# Skill & Agent Sources

> Imported foreign content, not Truss code. Every file's first line names its source,
> licence and import date; the licence texts are in `THIRD-PARTY-LICENSES.md`.
> Re-imported in full on 2026-09-09 — `SKILL.md` **and** its `references/`, assets and
> scripts, from each upstream's then-current state. `slop-scan` joined on 2026-09-10.

| Prefix | Repo | Licence | Contents |
|---|---|---|---|
| `marketing-*` | [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) | MIT | 40 skills |
| `composio-*` | [ComposioHQ/awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills) | Apache-2.0 | 11 skills |
| `superpowers-*` | [obra/superpowers](https://github.com/obra/superpowers) | MIT | 9 skills |
| `ecc-*` | [affaan-m/ECC](https://github.com/affaan-m/ECC) | MIT | 9 skills, 6 agents |
| `uiux-*` | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | MIT | 7 skills |
| `slop-*` | six sources, see below | MIT, Apache-2.0 | 7 skills |
| `context7-*` | [upstash/context7](https://github.com/upstash/context7) | MIT | 4 skills, 1 agent |

**Totals: 87 skills, 7 agents.**

## The `slop-*` group

One topical group instead of six singletons — `lib/skill-groups.mjs` groups by name
prefix, so a lone skill would land in `misc`. Install with `truss skills add slop`.

| Skill | Source | Licence | What it is |
|---|---|---|---|
| `slop-prose` | [petergyang/no-ai-slop](https://github.com/petergyang/no-ai-slop) | MIT | prose: edit or detect AI patterns while preserving the writer's voice; checks itself against `eval.md` |
| `slop-tells` | [hardikpandya/stop-slop](https://github.com/hardikpandya/stop-slop) | MIT | prose: banned phrases, structures, before/after examples, 5-dimension score |
| `slop-taste` | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) | MIT | frontend: design read, three dials (variance/motion/density), design-system map |
| `slop-hallmark` | [Nutlope/hallmark](https://github.com/Nutlope/hallmark) | MIT | landing pages: 21 themes, 21 macrostructures, ~57 slop gates, four verbs |
| `slop-diagrams` | [cathrynlavery/diagram-design](https://github.com/cathrynlavery/diagram-design) | MIT | 38 editorial diagram types as self-contained HTML + SVG |
| `slop-ui` | [miqdadbadjuber/anti-slop](https://github.com/miqdadbadjuber/anti-slop) | MIT | UI, copy, accessibility, mobile and code comments: 38 rules in three hardness tiers |
| `slop-scan` | [yetone/kill-ai-slop](https://github.com/yetone/kill-ai-slop) | Apache-2.0 | web code: a dependency-free scanner that reports 35 visual and copy tells with file and line |

`slop-ui` carries its five companion skills nested under `skills/antislop-*/SKILL.md`,
because its core routes to them by exactly those relative paths. Nested `SKILL.md`
files sit at depth 2 and are not registered as separate skills by the host.

`slop-scan` is the only one of the seven that **measures**: `scripts/scan.mjs` reads the
project's own files and names each hit with a path and a line, using nothing but the Node
standard library. Run it first — the other six then argue about findings that exist,
instead of about a page nobody has read. Its `scripts/rules.ru.mjs` is upstream's example
of a per-language copy-rule file and the template for adding another.

`slop-prose` and `slop-tells` disagree in one place on purpose: `slop-tells` cuts every
adverb, `slop-prose` keeps the ones that carry meaning. Pick one per piece of writing;
running both over the same draft produces the over-correction both warn about.

## What these skills do to your project

Documented upstream behaviour, repeated here so it is not a surprise:

- `slop-hallmark` writes `.hallmark/log.json` into the project and requires a
  `/* Hallmark · macrostructure: … */` stamp in generated CSS; `references/assets.md`
  points generated markup at external CDNs (picsum.photos, api.svgl.app, fontshare).
- `slop-diagrams` writes profile snapshots (`default.md`) into the project.
- `uiux-design/scripts/{cip,logo,icon}/generate.py` read a global
  `~/.claude/skills/.env` for an API key and call an external image API.
- `uiux-ui-styling/scripts/shadcn_add.py` runs the shadcn CLI as a subprocess.
- `superpowers-brainstorming/scripts/` starts a local server and deletes its own
  session directory on stop.
- `slop-scan` does almost none of it: `scripts/scan.mjs` imports `node:fs`,
  `node:url` and `node:path` and nothing else, writes no file and opens no socket.
  It reads and reports; any fix is applied by the agent, under the usual review.
  Two exceptions, both opt-in and both upstream's design: the optional
  `--rules=<path>` flag `import()`s that path, so it runs whatever module you point
  it at, and `scripts/scan.test.mjs` spawns `node` to exercise the scanner.
  `scripts/rules.ru.mjs` is Cyrillic on purpose — it is the Russian example rule
  set, which is why a mixed-script scanner flags it.

Truss needs none of this. Nothing runs until a skill is installed and invoked.

## Known gaps

A skill ships **its own directory**. Anything it references outside that directory is
an upstream-monorepo path and cannot resolve in a standalone install. That is the one
rule behind both classes below, and it is why nothing is copied in to close a gap:
reconstructing a layout upstream does not have would pull a chain of further sibling
links behind it.

**Inside a skill's own directory — 9 targets, 11 occurrences, 4 skills.** This is the
class the 2026-08-07 import broke; it stood at 167 before the repair. `slop-scan` adds
none: every path its files name resolves inside its own directory.

- `composio-skill-creator` (6) — `references/{api_docs,finance,mnda,policies,schema}.md`
  and `scripts/rotate_pdf.py` exist nowhere in the upstream repository.
- `marketing-attribution`, `-copywriting`, `-marketing-loops` (1 each) — one
  `references/*.md` that upstream keeps in a sibling skill's folder.

**Outside the skill's directory — 41 targets, 59 occurrences, 14 skills.**

- Eleven `marketing-*` skills link `../../tools/REGISTRY.md` and
  `../../tools/integrations/*.md` (43 occurrences). Upstream keeps a `tools/` tree at
  its repository root, with 95 integration notes and 64 executable SaaS CLI wrappers.
  Not imported: the wrappers need third-party API keys, which is what Truss exists
  without, and the notes alone would leave `REGISTRY.md`'s own 64 links dead.
- `marketing-ads` (6) and `marketing-offers` (1) link `../../ad-creative/SKILL.md`
  and the like — repository-root paths where upstream keeps no such directory either
  (its skills live under `skills/`). Broken upstream, not by this import.
- `slop-hallmark` (2) links `../../docs/recipes.md` and `../../docs/study-examples.md`.
- `superpowers-subagent-driven-development` (1) links
  `../requesting-code-review/code-reviewer.md` — one of the five upstream superpowers
  skills this baseline does not carry.

**Not counted, with the reason.** `assets/design-tokens.json` (five `uiux-*` skills)
and one example export path are files the skill writes into the *user's* project; its
own text says so. `.agents/product-marketing.md`, which every `marketing-*` skill reads
if the user's project has it. Three ADR filenames inside an example register that
`ecc-architecture-decision-records` prints as documentation. And 16 of `slop-diagrams`'
script references, guarded by its own "maintainer-checkout mode" and reported as not
applicable in an installed skill.

One more real consequence of leaving binaries out: `composio-artifacts-builder`'s
`scripts/init-artifact.sh` expects `shadcn-components.tar.gz` next to it and stops with
an error without it. The archive is binary, so the install path cannot carry it.

## Update policy

- Never edit imported files directly — patch upstream and re-import. The two named
  exceptions are listed in `THIRD-PARTY-LICENSES.md`.
- Binary files (fonts, PDFs, archives) are **not** imported: the install path reads
  every file as UTF-8 text, so a binary would arrive corrupted.
- Upstream is re-checked on a schedule. The procedure, the due date and the
  candidate evaluation live in the development workspace, not here.
- Excluded on licence grounds: `anthropics/claude-code` marketplace plugins
  ("All rights reserved", removed 2026-09-09), `Imbad0202/academic-research-skills`
  (CC BY-NC 4.0, non-commercial), `peteromallet/desloppify` (OSNL 0.2, fees on
  redistribution), `peakoss/anti-slop` (AGPL-3.0, copyleft).
