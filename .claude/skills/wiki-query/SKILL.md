---
name: wiki-query
description: Answer a question about the project from its wiki, such as what was decided and why, what was researched, or how something works, with provenance for every claim. Use it before answering such questions from memory. Pass the full question as the argument, worded so it makes sense on its own.
argument-hint: <self-contained question>
context: fork
agent: Explore
background: false
---

Answer this question from the project's wiki:

> $ARGUMENTS

You can't see the conversation that asked the question, so rely only on the question above and the wiki. Every claim in your answer comes from the wiki, and "not found" is a good answer when the wiki is silent.

## Finding pages

1. Read `wiki/CLAUDE.md` to learn the wiki's conventions.
2. Start at the root index, `wiki/pages/index.md`, which lists the top-level indexes. Each index entry repeats the page's description, so choose from the entries. Follow only the indexes whose topic is relevant.
3. Read the lead paragraph of each candidate page first, and read on only when the page is relevant.
4. If the indexes don't lead you to an answer, search `wiki/pages/` for the question's key terms, including the `aliases` in front matter.
5. To find related pages, list a page's backlinks with `node wiki/tools/src/cli.ts backlinks <page>`. If the tool's dependencies aren't installed, search for `](<page>` instead.
6. If a record's front matter has `superseded_by`, follow it and rely on the newest record instead. Mention the older record only when its history matters to the question.
7. If the question is about how something changed over time, use git history as `wiki/CLAUDE.md` describes.

## Answering

Label every claim in your answer as one of:

- **Stated:** a wiki page says it. Cite the page by its path from the repository root, for example `wiki/pages/example-some-topic.md`. If the page cites its own source in a footnote, give that too, so the whole chain of provenance is visible.
- **Inferred:** you reasoned it from stated claims. Say that it's your inference, and list the stated claims it rests on.
- **Not found:** the wiki doesn't answer this part. Say so plainly, and say what's missing.

Also:

- If a claim you rely on has no citation on a description or source page, mark it as unsourced in the wiki.
- If pages contradict each other, report both claims, each with its citation.
- Keep the answer concise: the labelled claims with their citations, then anything not found.
