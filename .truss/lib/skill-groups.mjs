// lib/skill-groups.mjs — discover and filter baseline skill/agent groups.
//
// Skills and agents live in baseline/.claude/skills/<prefix>-<name>/
// and baseline/.claude/agents/<prefix>-<name>.md respectively. The prefix
// (everything before the first '-') defines the group. Files without a
// recognisable prefix fall into the 'misc' group.
//
// Shared by init.mjs (exclude selection) and skills.mjs (list/add/remove).
// Zero external dependencies — node: built-ins only.

import fs from 'node:fs/promises'
import path from 'node:path'

const CLAUDE_DIR = '.claude'
const SKILLS_DIR = path.join(CLAUDE_DIR, 'skills')
const AGENTS_DIR = path.join(CLAUDE_DIR, 'agents')

/** Extract the group prefix from a filename or directory name. */
function groupOf(name) {
  const i = name.indexOf('-')
  return i > 0 ? name.slice(0, i) : 'misc'
}

/**
 * Scan the baseline's .claude/skills/ and .claude/agents/ to discover groups.
 *
 * @param {string} baselineDir  Absolute path to the baseline directory.
 * @returns {Promise<Map<string, {skills: string[], agents: string[]}>>}
 *   Sorted map of groupId → { skills (dir names), agents (file names) }.
 */
export async function discoverGroups(baselineDir) {
  const groups = new Map()

  const ensure = (id) => {
    if (!groups.has(id)) groups.set(id, { skills: [], agents: [] })
    return groups.get(id)
  }

  // Skills — each subdirectory is one skill.
  const skillsPath = path.join(baselineDir, SKILLS_DIR)
  try {
    const entries = await fs.readdir(skillsPath, { withFileTypes: true })
    for (const e of entries) {
      if (!e.isDirectory()) continue
      const g = groupOf(e.name)
      ensure(g).skills.push(e.name)
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }

  // Agents — each .md file is one agent.
  const agentsPath = path.join(baselineDir, AGENTS_DIR)
  try {
    const entries = await fs.readdir(agentsPath, { withFileTypes: true })
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith('.md')) continue
      const g = groupOf(e.name)
      ensure(g).agents.push(e.name)
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }

  // Return sorted by group id.
  return new Map([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

/**
 * Build a set of relative path prefixes to exclude from applyTree.
 *
 * @param {Map<string, {skills: string[], agents: string[]}>} allGroups
 * @param {Set<string>} selected  Group IDs to KEEP.
 * @returns {Set<string>}  Relative path prefixes to exclude.
 */
export function buildExcludes(allGroups, selected) {
  const excludes = new Set()
  for (const [id, group] of allGroups) {
    if (selected.has(id)) continue
    for (const s of group.skills) {
      excludes.add(path.join(SKILLS_DIR, s))
    }
    for (const a of group.agents) {
      excludes.add(path.join(AGENTS_DIR, a))
    }
  }
  return excludes
}

/**
 * One-line description per group for interactive display.
 * @param {{skills: string[], agents: string[]}} group
 * @returns {string}
 */
export function groupSummary(group) {
  const parts = []
  if (group.skills.length) parts.push(`${group.skills.length} skill${group.skills.length === 1 ? '' : 's'}`)
  if (group.agents.length) parts.push(`${group.agents.length} agent${group.agents.length === 1 ? '' : 's'}`)
  return parts.join(', ')
}

/**
 * Check which groups are installed in a workspace.
 *
 * @param {string} root  Workspace root.
 * @param {Map<string, {skills: string[], agents: string[]}>} allGroups
 * @returns {Promise<Map<string, boolean>>}  groupId → at least one file present.
 */
export async function installedGroups(root, allGroups) {
  const result = new Map()
  for (const [id, group] of allGroups) {
    let found = false
    for (const s of group.skills) {
      try {
        await fs.access(path.join(root, SKILLS_DIR, s))
        found = true
        break
      } catch { /* not installed */ }
    }
    if (!found) {
      for (const a of group.agents) {
        try {
          await fs.access(path.join(root, AGENTS_DIR, a))
          found = true
          break
        } catch { /* not installed */ }
      }
    }
    result.set(id, found)
  }
  return result
}

export { CLAUDE_DIR, SKILLS_DIR, AGENTS_DIR }
