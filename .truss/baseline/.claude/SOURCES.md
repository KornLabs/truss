# Skill & Agent Sources

> Imported foreign content, not Truss code. Every file's first line names its source,
> licence and import date; the licence texts are in `THIRD-PARTY-LICENSES.md`.
> Re-imported in full on 2026-09-09 — `SKILL.md` **and** its `references/`, assets and
> scripts, from each upstream's then-current state.

| Prefix | Repo | Licence | Contents |
|---|---|---|---|
| `marketing-*` | [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) | MIT | 40 skills |
| `composio-*` | [ComposioHQ/awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills) | Apache-2.0 | 11 skills |
| `superpowers-*` | [obra/superpowers](https://github.com/obra/superpowers) | MIT | 9 skills |
| `ecc-*` | [affaan-m/ECC](https://github.com/affaan-m/ECC) | MIT | 9 skills, 6 agents |
| `uiux-*` | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | MIT | 7 skills |
| `slop-*` | five sources, see below | MIT | 6 skills |
| `context7-*` | [upstash/context7](https://github.com/upstash/context7) | MIT | 4 skills, 1 agent |

**Totals: 86 skills, 7 agents.**

## The `slop-*` group

One topical group instead of five singletons — `lib/skill-groups.mjs` groups by name
prefix, so a lone skill would land in `misc`. Install with `truss skills add slop`.

| Skill | Source | Licence | What it is |
|---|---|---|---|
| `slop-prose` | [petergyang/no-ai-slop](https://github.com/petergyang/no-ai-slop) | MIT | prose: edit or detect AI patterns while preserving the writer's voice; checks itself against `eval.md` |
| `slop-tells` | [hardikpandya/stop-slop](https://github.com/hardikpandya/stop-slop) | MIT | prose: banned phrases, structures, before/after examples, 5-dimension score |
| `slop-taste` | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) | MIT | frontend: design read, three dials (variance/motion/density), design-system map |
| `slop-hallmark` | [Nutlope/hallmark](https://github.com/Nutlope/hallmark) | MIT | landing pages: 21 themes, 21 macrostructures, ~57 slop gates, four verbs |
| `slop-diagrams` | [cathrynlavery/diagram-design](https://github.com/cathrynlavery/diagram-design) | MIT | 38 editorial diagram types as self-contained HTML + SVG |
| `slop-ui` | [miqdadbadjuber/anti-slop](https://github.com/miqdadbadjuber/anti-slop) | MIT | UI, copy, accessibility, mobile and code comments: 38 rules in three hardness tiers |

`slop-ui` carries its five companion skills nested under `skills/antislop-*/SKILL.md`,
because its core routes to them by exactly those relative paths. Nested `SKILL.md`
files sit at depth 2 and are not registered as separate skills by the host.

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

Truss needs none of this. Nothing runs until a skill is installed and invoked.

## Known gaps

Eleven references do not resolve. Both causes are upstream, and neither is invented shut:

- `composio-skill-creator` — `references/{api_docs,finance,mnda,policies,schema}.md`
  and `scripts/rotate_pdf.py` exist nowhere in the upstream repository.
- `marketing-ads`, `-attribution`, `-copywriting`, `-marketing-loops`, `-marketing-plan`
  each name one `references/*.md` that upstream keeps in a **sibling skill's** folder.
  Those links resolve only in upstream's monorepo, never in a standalone install; the
  file is not copied in, because that would invent a layout upstream does not have.
- `ecc-api-patterns` is no longer findable upstream and stays in its 2026-08-07 state.
  It has no references, so it has no dead link.
- `ecc-architecture-decision-records` links three ADR filenames (`0001-use-nextjs.md` …)
  inside an example register it prints as documentation. Illustrative, not shipped files.
- 16 of `slop-diagrams`' script references are guarded by its own "maintainer-checkout
  mode" and are reported as not applicable in an installed skill.

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
