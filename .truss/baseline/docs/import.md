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

An overlay starts in `ingest` (import the system), then moves to `operate` (run it). Stay in `ingest` until the system is mapped and summarised; then `node .truss/bin/truss.mjs phase operate` (a human action — it updates `current:` and re-renders). If the project is actually still an idea/prototype rather than an existing system, the overlay is the wrong fit — use a fresh core `init` or a phase profile (see `.truss/phase-profiles/README.md`).

## Step 3 — Fill state files

- `state/profile.md`: fill in name, language, tools, style from existing docs.
- `state/decisions.md`: create D-NNN entries for significant past decisions. Use the date they were made if known; today's date otherwise.
- `state/current.md`: set the actual current focus and next actions.

## Step 4 — Place the existing codebase

The code lives **nested** under a single `repo/` directory inside the workspace (gitignored, its own git history — see docs/git.md). `truss init --overlay --repo <path|url>` does this for you (symlink a local path, clone a URL). If you didn't pass `--repo`, place it now:

1. `git clone <url> repo/` (or `ln -s /path/to/code repo`). Multiple codebases go in as `repo/<name>/`.
2. Confirm `repo/` is in `.gitignore` (overlay init adds it).
3. Add a note in state/profile.md under Tools: `repo/: <what it is>`.

## Step 5 — First doctor run

Run `node .truss/bin/truss.mjs doctor` and fix all findings before starting work. This surfaces any structural gaps introduced during the import.

## Import log

> Document what was imported here. One line per item.

<!-- Example:
- 2026-01-15: imported decisions from Notion "Architecture Decisions" page → D-001 through D-007
- 2026-01-15: linked existing repo at repo/ (git remote: github.com/org/myrepo)
-->
