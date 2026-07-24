// checks/cx.mjs — Context-size check (CX-01)
//
// CX-01  W/E  mandatory Truss boot metadata exceeds the token budget
//             (warn ≥ 18000, error ≥ 30000 token-equivalent; words × 1.5 heuristic)
//
// "Mandatory Truss boot metadata" = the deterministic files an agent loads per the
// AGENTS.md §1 load order, anchored to file *identities* (not the literal step
// numbers, which a project may renumber): AGENTS.md (incl. both generated blocks)
// + current.md + VISION.md + decisions.md + open-decisions.md + profile.md, plus
// the current phase's `read:` targets (load-order step 6). open-decisions.md is
// counted unconditionally (it is only conditionally loaded in §1, but a check
// cannot know the task, so we count conservatively). Task-selected domain files,
// source files, and agent-tool additions are outside this metric.
//
// Token factor 1.5 (not 1.35): truss files are markdown dense with tables, IDs,
// paths and backticks, which tokenize into more sub-tokens than prose — 1.35 would
// systematically under-count and miss real bloat. The message labels it a "≈".
//
// The file list (CONTEXT_FILES), the token factor, the budget bands and the
// phase-read resolution live in lib/context-budget.mjs and are SHARED with the
// dashboard budget endpoint, so the doctor and the dashboard never diverge on
// the number or the thresholds it is judged against.

import fs from 'node:fs/promises'
import path from 'node:path'
import { CONTEXT_FILES, TOKENS_PER_WORD, WARN_TOKENS, ERROR_TOKENS, wordCount, toTokens, phaseReadTargets } from '../lib/context-budget.mjs'

export const meta = [
  { id: 'CX-01', severity: 'W', title: 'mandatory Truss boot metadata exceeds the token budget', description: `Excludes task-selected domain/source context; W ≥ ${WARN_TOKENS}, E ≥ ${ERROR_TOKENS} token-equivalent (words × 1.5)` },
]

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
  for (const rel of phaseReadTargets(ctx.phases)) {
    if (seen.has(rel)) continue
    const f = ctx.files.get(rel)
    if (f) { add(rel, f.content); continue }
    // read: may point at an on-demand domain file that isn't table-managed.
    try { add(rel, await fs.readFile(path.join(ctx.root, rel), 'utf8')) } catch { /* missing — ignore */ }
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
      message: `mandatory Truss boot metadata ≈ ${tokens} tokens (${totalWords} words × ${TOKENS_PER_WORD}) — over the ${threshold} threshold. Task-selected domain/source context is not counted. Heaviest: ${heaviest}`,
      // Cleanup prompt (S-08) with the protection clause for system-relevant sections.
      fix: `Trim the boot context: review stale, duplicated, wrongly routed, oversized, bulk, or archive-worthy material in the always-loaded files (AGENTS.md, state/current.md, VISION.md, state/decisions.md, state/open-decisions.md, state/profile.md, and the current phase's read: targets). Move long-form material into on-demand docs/ or domain files, move bulk data to .trussignore, and archive superseded material with a one-line invalidation note. Do NOT remove system-relevant parts: the §2 structure table, the §1 load order, the generated preference/phase blocks, or canonical D-NNN decisions. Re-run doctor afterwards — the ST/BL/RF checks confirm nothing essential was lost.`,
    })
  }

  return findings
}
