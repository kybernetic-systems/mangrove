---
name: wiki-update
description: Add or change pages in the project's wiki. Use it only after the user has agreed that something should be recorded in the wiki.
argument-hint: <what to record>
---

Record this in the project's wiki:

> $ARGUMENTS

## Before you start

- Make sure the user has agreed to add this to the wiki. If they haven't, stop and ask them.
- Read `wiki/CLAUDE.md`, and follow its conventions throughout.

## Steps

1. **Look for existing pages on the topic.** Follow the relevant indexes from `wiki/pages/index.md`, and search `wiki/pages/` for key terms and aliases. When a page on the topic exists, extend it:
   - If the page is a description or a source, edit it.
   - If the page is a record, supersede it with a new record.
2. **Choose a page type** from the table in `wiki/CLAUDE.md`. If none fits, propose a new type to the user, with its name, its kind (record, description or source) and any required sections. Wait for their agreement, then add it to the table in the same change.
3. **Write the page:**
   - Front matter with a `description` of at most 100 characters, plus `aliases` if people might search for other names.
   - A `# Title`, then a lead paragraph that answers the page's main question first.
   - The sections its type requires.
   - Citations: on description and source pages, every claim gets a footnote citing a wiki page, a source page, a repository file, an issue, a pull request, a commit, or a web page with the date you read it. If a fact comes from a paper, book or other external source without a source page, create one.
   - Records link to their context, such as the issue, the pull request, or the research behind them.
   - Media go in `wiki/media/`, named after their content, with alt text.
   - An optional, short `## See also` list of related pages the body doesn't already link to.
4. **When superseding a record**, set `supersedes` on the new record, and add `superseded_by` to the old record's front matter as its one change.
5. **Update the indexes.**
   - List the page in every relevant index, as `- [Title](page.md) — description`, with the description repeated word for word. The root index lists only indexes, so pages go in its child indexes.
   - When superseding, replace the old record's entries with the new record.
   - If no index fits, propose a new index to the user and list it in its parent index.
   - If an index grows past 30 entries, propose splitting it.
6. **Check the pages that link here.** When you change what a page says, run `node wiki/tools/src/cli.ts backlinks <page>` and check that the pages linking to it are still accurate. Propose any changes they need.
7. **Run the `wiki-lint` skill**, and fix what it reports in the pages you changed.

## When you're done

Leave the changes in the working tree, and tell the user which pages you added or changed, so they can decide whether the changes go in the current work's pull request or in a pull request of their own.
