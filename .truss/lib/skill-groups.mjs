// lib/skill-groups.mjs — discover baseline skill groups without a separate catalog.

import fs from 'node:fs/promises'
import path from 'node:path'
import { writeFileAtomic } from './scaffold.mjs'

export const SKILL_SELECTION_REL = '.claude/.truss-skills.json'
export class SkillSelectionError extends Error {}

/** Installed by `init` unless `--skills` says otherwise (D-129). Every other group is opt-in. */
export const CORE_GROUPS = ['slop']

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
