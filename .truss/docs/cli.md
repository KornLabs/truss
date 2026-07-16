# CLI reference

Every command runs through the dispatcher:

```bash
node .truss/bin/truss.mjs <command> [flags]
```

The examples below assume the alias `truss='node .truss/bin/truss.mjs'`.
The CLI has **zero dependencies** and needs only Node ≥ 20.

The command surface is defined once in `.truss/lib/command-meta.mjs`, which
drives both `truss help` and the dashboard's action whitelist — so the help
text can never drift from what is actually dispatched.

---

## `init`

Preflight and scaffold a workspace from the core baseline. Fatal write failures
roll back files created by that run. Existing files are preserved unless the
user explicitly adopts `AGENTS.md` or overlay init adds `repo/` to an existing
`.gitignore`.

```bash
truss init --name "My Project" --lang English
```

| Flag | Meaning |
|---|---|
| `--name <name>` | project name (used in `profile.md`, VISION/README titles); skips the interactive prompt |
| `--lang <lang>` | primary language for agent output, e.g. `English`, `German` |
| `--overlay` | existing-project mode: installs the `ingest → operate` phase flow and adds `repo/` to `.gitignore` |
| `--repo <path\|url>` | (overlay only) bring the existing code in under `repo/`: a local path is symlinked, a URL is `git clone`d. Best-effort — a failure is reported, never fatal |
| `--code-root <dir>` | (overlay only) select exactly one existing relative in-workspace directory as the code-worktree boundary instead of `repo/`; it is not moved or added to `.gitignore` |
| `--adopt-agents` | preserve a marker-free existing `AGENTS.md` as a preamble and append the Truss router; without this flag init refuses before writing |

`--code-root` does not relocate the workspace, the `.truss/` engine, or Truss
state. It writes the normalized POSIX path to `state/profile.md`; status,
branch-guard, phase evidence, code-root checks, `map`, and `repo-map` then use
that same boundary. The directory must already exist inside the workspace and
must not be a Truss-managed top-level path. Absolute paths, backslashes, and
`..` traversal are rejected. Omit the option for the standard `repo/` overlay.

With no flags in a TTY, `init` asks interactively. With no TTY and missing
required answers it errors instead of hanging.

For the full existing-project flow, see
[overlay.md](overlay.md). The installed phases are a seed: the kickoff tailors
them to the project, and agents may restructure the plan later (D-NNN + telling
the human; advancing `current:` stays human-only) — see
[../phase-profiles/README.md](../phase-profiles/README.md).

---

## `status`

