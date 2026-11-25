# Mangrove

## Wiki

This project has a wiki in `wiki/`. Its conventions are in `wiki/CLAUDE.md`, and its root index is `wiki/pages/index.md`.

- **Check the wiki first.** Before answering a question about the project, such as what was decided and why, what was researched, or how something works, use the `wiki-query` skill.
- **Keep the provenance.** When you pass on what the wiki says, keep the labels and the citations: what the wiki **states**, what you **inferred** and from what, and what was **not found**.
- **Ask before you update the wiki.** When a session produces something worth keeping, such as a decision and its reasons, research findings, or an explanation of how something works, ask the user whether to add it to the wiki. Use the `wiki-update` skill only after they agree.
- **Keep the wiki in good shape.** After changing the wiki, run the `wiki-lint` skill. When the user asks for a deeper review, use the `wiki-review` skill.

## Where knowledge belongs

- **Project knowledge** goes in the wiki: decisions and their reasons, research, and how things work.
- **Project management** goes in GitHub: plans, status and discussion of work belong in issues, the project board and pull requests. Look there for context on current work.
- **Your private auto-memory** keeps only the user's personal working preferences.
