# Protocols

> Load when: unsure about session ritual or archiving procedure. Defines the session ritual and controlled forgetting.

## Session ritual

### Start

1. Load files per AGENTS.md §1 (load order).
2. State what you will do — one sentence. If the task is unclear, ask (`clarify` preference).
3. Read state/current.md. If the focus is stale or the next list is empty, surface this and ask.
4. If a `repo/` overlay exists, confirm its checked-out branch matches `current.md` `branch:` (run `truss status`, or `git -C repo symbolic-ref --short HEAD`). On a mismatch, apply the `branch-guard` preference: with `warn` (default) or `strict`, STOP, tell the human, and recommend `git -C repo switch <declared>` before doing branch-specific work; with `off`, just note it and continue.

### During

- Respect the phase block (allowed/forbidden). If a task would violate `forbidden`, state the conflict and ask before proceeding (`phase-lock` preference).
- Flag instead of drifting: if something is wrong or suboptimal, name it.
- Route facts, decisions, and todos as they arise — don't batch at the end.
- Write back per work unit: when a task completes (deliverable done, decision recorded, `next:` item finished), update state/current.md before or together with reporting it done. This is silent standard practice — no announcement; the diff is the record. The test: if the session ended right now, would state/current.md mislead the next agent? Review rounds on an unfinished draft are not a unit; a newly discovered blocker is — record it when it appears.
- When orchestrating subagents, the orchestrating session owns the state/current.md write-back; subagents report their results, they don't write it.
- If terminal/CLI access is unavailable, keep working in Markdown but say that `doctor`, `render`, `set`, or `map` validation could not run and suggest to run them manually or inspect the touched files.

### End (safety net, in order)

The per-unit write-back above is the primary mechanism; the end ritual verifies it. Never save state up for this step — a session can end without reaching it.

1. Verify state/current.md matches reality: current focus, next ≤5, blockers, recently-done (≤7 days). With a `repo/` overlay, set `branch:` to the branch the work belongs to.
2. Route any loose ends still unrouted: unresolved open questions → open-decisions, unresolved todos → HUMAN-TODOS.md.
3. Use `node .truss/bin/truss.mjs doctor` manually when unsure or at phase exits.
4. If `auto-commit: suggest`, propose a commit message: `<area>: <action> — <context>`.

## Controlled forgetting

The goal: keep the active workspace scannable in one pass. Archive is not deletion — it's relocation with a pointer.

**When to archive:**

- A domain file exceeds ~500 lines → split the oldest / least-active section to `archive/<domain>/<topic>.md`
- A decision is superseded (see D-NNN grammar in docs/conventions.md) → the entry stays in state/decisions.md with `Superseded-by:`; once its full text no longer informs current work, compress it in place to heading + supersede note and move the body to `archive/decisions.md` — decisions.md is boot context, dead prose there costs every session
- A task is fully done and has been in recently-done for >14 days → remove from state/current.md (it's in git history)
- A HUMAN-TODOS.md entry is checked `[x]` and clearly settled (the next session no longer needs it) → move the line verbatim to `archive/human-todos.md`; the HT counter continues across archived entries
- An open-decisions.md entry was decided → it is removed the moment the D-NNN (with `Closes: OD-NNN`) is written — never park a "DECIDED" tombstone; update references to point at the D-NNN instead

**When to clean up active files:**

- stale: focus, tasks, notes, or assumptions no longer match the current project state
- duplicated: the same truth appears in more than one canonical file
- wrong place: content belongs in a domain file, `pm/`, `HUMAN-TODOS.md`, `state/open-decisions.md`, `state/risks.md`, or `.trussignore`
- too large: a file is hard to scan, especially domain files over ~450 lines or five distinct themes
- bulk data: copied logs, exports, generated files, datasets, or foreign repo content should be ignored or moved out of active context
- archive-worthy: superseded material still useful as history should move to `archive/` with a pointer

**How to archive:**

1. Move the content to `archive/<path>`.
2. In the original location, add a one-line invalidation note: `> Archived to archive/<path> on YYYY-MM-DD — [reason].`
3. Update the §2 table in AGENTS.md if the original file is removed.

**Never silently drop content.** If it existed and mattered, the trace must remain.

## Latent notes

When you spot a future problem that isn't yet blocking, record it with a `latent:` prefix in the relevant file:

```
latent: [YYYY-MM-DD] this approach may break at scale because [reason] — revisit before build phase.
```

Latent notes are not action items. They are traps marked for future sessions.
