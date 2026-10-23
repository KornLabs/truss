# Skill Sources

> Imported foreign content, not Truss code. Every `SKILL.md` carries a header naming
> its source, licence, upstream name and import date; the licence texts are in
> `THIRD-PARTY-LICENSES.md`. Re-imported in full on 2026-10-23 — `SKILL.md` **and**
> its `references/`, assets and scripts, from each upstream's then-current state.

## Groups

| Group | Installed | Skills | Source | Licence |
|---|---|---|---|---|
| `slop` | by `truss init` (core) | `slop-prose`, `slop-tells`, `slop-diagrams` | three repos, see below | MIT |
| `code` | `truss skills add code` | `code-webapp-testing` | [anthropics/skills](https://github.com/anthropics/skills) | Apache-2.0 |
| | | `code-changelog-generator` | [ComposioHQ/awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills) | Apache-2.0 |
| | | `code-api-design`, `code-database-migrations`, `code-e2e-testing`, `code-deployment-patterns`, `code-postgres-patterns`, `code-error-handling` | [affaan-m/ECC](https://github.com/affaan-m/ECC) | MIT |
| `strategy` | `truss skills add strategy` | 12 skills | [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills), see below | MIT |
| `seo` | `truss skills add seo` | 9 skills | 〃 | MIT |
| `content` | `truss skills add content` | 8 skills | 〃 | MIT |
| `paid` | `truss skills add paid` | 8 skills | 〃 | MIT |
| `conversion` | `truss skills add conversion` | 6 skills | 〃 | MIT |
| `growth` | `truss skills add growth` | 6 skills | 〃 | MIT |
| `sales` | `truss skills add sales` | 3 skills | 〃 | MIT |
| `design` | `truss skills add design` | plugin `impeccable`, no files here | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | Apache-2.0 |
| `superpowers` | `truss skills add superpowers` | plugin `superpowers`, no files here | [obra/superpowers](https://github.com/obra/superpowers) | MIT |

**Totals: 63 skills, no agents.** `init` installs `slop` unless `--skills none` says
otherwise; every other group is opt-in. `truss skills list` and the `init` dialog show
each group's purpose and what it costs in every session (`lib/skill-groups.mjs`,
`GROUP_INFO`).

## The seven marketing groups

coreyhaines31/marketingskills ships 52 skills that cross-reference each other by
upstream name ("for ad creative, see ad-creative"). As one group they cost about 9k
tokens in every session, so they are split along the categories upstream's own README
uses. Skills the README does not categorise are placed by topic.

| Group | Upstream skills |
|---|---|
| `strategy` | product-marketing, marketing-ideas, marketing-plan, marketing-psychology, marketing-council, marketing-loops, customer-research, competitor-profiling, content-strategy, pricing, offers, launch |
| `seo` | seo-audit, ai-seo, link-building, programmatic-seo, site-architecture, competitors, schema, aso, directory-submissions |
| `content` | copywriting, copy-editing, cold-email, emails, social, image, video, sms |
| `paid` | ads, ad-creative, events, analytics, conversion-tracking, ab-testing, attribution, influencer-marketing |
| `conversion` | cro, signup, onboarding, popups, paywalls, churn-prevention |
| `growth` | co-marketing, free-tools, referrals, lead-magnets, community-marketing, public-relations |
| `sales` | revops, sales-enablement, prospecting |

Names are `<group>-<upstream>`; an upstream `marketing-` prefix is dropped
(`strategy-ideas`), and an upstream name that already starts with the group is kept
as it is (`seo-audit`, `sales-enablement`). `strategy-product-marketing` writes
`.agents/product-marketing.md`, which every other marketing skill reads when it
exists. A cross-reference to a skill in a group you did not install points at nothing;
the skill still works, with less context.

`docker-patterns` from ECC was evaluated for `code` and left out: about a third of it
documents ECC's own installer harness (`docker/plugin-setup/compose.yaml`, Codex sign-in
inside the container), which does not exist outside ECC. `code-deployment-patterns`
covers Dockerfiles and health checks.

**The prefix is the command.** In Claude Code a project skill is invoked by its
directory name, so every entry carries the prefixed name in its directory and in its
frontmatter `name:` — `/slop-prose`, `/paid-ads`. That keeps a baseline copy from
colliding with the same skill installed globally under its upstream name. The upstream
name survives in the header line.

## The core group `slop`

| Skill | Source | Upstream name | What it is |
|---|---|---|---|
| `slop-prose` | [petergyang/no-ai-slop](https://github.com/petergyang/no-ai-slop) | `no-ai-slop` | prose: edit or detect AI patterns while preserving the writer's voice; checks itself against `eval.md` |
| `slop-tells` | [hardikpandya/stop-slop](https://github.com/hardikpandya/stop-slop) | `stop-slop` | prose: banned phrases, structures, before/after examples, 5-dimension score |
| `slop-diagrams` | [cathrynlavery/diagram-design](https://github.com/cathrynlavery/diagram-design) | `diagram-design` | editorial diagrams and charts as self-contained HTML + SVG, with draw.io, Mermaid and Excalidraw import |

`slop-prose` and `slop-tells` disagree in one place on purpose: `slop-tells` cuts every
adverb, `slop-prose` keeps the ones that carry meaning. Pick one per piece of writing;
running both over the same draft produces the over-correction both warn about.

Only the skill directory ships: `slop-prose` without upstream's Codex-only
`agents/openai.yaml`, `slop-tells` without the repository's `README.md`, `CHANGELOG.md`
and `LICENSE` (the licence text is in `THIRD-PARTY-LICENSES.md`).

## Plugin groups

`design` and `superpowers` are not copied. `truss skills add <group>` writes the
upstream marketplace into `extraKnownMarketplaces` and the plugin into `enabledPlugins`
of the workspace's `.claude/settings.json`; Claude Code installs and updates it from
there. `truss skills remove <group>` takes both entries out again. Reasons, each
specific to the copy it replaces:

- **impeccable** starts a platform binary its launcher downloads on first run, and its
  text addresses itself by the fixed path `.claude/skills/impeccable/` — a renamed
  copy would break that path, and the install path here carries neither binaries nor
  the executable bit.
- **superpowers** moves fast (7.0.1 on 2026-10-23); a copy was stale within weeks.
  Its `using-superpowers` skill tells the agent to reach for a skill before anything
  else, which can compete with the session start that `AGENTS.md` prescribes.

## Skills already installed globally

Claude Code loads skills from `~/.claude/skills` **and** from the project. A skill
present in both appears twice and costs its frontmatter twice. `truss init` and
`truss skills add` therefore compare each skill they are about to install against
`~/.claude/skills/*` (symlinks resolved) by name — the baseline name, or the upstream
name above together with an identical `description:` — and plugin groups against
`enabledPlugins` in `~/.claude/settings.json`.

- **Solo workspace:** a match is skipped and recorded under `skippedGlobal` in
  `.claude/.truss-skills.json`; `upgrade` leaves it out from then on.
- **Team workspace** (`state/team.md` exists): installed anyway — teammates and cloud
  sessions do not have your home directory. The match is reported, nothing more, and
  `truss team enable` installs what an earlier solo setup skipped.
- `--no-global-check` turns the comparison off.

`doctor` reports a skill present in both places as `ST-12` (warning) with the command
that removes the workspace copy.

## What these skills do to your project

Documented upstream behaviour, repeated here so it is not a surprise:

- `slop-diagrams` resolves a `.diagram-design` marker in the project, asks once to
  customise its style guide and then edits its own `references/style-guide.md`; saved
  profiles land in the project. `upgrade` treats the edited style guide like any other
  file changed on both sides.
- `code-webapp-testing/scripts/with_server.py` starts the servers you name as
  subprocesses and waits on their ports.
- `paid-conversion-tracking/assets/` holds browser snippets and GTM recipes that
  send events to Google, Meta, LinkedIn, TikTok and others — written for the user's
  site, not run here. `scripts/*.py` only read and write local JSON.
- Every marketing skill reads `.agents/product-marketing.md` (or
  `.claude/product-marketing.md`) if the project has one.

`skillspector --no-llm` was run on every new or changed skill. Its critical verdict on
`paid-conversion-tracking` rests on documentation it misreads — "never judge
same-day numbers" as an anti-refusal statement, a `gtag.js` example as a hidden
instruction, the words "access token" in Meta's CAPI notes as credential access.

Truss needs none of this. Nothing runs until a skill is installed and invoked.

## Known gaps

A skill ships **its own directory**. Anything it references outside that directory is
an upstream-monorepo path and cannot resolve in a standalone install; nothing is
copied in to close a gap.

- **Marketing skills, upstream sibling folders — 8 targets, 6 skills.** `copywriting`,
  `marketing-loops` and `product-marketing` (upstream names) name a `references/*.md` that upstream
  keeps in another skill's folder (`seo-audit`, `ai-seo`, `social`, `copywriting`,
  `copy-editing`); `marketing-plan` and `social` name `skills/<name>/…` repository
  paths. `lead-magnets` (`references/session-02.md`) and `ads`
  (`conversion-tracking.md`) name files upstream does not have at all.
- **Marketing skills, repository root — 19 targets, 20 occurrences, 5 skills.** `ads`,
  `ad-creative`, `offers` and `prospecting` link `../../<skill>/…`, a layout upstream
  does not have either (its skills live under `skills/`). `link-building` links six
  `../../tools/integrations/*.md`; `ad-creative` and `prospecting` name
  `tools/clis/*.js`. Upstream's `tools/` tree holds executable SaaS CLI wrappers that
  need third-party API keys — not imported.
- **`code-postgres-patterns`** names an ECC agent (`database-reviewer`) and two ECC
  skills (`clickhouse-io`, `backend-patterns`) under "Related" that this baseline does
  not ship.
- **`slop-diagrams` — 46 script names.** Its `verify-*`, `test-verify-*`, `lint-*` and
  `build-*-examples` scripts live in upstream's repository-level `scripts/`, and its
  own text guards them as maintainer-checkout tooling. The six scripts an installed
  skill uses (`export_*`, `*_extract`, `self_check`) ship.

Not counted: paths a skill writes into the user's project (`outputs/…`, `retros/…`,
`competitor-profiles/…`), example code paths, and third-party script URLs.

## Update policy

- Never edit imported files directly — patch upstream and re-import.
- Line endings are LF throughout: the repository's `.gitattributes` normalises them,
  so seven `slop-diagrams` example pages that upstream ships with CRLF differ from it
  in that and nothing else.
- Binary files (fonts, PDFs, archives) are **not** imported: the install path reads
  every file as UTF-8 text, so a binary would arrive corrupted. The 2026-10-23 import
  contained none.
- Upstream is re-checked on a schedule. The procedure, the due date and the
  candidate evaluation live in the development workspace, not here.
- Excluded on licence grounds: `anthropics/claude-code` marketplace plugins
  ("All rights reserved"), `Imbad0202/academic-research-skills` (CC BY-NC 4.0,
  non-commercial), `peteromallet/desloppify` (OSNL 0.2, fees on redistribution),
  `peakoss/anti-slop` (AGPL-3.0, copyleft).
