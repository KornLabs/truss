// lib/global-skills.mjs — notice a baseline skill the user already has globally (D-127).
//
// Claude Code loads skills from ~/.claude/skills AND from the project. The same
// skill in both places shows up twice and costs its frontmatter twice. The
// baseline renames every skill to `<group>-<name>`, so the two copies never
// collide by name — which is exactly why nobody notices them.
//
// Matching is by NAME, not by the source header or a content hash: a skill the
// user linked in from its own clone carries no `<!-- Source: -->` line, and it is
// usually a newer or older version than the baseline copy, so a hash never
// matches. A global skill answers to its directory name and its frontmatter
// `name:`. A baseline skill matches on its own `<group>-<name>`, which is
// distinctive; on the bare upstream name it matches only when the `description:`
// is the same too — `video`, `image` or `social` are names an unrelated personal
// skill may well carry, and a false match silently withholds a skill.

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

/**
 * The user-level Claude directory: TRUSS_GLOBAL_CLAUDE_DIR (tests), else Claude
 * Code's own CLAUDE_CONFIG_DIR, else ~/.claude.
 */
export function globalClaudeDir() {
  return process.env.TRUSS_GLOBAL_CLAUDE_DIR || process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
}

async function readText(absPath) {
  try {
    return await fs.readFile(absPath, 'utf8')
  } catch {
    return null
  }
}

function frontmatterField(text, field) {
  const fm = text?.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const value = fm?.[1].match(new RegExp(`^${field}:[ \\t]*["']?([^"'\\r\\n]+?)["']?[ \\t]*$`, 'm'))
  return value ? value[1] : null
}
const frontmatterName = (text) => frontmatterField(text, 'name')

function upstreamName(text) {
  return text?.match(/<!-- Source:[^\n]*?upstream name `([^`]+)`/)?.[1] ?? null
}

/**
 * What a workspace or baseline skill is matched by: its own names (directory
 * and `name:`), the upstream name its header records, and its description.
 */
export async function skillIdentity(skillDir) {
  const text = await readText(path.join(skillDir, 'SKILL.md'))
  return {
    names: new Set([path.basename(skillDir), frontmatterName(text)].filter(Boolean)),
    upstream: upstreamName(text),
    description: frontmatterField(text, 'description'),
  }
}

/**
 * Every skill under `<claudeDir>/skills`, symlinks followed.
 * @returns {Promise<Array<{dir:string, names:Set<string>}>>}
 */
export async function readGlobalSkills(claudeDir = globalClaudeDir()) {
  const skillsDir = path.join(claudeDir, 'skills')
  let entries
  try {
    entries = await fs.readdir(skillsDir)
  } catch {
    return []
  }
  const skills = []
  for (const entry of entries.sort()) {
    let real
    try {
      real = await fs.realpath(path.join(skillsDir, entry))
      if (!(await fs.stat(real)).isDirectory()) continue
    } catch {
      continue
    }
    const text = await readText(path.join(real, 'SKILL.md'))
    if (text === null) continue
    skills.push({ dir: entry, names: new Set([entry, frontmatterName(text)].filter(Boolean)), description: frontmatterField(text, 'description') })
  }
  return skills
}

/** The global skill that stands in for this one, or null. */
export function matchGlobal(identity, globalSkills) {
  return globalSkills.find(global =>
    [...global.names].some(name => identity.names.has(name)) ||
    (identity.upstream && global.names.has(identity.upstream) &&
      identity.description !== null && global.description === identity.description),
  )?.dir ?? null
}

/**
 * For each named baseline skill, the global skill that already covers it.
 * @returns {Promise<Record<string,string>>} baseline skill → global directory name
 */
export async function findGlobalMatches(baselineDir, skills, claudeDir = globalClaudeDir()) {
  const globalSkills = await readGlobalSkills(claudeDir)
  const matches = {}
  if (!globalSkills.length) return matches
  for (const skill of skills) {
    const hit = matchGlobal(await skillIdentity(path.join(baselineDir, '.claude', 'skills', skill)), globalSkills)
    if (hit) matches[skill] = hit
  }
  return matches
}

/** True when `<claudeDir>/settings.json` enables this plugin key. */
export async function globalPluginEnabled(key, claudeDir = globalClaudeDir()) {
  try {
    const settings = JSON.parse(await fs.readFile(path.join(claudeDir, 'settings.json'), 'utf8'))
    return settings?.enabledPlugins?.[key] === true
  } catch {
    return false
  }
}

/**
 * Split the skills about to be installed by what the user already has globally.
 * Solo workspace: a match is skipped. Team workspace: installed anyway — members
 * and cloud sessions do not share this home directory — and only named.
 * @returns {Promise<{skipped: Record<string,string>, alsoGlobal: Record<string,string>}>}
 */
export async function resolveGlobalSkips(baselineDir, skills, { team = false, check = true } = {}) {
  if (!check) return { skipped: {}, alsoGlobal: {} }
  const matches = await findGlobalMatches(baselineDir, skills)
  return team ? { skipped: {}, alsoGlobal: matches } : { skipped: matches, alsoGlobal: {} }
}
