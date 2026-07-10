# Concepts

This is the mental model behind Truss. Read it once and the file layout, the
CLI, and the agent's behaviour all follow from the same few ideas.

## 1. Files are the source of truth

Everything a project knows lives in plain Markdown. There is no database and no
hidden state. If you want to know what the project has decided, you open
`state/decisions.md`. If you want to change it, you edit the file. The CLI never
owns the truth — it only reads these files, checks that they agree with each
other, and reports what it finds. This is what makes Truss portable, diffable,
and free of lock-in: a workspace is just a folder of text.

A direct consequence: **every fact has exactly one canonical home.** You link to
it, you never copy it. Two files holding the same number or name is treated as a
bug (the `RF` checks catch it).

## 2. The boot file: AGENTS.md

`AGENTS.md` is the one file every agent reads in full, every session. It follows
the open [AGENTS.md](https://agents.md) convention, so it is tool-agnostic — small
adapter stubs (`CLAUDE.md`, `GEMINI.md`, `.cursorrules`,
`.github/copilot-instructions.md`) each contain a single line pointing back to it.

`AGENTS.md` defines:

- **Load order (§1)** — the handful of files an agent must read before doing
  anything, and the rule to stop reading as soon as the task is unambiguous.
- **Structure & routing (§2)** — a table of every core file, who owns it
  (Human / Agent / Script), and what belongs in it. This table is the authority
  on *where information goes*.
- **Rules, session protocol, hard limits (§3–§5)** — how an agent works, what it
  must do at the start and end of a session, and the things it may never do
  (e.g. change the phase, edit a generated block by hand, commit secrets).

Two regions of `AGENTS.md` are **generated** and marked with `truss:begin/end`
comments: the *preferences* block and the *phase* block. You never edit these by
hand — `truss set` and `truss render` are their only writers.

## 3. The state layer

`state/` is the project's working memory. Each file has a single job:

| File | Holds |
|---|---|
| `current.md` | the live focus: what you're doing, next actions (≤5), blockers, recently done |
| `decisions.md` | decided decisions, each a `D-NNN` entry; superseded, never deleted |
| `open-decisions.md` | undecided questions with options and trade-offs (`OD-NNN`) |
| `phases.md` | the phase definitions and the `current:` pointer |
| `profile.md` | project name, language, tools, PM method, style notes |
| `risks.md` | project, launch, safety, strategy, or blocker risks (`R-NNN`); loaded on demand |
| `learnings.md` | recurring agent weaknesses and structural fixes (`L-NNN`) |
| `map.md` | a script-generated overview of domain files (on demand) |

Everything that *describes a topic* rather than the project's process goes into a
**domain file** under `context/<domain>.md`, created on demand. Domain files are
not pre-registered — `state/map.md` maps them automatically.

## 4. Structured IDs

Truss uses a small set of sequential, never-reused IDs so that any claim can be
traced to one place:

- `D-NNN` — a decision
- `OD-NNN` — an open (undecided) question
- `HT-NNN` — a human-only to-do
- `L-NNN` — a learning
- `R-NNN` — a risk

The `RF` checks verify that every referenced ID is defined exactly once.

## 5. Phases

A project moves through a fixed lifecycle. The core flow is four phases:

```
discover  →  validate  →  plan  →  build
```

Each phase narrows or widens what an agent may do. `discover` is divergent
(generate options, no code yet); `validate` seeks disconfirming evidence;
`plan` is convergent (every open question gets a `D-NNN`); `build` ships. Each
phase declares its `allowed`, `forbidden`, `forbidden-globs`, the files to
`read`, and the `exit` criteria that must be met to leave it.

Two rules make phases trustworthy:

1. **Phase changes are human-only.** An agent never edits `current:` in
   `state/phases.md` or declares a phase done. When exit criteria look met, it
   runs `doctor --gate`, writes an `HT-NNN` summary, and stops. The human decides.
   The phase *model* itself — the definitions, order, and set of phases — can be
   reshaped by an agent, but only when the human explicitly asks; never on its own
   initiative, and never silently.
2. **The phase block is generated.** `state/phases.md` is the source; running
   `truss render` writes the human-readable phase block into `AGENTS.md` so an
   agent always sees the active rules without loading the whole phase file.

Projects that need a different lifecycle adopt a **phase profile** (e.g.
`software` adds an `operate` phase; `founders-thinking` ends in a concept/park
call). See [phase-profiles/README.md](../phase-profiles/README.md).
An existing codebase uses the **overlay** flow (`ingest → operate`) via
`init --overlay`.

## 6. Checks (the doctor)

`truss doctor` runs a catalogue of checks grouped into families. Each finding
has a severity — **E**rror, **W**arning, or **I**nfo — and an ID like `ST-02`:

| Family | Guards |
|---|---|
| `ST` Structure | the structure table matches what's actually on disk |
| `BL` Block | the generated preference/phase blocks haven't drifted |
| `RF` Reference | every link resolves and every ID is defined exactly once |
| `SY` State | the state files have the required keys and aren't stale |
| `PH` Phase | the phase grammar is valid; `--gate` adds exit-criteria checks |
| `CX` Context | the mandatory per-session reading stays under the token budget |
| `HY` Hygiene | flags `context/` domain files untouched for >90 days (archive nudge) |

`doctor` is read-only. It reports; it never edits your files. `--fix-prompt`
emits an instruction block you can hand to an agent, `--json` is for tooling, and
`--html` writes a report. `--gate` is the phase-exit check.

Without terminal access, Truss degrades to manual Markdown operation: agents can
still follow the structure, but `doctor`, `render`, `set`, and `map` cannot
provide mechanical validation or generated updates. Say that plainly when a
workspace was changed without running the CLI.

| Missing command | Manual fallback |
|---|---|
| `doctor` | inspect touched files and disclose that mechanical validation did not run |
| `render` | edit `state/phases.md` only; generated blocks may be stale until CLI returns |
| `set` | do not hand-edit generated preferences; leave the change as a human todo |
| `map` | use existing domain files directly; `state/map.md` may be stale |

## 7. Preferences

A small catalogue of preferences tunes how agents behave — autonomy, criticality,
whether to ask or infer, commit behaviour, response style, and so on. They live
in the generated preferences block of `AGENTS.md` and are changed only through
`truss set <key> <value>`, which validates the value against the catalogue.
Defaults are deliberately cautious (e.g. `clarify: ask`, `criticality: high`).
The full list of keys and values is in [cli.md](cli.md#set).

## 8. Prompts

Truss ships a small **prompt library** — task prompts (`plan`, `implement`,
`bug-fix`, `refactor`, `research`, `critique`, …), session prompts (`resume`,
`handover`), and one orchestration wrapper — plus a set of engine-ritual prompts
the phase machine uses internally. Prompts are intentionally lightweight: a
one-line mandate and the result bar, leaving the method to the agent, because the
house rules already live in `AGENTS.md`. Details:
[prompts/README.md](../prompts/README.md).

## 9. The dashboard

`truss dashboard` starts a local-only web view of the workspace — status,
phases, decisions, the context budget, and drift warnings — and can trigger the
safe, read-only/confined CLI actions. It binds to `127.0.0.1` only and never
writes files directly. See
[dashboard/README.md](../dashboard/README.md) and
[architecture.md](architecture.md#dashboard) for the security model.

---

Put together: **files hold the truth, `AGENTS.md` boots the agent, the state
layer is the memory, phases gate the work, and the doctor keeps it all
consistent.** Everything else in the repo is an implementation of these ideas.
