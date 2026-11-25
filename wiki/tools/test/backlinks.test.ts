import assert from "node:assert/strict";
import { it } from "node:test";
import { backlinks } from "../src/backlinks.ts";
import { Fixture, page, validFiles } from "./fixture.ts";

it("lists the pages that link to a page, with their sections", () => {
  using fixture = new Fixture({
    ...validFiles(),
    "wiki/pages/concept-beta.md": page("Beta", "Beta", "Builds on [Alpha](concept-alpha.md#details).\n\n## See also\n\n- [Alpha](./concept-alpha.md)\n\n`[code](concept-alpha.md)`\n"),
  });
  assert.deepEqual(backlinks(fixture.wiki(), "concept-alpha.md"), [
    { from: "concept-beta.md", line: 9, section: undefined },
    { from: "concept-beta.md", line: 13, section: "See also" },
    { from: "index-topics.md", line: 11, section: "Pages" },
  ]);
});
