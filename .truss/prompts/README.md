# Prompts

Truss ships no prompt library. This directory holds what a project adds itself,
the two procedures the engine itself points at, and an unsupported archive of
what used to be shipped.

## Layout

| Path | What |
|---|---|
| `custom/<id>.md` | User-created prompts, single language, served as-is. The only prompts the dashboard serves. Also holds `prefs/` overrides. |
| `library.json` | Legacy manifest, kept for shape compatibility. `"prompts"` is `[]` — nothing is read from it. |
| `rituals/<id>.md` | The two procedures the engine names by path: `cleanup.md` and `upgrade.md`. Supported — a `fix:` string a check prints is a contract. |
| `archive/<id>.md` | English bodies of the removed library prompts and the remaining engine rituals, as they stood before removal. Unsupported. |
| `archive-de/<id>.md` | German bodies for the library prompts (the engine rituals were EN-only). Unsupported. |

`promptIds` (used by check **RF-04**) is scanned from `custom/` only. A
`prompts:` reference in `state/phases.md` must have a matching file there, or
RF-04 warns.

## Why there's no library

1.0.0-beta.2 removed the shipped prompt library. Loading every fresh instance
with pre-made method knowledge — how to plan, how to critique, how to run a
kickoff — worked against the framework's own principle that files are the
source of truth, not baked-in habits. `custom/` remains the supported way to
give the dashboard a prompt: write it, save it, it's served as-is.

## `rituals/`

Two procedures that the engine points at by path, so they are part of the
supported surface even though no library ships:

- **`cleanup.md`** — the controlled-forgetting procedure. `CX-01` (context
  budget) and `SY-09` (state file size) both name
  `.truss/prompts/rituals/cleanup.md` in their `fix:` text as the way to trim
  boot-loaded content.
- **`upgrade.md`** — the standing instruction for the judgment half of a
  version upgrade, named by `truss upgrade`'s printed prompt and by the upgrade
  and CLI docs.

They moved out of `archive/` under D-073: a `fix:` string a check emits must not
point into a directory the documentation calls unsupported, and "archive" reads
as "obsolete" for a procedure that is still the canonical one.

## `archive/` and `archive-de/`

These hold the removed bodies unchanged, kept as an unsupported starting
point — copy one into `custom/` and adapt it. Nothing in the engine loads or
requires any of them: the eight library prompts (`plan`, `implement`,
`critique`, `decide`, `resume`, `handover`, `project-kickoff`,
`overlay-onboard`) and the three remaining engine rituals (`phase-recap`,
`gate-advocate`, `phase-replan`) sit there for reference only. `archive-de/`
holds German bodies for the library prompts; the engine rituals were EN-only.

## Custom prompts

Written to `custom/` via `truss prompt save` (dashboard-driven, single
language). **Presets** (a custom prompt with pre-filled input) are
dashboard-local (localStorage), not files.
