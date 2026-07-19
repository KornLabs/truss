<p align="center">
  <img src=".github/hero-mockup.png" alt="Left: a project's plain-Markdown state files (AGENTS.md, state/current.md). Right: an AI agent booting from them and resuming exactly where the last session stopped." width="800">
</p>

<p align="center">
  <b>English</b> · <a href="README.de.md">Deutsch</a>
</p>

# Truss

**A layer that sits on top of your project and holds everything an AI agent needs to work on it — vision, plans, phases, current state, decisions, and docs — as plain Markdown.**
**Work-oriented by design: the agent loads only the context a task needs and always knows where to find the rest, so the window stays light instead of drowning in the whole repo.**
**No API keys, no metered bills: it runs on the AI subscription you already pay for.**

[![CI](https://github.com/KornLabs/truss/actions/workflows/ci.yml/badge.svg)](https://github.com/KornLabs/truss/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A5%2020-brightgreen.svg)](https://nodejs.org)
![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)

Every AI coding session starts from zero. Context scatters, decisions get
forgotten, and consistency rests on you re-explaining the project each time.
Truss fixes that with one folder that lives beside your code and acts as its
memory. An agent opens a single boot file — `AGENTS.md` — and instantly knows
what the project is, what phase it's in, what's being worked on right now, and
where to find anything else. Its deterministic boot metadata is about 3.8k
estimated tokens by default; task-selected domain and source files load on
demand.

Point any AGENTS.md-aware agent at it — Claude Code, Cowork, Codex, Gemini CLI,
Copilot, Cursor — start it in the project folder, and it resumes exactly where
the last session stopped. Agent-driven, but you make the calls: a tiny,
zero-dependency CLI checks the structure and surfaces open decisions for you.

> A truss is a light framework of struts that carries a structure's load and
> holds its shape — without being the building itself. Truss does the same for a
> project built with AI agents: a thin frame your work rests on, never a
> replacement for it.

<p align="center">
  <img src=".github/dashboard-overview.png" alt="Truss dashboard — Overview: current focus, phase, human to-dos, open decisions, and boot metadata at a glance" width="820">
  <br>
  <sub>Optional local dashboard over the same Markdown — <code>node .truss/bin/truss.mjs dashboard</code>. <a href="#dashboard-optional">More below.</a></sub>
</p>

## Principles

- **Files are the single source of truth.** Everything an agent needs lives in
  plain Markdown you can read, edit, and diff. No database, no lock-in.
- **Scripts check and report — they never decide.** The CLI validates the
  structure and surfaces drift; humans and agents make the calls.
- **Subscription-first.** Truss never calls a model itself — your agent does,
  through the plan you already have. That's what keeps it free to run and
  genuinely tool-agnostic.
- **Zero dependencies.** Node ≥ 20 is the only requirement. No `npm install`.
- **Tool-agnostic.** Built on the open [AGENTS.md](https://agents.md) convention;
  one-line adapter stubs point Claude, Gemini, Cursor, and Copilot at the same
  boot file.
- **Work-oriented, task-scoped context.** This is the core design goal, not a
  side effect. Every session boots from `AGENTS.md`, which hands the agent an
  ordered load list and one instruction: _load the smallest context that can
  answer the task, then stop._ A routing table (§2) plus a generated
  `state/map.md` route Truss's operational Markdown, so the agent can load domain
  knowledge on demand instead of ingesting it all. Source files and the
  task-selected domain context remain the agent tool's responsibility. The
  mandatory Truss boot metadata is about 3.8k estimated tokens at scaffold; the
  `doctor` context check (`CX`) measures that boot set plus explicit phase
  `read:` targets and warns past ~9k. It is not a measurement of total task
  context, task cost, or task quality.

**Portable guardrail contract.** Phase limits, human-only transitions, and
subagent inheritance are behavioral instructions. Truss reports grammar,
uncommitted forbidden-path evidence, and exit artifacts, but it does not
authenticate the actor or intercept file writes. Treat those rules as advisory
unless your agent host adds its own enforcement boundary.

## How it compares

|                        | **Truss**                                                  | Raw `AGENTS.md`                 | Heavy agent frameworks                       |
| ---------------------- | ---------------------------------------------------------- | ------------------------------- | -------------------------------------------- |
| Setup                  | Copy one `.truss/` folder, run `init`                      | Write & maintain a file by hand | Install deps, configure, sometimes a service |
| Dependencies           | None — Node ≥ 20 only                                      | None                            | Many (npm/PyPI, lockfiles)                   |
| Cost to run            | **None — your existing subscription, no API keys**         | None                            | Often metered API keys / token spend         |
| Memory across sessions | Structured Markdown: context, decisions, phases            | One flat file you curate        | Framework DB or vendor-hosted store          |
| Drift detection        | `doctor` checks the files still agree                      | None                            | Varies                                       |
| Guardrails             | Advisory phases + changed-path and exit reports             | None                            | Often fully autonomous                       |
| Who decides            | Humans & agents; scripts only report                       | You                             | The framework may act on its own             |
| Tool-agnostic          | Yes — AGENTS.md standard (Claude, Gemini, Cursor, Copilot) | Yes                             | Usually tied to one runtime                  |
| Lock-in                | None — plain, git-diffable files                           | None                            | Framework + sometimes hosted state           |
| Mandatory boot metadata| ~3.8k estimated tokens                                      | Whatever you put in the file    | Can be heavy                                 |

## Quickstart

Requires **Node ≥ 20** — no other dependencies, no build step.

Truss wraps your project in two ways: **drop-in** places the workspace
_beside_ your existing code (both live in the same folder), while **overlay**
nests your code _underneath_ it in `repo/`. Either way Truss is the layer your
work rests on — the steps below cover drop-in; see
[overlay](.truss/docs/overlay.md) for an existing codebase.

Truss is a **drop-in**: you copy the `.truss/` engine folder into your
project, then run `init` to scaffold the workspace. This repo is the
_source_ of that folder — don't run `init` inside the clone; copy `.truss/`
into a project of its own (everything else here, README and docs included, is
documentation that stays in the source repo).

**macOS / Linux:**

```bash
# In an empty or existing project directory:

# 1. Drop the engine in — just the .truss/ folder, nothing else.
git clone --depth 1 https://github.com/KornLabs/truss.git /tmp/truss
cp -R /tmp/truss/.truss ./.truss && rm -rf /tmp/truss

# 2. Scaffold a fresh workspace next to the engine.
node .truss/bin/truss.mjs init

# 3. Copy the boot prompt init printed into your AI tool, paste your idea after
#    it, and you're ready to go — the agent interviews you to build VISION.md.

# Optional: sanity-check workspace health anytime.
node .truss/bin/truss.mjs doctor
```

If the project already has a marker-free `AGENTS.md`, `init` stops before
writing anything. Review that file, then re-run with `--adopt-agents` to keep it
as the preamble and append the Truss router. Overlay init preserves an existing
`.gitignore` and adds `repo/`.

**Windows (PowerShell):**

```powershell
# In an empty or existing project directory:

# 1. Drop the engine in.
git clone --depth 1 https://github.com/KornLabs/truss.git $env:TEMP\truss
Copy-Item -Recurse $env:TEMP\truss\.truss .\.truss
Remove-Item -Recurse -Force $env:TEMP\truss

# 2. Scaffold a fresh workspace next to the engine.
node .truss/bin/truss.mjs init

# 3. Copy the boot prompt init printed into your AI tool, paste your idea after
#    it, and you're ready to go — the agent interviews you to build VISION.md.

# Optional: sanity-check workspace health anytime.
node .truss/bin/truss.mjs doctor
```

`init` doesn't scaffold and leave you at a blank page. It ends with your next
steps and a **ready-to-paste boot prompt** — drop it into your AI tool, add your
idea, and the agent interviews you into a real `VISION.md` instead of an empty
template (abbreviated):

```text
  Next steps:
    1. Start with the boot prompt below — the agent interviews you to turn your
       idea into VISION.md and state/profile.md (no blank-template filling).
    2. Run: node .truss/bin/truss.mjs doctor

  Boot prompt for your AI tool:
    "Read AGENTS.md fully, then follow §1 load order. This is a fresh project.
     First turn my idea into VISION.md and state/profile.md by interviewing me,
     one question at a time.  My idea: ⟨paste your idea, role, and goal here⟩"
```

The product documentation travels with the engine under
[`.truss/docs/`](.truss/docs/), so it is available inside any project that
adopted Truss — out of the agent's way and never colliding with your own
`docs/`.

Optional convenience alias:

```bash
# bash / zsh
alias truss='node .truss/bin/truss.mjs'
```

```powershell
# PowerShell
function truss { node .truss/bin/truss.mjs @args }
```

```cmd
rem cmd.exe
doskey truss=node .truss/bin/truss.mjs $*
```

Working on an **existing** codebase? Make a Truss workspace, then bring your code
in under `repo/`:

```bash
node .truss/bin/truss.mjs init --overlay --name "My Project" --lang English \
  --repo /path/to/code            # local path → symlinked, or a URL → cloned
```

> **Windows note:** creating symlinks requires Developer Mode (or an elevated
> shell). If symlinking fails, pass a git URL instead — the repo is cloned
> under `repo/`.

This sets up an import-first phase flow (`ingest → operate`), nests your code
under `repo/` (its own git history, gitignored here so commits never mix), and
starts an `ingest` phase that first asks you the context the code can't reveal,
then surveys the code. Full walkthrough:
[.truss/docs/overlay.md](.truss/docs/overlay.md).

Already have one code directory inside the workspace (for example a tracked
submodule)? Keep it where it is and select it explicitly:

```bash
node .truss/bin/truss.mjs init --overlay --name "My Project" --lang English \
  --code-root product
```

Truss records `code-root: product` in `state/profile.md`; checks, branch status,
phase evidence, `map`, and `repo-map` then share that single boundary.
This changes only which existing directory is treated as code: it does not
move the workspace, `.truss/`, or state files. The path must be relative,
already exist inside the workspace, and stay outside Truss-managed top-level
directories.

## Agent setup

Truss needs the AI tool to have **terminal/command execution** permission in
the workspace (to run `truss doctor`, `render`, `set`) and **read/write
access** to the workspace files. The system stays functional without terminal
access — agents can still read and write the Markdown files — but the CLI
validation and generated blocks will not update automatically.

> **Tip:** Allow auto-run for `node .truss/bin/truss.mjs` commands to get the
> smoothest experience. The CLI never writes outside the workspace.

### No terminal access?

Truss still works as plain Markdown: an agent can read `AGENTS.md`, update
state files, and follow the phase rules by hand. What you lose is mechanical
validation and generated updates: `doctor` cannot catch drift, `render` cannot
refresh generated blocks, `set` cannot safely change preferences, and `map`
cannot rebuild the domain overview. In that mode, treat the workspace as
manually maintained and ask the agent to say explicitly when CLI validation did
not run.

## Session-health marker

By default, Truss sets a **control word** (`TRUSS`) that the agent prepends
to every response: `` `TRUSS — ` ``. If the marker disappears mid-session, it
signals that context may be degrading — a simple, visible canary for session
health. You can change the word (`truss set control-word MYWORD`), or disable
it entirely (`truss set control-word off`).

## How it works

`init` scaffolds a workspace of Markdown files around the hidden `.truss/`
engine:

```
my-project/
├── AGENTS.md          # boot file — every agent reads this first
├── VISION.md          # problem, idea, principles, constraints
├── README.md          # human onboarding
├── HUMAN-TODOS.md     # things only a human can do (HT-NNN)
├── state/             # current focus, decisions, phases, profile, learnings
├── docs/              # conventions, protocols, git, import
├── context/           # domain files, created on demand
└── .truss/            # the engine (read-only for agents)
```

An agent's loop is always the same: read `AGENTS.md`, load the few state files it
points to, do the work, update `state/current.md`, stop. The CLI's `doctor`
command checks that the files still agree with each other and flags any drift.

A project moves through **phases** that widen or narrow what an agent is allowed
to do at each stage. `discover → validate → plan → build` is the seed a fresh
workspace starts from; the kickoff tailors it into a project-specific plan, and
agents restructure the plan when requirements change (always with a decision
entry and a note to you). Advancing the phase itself stays deliberately
human-only. (Alternative seeds ship as
[phase profiles](.truss/phase-profiles/README.md).)

## Commands

Run as `node .truss/bin/truss.mjs <command>` (or `truss <command>` with the
alias). Full reference: [.truss/docs/cli.md](.truss/docs/cli.md).

| Command                                            | What it does                                             |
| -------------------------------------------------- | -------------------------------------------------------- |
| `init [--name --lang --overlay --adopt-agents]`    | preflight and scaffold a workspace                       |
| `status`                                           | compact workspace status summary                         |
| `doctor [--gate] [--json] [--html] [--fix-prompt]` | check workspace health                                   |
| `render`                                           | sync the phase block in AGENTS.md from `state/phases.md` |
| `phase [<id>] [--override-gate]`                   | list phases, or gate and change the active phase         |
| `set <key> <value>`                                | change an agent preference                               |
| `map`                                              | regenerate the `state/map.md` domain overview (with per-file token estimates) |
| `dashboard`                                        | start the local web dashboard                            |
| `prompt <save\|reset\|delete> <id>`                | manage custom prompts                                    |
| `help`                                             | list commands                                            |

## Dashboard (optional)

An optional local control center over the same Markdown — writable by default
through a token-guarded CLI whitelist, or read-only with `--read-only`. Nothing
runs in the background and it keeps the zero-dependency rule. Start it with `node
.truss/bin/truss.mjs dashboard` (binds to `127.0.0.1` only). It surfaces the
current focus and phase, open decisions, Truss boot metadata, the prompt library,
and any drift, using the same health language as the CLI (Lightweight / Growing /
Heavy — a reading of the _workspace structure_, not your code).

<p align="center">
  <img src=".github/dashboard-context-budget.png" alt="Truss dashboard — Boot metadata: mandatory Truss reading and per-file breakdown" width="820">
</p>

## Documentation

| Doc                                                                | Read it for                                                 |
| ------------------------------------------------------------------ | ----------------------------------------------------------- |
| [.truss/docs/concepts.md](.truss/docs/concepts.md)                 | the model — files, state layer, phases, checks, preferences |
| [.truss/docs/cli.md](.truss/docs/cli.md)                           | command reference and flags                                 |
| [.truss/docs/architecture.md](.truss/docs/architecture.md)         | how the engine is built (contributors)                      |
| [.truss/prompts/README.md](.truss/prompts/README.md)               | the prompt library                                          |
| [.truss/phase-profiles/README.md](.truss/phase-profiles/README.md) | alternative lifecycles                                      |
| [.truss/dashboard/README.md](.truss/dashboard/README.md)           | the local dashboard                                         |

## Contributing

Issues and pull requests are welcome. Please keep the **zero-dependency** rule
intact, run the test suite (`cd .truss && node --test`) before opening a PR, and
keep changes small and focused. For larger ideas, open an issue first so we can
agree on the direction.

## Status

`1.0.0-alpha.6`. The engine and its test suite are stable; the API and file
grammar may still change before `1.0.0`.

## License

[MIT](LICENSE) © 2026 Niklas Korn
