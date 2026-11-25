---
name: wiki-review
description: Review the project's wiki for problems a lint tool can't find, such as contradictions, stale or unsourced claims, missing pages and missing cross-references, and proposes changes. Use it when the user asks for a review of the wiki or some of its pages.
argument-hint: "[pages to review, or \"all\"; defaults to the pages changed on this branch]"
context: fork
agent: Explore
---

Review the project's wiki for problems a lint tool can't find, and report the changes you propose. The user decides which to apply.

Scope: $ARGUMENTS

## Scope

- If the scope names pages, review those pages.
- If it says "all", review the whole wiki.
- If it's empty, review the pages changed on this branch: `git diff --name-only origin/main -- wiki/pages`. If nothing changed, say so and stop.

The wiki is `wiki/pages/` and `wiki/media/`, and every finding is about a page there. Read other files in the repository only to verify what a wiki page says about them.

For each page in scope, also read its neighbours: the pages it links to, and the pages that link to it, listed by `node wiki/tools/src/cli.ts backlinks <page>`. Problems often show up between a page and its neighbours.

Read `wiki/CLAUDE.md` first, for the conventions.

## What to look for

1. **Contradictions:** two pages that say incompatible things.
2. **Stale claims:** claims on description and source pages about the code, tools or processes that no longer match the repository. Check them against the files they describe. Use `git log` to see what changed since the page was written. Records describe a point in time, so judge them only by whether a description relies on one that has been superseded.
3. **Unsourced claims:** claims on description or source pages without a citation.
4. **Weak citations:** citations that don't support the claim they're attached to.
5. **Superseded content:** pages that cite or rely on a record whose front matter has `superseded_by`.
6. **Missing pages:** important concepts that several wiki pages mention but no page explains.
7. **Missing cross-references:** pages that discuss the same thing without linking to each other.
8. **Gaps:** questions the pages raise but don't answer. If a web search could fill a gap, say what to search for. You may search to confirm that an answer exists, and report it as a suggestion with its URL.

## Report

Group the findings by category. For each one, give the files and lines, what's wrong, the evidence, and the change you propose. Rank the findings by how much they'd mislead a reader, most misleading first. If you found nothing, say so, and list what you checked.
