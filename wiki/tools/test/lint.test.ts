import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Issue } from "../src/lint.ts";
import { Fixture, index, page, summary, validFiles } from "./fixture.ts";

const ALPHA = "wiki/pages/concept-alpha.md";
const ROOT = "wiki/pages/index.md";
const TOPICS = "wiki/pages/index-topics.md";

function find(issues: Issue[], rule: string, file: string): Issue[] {
  return issues.filter((issue) => issue.rule === rule && issue.file === file);
}

function lintWith(overrides: Record<string, string>, base?: string): Issue[] {
  using fixture = new Fixture({ ...validFiles(), ...overrides });
  return fixture.lint(base);
}

describe("lint", () => {
  it("accepts a valid wiki", () => {
    assert.deepEqual(summary(lintWith({})), []);
  });

  it("ignores hidden entries such as editor settings", () => {
    assert.deepEqual(summary(lintWith({ "wiki/pages/.obsidian/app.json": "{}" })), []);
  });

  describe("links", () => {
    it("reports links to missing files and headings", () => {
      const issues = lintWith({
        [ALPHA]: page("The first concept", "Alpha", "## Details\n\n[a](concept-missing.md) [b](index.md#nope) [c](index.md#indexes) [d](#details)\n"),
      });
      assert.equal(find(issues, "link", ALPHA).length, 2);
    });

    it("rejects paths that start with a slash", () => {
      const issues = lintWith({ [ALPHA]: page("The first concept", "Alpha", "[x](/README.md)\n") });
      assert.match(find(issues, "link", ALPHA)[0]!.message, /relative path/);
    });

    it("ignores links in code", () => {
      const issues = lintWith({ [ALPHA]: page("The first concept", "Alpha", "`[x](nope.md)`\n\n```md\n[y](nope.md)\n```\n") });
      assert.deepEqual(summary(issues), []);
    });

    it("checks the links in the conventions too", () => {
      const issues = lintWith({ "wiki/CLAUDE.md": validFiles()["wiki/CLAUDE.md"] + "\nSee [this](pages/nope.md).\n" });
      assert.equal(find(issues, "link", "wiki/CLAUDE.md").length, 1);
    });
  });

  describe("media", () => {
    it("requires alt text and images in the media folder", () => {
      const issues = lintWith({
        "wiki/media/flow.svg": "<svg/>",
        "wiki/other.svg": "<svg/>",
        [ALPHA]: page("The first concept", "Alpha", "![](../media/flow.svg)\n\n![Other](../other.svg)\n"),
      });
      assert.deepEqual(find(issues, "image", ALPHA).map((issue) => issue.message), [
        "image ../media/flow.svg has no alt text",
        "image ../other.svg isn't in wiki/media",
      ]);
    });

    it("warns about media no page uses", () => {
      const issues = lintWith({ "wiki/media/unused.svg": "<svg/>" });
      assert.deepEqual(summary(issues), ["warning media wiki/media/unused.svg"]);
    });
  });

  describe("names and types", () => {
    it("rejects names that break the convention", () => {
      const issues = lintWith({ "wiki/pages/Concept_Beta.md": page("Beta", "Beta") });
      assert.equal(find(issues, "name", "wiki/pages/Concept_Beta.md").length, 1);
    });

    it("rejects types missing from the table", () => {
      const issues = lintWith({ "wiki/pages/howto-beta.md": page("Beta", "Beta") });
      assert.match(find(issues, "name", "wiki/pages/howto-beta.md")[0]!.message, /isn't in the page-type table/);
    });

    it("rejects files other than Markdown pages", () => {
      const issues = lintWith({ "wiki/pages/notes.txt": "hi" });
      assert.equal(find(issues, "folder", "wiki/pages/notes.txt").length, 1);
    });

    it("reports a malformed type table", () => {
      const issues = lintWith({ "wiki/CLAUDE.md": "# Wiki\n\n## Page types\n\n| Type | Kind | Purpose | Sections |\n|---|---|---|---|\n| `how-to` | description | x | |\n| `index` | thing | x | |\n" });
      assert.equal(find(issues, "types", "wiki/CLAUDE.md").length, 2);
    });
  });

  describe("front matter", () => {
    it("requires front matter with a short description", () => {
      const long = "x".repeat(101);
      const issues = lintWith({
        [ALPHA]: "# Alpha\n\nLead.\n",
        "wiki/pages/concept-beta.md": page(long, "Beta"),
      });
      assert.match(find(issues, "frontmatter", ALPHA)[0]!.message, /no front matter/);
      assert.match(find(issues, "frontmatter", "wiki/pages/concept-beta.md")[0]!.message, /at most 100/);
    });

    it("rejects unknown fields and record fields on descriptions", () => {
      const issues = lintWith({ [ALPHA]: page("The first concept", "Alpha", "", "status: draft\nsupersedes: concept-beta.md\n") });
      assert.equal(find(issues, "frontmatter", ALPHA).length, 2);
    });

    it("requires a url on source pages", () => {
      const issues = lintWith({
        [TOPICS]: index("Topics", undefined, ["- [Alpha](concept-alpha.md) — The first concept", "- [Paper](paper-knuth.md) — A paper"]),
        "wiki/pages/paper-knuth.md": page("A paper", "Paper", "", "authors: Knuth\nyear: 1984\n"),
      });
      assert.deepEqual(find(issues, "frontmatter", "wiki/pages/paper-knuth.md").map((issue) => issue.message), [
        "url is required on source pages",
        "authors must be a list of names",
      ]);
    });
  });

  describe("structure", () => {
    it("requires a title, a lead paragraph and the type's sections", () => {
      const issues = lintWith({
        [ROOT]: "---\ndescription: Root\n---\n\nNo title.\n",
        [ALPHA]: "---\ndescription: The first concept\n---\n\n# Alpha\n\n## Straight to a section\n",
      });
      assert.equal(find(issues, "title", ROOT).length, 1);
      assert.equal(find(issues, "sections", ROOT).length, 1);
      assert.equal(find(issues, "lead", ALPHA).length, 1);
    });

    it("warns when See also repeats a body link or isn't last", () => {
      const issues = lintWith({
        [ALPHA]: page("The first concept", "Alpha", "See [root](index.md).\n\n## See also\n\n- [Root](index.md)\n\n## After\n\nText.\n"),
      });
      assert.deepEqual(summary(issues).filter((line) => line.includes("see-also") || line.includes("sections")), [
        `warning sections ${ALPHA}:11`,
        `warning see-also ${ALPHA}:13`,
      ]);
    });

    it("checks footnotes", () => {
      const issues = lintWith({
        [ALPHA]: page("The first concept", "Alpha", "Claim.[^1] Other.[^2]\n\n[^1]: Source.\n\n[^3]: Unused.\n\nTrailing text.\n"),
      });
      assert.deepEqual(find(issues, "footnote", ALPHA).map((issue) => issue.severity), ["error", "error", "warning"]);
    });
  });

  describe("indexes", () => {
    it("requires every page to be listed and every index to be reachable", () => {
      const issues = lintWith({
        "wiki/pages/concept-beta.md": page("Beta", "Beta"),
        "wiki/pages/index-lost.md": index("Lost", undefined, ["- [Beta](concept-beta.md) — Beta"]),
      });
      assert.deepEqual(find(issues, "index", "wiki/pages/index-lost.md").map((issue) => issue.message), [
        "no index lists this page",
        "can't be reached from index.md through \"## Indexes\" sections",
      ]);
      assert.deepEqual(summary(issues).length, 2);
    });

    it("requires entries to repeat descriptions and sit in the right section", () => {
      const issues = lintWith({
        [TOPICS]: index("Topics", ["- [Alpha](concept-alpha.md) — Something else"], undefined),
      });
      assert.deepEqual(find(issues, "index", TOPICS).map((issue) => issue.message), [
        "concept-alpha.md isn't an index; list it under \"## Pages\"",
        'the summary of concept-alpha.md must repeat its description: "The first concept"',
      ]);
    });

    it("rejects malformed entries", () => {
      const issues = lintWith({
        [TOPICS]: index("Topics", undefined, ["- [Alpha](concept-alpha.md) The first concept", "- Just text", "- [Web](https://example.com) — Web"]),
      });
      assert.equal(find(issues, "index", TOPICS).length, 3);
    });

    it("lets the root index list only indexes", () => {
      const issues = lintWith({
        [ROOT]: index("Root", ["- [Topics](index-topics.md) — Index of Topics"], ["- [Alpha](concept-alpha.md) — The first concept"]),
      });
      assert.deepEqual(find(issues, "sections", ROOT).map((issue) => issue.message), [
        "the root index lists only indexes; move its pages into a child index",
      ]);
    });

    it("requires other indexes to list indexes, pages or both", () => {
      const issues = lintWith({ [TOPICS]: page("Index of Topics", "Topics", "## Other\n\nText.\n") });
      assert.equal(find(issues, "sections", TOPICS).length, 1);
      const both = lintWith({
        [TOPICS]: index("Topics", [], ["- [Alpha](concept-alpha.md) — The first concept"]),
      });
      assert.deepEqual(summary(both), []);
    });

    it("warns about oversized indexes", () => {
      const pages: Record<string, string> = {};
      const entries = ["- [Alpha](concept-alpha.md) — The first concept"];
      for (let i = 0; i < 30; i++) {
        pages[`wiki/pages/concept-c${i}.md`] = page(`C${i}`, `C${i}`);
        entries.push(`- [C${i}](concept-c${i}.md) — C${i}`);
      }
      const issues = lintWith({ ...pages, [TOPICS]: index("Topics", undefined, entries) });
      assert.deepEqual(summary(issues), [`warning index ${TOPICS}`]);
    });
  });

  describe("records", () => {
    const decisions = (oldExtra: string, newExtra: string, listed = "decision-new.md"): Record<string, string> => ({
      [TOPICS]: index("Topics", undefined, [
        "- [Alpha](concept-alpha.md) — The first concept",
        `- [Decision](${listed}) — ${listed === "decision-new.md" ? "New" : "Old"}`,
      ]),
      "wiki/pages/decision-old.md": page("Old", "Old", "## Decision\n\nOld.\n", oldExtra),
      "wiki/pages/decision-new.md": page("New", "New", "## Decision\n\nNew.\n", newExtra),
    });

    it("accepts a symmetric supersession", () => {
      const issues = lintWith(decisions("superseded_by: decision-new.md\n", "supersedes: decision-old.md\n"));
      assert.deepEqual(summary(issues), ["error index wiki/pages/decision-old.md"]);
    });

    it("requires both directions and no superseded page in an index", () => {
      const issues = lintWith(decisions("", "supersedes: decision-old.md\n", "decision-old.md"));
      assert.deepEqual(find(issues, "supersede", "wiki/pages/decision-old.md").length, 1);
      const listed = lintWith(decisions("superseded_by: decision-new.md\n", "supersedes: decision-old.md\n", "decision-old.md"));
      assert.equal(find(listed, "supersede", TOPICS).length, 1);
    });

    it("rejects edits to merged records, but allows adding superseded_by", () => {
      using fixture = new Fixture({ ...validFiles(), ...decisions("", "") });
      fixture.commit();
      fixture.git("branch", "-f", "base");

      fixture.write({ "wiki/pages/decision-old.md": page("Old", "Old", "## Decision\n\nOld.\n", "superseded_by: decision-new.md\n") });
      assert.deepEqual(find(fixture.lint("base"), "immutable", "wiki/pages/decision-old.md"), []);

      fixture.write({ "wiki/pages/decision-old.md": page("Old", "Old", "## Decision\n\nChanged.\n") });
      assert.equal(find(fixture.lint("base"), "immutable", "wiki/pages/decision-old.md").length, 1);

      fixture.write({ "wiki/pages/decision-old.md": page("Changed description", "Old", "## Decision\n\nOld.\n") });
      assert.equal(find(fixture.lint("base"), "immutable", "wiki/pages/decision-old.md").length, 1);
    });

    it("lets descriptions change, but never deletes pages", () => {
      using fixture = new Fixture(validFiles());
      fixture.commit();
      fixture.git("branch", "base");
      fixture.write({ [ALPHA]: page("The first concept", "Alpha", "Rewritten.\n") });
      assert.deepEqual(summary(fixture.lint("base")), []);
      fixture.remove(ALPHA);
      assert.ok(summary(fixture.lint("base")).includes(`error permanent ${ALPHA}`));
    });

    it("warns when the base ref is missing", () => {
      assert.deepEqual(summary(lintWith({}, "nope")), ["warning base wiki/pages"]);
    });
  });

  it("warns when a cited repository file changed after the page", () => {
    using fixture = new Fixture({
      ...validFiles(),
      "src/app.ts": "v1",
      [ALPHA]: page("The first concept", "Alpha", "See [app](../../src/app.ts).\n"),
    });
    fixture.commit("2026-01-01T00:00:00Z");
    assert.deepEqual(summary(fixture.lint()), []);
    fixture.write({ "src/app.ts": "v2" });
    assert.deepEqual(summary(fixture.lint()), [`warning stale ${ALPHA}:9`]);
  });
});
