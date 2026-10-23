// lib/commands/skills.mjs — install or remove baseline skill groups.

import fs from 'node:fs/promises'
import path from 'node:path'
import { applyTree, writeFileSafe } from '../scaffold.mjs'
import {
  CORE_GROUPS,
  discoverGroups,
  readSelectedGroups,
  readSkippedGlobal,
  SkillSelectionError,
  writeSelectedGroups,
} from '../skill-groups.mjs'
import { globalPluginEnabled, resolveGlobalSkips } from '../global-skills.mjs'
import { disablePlugin, enablePlugin, pluginEnabled, PluginSettingsError } from '../skill-plugins.mjs'
import { TEAM_FILE } from '../team.mjs'

export class SkillsError extends Error {}

async function exists(absPath) {
  try {
    await fs.access(absPath)
    return true
  } catch {
    return false
  }
}

function selectedGroups(groups, selection) {
  if (selection === 'all') return new Set(groups.keys())
  if (!groups.has(selection)) {
    throw new SkillsError(
      `skills: unknown group '${selection}'. Available: ${[...groups.keys()].join(', ')}`,
    )
  }
  return new Set([selection])
}

/** Installed = every skill present, or covered by a global copy that stands in for it (D-127). */
async function isInstalled(root, assets, skipped = {}, team = false) {
  if (assets.plugin) {
    return (await pluginEnabled(root, assets.plugin)) || (!team && await globalPluginEnabled(assets.plugin.key))
  }
  const paths = [
    ...assets.skills.filter(skill => !skipped[skill]).map(skill => path.join(root, '.claude', 'skills', skill)),
    ...assets.agents.map(agent => path.join(root, '.claude', 'agents', agent)),
  ]
  const total = assets.skills.length + assets.agents.length
  return total > 0 && (await Promise.all(paths.map(exists))).every(Boolean)
}

async function addGroup(root, baselineDir, assets, skip = {}) {
  const result = { written: [], skipped: [], errors: [] }
  for (const skill of assets.skills) {
    if (skip[skill]) continue
    const copied = await applyTree(
      path.join(baselineDir, '.claude', 'skills', skill),
      path.join(root, '.claude', 'skills', skill),
    )
    result.written.push(...copied.written)
    result.skipped.push(...copied.skipped)
    result.errors.push(...copied.errors)
  }
  for (const agent of assets.agents) {
    const source = path.join(baselineDir, '.claude', 'agents', agent)
    const target = path.join(root, '.claude', 'agents', agent)
    const copied = await writeFileSafe(target, await fs.readFile(source, 'utf8'))
    if (copied.status === 'written') result.written.push(target)
    else if (copied.status === 'skipped-exists') result.skipped.push(target)
    else result.errors.push({ path: target, error: copied.error })
  }
  return result
}

async function treeSnapshot(root, rel = '') {
  let entries
  try {
    entries = await fs.readdir(path.join(root, rel), { withFileTypes: true })
  } catch {
    return null
  }
  const snapshot = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const entryRel = path.join(rel, entry.name)
    if (entry.isDirectory()) {
      const nested = await treeSnapshot(root, entryRel)
      if (!nested) return null
      snapshot.push({ path: entryRel, type: 'directory' }, ...nested)
    } else if (entry.isFile()) {
      try {
        snapshot.push({
          path: entryRel,
          type: 'file',
          content: await fs.readFile(path.join(root, entryRel)),
        })
      } catch {
        return null
      }
    } else {
      return null
    }
  }
  return snapshot
}

async function treesMatch(source, target) {
  const [sourceTree, targetTree] = await Promise.all([
    treeSnapshot(source),
    treeSnapshot(target),
  ])
  if (!sourceTree || !targetTree || sourceTree.length !== targetTree.length) return false
  return sourceTree.every((entry, index) =>
    entry.path === targetTree[index].path &&
    entry.type === targetTree[index].type &&
    (entry.type !== 'file' || entry.content.equals(targetTree[index].content)),
  )
}

