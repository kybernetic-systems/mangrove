import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { List } from "mdast";
import { toString } from "mdast-util-to-string";
import { changedFiles, lastChanged, listFiles, refExists, showFile } from "./git.ts";
import type { Document, Link } from "./markdown.ts";
import { isExternal, parseDocument, splitUrl } from "./markdown.ts";
import type { Page, Wiki } from "./wiki.ts";
import { linkedPage, PAGE_NAME, ROOT_INDEX } from "./wiki.ts";

export interface Issue {
  severity: "error" | "warning";
  rule: string;
  file: string;
  line?: number;
  message: string;
}

export interface LintOptions {
  /** The ref to compare against for edited records and deleted pages; undefined skips those checks. */
  base?: string;
}

export const MAX_DESCRIPTION_LENGTH = 100;
export const MAX_INDEX_ENTRIES = 30;
const INDEX_SECTIONS = ["Indexes", "Pages"];
const SEE_ALSO = "See also";

interface IndexEntry {
  target: string;
  summary: string;
  section: string;
  line: number;
}

export function lint(wiki: Wiki, options: LintOptions = {}): Issue[] {
  const issues: Issue[] = [];
  const report = (
    severity: Issue["severity"],
    rule: string,
    file: string,
    line: number | undefined,
    message: string,
  ): void => {
    issues.push({ severity, rule, file, ...(line === undefined ? {} : { line }), message });
  };
  const conventionsFile = relative(wiki.repoRoot, wiki.conventionsPath);
  const pagesFolder = relative(wiki.repoRoot, wiki.pagesDir);
  const mediaFolder = relative(wiki.repoRoot, wiki.mediaDir);

  for (const error of wiki.typeErrors) report("error", "types", conventionsFile, undefined, error);
  for (const entry of wiki.strayEntries) {
    report("error", "folder", join(pagesFolder, entry), undefined, "only Markdown pages belong in the pages folder");
  }
  for (const file of wiki.mediaFiles) {
    if (!statSync(join(wiki.mediaDir, file)).isFile()) {
      report("error", "folder", join(mediaFolder, file), undefined, "the media folder has no subfolders");
    }
  }
  if (!wiki.pages.has(ROOT_INDEX)) {
    report("error", "index", pagesFolder, undefined, `the root index ${ROOT_INDEX} is missing`);
  }

  // Links, anchors and images, in every page and in the conventions.
  const anchorCache = new Map<string, Set<string>>();
  const anchorsOf = (path: string): Set<string> => {
    let anchors = anchorCache.get(path);
    if (anchors === undefined) {
      anchors = parseDocument(readFileSync(path, "utf8")).anchors;
      anchorCache.set(path, anchors);
    }
    return anchors;
  };
  const usedMedia = new Set<string>();
  const checkLinks = (displayPath: string, path: string, document: Document): void => {
    for (const link of document.links) {
      if (isExternal(link.url)) continue;
      if (link.image && link.alt.trim() === "") {
        report("error", "image", displayPath, link.line, `image ${link.url} has no alt text`);
      }
      const { path: target, anchor } = splitUrl(link.url);
      if (target.startsWith("/")) {
        report("error", "link", displayPath, link.line, `${link.url} starts with "/"; use a relative path`);
        continue;
      }
      const targetPath = target === "" ? path : resolve(dirname(path), target);
      if (!existsSync(targetPath)) {
        report("error", "link", displayPath, link.line, `${link.url} points to a file that doesn't exist`);
        continue;
      }
      if (dirname(targetPath) === wiki.mediaDir) usedMedia.add(targetPath);
      else if (link.image) {
        report("error", "image", displayPath, link.line, `image ${link.url} isn't in ${mediaFolder}`);
      }
      if (anchor !== undefined && anchor !== "" && targetPath.endsWith(".md")) {
        if (!anchorsOf(targetPath).has(anchor)) {
          report("error", "link", displayPath, link.line, `${link.url} points to a heading that doesn't exist`);
        }
      }
    }
  };
  checkLinks(conventionsFile, wiki.conventionsPath, wiki.conventions);

  const pageTarget = (page: Page, link: Link): string | undefined => linkedPage(wiki, page.path, link.url);

  const indexEntries = new Map<string, IndexEntry[]>();
  for (const page of wiki.pages.values()) {
    const file = page.displayPath;
    checkLinks(file, page.path, page);

    // Name and type.
    if (page.file !== ROOT_INDEX && !PAGE_NAME.test(page.file)) {
      report("error", "name", file, undefined, "page names follow <type>-<name>.md, in lowercase words separated by hyphens");
    } else if (page.type === undefined) {
      report("error", "name", file, undefined, `type "${page.typeName}" isn't in the page-type table in ${conventionsFile}`);
    }

    checkFrontmatter(page, report);
    checkStructure(page, report);

    // Footnotes.
    const defined = new Set(page.footnoteDefinitions.map((definition) => definition.id));
    const referenced = new Set(page.footnoteReferences.map((reference) => reference.id));
    for (const reference of page.footnoteReferences) {
      if (!defined.has(reference.id)) {
        report("error", "footnote", file, reference.line, `footnote [^${reference.id}] has no definition`);
      }
    }
    for (const definition of page.footnoteDefinitions) {
      if (!referenced.has(definition.id)) {
        report("error", "footnote", file, definition.line, `footnote [^${definition.id}] is never referenced`);
      }
    }

    // See also repeats a page the body already links to.
    const bodyTargets = new Set(
      page.links.filter((link) => link.section !== SEE_ALSO).map((link) => splitUrl(link.url).path),
    );
    for (const link of page.links.filter((link) => link.section === SEE_ALSO)) {
      if (bodyTargets.has(splitUrl(link.url).path)) {
        report("warning", "see-also", file, link.line, `${link.url} is already linked from the body`);
      }
    }

    if (page.type?.name === "index") {
      const sections = new Set(page.headings.filter((heading) => heading.depth === 2).map((heading) => heading.text));
      if (page.file === ROOT_INDEX) {
        if (!sections.has("Indexes")) {
          report("error", "sections", file, undefined, 'the root index needs an "## Indexes" section');
        }
        if (sections.has("Pages")) {
          report("error", "sections", file, undefined, 'the root index lists only indexes; move its pages into a child index');
        }
      } else if (!sections.has("Indexes") && !sections.has("Pages")) {
        report("error", "sections", file, undefined, 'an index needs an "## Indexes" section, a "## Pages" section, or both');
      }
      const entries = readIndexEntries(page, pageTarget, report);
      indexEntries.set(page.file, entries);
      if (entries.length > MAX_INDEX_ENTRIES) {
        report("warning", "index", file, undefined, `${entries.length} entries; split indexes past ${MAX_INDEX_ENTRIES}`);
      }
    }
  }

  // Index entries: targets, descriptions, listing and reachability.
  const listed = new Set<string>();
  for (const [indexFile, entries] of indexEntries) {
    const index = wiki.pages.get(indexFile)!;
    for (const entry of entries) {
      const target = wiki.pages.get(entry.target)!;
      listed.add(entry.target);
      const targetIsIndex = target.type?.name === "index";
      if (entry.section === "Indexes" && !targetIsIndex) {
        report("error", "index", index.displayPath, entry.line, `${entry.target} isn't an index; list it under "## Pages"`);
      } else if (entry.section === "Pages" && targetIsIndex) {
        report("error", "index", index.displayPath, entry.line, `${entry.target} is an index; list it under "## Indexes"`);
      }
      const description = target.frontmatter?.["description"];
      if (typeof description === "string" && entry.summary !== description) {
        report("error", "index", index.displayPath, entry.line, `the summary of ${entry.target} must repeat its description: "${description}"`);
      }
      if (target.frontmatter?.["superseded_by"] !== undefined) {
        report("error", "supersede", index.displayPath, entry.line, `${entry.target} is superseded; list ${String(target.frontmatter["superseded_by"])} instead`);
      }
    }
  }
  for (const page of wiki.pages.values()) {
    if (page.file !== ROOT_INDEX && !listed.has(page.file)) {
      report("error", "index", page.displayPath, undefined, "no index lists this page");
    }
  }
  const reachable = new Set<string>();
  const queue = wiki.pages.has(ROOT_INDEX) ? [ROOT_INDEX] : [];
  while (queue.length > 0) {
    const current = queue.pop()!;
    if (reachable.has(current)) continue;
    reachable.add(current);
    for (const entry of indexEntries.get(current) ?? []) {
      if (entry.section === "Indexes" && indexEntries.has(entry.target)) queue.push(entry.target);
    }
  }
  for (const indexFile of indexEntries.keys()) {
    if (!reachable.has(indexFile)) {
      report("error", "index", wiki.pages.get(indexFile)!.displayPath, undefined, `can't be reached from ${ROOT_INDEX} through "## Indexes" sections`);
    }
  }

  checkSupersession(wiki, report);

  for (const file of wiki.mediaFiles) {
    const path = join(wiki.mediaDir, file);
    if (statSync(path).isFile() && !usedMedia.has(path)) {
      report("warning", "media", join(mediaFolder, file), undefined, "no page uses this file");
    }
  }

  checkStaleness(wiki, report);
  if (options.base !== undefined) checkAgainstBase(wiki, options.base, report);

  return issues.sort(
    (a, b) => a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0) || a.rule.localeCompare(b.rule),
  );
}

