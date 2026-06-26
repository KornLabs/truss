// checks/cx.mjs — Context-size check (CX-01)
//
// CX-01  W/E  the mandatory read-context exceeds the token budget
//             (warn ≥ 6000, error ≥ 12000 token-equivalent; words × 1.5 heuristic)
//
// "Mandatory read-context" = the files an agent must load every session per the
// AGENTS.md §1 load order, anchored to file *identities* (not the literal step
// numbers, which a project may renumber): AGENTS.md (incl. both generated blocks)
// + current.md + VISION.md + decisions.md + open-decisions.md + profile.md, plus
// the current phase's `read:` targets (load-order step 6). open-decisions.md is
// counted unconditionally (it is only conditionally loaded in §1, but a check
// cannot know the task, so we count conservatively).
//
// Token factor 1.5 (not 1.35): truss files are markdown dense with tables, IDs,
// paths and backticks, which tokenize into more sub-tokens than prose — 1.35 would
// systematically under-count and miss real bloat. The message labels it a "≈".

import fs from 'node:fs/promises'
import path from 'node:path'

export const meta = [
  { id: 'CX-01', severity: 'W', title: 'mandatory read-context exceeds the token budget', description: 'W ≥ 6000, E ≥ 12000 token-equivalent (words × 1.5); emits a cleanup prompt (S-08)' },
]

const WARN_TOKENS      = 6000
const ERROR_TOKENS     = 12000
const TOKENS_PER_WORD  = 1.5

// Always-loaded boot context (§1 load order, by file identity).
const CONTEXT_FILES = [
  'AGENTS.md',
  'state/current.md',
  'VISION.md',
  'state/decisions.md',
  'state/open-decisions.md',
  'state/profile.md',
]

const wordCount = (content) => (content.trim().match(/\S+/g) || []).length
const toTokens  = (words) => Math.round(words * TOKENS_PER_WORD)

/**
 * @param {import('../lib/workspace.mjs').WorkspaceContext} ctx
 * @returns {Promise<Array>}
 */
export async function run(ctx) {
  const findings = []
  const counted = [] // { file, words }
  const seen = new Set()

  const add = (rel, content) => {
    if (content == null || seen.has(rel)) return
    seen.add(rel)
    counted.push({ file: rel, words: wordCount(content) })
  }

  // 1) Always-loaded files (already parsed in ctx.files).
  for (const rel of CONTEXT_FILES) {
    const f = ctx.files.get(rel)
    if (f) add(rel, f.content)
  }

  // 2) Current phase `read:` targets (load-order step 6, deterministic part).
  const currentId = ctx.phases?.frontmatter?.current
  const def = currentId ? ctx.phases?.defs?.get(currentId) : null
  if (def?.read) {
    // Split on whitespace as well as , ; — a human may write "read: a.md b.md".
    const targets = def.read.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean)
    for (const rel of targets) {
      if (seen.has(rel)) continue
      const f = ctx.files.get(rel)
      if (f) { add(rel, f.content); continue }
      // read: may point at an on-demand domain file that isn't table-managed.
      try { add(rel, await fs.readFile(path.join(ctx.root, rel), 'utf8')) } catch { /* missing — ignore */ }
    }
  }

  const totalWords = counted.reduce((s, c) => s + c.words, 0)
  const tokens = toTokens(totalWords)

  if (tokens >= WARN_TOKENS) {
    const severity = tokens >= ERROR_TOKENS ? 'E' : 'W'
    const threshold = severity === 'E' ? `${ERROR_TOKENS} error` : `${WARN_TOKENS} warn`
    const heaviest = [...counted]
      .sort((a, b) => b.words - a.words)
      .slice(0, 3)
      .map(c => `${c.file} (≈${toTokens(c.words)})`)
      .join(', ')

    findings.push({
      id: 'CX-01', severity,
      file: 'AGENTS.md',
      message: `mandatory read-context ≈ ${tokens} tokens (${totalWords} words × ${TOKENS_PER_WORD}) — over the ${threshold} threshold. Heaviest: ${heaviest}`,
      // Cleanup prompt (S-08) with the protection clause for system-relevant sections.
      fix: `Trim the boot context: move long-form material out of the always-loaded files (AGENTS.md, state/current.md, VISION.md, state/decisions.md, state/open-decisions.md, state/profile.md, and the current phase's read: targets) into on-demand docs/ or domain files that load only when triggered. Do NOT remove system-relevant parts: the §2 structure table, the §1 load order, the generated preference/phase blocks, or canonical D-NNN decisions. Re-run doctor afterwards — the ST/BL/RF checks confirm nothing essential was lost.`,
    })
  }

  return findings
}