Print a compact, read-only summary of the workspace — current date/time, phase,
and health. The **canonical session-start command** (AGENTS.md §4): agents run it
first every session. The `Date:` line is a temporal anchor — agents have no
reliable clock, and a current timestamp lets them judge the age of `updated:`,
`Opened:`, and recently-done dates in the state files.
When `state/profile.md` configures a
`code-root`, it also prints a **Branch** line: the live code-root branch against the
`branch:` declared in `state/current.md` (`✓` when they match, `✗ MISMATCH` with a
switch hint when they don't). This is the live branch check — `doctor` itself
stays purely file-based and never reads the live branch (see `branch-guard`).

```bash
truss status
```

---

## `repo-map`

Print a compact, read-only orientation map for the configured code root.
It respects the workspace `.trussignore` and the code checkout's own
`.gitignore`/`.trussignore`, and has fixed limits: depth 3, 500 files scanned,
200 output lines. It never writes a map file.

```bash
truss repo-map
```

---

## `doctor`

Check workspace health. Runs every check family (see
[concepts.md §6](concepts.md#6-checks-the-doctor)) and prints findings grouped by
severity. **Read-only** — it never edits your files.

```bash
truss doctor              # human-readable report
truss doctor --gate       # also run phase-exit (PH-04) checks
truss doctor --json       # write .truss/out/doctor.json (for tooling)
truss doctor --html       # write .truss/out/doctor.html (static report)
truss doctor --fix-prompt # print a copyable remediation prompt for an agent
```

**Exit codes** (useful in CI): `0` clean · `1` warnings only · `2` at least one
error.

---

## `render`

Regenerate the phase block inside `AGENTS.md` from `state/phases.md`. Run it after
any edit to the phase definitions or the `current:` pointer. This is the only
sanctioned writer of that block; editing it by hand is a `BL` error.

```bash
truss render
```

---

## `phase`

Show the phases, or set the current one. With no argument it lists every defined
phase and marks where you are. With an `<id>` it validates the id against
`state/phases.md`, updates the `current:` pointer, and re-renders the `AGENTS.md`
phase block — the supported alternative to hand-editing `current:` and remembering
to `render`. Before changing `current:`, the command runs the active phase's exit
gate.

```bash
truss phase            # list phases, show the current one
truss phase operate                    # switch only when the exit gate is clear
truss phase operate --override-gate    # explicit human confirmation/override
```

Phase changes stay **human-only** by protocol (AGENTS.md §4). The CLI cannot
authenticate the caller, but it refuses unmet machine or human gate results
unless `--override-gate` is present. That flag records explicit intent; it is not
proof that a human invoked the command.

---

## `set`

Change one agent preference. The value is validated against the catalogue before
the preferences block in `AGENTS.md` is rewritten.

```bash
truss set criticality high
truss set response-style compact
```

### Preference keys

| Key | Values | Default |
|---|---|---|
| `orchestration` | low · medium · high | medium |
| `criticality` | low · medium · high | high |
| `clarify` | ask · infer | ask |
| `input-trust` | open · medium · critical | medium |
| `research-agent` | off · on | on |
| `review-agent` | off · on | on |
| `source-citation` | off · on | off |
| `scope` | off · minimal · balanced · thorough | off |
| `auto-commit` | off · suggest · on | suggest |
| `post-task-check` | off · inline · subagent | inline |
| `gate-advocate` | off · on · agentic | agentic |
| `phase-lock` | off · advisory | advisory |
| `branch-guard` | off · warn · strict | warn |
| `response-style` | normal · compact · maxcompact | normal |
| `control-word` | `off` or any short word | TRUSS |

Each non-omitted preference renders one directive line into the `AGENTS.md`
preferences block. `scope: off` renders no line. `control-word: off` renders an
explicit opt-out directive (`control-word=off :: do not prepend a control word
to responses`) so the disabled state is visible in the block.

---

## `map`

Regenerate `state/map.md`, the auto-generated overview of the domain files under
`context/`. Read-only for your content; it only rewrites the map file.

Each row carries a `~Tokens` column: the estimated read cost of that file
(words × 1.5, the same method as the boot-budget check, coarsely rounded).
Agents weigh this cost before loading a file — the map shows what exists *and*
what it costs to know. Estimates refresh on each `truss map` run; token drift
alone never marks the map as outdated (doctor's ST-07 compares maps with the
tokens column stripped, so ordinary editing does not create noise).

```bash
truss map
```

---

## `dashboard`

Start the local web dashboard — a browser view of status, phases, decisions,
mandatory Truss boot metadata, and drift warnings. Binds to `127.0.0.1` only.

```bash
truss dashboard
```

| Flag | Meaning |
|---|---|
| `--port <n>` | port to listen on (default `3741`) |
| `--no-open` | don't open a browser automatically |
| `--read-only` | start in read-only mode (all write endpoints disabled) |

See [architecture.md §Dashboard](architecture.md#dashboard) for the security
model.

---

## `prompt`

Manage user-created custom prompts (written to `.truss/prompts/custom/`). Mostly
driven by the dashboard, but available directly:

```bash
truss prompt save <id> [content]   # write custom/<id>.md
truss prompt reset <id>            # copy base/<id>.md → custom/<id>-custom.md
truss prompt delete <id>           # remove custom/<id>.md
```

---

## `help`

List all commands with a one-line summary.

```bash
truss help
```