type Report = (severity: Issue["severity"], rule: string, file: string, line: number | undefined, message: string) => void;

function checkFrontmatter(page: Page, report: Report): void {
  const file = page.displayPath;
  if (page.frontmatterText === undefined) {
    report("error", "frontmatter", file, 1, "the page has no front matter");
    return;
  }
  if (page.frontmatter === undefined) {
    report("error", "frontmatter", file, 1, page.frontmatterError ?? "invalid front matter");
    return;
  }
  const kind = page.type?.kind;
  const allowed = new Set(["description", "aliases"]);
  if (kind === "record") ["supersedes", "superseded_by"].forEach((key) => allowed.add(key));
  if (kind === "source") ["url", "authors", "year"].forEach((key) => allowed.add(key));
  const data = page.frontmatter;
  for (const key of Object.keys(data)) {
    if (!allowed.has(key)) {
      report("error", "frontmatter", file, 1, `"${key}" isn't allowed in the front matter of ${kind ?? "this"} pages`);
    }
  }

  const description = data["description"];
  if (typeof description !== "string" || description.trim() === "") {
    report("error", "frontmatter", file, 1, "description is required");
  } else if (description.length > MAX_DESCRIPTION_LENGTH || description.includes("\n")) {
    report("error", "frontmatter", file, 1, `description must be one line of at most ${MAX_DESCRIPTION_LENGTH} characters`);
  }
  if ("aliases" in data && !isStringList(data["aliases"])) {
    report("error", "frontmatter", file, 1, "aliases must be a list of names");
  }
  for (const key of ["supersedes", "superseded_by"]) {
    if (key in data && allowed.has(key) && (typeof data[key] !== "string" || !PAGE_NAME.test(data[key] as string))) {
      report("error", "frontmatter", file, 1, `${key} must be a page's file name, such as decision-some-topic.md`);
    }
  }
  if (kind === "source") {
    if (typeof data["url"] !== "string" || data["url"].trim() === "") {
      report("error", "frontmatter", file, 1, "url is required on source pages");
    }
    if ("authors" in data && !isStringList(data["authors"])) {
      report("error", "frontmatter", file, 1, "authors must be a list of names");
    }
    if ("year" in data && !Number.isInteger(data["year"])) {
      report("error", "frontmatter", file, 1, "year must be a whole number");
    }
  }
}

