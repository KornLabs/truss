# Import guide

> Load when: importing an existing project into this Truss workspace.
> Walks through mapping an existing project's files to the Truss structure.

## When to use this

Use this guide when you are adapting Truss to a project that already exists — an existing codebase, a Notion workspace, a folder of docs, or a prior project in a different structure.

## Step 1 — Inventory the existing project

List all significant files and folders. For each, decide:

| Existing item | Maps to |
|---|---|
| Core idea / README | VISION.md |
| Past decisions (in docs, Notion, Slack) | state/decisions.md (D-NNN) |
| Open questions | state/open-decisions.md (OD-NNN) |
| Tasks / backlog | state/current.md next list, or pm/ |
| Code repository | repo/ (or symlink) |
| Research notes | research.md or research/ |
| Meeting notes | domain file (e.g. meetings.md) |
| Existing conventions doc | merge into docs/conventions.md |
| Config, CI, infra | repo/ or a dedicated domain file |

Document the mapping in a section below this line before starting to move files.

## Step 2 — Set the phase correctly

Decide where in the lifecycle the project currently is. Update `current:` in `state/phases.md` to reflect reality (human-only action). Do not start in discover if the project is already in build — the phase block must reflect the actual state.

## Step 3 — Fill state files

- `state/profile.md`: fill in name, language, tools, style from existing docs.
- `state/decisions.md`: create D-NNN entries for significant past decisions. Use the date they were made if known; today's date otherwise.
- `state/current.md`: set the actual current focus and next actions.

## Step 4 — Place the existing codebase

If there is an existing repository:

1. Clone or symlink it to `repo/`.
2. Set up overlay git per docs/git.md if needed.
3. Add a note in state/profile.md under Tools: `repo/: <what it is>`.

## Step 5 — First doctor run

Run `node .truss/bin/truss.mjs doctor` and fix all findings before starting work. This surfaces any structural gaps introduced during the import.

## Import log

> Document what was imported here. One line per item.

<!-- Example:
- 2026-01-15: imported decisions from Notion "Architecture Decisions" page → D-001 through D-007
- 2026-01-15: linked existing repo at repo/ (git remote: github.com/org/myrepo)
-->