async function filesMatch(source, target) {
  try {
    const [sourceContent, targetContent] = await Promise.all([
      fs.readFile(source),
      fs.readFile(target),
    ])
    return sourceContent.equals(targetContent)
  } catch {
    return false
  }
}

async function removeGroup(root, baselineDir, assets) {
  const result = { removed: [], preserved: [] }
  for (const skill of assets.skills) {
    const source = path.join(baselineDir, '.claude', 'skills', skill)
    const target = path.join(root, '.claude', 'skills', skill)
    if (await exists(target)) {
      if (await treesMatch(source, target)) {
        await fs.rm(target, { recursive: true })
        result.removed.push(target)
      } else {
        result.preserved.push(target)
      }
    }
  }
  for (const agent of assets.agents) {
    const source = path.join(baselineDir, '.claude', 'agents', agent)
    const target = path.join(root, '.claude', 'agents', agent)
    if (await exists(target) && await filesMatch(source, target)) {
      await fs.unlink(target)
      result.removed.push(target)
    } else if (await exists(target)) {
      result.preserved.push(target)
    }
  }
  return result
}

function kindOf(group, assets) {
  if (assets.plugin) return 'plugin'
  return CORE_GROUPS.includes(group) ? 'core' : 'opt-in'
}

function printList(rows) {
  const cells = rows.map(row => [
    row.group,
    row.plugin ? '—' : String(row.skills),
    row.kind,
    row.installed ? (row.global ? `✓ (${row.global} global)` : '✓') : '—',
  ])
  const header = ['Group', 'Skills', 'Kind', 'Installed']
  const widths = header.map((title, index) => Math.max(title.length, ...cells.map(cell => cell[index].length)))
  const line = cell => cell.map((value, index) => index === cell.length - 1 ? value : value.padEnd(widths[index])).join(' ')
  console.log(line(header))
  for (const cell of cells) console.log(line(cell))
}

function parseArgs(argv) {
  const positional = argv.filter(arg => !arg.startsWith('--'))
  const flags = argv.filter(arg => arg.startsWith('--'))
  const unknown = flags.filter(flag => flag !== '--no-global-check')
  if (unknown.length) throw new SkillsError(`skills: unknown flag '${unknown[0]}'. Flags: --no-global-check`)
  return { positional, globalCheck: !flags.includes('--no-global-check') }
}

