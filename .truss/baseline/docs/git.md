# Git

> Load when: before the first commit of the session, or when working with overlay git.
> Defines commit discipline and overlay git mechanics.

## Commit format

```
<area>: <action> — <context>
```

- **area**: file group or feature (e.g. `state`, `docs`, `agents`, `repo/auth`, `dashboard`)
- **action**: imperative verb phrase (e.g. `add D-003 tech stack decision`, `fix phase block timestamp`)
- **context**: why or what changed (one clause; omit if the action is self-explanatory)

Examples:
```
state: add D-003 tech stack decision — chose TypeScript over Go for team familiarity
agents: update phase block to validate — discover exit approved
docs: add conventions entry grammar for OD-NNN
repo/auth: implement JWT refresh — covers expired-token edge case
```

Keep the subject line under 72 characters. Body is optional; use it for breaking changes or migration notes.

## When to commit

- After each logical unit of work (a decision, a completed task, a phase advance).
- Never in the middle of a refactor — leave the tree clean.
- With `auto-commit: suggest`, the agent proposes the message; you run `git commit`.
- With `auto-commit: off`, you write your own commit messages.

The agent never runs `git commit` itself (hard limit).

## Overlay git

Some projects use Truss to manage an *existing* repository — the workspace sits alongside or above the repo. In this setup:

- `repo/` (or a symlink) points to the existing codebase.
- The workspace and the repo have separate git histories.
- Commits to `repo/` follow the repo's own conventions; workspace commits follow this file.
- Never mix workspace state files and repo source files in the same commit.

**To set up overlay git:**

1. Clone the target repo into `repo/` (or symlink).
2. Add `repo/` to `.gitignore` if workspace and repo share a git root.
3. Document the overlay structure in state/profile.md under Tools.
4. Note in docs/import.md which files were imported and from where.

## Tags and branches

- Tags: `truss/phase-<name>-exit` when a phase is approved (human tags after HT is checked off).
- Branches: workspace conventions don't prescribe branch strategy — follow whatever is in state/profile.md.
