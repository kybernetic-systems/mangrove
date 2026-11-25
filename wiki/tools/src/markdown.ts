import GithubSlugger from "github-slugger";
import type { Nodes, Root } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { frontmatterFromMarkdown } from "mdast-util-frontmatter";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { toString } from "mdast-util-to-string";
import { frontmatter } from "micromark-extension-frontmatter";
import { gfm } from "micromark-extension-gfm";
import { parse as parseYaml } from "yaml";

export interface Heading {
  depth: number;
  text: string;
  line: number;
}

export interface Link {
  url: string;
  line: number;
  image: boolean;
  alt: string;
  /** The `##` section the link is in, or undefined before the first one. */
  section: string | undefined;
}

export interface Document {
  tree: Root;
  /** Raw YAML front matter, or undefined when the document has none. */
  frontmatterText: string | undefined;
  /** Parsed front matter, or undefined when it's missing or invalid. */
  frontmatter: Record<string, unknown> | undefined;
  frontmatterError: string | undefined;
  /** The document without its front matter. */
  body: string;
  headings: Heading[];
  /** Heading anchors, as GitHub generates them. */
  anchors: Set<string>;
  links: Link[];
  footnoteReferences: { id: string; line: number }[];
  footnoteDefinitions: { id: string; line: number }[];
}

export function parseDocument(text: string): Document {
  const tree = fromMarkdown(text, {
    extensions: [gfm(), frontmatter(["yaml"])],
    mdastExtensions: [gfmFromMarkdown(), frontmatterFromMarkdown(["yaml"])],
  });

  const document: Document = {
    tree,
    frontmatterText: undefined,
    frontmatter: undefined,
    frontmatterError: undefined,
    body: text,
    headings: [],
    anchors: new Set(),
    links: [],
    footnoteReferences: [],
    footnoteDefinitions: [],
  };

  const first = tree.children[0];
  if (first?.type === "yaml") {
    document.frontmatterText = first.value;
    document.body = text.slice(first.position?.end.offset ?? 0).replace(/^\r?\n/, "");
    try {
      const value: unknown = parseYaml(first.value);
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        document.frontmatter = value as Record<string, unknown>;
      } else {
        document.frontmatterError = "front matter must be a YAML mapping";
      }
    } catch (error) {
      document.frontmatterError = `invalid YAML: ${(error as Error).message.split("\n")[0]}`;
    }
  }

  const slugger = new GithubSlugger();
  let section: string | undefined;

  const visit = (node: Nodes): void => {
    const line = node.position?.start.line ?? 0;
    switch (node.type) {
      case "heading": {
        const headingText = toString(node);
        document.headings.push({ depth: node.depth, text: headingText, line });
        document.anchors.add(slugger.slug(headingText));
        if (node.depth === 2) section = headingText;
        break;
      }
      case "link":
      case "definition":
        document.links.push({ url: node.url, line, image: false, alt: "", section });
        break;
      case "image":
        document.links.push({ url: node.url, line, image: true, alt: node.alt ?? "", section });
        break;
      case "text":
        // A reference without a definition stays plain text, so find it in the text.
        for (const match of node.value.matchAll(/\[\^([^\]\s]+)\]/g)) {
          document.footnoteReferences.push({ id: match[1]!.toLowerCase(), line });
        }
        break;
      case "footnoteReference":
        document.footnoteReferences.push({ id: node.identifier, line });
        break;
      case "footnoteDefinition":
        document.footnoteDefinitions.push({ id: node.identifier, line });
        break;
    }
    if ("children" in node) {
      for (const child of node.children) visit(child);
    }
  };
  visit(tree);

  return document;
}

/** True when a URL has a scheme, such as `https:` or `mailto:`, or is protocol-relative. */
export function isExternal(url: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//");
}

/** Splits a relative URL into its decoded path and its anchor. */
export function splitUrl(url: string): { path: string; anchor: string | undefined } {
  const hash = url.indexOf("#");
  const rawPath = hash === -1 ? url : url.slice(0, hash);
  const anchor = hash === -1 ? undefined : url.slice(hash + 1);
  let path = rawPath;
  try {
    path = decodeURIComponent(rawPath);
  } catch {
    // Keep the raw path; the link check reports it as missing.
  }
  return { path, anchor: anchor === undefined ? undefined : decodeURIComponent(anchor) };
}
