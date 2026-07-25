# AGENTS.md

> Boot file for all AI agents in this workspace (open agents.md standard, tool-agnostic).
> Files are the single source of truth; scripts only check and report — except the two generated blocks below. Read this file fully, then load per §1.
>
> This workspace is memory, not storage: the work product lives in the code root; here lives only what a future session needs in order to act — every fact in exactly one file (§2), nothing written just in case (§3).

<!-- truss:begin preferences -->
> empty — all preferences off (host-agent defaults). Set via `node .truss/bin/truss.mjs set <key> <value>`.
<!-- truss:end preferences -->

<!-- truss:begin phase -->
> Rendered by `node .truss/bin/truss.mjs init`/`render` from `state/phases.md` — edit there, then run `truss render`.
<!-- truss:end phase -->

## 1 Load order

1. This file — fully, every session.
2. `state/current.md` — focus, next actions, blockers.
3. `VISION.md` — once per session.
4. `state/profile.md` — project language, tools, style.
5. `state/decisions.md` — before making or proposing any decision; `state/open-decisions.md` (if present) when the task touches an open question.
6. The phase block's read list, then the one domain file your task belongs to (§2).

Load the smallest context that can answer the task; stop as soon as it is unambiguous — no archives, history, bulk data, engine internals, or unrelated domains unless the task requires them.

## 2 Structure & routing

Routing policy: which file owns what. Not a file inventory — that is `state/map.md` (script-generated, with read-cost estimates). Owner: H human · A agent · S script.

| Path | Owner | Purpose / what belongs here |
|---|---|---|
| AGENTS.md | A body · S blocks | router, this table, rules |
| README.md | H | human onboarding — not agent context |
| VISION.md | H+A | problem, idea, principles, constraints |
| state/current.md | A | focus · next (≤5) · blockers · recently done (≤7 days); one line per item |
| state/decisions.md | A | decided decisions D-NNN; supersede, never delete |
| state/phases.md | H pointer · H+A definitions | phase definitions and `current:` pointer |
| state/profile.md | H+A | project name/language, code-root, tools, style, and the durable behaviour preferences the human dictates; one line per entry |
| state/open-decisions.md (on demand) | A | briefings for undecided questions (options + trade-offs); on decision → D-NNN with `Closes:`, remove the entry |
| state/risks.md (on demand) | A | risks R-NNN; load only for risk, Go/No-Go, launch, safety, or blocker work |
| state/learnings.md (on demand) | A | systemic agent/framework weaknesses — not a product bug log |
| state/map.md (on demand) | S | auto-generated domain map with read-cost estimates; read-only |
| HUMAN-TODOS.md (on demand) | A→H | only what no agent can execute — qualifier test in docs/conventions.md (HT-NNN, ≤2 lines each); settled `[x]` entries → archive/human-todos.md |
| docs/ | A | working docs (conventions · protocols · git · import) — read per §6 |
| context/ (on demand) | H+A | domain (topic) files — one canonical home per topic (`context/<domain>.md`) |
| archive/ (on demand) | A | superseded material with one-line invalidation note |
| repo/ (on demand) | H+A | the work product (code repo or overlay target) — contents not table-managed |
| pm/ · skills/ (on demand) | A | PM files per profile method · agent skills |
| .truss/ | S | engine: scripts, checks, prompts, dashboard — read-only for agents except `prompts/custom/` |
| .trussignore | A | paths the map + doctor must skip (foreign/bulk data); gitignore syntax |
| package.json | S | metadata + `test`/`doctor` script aliases; zero dependencies |
| CLAUDE.md · GEMINI.md · .cursorrules · .github/copilot-instructions.md | S | adapter stubs — one line each pointing to AGENTS.md |

On demand means: the path does not exist until its first real entry. Never create a file empty or "for later" — write it the moment the first admitted entry needs it; a directory appears when its first file does. Promote a file to a directory only when pruning can no longer keep it under the growth limit (~450 lines) AND tasks regularly need only a slice of it — split by theme; prune first, split second.

