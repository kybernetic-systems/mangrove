import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import type { RootContent, TableCell } from "mdast";
import { toString } from "mdast-util-to-string";
import type { Document } from "./markdown.ts";
import { isExternal, parseDocument, splitUrl } from "./markdown.ts";

export const KINDS = ["record", "description", "source"] as const;
export type Kind = (typeof KINDS)[number];

export interface PageType {
  name: string;
  kind: Kind;
  sections: string[];
}

export interface Page extends Document {
  /** File name, such as `index-git.md`. */
  file: string;
  path: string;
  /** Path relative to the repository root, for messages. */
  displayPath: string;
  /** The type named in the file name, or undefined when the name doesn't follow the convention. */
  typeName: string | undefined;
  type: PageType | undefined;
  text: string;
}

export interface Wiki {
  repoRoot: string;
  wikiDir: string;
  pagesDir: string;
  mediaDir: string;
  conventionsPath: string;
  conventions: Document;
  types: Map<string, PageType>;
  /** Problems found while reading the page-type table. */
  typeErrors: string[];
  pages: Map<string, Page>;
  /** Entries in the pages folder that aren't Markdown files. */
  strayEntries: string[];
  mediaFiles: string[];
}

export const ROOT_INDEX = "index.md";
export const PAGE_NAME = /^([a-z]+)-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;

export function loadWiki(wikiDir: string, repoRoot: string): Wiki {
  const pagesDir = join(wikiDir, "pages");
  const mediaDir = join(wikiDir, "media");
  const conventionsPath = join(wikiDir, "CLAUDE.md");
  const conventions = parseDocument(readFileSync(conventionsPath, "utf8"));
  const { types, errors } = readTypes(conventions);

  const pages = new Map<string, Page>();
  const strayEntries: string[] = [];
  for (const file of visibleEntries(pagesDir)) {
    const path = join(pagesDir, file);
    if (!file.endsWith(".md") || !statSync(path).isFile()) {
      strayEntries.push(file);
      continue;
    }
    const text = readFileSync(path, "utf8");
    const typeName = file === ROOT_INDEX ? "index" : PAGE_NAME.exec(file)?.[1];
    pages.set(file, {
      ...parseDocument(text),
      file,
      path,
      displayPath: relative(repoRoot, path),
      typeName,
      type: typeName === undefined ? undefined : types.get(typeName),
      text,
    });
  }

  const mediaFiles = existsSync(mediaDir) ? visibleEntries(mediaDir) : [];

  return {
    repoRoot,
    wikiDir,
    pagesDir,
    mediaDir,
    conventionsPath,
    conventions,
    types,
    typeErrors: errors,
    pages,
    strayEntries,
    mediaFiles,
  };
}

/** Lists a folder's entries, skipping hidden ones such as editor settings. */
function visibleEntries(directory: string): string[] {
  return readdirSync(directory)
    .filter((entry) => !entry.startsWith("."))
    .sort();
}

/** Reads the first table under the `## Page types` heading of the conventions. */
function readTypes(conventions: Document): { types: Map<string, PageType>; errors: string[] } {
  const types = new Map<string, PageType>();
  const errors: string[] = [];
  const children = conventions.tree.children;
  const start = children.findIndex(
    (node) => node.type === "heading" && node.depth === 2 && toString(node) === "Page types",
  );
  let table: RootContent | undefined;
  for (let i = start + 1; start !== -1 && i < children.length; i++) {
    const node = children[i]!;
    if (node.type === "heading" && node.depth <= 2) break;
    if (node.type === "table") {
      table = node;
      break;
    }
  }
  if (table?.type !== "table") {
    errors.push('no table under the "## Page types" heading');
    return { types, errors };
  }

  for (const row of table.children.slice(1)) {
    const [typeCell, kindCell, , sectionsCell] = row.children;
    const name = typeCell === undefined ? "" : toString(typeCell).trim();
    const kind = kindCell === undefined ? "" : toString(kindCell).trim();
    const line = row.position?.start.line ?? 0;
    if (!/^[a-z]+$/.test(name)) {
      errors.push(`line ${line}: type "${name}" must be a single lowercase word`);
      continue;
    }
    if (!(KINDS as readonly string[]).includes(kind)) {
      errors.push(`line ${line}: type "${name}" has kind "${kind}"; use one of ${KINDS.join(", ")}`);
      continue;
    }
    types.set(name, { name, kind: kind as Kind, sections: inlineCodes(sectionsCell) });
  }
  return { types, errors };
}

function inlineCodes(cell: TableCell | undefined): string[] {
  return cell?.children.flatMap((node) => (node.type === "inlineCode" ? [node.value] : [])) ?? [];
}

/** Resolves a link in a file to the name of the wiki page it points to, or undefined when it points elsewhere. */
export function linkedPage(wiki: Wiki, fromPath: string, url: string): string | undefined {
  if (isExternal(url)) return undefined;
  const { path } = splitUrl(url);
  if (path === "" || path.startsWith("/")) return undefined;
  const target = resolve(dirname(fromPath), path);
  if (dirname(target) !== wiki.pagesDir) return undefined;
  const file = basename(target);
  return wiki.pages.has(file) ? file : undefined;
}