function isStringList(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim() !== "");
}

function checkStructure(page: Page, report: Report): void {
  const file = page.displayPath;
  const content = page.tree.children.filter((node) => node.type !== "yaml");
  const first = content[0];
  if (first?.type !== "heading" || first.depth !== 1) {
    report("error", "title", file, first?.position?.start.line, "the page must start with a # Title heading");
  } else {
    const lead = content[1];
    if (lead?.type !== "paragraph") {
      report("error", "lead", file, lead?.position?.start.line ?? first.position?.start.line, "a lead paragraph must follow the title");
    }
  }
  for (const heading of page.headings.filter((heading) => heading.depth === 1).slice(1)) {
    report("error", "title", file, heading.line, "a page has only one # heading");
  }

  const sections = page.headings.filter((heading) => heading.depth === 2);
  for (const required of page.type?.sections ?? []) {
    if (!sections.some((heading) => heading.text === required)) {
      report("error", "sections", file, undefined, `${page.type!.name} pages need a "## ${required}" section`);
    }
  }
  const seeAlso = sections.findIndex((heading) => heading.text === SEE_ALSO);
  if (seeAlso !== -1 && seeAlso !== sections.length - 1) {
    report("warning", "sections", file, sections[seeAlso]!.line, `"## ${SEE_ALSO}" should be the last section`);
  }

  const firstDefinition = content.findIndex((node) => node.type === "footnoteDefinition");
  if (firstDefinition !== -1) {
    const after = content.slice(firstDefinition).find((node) => node.type !== "footnoteDefinition");
    if (after !== undefined) {
      report("warning", "footnote", file, after.position?.start.line, "footnote definitions belong at the end of the page");
    }
  }
}

