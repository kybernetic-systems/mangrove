# Wiki conventions

This folder holds the project's wiki. It's for people and AI agents alike. It records what we decided and why, what we researched, and how things work. Plans live in GitHub issues.

Every change to the wiki goes through a reviewed pull request, like code. The lint tool in `wiki/tools/` checks most of these conventions, locally and in CI.

## Folders

- `wiki/pages/` holds every page, in one flat folder with no subfolders.
- `wiki/media/` holds images and other media, in one flat folder. Media files are named after their content, so several pages can use them.
- `wiki/tools/` holds the lint and backlinks tool.

## Page names

- Each page is named `<type>-<name>.md`:
  - `<type>` is one of the page types listed below. It's a single lowercase word with no hyphens.
  - `<name>` is lowercase words and digits separated by hyphens, for example `example-some-topic.md`.
- The one exception is the root index, `wiki/pages/index.md`.
- File names are permanent. A page keeps its name for good, because other pages, including records, link to it by that name.

## Records and descriptions

Every page type is one of three kinds:

- **Record:** a source of truth captured at a point in time, such as a decision or an incident analysis. Records are **immutable**. A record is itself the source, so instead of citations it links to its context, such as the issue, the pull request or the research behind it.
- **Description:** explains or summarises something, such as a concept or how a system works. Descriptions are **mutable**: when they're out of date, edit them. Their claims need citations.
- **Source:** describes an external source we learned from, such as a paper or a book. Sources are mutable. The source itself usually isn't in the repository, so its page keeps what we took from it, with page or section numbers, so the knowledge stays available without the original.

## Page types

Page types are added as they're needed, in the same pull request as the first page of the new type. For example, the first paper we cite adds a `paper` type of the source kind. Each type has a kind and, optionally, the `##` sections every page of that type must have. The lint tool reads this table.

| Type | Kind | Purpose | Sections |
|---|---|---|---|
| `index` | description | Lists the child indexes or pages for one topic. | |

## Page structure

Every page follows this order:

1. **Front matter**, described below.
2. **`# Title`**, the page's only level-one heading.
3. **Lead paragraph:** a short paragraph that answers the page's main question first. Readers, and agents deciding whether to read on, may read only this.
4. **Body:** the sections the page type requires, then any others.
5. **`## See also`** (optional): a short, curated list of related pages for readers, limited to pages the body doesn't already link to.
6. **Footnote definitions**, at the end of the file.

## Front matter

Front matter holds only what can't be derived. The type comes from the file name, the title from the heading, and dates and authors from git history.

```yaml
---
description: A one-line summary of the page
aliases:
  - Another name
---
```

- `description` (required): a short description of the page, in 100 characters or fewer. Index entries repeat it word for word.
- `aliases` (optional): other names and abbreviations people might search for.
- `supersedes` (records only): the file name of the record this one replaces.
- `superseded_by` (records only): the file name of the record that replaces this one.
- For source kinds only:
  - `url` (required): where to find the source, such as a DOI link.
  - `authors` (optional): a list of the authors' names.
  - `year` (optional): the year it was published.

These are the only fields, so the schema stays the same across pages.

## Links

- Pages link to each other by file name alone, for example `[Some topic](example-some-topic.md)`.
- Links to other files in the repository use relative paths, for example `[README](../../README.md)`. Relative paths work both on GitHub and in a local viewer.
- Links to headings, such as `example-some-topic.md#some-heading`, are fine.
- Images live in `wiki/media/` and always have alt text: `![Review flow](../media/review-flow.svg)`. Prefer text formats you can diff, such as Mermaid diagrams or SVG, to binary images.

## Citations

Every claim a description or source page makes about the project, its code, its history or the outside world is backed by a citation. Statements about the wiki itself, such as what an index covers, are their own provenance. Citations are footnotes:

```markdown
Some claim about the topic.[^1]

[^1]: [Some topic](example-some-topic.md)
```

A footnote can cite:

- another wiki page;
- a source page, with a page or section number, for example `[^2]: [Knuth 1984](example-knuth-literate-programming.md), p. 42.`;
- a file in the repository, with a relative link;
- an issue, a pull request or a commit, with its GitHub link;
- a web page, with its URL and the date you read it.

## Indexes and the hierarchy

The hierarchy comes from index pages.

- An index is a page of type `index`, named `index-<name>.md`. The root index is `index.md`.
- The root index lists only indexes, in its `## Indexes` section.
- Every other index lists child indexes in an `## Indexes` section, pages in a `## Pages` section, or both.
- Each entry is one list item, followed by the target page's description:

  ```markdown
  - [Some topic](example-some-topic.md) — A one-line summary of the page
  ```

- Every index other than the root is listed by at least one other index, so every index can be reached from `index.md`.
- Every page is listed by at least one index. A page can be listed by several indexes.
- When an index grows past 30 entries, split it into child indexes.

## Superseding a record

Once a record is merged into `main`, it stays as it was written. Until then, it can be changed in its pull request like any other file. To replace a merged record:

1. Write a new record of the same type, with `supersedes:` set to the old record's file name.
2. Add `superseded_by:` with the new record's file name to the old record's front matter. This is the one change a merged record ever receives.
3. In every index that lists the old record, replace its entry with the new record.

## History

The wiki is in git, so every page's history is already recorded. When you need to know how something changed, ask git:

- `git log -p -- wiki/pages/<page>` shows every change to a page.
- `git log -S '<text>' -- wiki/` finds the commits that added or removed some text, such as a claim.
- `git blame wiki/pages/<page>` shows which commit last changed each line.
- A commit's pull request often explains why the change was made: `gh pr list --search <commit> --state merged`.

## Tools

Install the dependencies once with `pnpm --dir wiki/tools install`. Then, from the repository root:

- `node wiki/tools/src/cli.ts lint` checks these conventions. Errors fail CI. Warnings point at things worth a look. By default it compares against `origin/main` to check that merged records and page names stay as they were. Use `--base <ref>` to compare against another ref.
- `node wiki/tools/src/cli.ts backlinks <page>` lists the pages that link to a page.

## Skills

Claude works with the wiki through four skills in `.claude/skills/`:

- `wiki-query` answers a question from the wiki, with provenance.
- `wiki-update` adds or changes pages, after the user has agreed that something should be recorded.
- `wiki-lint` runs the lint tool and reports the results.
- `wiki-review` looks for problems a tool can't find, such as contradictions, stale claims and missing pages, and proposes changes.
