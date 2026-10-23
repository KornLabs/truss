// lib/skill-groups.mjs — discover baseline skill groups without a separate catalog.

import fs from 'node:fs/promises'
import path from 'node:path'
import { writeFileAtomic } from './scaffold.mjs'
import { toTokens, wordCount } from './context-budget.mjs'

export const SKILL_SELECTION_REL = '.claude/.truss-skills.json'
export class SkillSelectionError extends Error {}

/** Installed by `init` unless `--skills` says otherwise (D-129). Every other group is opt-in. */
export const CORE_GROUPS = ['slop']

/**
 * What each group is for, in one line — shown by `init`'s dialog and report and
 * by `skills list`, so a human and an agent can choose without opening SOURCES.md.
 * A group missing here still works; it is just shown without a purpose.
 */
export const GROUP_INFO = {
  slop: 'clear, human prose and editorial diagrams — the core, useful in any project',
  code: 'software work: API design, migrations, Postgres, error handling, E2E and web-app testing, deployment, changelogs',
  strategy: 'marketing groundwork: product context (read by every marketing group), positioning, pricing, offers, launch, plans',
  seo: 'being found: SEO and AI-search audits, programmatic pages, schema, site architecture, app stores, directories',
  content: 'writing that sells: page copy, editing, lifecycle and cold email, social, SMS, image and video',
  paid: 'paid acquisition and measurement: ads, ad creative, analytics, conversion tracking, attribution, A/B tests',
  conversion: 'turning visitors into users: page CRO, signup, onboarding, popups, paywalls, churn',
  growth: 'growth loops: referrals, co-marketing, free tools, lead magnets, community, PR',
  sales: 'B2B sales: RevOps, sales collateral, prospecting',
  design: 'Claude Code plugin impeccable: frontend design, critique and polish (no files here)',
  superpowers: 'Claude Code plugin superpowers: TDD, debugging, planning, code review (no files here)',
}

/**
 * How the dialog, the init report and `skills list` order and head the groups:
 * related groups stand together, the core first. A group not listed here goes
 * last, under no heading.
 */
export const GROUP_SECTIONS = [
  { title: 'Core — installed by default', groups: ['slop'] },
  { title: 'Software', groups: ['code'] },
  { title: 'Marketing — seven groups; start with strategy, its product context feeds the others', groups: ['strategy', 'seo', 'content', 'paid', 'conversion', 'growth', 'sales'] },
  { title: 'Claude Code plugins — switched on in .claude/settings.json, nothing copied', groups: ['design', 'superpowers'] },
]

/**
 * Groups a later baseline replaced, and what took their place — `upgrade` names
 * the successors instead of a bare "gone" (D-130).
 */
export const GROUP_SUCCESSORS = {
  marketing: ['strategy', 'seo', 'content', 'paid', 'conversion', 'growth', 'sales'],
}

/**
 * Approximate context a group costs in EVERY session: the host loads each
 * skill's `name:` and `description:`. A plugin group's cost is the plugin's own.
 * @returns {Promise<number|null>} tokens, or null for a plugin group
 */
export async function groupTokens(baselineDir, assets) {
  if (assets.plugin) return null
  let words = 0
  for (const skill of assets.skills) {
    let text = ''
    try { text = await fs.readFile(path.join(baselineDir, '.claude', 'skills', skill, 'SKILL.md'), 'utf8') } catch { continue }
    const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? ''
    words += wordCount(fm.split(/\r?\n/).filter(line => /^(name|description):/.test(line)).join(' '))
  }
  return toTokens(words)
}

/**
 * Groups that ship no files: `skills add` enables the upstream Claude Code plugin
 * in the workspace's `.claude/settings.json` instead of copying a snapshot that
 * goes stale (D-126). `key` is the `enabledPlugins` entry, `marketplace` the
 * `extraKnownMarketplaces` entry it needs.
 */
export const PLUGIN_GROUPS = {
  design: { key: 'impeccable@impeccable', marketplace: 'impeccable', repo: 'pbakaus/impeccable' },
  superpowers: { key: 'superpowers@superpowers-marketplace', marketplace: 'superpowers-marketplace', repo: 'obra/superpowers-marketplace' },
}

async function entriesAt(absPath) {
  try {
    return await fs.readdir(absPath, { withFileTypes: true })
  } catch (err) {
    if (err.code === 'ENOENT') return []
    throw err
  }
}

function prefixOf(name) {
  const dash = name.indexOf('-')
  return dash === -1 ? null : name.slice(0, dash)
}