function readIndexEntries(
  page: Page,
  pageTarget: (page: Page, link: Link) => string | undefined,
  report: Report,
): IndexEntry[] {
  const entries: IndexEntry[] = [];
  let section: string | undefined;
  for (const node of page.tree.children) {
    if (node.type === "heading" && node.depth <= 2) {
      section = node.depth === 2 ? toString(node) : undefined;
      continue;
    }
    if (section === undefined || !INDEX_SECTIONS.includes(section) || node.type !== "list") continue;
    for (const item of (node as List).children) {
      const line = item.position?.start.line;
      const paragraph = item.children[0];
      if (paragraph?.type !== "paragraph" || paragraph.children[0]?.type !== "link") {
        report("error", "index", page.displayPath, line, "an index entry starts with a link to a page");
        continue;
      }
      const link = paragraph.children[0];
      const target = pageTarget(page, { url: link.url, line: line ?? 0, image: false, alt: "", section });
      if (target === undefined) {
        report("error", "index", page.displayPath, line, `${link.url} isn't a wiki page`);
        continue;
      }
      const text = paragraph.children.slice(1).map((child) => toString(child)).join("");
      if (!text.startsWith(" — ")) {
        report("error", "index", page.displayPath, line, 'an index entry is "- [Title](page.md) — description"');
        continue;
      }
      entries.push({ target, summary: text.slice(3).trim(), section, line: line ?? 0 });
    }
  }
  return entries;
}

function checkSupersession(wiki: Wiki, report: Report): void {
  const supersededBy = new Map<string, string[]>();
  for (const page of wiki.pages.values()) {
    if (page.type?.kind !== "record" || page.frontmatter === undefined) continue;
    for (const key of ["supersedes", "superseded_by"] as const) {
      const target = page.frontmatter[key];
      if (typeof target !== "string") continue;
      const other = wiki.pages.get(target);
      if (other === undefined) {
        report("error", "supersede", page.displayPath, 1, `${key}: ${target} doesn't exist`);
        continue;
      }
      if (other.typeName !== page.typeName) {
        report("error", "supersede", page.displayPath, 1, `${key}: ${target} is a different type of page`);
        continue;
      }
      const back = key === "supersedes" ? "superseded_by" : "supersedes";
      if (other.frontmatter?.[back] !== page.file) {
        report("error", "supersede", other.displayPath, 1, `add "${back}: ${page.file}" to the front matter`);
      }
      if (key === "supersedes") supersededBy.set(target, [...(supersededBy.get(target) ?? []), page.file]);
    }
  }
  for (const [target, pages] of supersededBy) {
    if (pages.length > 1) {
      report("error", "supersede", wiki.pages.get(target)!.displayPath, 1, `superseded by more than one page: ${pages.join(", ")}`);
    }
  }
}

