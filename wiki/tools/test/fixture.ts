import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Issue } from "../src/lint.ts";
import { lint } from "../src/lint.ts";
import type { Wiki } from "../src/wiki.ts";
import { loadWiki } from "../src/wiki.ts";

export const CONVENTIONS = `# Wiki conventions

## Page types

| Type | Kind | Purpose | Sections |
|---|---|---|---|
| \`index\` | description | Lists pages. | |
| \`decision\` | record | A decision. | \`Decision\` |
| \`concept\` | description | Explains a concept. | |
| \`paper\` | source | A paper. | |
`;

/** A page with front matter, a title and a lead paragraph. */
export function page(description: string, title: string, body = "", extraFrontmatter = ""): string {
  return `---\ndescription: ${description}\n${extraFrontmatter}---\n\n# ${title}\n\nLead paragraph.\n\n${body}`;
}

/** An index page; a section is left out when its entries are undefined. */
export function index(title: string, indexes: string[] | undefined, pages: string[] | undefined): string {
  const list = (entries: string[]): string => (entries.length === 0 ? "_None yet._" : entries.join("\n"));
  const sections = [
    ...(indexes === undefined ? [] : [`## Indexes\n\n${list(indexes)}\n`]),
    ...(pages === undefined ? [] : [`## Pages\n\n${list(pages)}\n`]),
  ];
  return page(`Index of ${title}`, title, sections.join("\n"));
}

/** A minimal valid wiki: the root index lists a topic index, which lists one concept. */
export function validFiles(): Record<string, string> {
  return {
    "wiki/CLAUDE.md": CONVENTIONS,
    "wiki/pages/index.md": index("Root", ["- [Topics](index-topics.md) — Index of Topics"], undefined),
    "wiki/pages/index-topics.md": index("Topics", undefined, ["- [Alpha](concept-alpha.md) — The first concept"]),
    "wiki/pages/concept-alpha.md": page("The first concept", "Alpha", "## Details\n\nSome text.\n"),
  };
}

export class Fixture {
  readonly root = mkdtempSync(join(tmpdir(), "wiki-test-"));

  constructor(files: Record<string, string>) {
    this.git("init", "--quiet", "--initial-branch=main");
    this.git("config", "user.email", "test@example.com");
    this.git("config", "user.name", "Test");
    this.git("config", "commit.gpgSign", "false");
    this.write(files);
  }

  write(files: Record<string, string>): void {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(this.root, path)), { recursive: true });
      writeFileSync(join(this.root, path), content);
    }
  }

  remove(path: string): void {
    rmSync(join(this.root, path));
  }

  /** Commits everything, optionally at a fixed date. */
  commit(date?: string): void {
    this.git("add", "--all");
    this.git("commit", "--quiet", "--message", "commit", ...(date === undefined ? [] : ["--date", date]));
  }

  git(...args: string[]): string {
    const date = args.includes("--date") ? args[args.indexOf("--date") + 1] : undefined;
    return execFileSync("git", ["-C", this.root, ...args], {
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_COUNT: "0",
        ...(date === undefined ? {} : { GIT_COMMITTER_DATE: date }),
      },
    });
  }

  wiki(): Wiki {
    return loadWiki(join(this.root, "wiki"), this.root);
  }

  lint(base?: string): Issue[] {
    return lint(this.wiki(), base === undefined ? {} : { base });
  }

  [Symbol.dispose](): void {
    rmSync(this.root, { recursive: true, force: true });
  }
}

/** Summarises issues as "severity rule file:line" strings, for compact assertions. */
export function summary(issues: Issue[]): string[] {
  return issues.map((issue) => `${issue.severity} ${issue.rule} ${issue.file}${issue.line === undefined ? "" : `:${issue.line}`}`);
}