/**
 * Scan the baseline's Claude assets and group them by their shared name prefix,
 * then add the plugin groups. A name without a dash lands in misc. A prefix
 * carried by one asset alone is still a group: since D-126 the prefix is chosen
 * on import, so a lone `design-x` is a group of one, not a stray.
 *
 * @returns {Promise<Map<string, {skills: string[], agents: string[], plugin?: object}>>}
 */
export async function discoverGroups(baselineDir) {
  const skillsDir = path.join(baselineDir, '.claude', 'skills')
  const agentsDir = path.join(baselineDir, '.claude', 'agents')
  const [skillEntries, agentEntries] = await Promise.all([
    entriesAt(skillsDir),
    entriesAt(agentsDir),
  ])
  const assets = [
    ...skillEntries
      .filter(entry => entry.isDirectory())
      .map(entry => ({ kind: 'skill', name: entry.name })),
    ...agentEntries
      .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
      .map(entry => ({ kind: 'agent', name: entry.name })),
  ].sort((a, b) => a.name.localeCompare(b.name))
  const groups = new Map()
  for (const asset of assets) {
    const group = prefixOf(asset.name) ?? 'misc'
    if (!groups.has(group)) groups.set(group, { skills: [], agents: [] })
    groups.get(group)[`${asset.kind}s`].push(asset.name)
  }
  for (const [group, plugin] of Object.entries(PLUGIN_GROUPS)) {
    if (!groups.has(group)) groups.set(group, { skills: [], agents: [], plugin })
  }
  return new Map([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

/**
 * Build baseline-relative path prefixes for groups omitted from a selection,
 * plus every skill skipped because the same skill is installed globally (D-127).
 */
export function buildExcludes(groups, selected, skipped = {}) {
  const excludes = new Set()
  for (const [group, assets] of groups) {
    if (selected.has(group)) continue
    for (const skill of assets.skills) excludes.add(`.claude/skills/${skill}`)
    for (const agent of assets.agents) excludes.add(`.claude/agents/${agent}`)
  }
  for (const skill of Object.keys(skipped)) excludes.add(`.claude/skills/${skill}`)
  return excludes
}

/**
 * Parse an init selection into its enabled baseline groups.
 * value === null/undefined means --skills was not given at all. Every installed
 * skill's frontmatter loads into every host-agent session and Truss cannot see
 * it (.claude/ is .trussignore'd), so the default is the small core (D-129),
 * never "all" (D-069).
 */
export function selectedGroupsFor(value, groups) {
  if (value == null) return new Set(CORE_GROUPS.filter(group => groups.has(group)))
  if (value === 'all') return new Set(groups.keys())
  if (value === 'none') return new Set()
  const selected = new Set(value.split(',').map(group => group.trim()).filter(Boolean))
  if (selected.size === 0 || [...selected].some(group => !groups.has(group))) {
    throw new SkillSelectionError(
      `--skills expects all, none, or comma-separated groups: ${[...groups.keys()].join(', ')}`,
    )
  }
  return selected
}

/**
 * The selection file's content, or null when no file is needed (all groups,
 * nothing skipped — absence means "all"). `skipped` maps a skill to the global
 * skill that stands in for it (D-127).
 */
export function selectionContent(groups, selected, skipped = {}) {
  const hasSkipped = Object.keys(skipped).length > 0
  if (selected.size === groups.size && !hasSkipped) return null
  const state = { groups: [...selected].sort() }
  if (hasSkipped) {
    state.skippedGlobal = Object.fromEntries(Object.entries(skipped).sort(([a], [b]) => a.localeCompare(b)))
  }
  return `${JSON.stringify(state, null, 2)}\n`
}

/**
 * Skills left out because the same skill is installed globally (D-127):
 * `{ "slop-tells": "stop-slop" }`. Lenient like droppedSelectedGroups — `upgrade`
 * reads it and must finish; the strict reader raises where it matters.
 */
export async function readSkippedGlobal(root) {
  let parsed
  try {
    parsed = JSON.parse(await fs.readFile(path.join(root, SKILL_SELECTION_REL), 'utf8'))
  } catch {
    return {}
  }
  const skipped = parsed?.skippedGlobal
  if (!skipped || typeof skipped !== 'object' || Array.isArray(skipped)) return {}
  return Object.fromEntries(Object.entries(skipped).filter(([, value]) => typeof value === 'string'))
}

/**
 * Read explicit opt-ins. Absence means all groups remain enabled, including
 * groups introduced by a future engine upgrade.
 */
export async function readSelectedGroups(root, groups) {
  const configPath = path.join(root, SKILL_SELECTION_REL)
  let raw
  try {
    raw = await fs.readFile(configPath, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') return new Set(groups.keys())
    throw err
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new SkillSelectionError(`invalid skill selection state at ${SKILL_SELECTION_REL}`)
  }
  if (!parsed || !Array.isArray(parsed.groups) || parsed.groups.some(group => typeof group !== 'string')) {
    throw new SkillSelectionError(`invalid skill selection state at ${SKILL_SELECTION_REL}`)
  }
  return new Set(parsed.groups.filter(group => groups.has(group)))
}

/**
 * Group names this workspace selected that the given baseline no longer has.
 *
 * `readSelectedGroups` drops them silently, and that is right: a group that was
 * renamed must not turn an upgrade into an error, and an unknown name is not a
 * defect in the workspace. But silence leaves the adopter in a dead end — the
 * selection still names a group nobody ships, so `upgrade` installs nothing for
 * it and never says why. Observed with D-102, which folded a singleton skill out
 * of `misc` into the `slop` group: the upgrade report listed the old skill as
 * "kept as yours" and said nothing about the selection that had gone stale.
 *
 * Reporting only — nothing is rewritten. The selection file belongs to the user.
 *
 * @returns {Promise<string[]>} the stale names, in the order the file lists them
 */
export async function droppedSelectedGroups(root, groups) {
  return (await selectionNames(root)).filter(group => !groups.has(group))
}

/**
 * The group names the selection file lists, as written — [] when the file is
 * missing or unreadable. Lenient on purpose: its callers report, they do not install.
 */
export async function selectionNames(root) {
  let parsed
  try {
    parsed = JSON.parse(await fs.readFile(path.join(root, SKILL_SELECTION_REL), 'utf8'))
  } catch {
    return []
  }
  if (!parsed || !Array.isArray(parsed.groups)) return []
  return parsed.groups.filter(group => typeof group === 'string')
}

/** Persist an opt-in selection; an all-groups selection with nothing skipped removes the override. */
export async function writeSelectedGroups(root, groups, selected, skipped = {}) {
  const configPath = path.join(root, SKILL_SELECTION_REL)
  const content = selectionContent(groups, selected, skipped)
  if (content === null) {
    try {
      await fs.unlink(configPath)
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
    }
    return
  }
  await writeFileAtomic(configPath, content)
}

/**
 * One row per group for the dialog, the init report and `skills list`.
 * @returns {Promise<Array<{group:string, kind:string, skills:number, tokens:number|null, info:string}>>}
 */
export async function describeGroups(baselineDir, groups) {
  const order = GROUP_SECTIONS.flatMap(section => section.groups.map(group => [group, section.title]))
  const sectionOf = new Map(order)
  const rank = (group) => {
    const index = order.findIndex(([name]) => name === group)
    return index === -1 ? order.length : index
  }
  const rows = []
  for (const [group, assets] of [...groups].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))) {
    rows.push({
      group,
      section: sectionOf.get(group) ?? '',
      kind: assets.plugin ? 'plugin' : CORE_GROUPS.includes(group) ? 'core' : 'opt-in',
      skills: assets.skills.length,
      tokens: await groupTokens(baselineDir, assets),
      info: GROUP_INFO[group] ?? '',
    })
  }
  return rows
}

/** `8 skills, ~450 tokens` or `plugin` — the size column of a group row. */
export const groupSize = (row) =>
  row.kind === 'plugin' ? 'plugin' : `${row.skills} skill${row.skills === 1 ? '' : 's'}, ~${row.tokens} tokens`

/**
 * Render group rows as aligned lines under their section headings.
 * `number` prefixes each row with its 1-based position (the dialog's choice key).
 */
export function formatGroupRows(rows, { indent = '  ', number = false } = {}) {
  const label = (row) => `${row.group}${row.kind === 'core' ? ' [core]' : ''}`
  const width = Math.max(...rows.map(row => label(row).length))
  const sizeWidth = Math.max(...rows.map(row => groupSize(row).length))
  const lines = []
  let section = null
  for (const [index, row] of rows.entries()) {
    if (row.section !== section) {
      section = row.section
      if (section) lines.push(`${indent}${section}`)
    }
    const key = number ? `${String(index + 1).padStart(2)}. ` : '- '
    lines.push(`${indent}  ${key}${label(row).padEnd(width)}  ${groupSize(row).padEnd(sizeWidth)}  ${row.info}`)
  }
  return lines
}
