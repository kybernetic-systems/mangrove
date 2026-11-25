import type { Wiki } from "./wiki.ts";
import { linkedPage } from "./wiki.ts";

export interface Backlink {
  /** The file name of the page that links. */
  from: string;
  line: number;
  /** The `##` section the link is in, or undefined before the first one. */
  section: string | undefined;
}

/** Lists the links from other pages to a page, in file-name order. */
export function backlinks(wiki: Wiki, file: string): Backlink[] {
  const result: Backlink[] = [];
  for (const page of wiki.pages.values()) {
    if (page.file === file) continue;
    for (const link of page.links) {
      if (linkedPage(wiki, page.path, link.url) === file) {
        result.push({ from: page.file, line: link.line, section: link.section });
      }
    }
  }
  return result;
}
