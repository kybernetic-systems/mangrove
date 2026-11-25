import { basename, dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { backlinks } from "./backlinks.ts";
import { repositoryRoot } from "./git.ts";
import { lint } from "./lint.ts";
import { loadWiki } from "./wiki.ts";

const usage = `Usage:
  wiki lint [--base <ref>] [--json]   Check the wiki's conventions (default base: origin/main)
  wiki backlinks <page>               List the pages that link to a page

Options:
  --wiki <dir>   The wiki folder (default: the folder that contains these tools)
  --help         Show this help`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    base: { type: "string", default: "origin/main" },
    json: { type: "boolean", default: false },
    wiki: { type: "string" },
    help: { type: "boolean", default: false },
  },
});

const [command, ...rest] = positionals;
if (values.help || command === undefined) {
  console.log(usage);
  process.exit(values.help ? 0 : 2);
}

const wikiDir = resolve(values.wiki ?? join(import.meta.dirname, "..", ".."));
const repoRoot = repositoryRoot(wikiDir) ?? dirname(wikiDir);
const wiki = loadWiki(wikiDir, repoRoot);

switch (command) {
  case "lint": {
    const issues = lint(wiki, { base: values.base });
    const errors = issues.filter((issue) => issue.severity === "error").length;
    if (values.json) {
      console.log(JSON.stringify(issues, null, 2));
    } else {
      for (const issue of issues) {
        const location = issue.line === undefined ? issue.file : `${issue.file}:${issue.line}`;
        console.log(`${issue.severity.padEnd(7)} ${location}  ${issue.message}  [${issue.rule}]`);
      }
      const warnings = issues.length - errors;
      console.log(`${wiki.pages.size} pages, ${errors} errors, ${warnings} warnings`);
    }
    process.exit(errors > 0 ? 1 : 0);
  }
  case "backlinks": {
    const [page] = rest;
    if (page === undefined) {
      console.error("Name the page, for example: wiki backlinks index-git.md");
      process.exit(2);
    }
    const file = basename(page);
    if (!wiki.pages.has(file)) {
      console.error(`${file} isn't a page in ${wiki.pagesDir}`);
      process.exit(2);
    }
    for (const link of backlinks(wiki, file)) {
      const section = link.section === undefined ? "" : `  (${link.section})`;
      console.log(`${link.from}:${link.line}${section}`);
    }
    break;
  }
  default:
    console.error(`Unknown command "${command}".\n\n${usage}`);
    process.exit(2);
}