/** Warns when a description cites a repository file that changed after the description did. */
function checkStaleness(wiki: Wiki, report: Report): void {
  const citations = new Map<Page, Map<string, number>>();
  for (const page of wiki.pages.values()) {
    if (page.type === undefined || page.type.kind === "record") continue;
    const targets = new Map<string, number>();
    for (const link of page.links) {
      if (isExternal(link.url)) continue;
      const { path } = splitUrl(link.url);
      if (path === "" || path.startsWith("/")) continue;
      const target = resolve(dirname(page.path), path);
      if (target.startsWith(wiki.wikiDir + sep) || !existsSync(target)) continue;
      if (!targets.has(target)) targets.set(target, link.line);
    }
    if (targets.size > 0) citations.set(page, targets);
  }
  const paths = new Set<string>();
  for (const [page, targets] of citations) {
    paths.add(relative(wiki.repoRoot, page.path));
    for (const target of targets.keys()) paths.add(relative(wiki.repoRoot, target));
  }
  const times = lastChanged(wiki.repoRoot, [...paths]);
  for (const [page, targets] of citations) {
    const pageTime = times.get(relative(wiki.repoRoot, page.path));
    if (pageTime === undefined) continue;
    for (const [target, line] of targets) {
      const targetPath = relative(wiki.repoRoot, target);
      const targetTime = times.get(targetPath);
      if (targetTime !== undefined && targetTime > pageTime) {
        report("warning", "stale", page.displayPath, line, `${targetPath} changed after this page did; check the page is still accurate`);
      }
    }
  }
}

/** Catches deleted or renamed pages and edited records, by comparing against a base ref. */
function checkAgainstBase(wiki: Wiki, base: string, report: Report): void {
  const pagesFolder = relative(wiki.repoRoot, wiki.pagesDir);
  if (!refExists(wiki.repoRoot, base)) {
    report("warning", "base", pagesFolder, undefined, `${base} doesn't exist; skipped the checks that merged records and page names stay as they were`);
    return;
  }
  const changed = changedFiles(wiki.repoRoot, base, pagesFolder);
  for (const basePath of listFiles(wiki.repoRoot, base, pagesFolder)) {
    const file = basePath.slice(pagesFolder.length + 1);
    const page = wiki.pages.get(file);
    if (page === undefined) {
      report("error", "permanent", basePath, undefined, `exists on ${base}; page names are permanent, so restore it`);
      continue;
    }
    if (page.type?.kind !== "record" || !changed.has(basePath)) continue;
    const baseText = showFile(wiki.repoRoot, base, basePath);
    if (baseText === undefined || baseText === page.text) continue;
    const original = parseDocument(baseText);
    if (original.body !== page.body) {
      report("error", "immutable", page.displayPath, undefined, `merged records stay as written; restore the body from ${base} and supersede the record instead`);
    }
    const { superseded_by: added, ...rest } = page.frontmatter ?? {};
    const originalData = original.frontmatter ?? {};
    const allowedAddition = added !== undefined && !("superseded_by" in originalData);
    const comparable = allowedAddition ? rest : (page.frontmatter ?? {});
    if (stableJson(comparable) !== stableJson(originalData)) {
      report("error", "immutable", page.displayPath, 1, `merged records stay as written; the one allowed change is adding superseded_by to the front matter`);
    }
  }
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner !== null && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => a.localeCompare(b)))
      : inner,
  );
}