Routing tie-breakers: how-you-work preference → state/profile.md · technical convention → docs/conventions.md · describes the world → domain file · commits us to act → owning domain · is a decision → state/decisions.md · only a human can do it → HUMAN-TODOS.md · unsure → ask, don't guess.

## 3 Rules

Canonical truth: every operational fact lives in exactly one file; link, never copy.

Admission & expiry: before writing, name what a future session does differently because of the entry — if nothing, don't write it; never restate what git, the code, or another file already carries. Boot files (§1) hold only what every session needs. Whenever you touch a file, prune what no longer earns its place — relevance decides, not age, and VISION.md and state/ are not exempt; archive with a pointer (docs/protocols.md), never silently drop.

Language: all free-text follows `language:` in state/profile.md — entry titles and bodies included; only the machine-parsed skeleton stays English — ID tokens, keys/field labels, fixed file headings.

Consistency — a change is complete only with its follow-ups: human decided → D-NNN (with `Closes:`), update affected canonical files, remove the OD entry · new undecided question that blocks work → open-decisions briefing · new fact → its one canonical file, contradicted content gets an invalidation note · task done → write focus/next/blockers back to state/current.md before reporting done · same fact found in two files → fix the canonical one, then grep and sync the copies · superseded content → archive/ plus invalidation note.

Problems — never knowingly pass one by: fix it if no human input is needed and say so; otherwise flag it (open-decisions or HT entry). Suspected wrong input → say "X may be wrong because Y", don't silently comply. Future trap → record it where it belongs with a `latent:` note.

Conflict tie-breaker: AGENTS.md §2 table governs structure · state/decisions.md governs decided facts · domain files govern domain content · flag all others via open-decisions.

Scan scope: foreign or bulk data placed in the project belongs in `.trussignore` so it stays out of state/map.md and doctor findings; git-ignored paths are skipped automatically.

IDs: D-NNN decisions · OD-NNN open decisions · HT-NNN human todos · R-NNN risks · L-NNN learnings — sequential, never reused. Entry grammars: docs/conventions.md.

## 4 Session protocol

Start: load §1; run `node .truss/bin/truss.mjs status` — the canonical session-start command (date/time anchor, phase, health, branch); state what you will do; if the task is unclear, ask before touching files.

During: respect the phase block — if an action would violate `forbidden`, say so and ask before proceeding; never drift silently. Write back per work unit: the moment a task lands, update state/current.md and route its loose ends. Sessions can end without warning; unrecorded state misleads the next agent.

End: verify state/current.md matches reality; route anything still loose; run `node .truss/bin/truss.mjs doctor` when unsure about workspace health — if the CLI is unavailable, check the touched files manually and say that mechanical validation did not run.

Phase exit — when exit criteria appear met (never self-declare a phase change): run `node .truss/bin/truss.mjs doctor --gate`, collect the findings, write ONE `HT-NNN — Phase [X] exit: [verdict · findings]`, then STOP. The human decides.

## 5 Hard limits

- Never change `current:` in state/phases.md, declare a phase change, or proceed past exit criteria — human act only (§4).
- Phase definitions are yours to maintain — restructure future phases with a D-NNN, tell the human, then `truss render`; never loosen the CURRENT phase's `forbidden`/`forbidden-globs`/`exit` without explicit human confirmation.
- Never edit the generated blocks by hand — use `truss set`, `truss render`, `truss phase`.
- Never write or commit secrets: keys live in a gitignored `.env`; document required key names in a tracked `.env.example`.
- Never store the same truth twice, create empty files or folders, or add per-folder index files.
- Never delete a decision — supersede it.
- Never ignore a known problem — fix or flag it (§3).
- Subagents inherit your active preferences and the current phase's forbidden list / `forbidden-globs` — recursively; before any write to a forbidden path they re-check the phase gate and refuse if the phase forbids it.

## 6 On-demand docs

| Read | when |
|---|---|
| docs/conventions.md | writing your first D-/OD-/HT-/R-/L- entry or a new file type this session |
| docs/protocols.md | unsure about session ritual, archiving, or whether an entry belongs in the workspace at all |
| docs/git.md | before the first commit of the session; anything overlay or git |
| docs/import.md | importing an existing project |
