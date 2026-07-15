# Architecture

For contributors to the Truss engine itself. If you only want to *use* Truss,
read [concepts.md](concepts.md) and [cli.md](cli.md) instead.

The whole engine lives in the hidden `.truss/` directory. It is plain ESM,
Node ≥ 20, **zero external dependencies** — a deliberate constraint, not an
accident. Nothing here is published to npm; the directory *is* the distribution.

## Engine layout

```
.truss/
├── bin/truss.mjs      # CLI dispatcher — argv → command handler
├── lib/                 # shared library
│   ├── command-meta.mjs # the canonical command list (drives help + dashboard whitelist)
│   ├── workspace.mjs    # locate & load a workspace
│   ├── scaffold.mjs     # atomic/no-overwrite whole-file primitives
│   ├── writer.mjs       # generated-block writer
│   ├── render.mjs       # render phase / preferences blocks
│   ├── prefs.mjs        # preferences catalogue (single source of truth)
│   ├── md.mjs           # markdown parsing helpers
│   ├── severity.mjs     # E/W/I severity + family metadata
│   ├── defaults.mjs     # default preference rows + behaviour text
│   └── commands/        # init, status, map, prompt handlers
├── checks/              # one module per check family (st, bl, rf, sy, ph, cx, hy)
├── docs/                # product documentation (concepts, cli, architecture)
├── baseline/            # the pristine workspace skeleton `init` scaffolds from
├── prompts/             # prompt library + engine-ritual prompts (see its README)
├── phase-profiles/      # alternative lifecycles (see its README)
├── prefs/               # behaviour text fragments per preference value
├── dashboard/           # the local web dashboard (server + UI)
├── tests/               # the engine test suite + fixtures
└── VERSION              # current version string
```

## Design rules worth knowing

**1. Single source of truth for the command surface.** Every command is declared
once in `lib/command-meta.mjs` (name, help summary, and whether the dashboard may
invoke it). Both `truss help` and the dashboard action whitelist derive from
that one list, so "documented but not dispatched" or "whitelisted but not
implemented" drift cannot happen.

**2. Writer ownership is explicit.** Mutation is limited to command-owned
surfaces:

- `init` uses `scaffold.mjs` for atomic/no-overwrite whole-file operations,
  including rollback and the explicit `--adopt-agents` merge.
- `writer.mjs` writes the **generated blocks** (the preferences and phase blocks
  in `AGENTS.md`) for `init`, `render`, `set`, and `phase`.
- `phase` owns the `current:` update in `state/phases.md`; `map` owns
  `state/map.md`; `prompt` owns `.truss/prompts/custom/`; doctor report modes own
  files under `.truss/out/`.

Checks and `status` are read-only. The dashboard never writes directly; it can
invoke only the command whitelist described below.

## Checks

Each file in `checks/` owns one family and exports:

- a `meta` array declaring every check it implements (`id`, `severity`, `title`),
  so `doctor --json` can enumerate the full catalogue even for checks that didn't
  fire; and
- the check functions themselves, which take the loaded workspace and return
  findings.

Severity (`E`/`W`/`I`), sort order, and family display names are centralised in
`lib/severity.mjs` so no consumer keeps a private copy. Adding a check means
adding its `meta` entry and logic in the right family module — nothing else needs
to know about it.

## Baseline & scaffolding

`baseline/` is the canonical fresh-instance format: the exact `AGENTS.md`, state
files, docs, adapter stubs, and `package.json` a new workspace starts with.
`init` resolves and validates the phase source and AGENTS.md adoption before the
first write, writes substituted skeletons, then copies the rest of the tree with
`applyTree`, skipping anything already present. A fatal write or render failure
restores modified files and removes files created by that run. Because
the state grammars the `SY` checks enforce are grounded in this baseline, the
baseline *is* the spec — keep them in sync.

## Dashboard

`truss dashboard` starts a small `node:http` server (`dashboard/server.mjs`)
that serves a Preact + HTM UI with **no build step and no npm dependencies**. The
markdown parsers reuse the core lib (`md.mjs`, `render.mjs`), so the dashboard is
npm-free but not fully isolated from the core — changes to those helpers can
affect it.

### Security model

The dashboard is a **local developer tool**; its threat model is "other local
processes", and the constraints below are enforced accordingly:

1. **Host binding.** The server binds to `127.0.0.1` only — never `0.0.0.0`.
2. **Origin/Host check.** Every request's `Origin`/`Host` must be a local host
   (`127.0.0.1:<port>` or `localhost:<port>`) to defeat DNS-rebinding.
3. **Session token on writes.** Mutations (`POST /api/action`) require a
   per-start session token (`x-truss-token`) that the server injects into the
   HTML head. Read endpoints rely on the host/origin check, the loopback binding,
   and the browser same-origin policy (no CORS headers) — local read access is a
   knowingly accepted trade-off.
4. **No direct writes — whitelist only.** The dashboard never writes files
   itself. Mutations go through a fixed whitelist of CLI commands (`set`,
   `doctor`, `map`, `render`, `prompt`), defined by `DASHBOARD_SAFE_COMMANDS` in
   `command-meta.mjs`. `init` and phase changes are *never* reachable — they stay
   human-only.
5. **No shell.** CLI calls use `child_process.execFile` with a strict argument
   array; never a raw shell, never unfiltered client strings on a command line.
6. **No path traversal.** File paths are fixed or validated; paths from URL
   parameters are rejected.
7. **Read-only mode.** Under `--read-only`, all write endpoints are disabled.

### Key endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/state` | current workspace status as JSON (no-store) |
| `GET /api/doctor` | the doctor report (`available: true/false`) |
| `POST /api/action` | run a whitelisted CLI command (token-guarded) |
| `GET /api/git/*` | read-only git history (diff, log) |
| `GET /events` | server-sent events for live updates (falls back to polling) |

Arrays such as `next` and `recentlyDone` are always normalised to `[]`, and a
missing file yields a sensible fallback rather than a 500.

## Tests

The engine has its own suite under `tests/` (plus dashboard tests under
`dashboard/tests/`), run with Node's built-in test runner. There is no root
`package.json` — run the runner from inside the engine directory:

```bash
cd .truss
node --test          # discovers all suites recursively
```

Tests use fixtures in `tests/fixture/` and temporary directories
(`tests/tmp-*/`, gitignored) so they never touch a live workspace. The CLI is
written to be testable in-process: handlers like `runInit` return a result object
and throw typed errors, which the dispatcher maps to exit codes.

## Contributing checklist

- Keep the **zero-dependency** rule: standard library only.
- A new command → add it to `command-meta.mjs` first.
- A new check → add its `meta` entry and logic to the right family module.
- A change to the workspace format → update `baseline/` and the matching checks
  together.
- `node --test` (from `.truss/`) green, and `truss doctor` clean on a fresh
  `init`, before you ship.
