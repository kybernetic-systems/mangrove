---
name: wiki-lint
description: Check that the project's wiki follows its conventions, by running the wiki's lint tool. It finds broken links, unlisted pages, bad names and front matter, edited records and more. Use it after changing the wiki.
allowed-tools: Bash(node wiki/tools/src/cli.ts *) Bash(pnpm --dir wiki/tools install*)
---

Check that the project's wiki follows its conventions.

1. If `wiki/tools/node_modules/` doesn't exist, install the tool's dependencies with `pnpm --dir wiki/tools install --frozen-lockfile`.
2. Run `node wiki/tools/src/cli.ts lint` from the repository root. It compares against `origin/main` by default. When the current branch is based on another branch, pass `--base <that branch>`.
3. Report the result:
   - **Errors** break the conventions, and fail CI.
   - **Warnings** point at things worth a look, such as a page citing a file that changed after the page did.
4. Fix the problems in pages you changed in this session. Report any others to the user, and fix them when asked. For a problem in a merged record, propose a superseding record.

The tool checks structure only. For contradictions, stale claims and missing pages, use the `wiki-review` skill.