export async function runSkills(root, argv) {
  const { positional, globalCheck } = parseArgs(argv)
  const [subcommand, selection] = positional
  const baselineDir = path.join(root, '.truss', 'baseline')
  if (!(await exists(baselineDir))) {
    throw new SkillsError(`skills: baseline not found at ${baselineDir}`)
  }
  const groups = await discoverGroups(baselineDir)
  const skippedGlobal = await readSkippedGlobal(root)
  const team = await exists(path.join(root, TEAM_FILE))

  if (subcommand === 'list' && positional.length === 1) {
    const rows = await Promise.all([...groups].map(async ([group, assets]) => ({
      group,
      kind: kindOf(group, assets),
      plugin: Boolean(assets.plugin),
      skills: assets.skills.length,
      agents: assets.agents.length,
      global: assets.skills.filter(skill => skippedGlobal[skill]).length,
      installed: await isInstalled(root, assets, skippedGlobal, team),
    })))
    printList(rows)
    return rows
  }
  if (!['add', 'remove'].includes(subcommand) || !selection || positional.length !== 2) {
    throw new SkillsError('skills: usage: truss skills <list|add|remove> [group|all] [--no-global-check]')
  }

  const selected = selectedGroups(groups, selection)
  let enabled
  try {
    enabled = await readSelectedGroups(root, groups)
  } catch (err) {
    if (err instanceof SkillSelectionError) throw new SkillsError(`skills: ${err.message}`)
    throw err
  }
  const skipped = { ...skippedGlobal }
  const lines = []
  try {
    if (subcommand === 'add') {
      const result = { written: [], skipped: [], errors: [], global: {}, plugins: [] }
      for (const group of selected) {
        const assets = groups.get(group)
        if (assets.plugin) {
          if (globalCheck && !team && await globalPluginEnabled(assets.plugin.key)) {
            result.global[group] = assets.plugin.key
            lines.push(`  skipped ${group} — plugin ${assets.plugin.key} is already enabled globally (--no-global-check enables it here too)`)
            continue
          }
          if (await enablePlugin(root, assets.plugin)) result.plugins.push(group)
          continue
        }
        // A copy already in the workspace stays the workspace's: skipping it would
        // also stop upgrade from ever updating it. doctor (ST-12) names the pair.
        const candidates = []
        for (const skill of assets.skills) {
          if (!(await exists(path.join(root, '.claude', 'skills', skill)))) candidates.push(skill)
        }
        const { skipped: skip, alsoGlobal } = await resolveGlobalSkips(baselineDir, candidates, { team, check: globalCheck })
        for (const skill of assets.skills) if (!skip[skill]) delete skipped[skill]
        Object.assign(skipped, skip)
        Object.assign(result.global, skip)
        for (const [skill, global] of Object.entries(skip)) {
          lines.push(`  skipped ${skill} — installed globally as ${global} (--no-global-check installs it anyway)`)
        }
        for (const [skill, global] of Object.entries(alsoGlobal)) {
          lines.push(`  note    ${skill} is also installed globally as ${global} — kept here, team members do not share your home directory`)
        }
        const copied = await addGroup(root, baselineDir, assets, skip)
        result.written.push(...copied.written)
        result.skipped.push(...copied.skipped)
        result.errors.push(...copied.errors)
      }
      if (result.errors.length) {
        const first = result.errors[0]
        throw new SkillsError(`skills: could not install ${first.path}: ${first.error}`)
      }
      for (const group of selected) enabled.add(group)
      await writeSelectedGroups(root, groups, enabled, skipped)
      const plugins = result.plugins.length ? `; plugin enabled in .claude/settings.json: ${result.plugins.join(', ')}` : ''
      console.log(`truss skills: added ${[...selected].join(', ')} (${result.written.length} written, ${result.skipped.length} existing${plugins})`)
      for (const line of lines) console.log(line)
      return result
    }

    const result = { removed: [], preserved: [], plugins: [] }
    for (const group of selected) {
      const assets = groups.get(group)
      if (assets.plugin) {
        if (await disablePlugin(root, assets.plugin)) result.plugins.push(group)
      } else {
        const removed = await removeGroup(root, baselineDir, assets)
        result.removed.push(...removed.removed)
        result.preserved.push(...removed.preserved)
        for (const skill of assets.skills) delete skipped[skill]
      }
      enabled.delete(group)
    }
    await writeSelectedGroups(root, groups, enabled, skipped)
    const plugins = result.plugins.length ? `; plugin disabled: ${result.plugins.join(', ')}` : ''
    console.log(
      `truss skills: removed ${[...selected].join(', ')} ` +
      `(${result.removed.length} paths, ${result.preserved.length} preserved${plugins})`,
    )
    return result
  } catch (err) {
    if (err instanceof PluginSettingsError) throw new SkillsError(`skills: ${err.message}`)
    throw err
  }
}

/**
 * Install every skill a solo workspace skipped for a global copy and forget the
 * record — called when the workspace becomes a team workspace (D-127): members
 * and cloud sessions do not share the home directory that made the skip right.
 * @returns {Promise<string[]>} the skills installed
 */
export async function restoreSkippedGlobal(root) {
  const skipped = await readSkippedGlobal(root)
  const names = Object.keys(skipped)
  if (!names.length) return []
  const baselineDir = path.join(root, '.truss', 'baseline')
  const groups = await discoverGroups(baselineDir)
  const restored = []
  for (const skill of names) {
    const source = path.join(baselineDir, '.claude', 'skills', skill)
    if (await exists(source)) {
      const copied = await applyTree(source, path.join(root, '.claude', 'skills', skill))
      if (copied.errors.length) throw new SkillsError(`skills: could not install ${copied.errors[0].path}: ${copied.errors[0].error}`)
      restored.push(skill)
    }
  }
  await writeSelectedGroups(root, groups, await readSelectedGroups(root, groups), {})
  return restored
}
