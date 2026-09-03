// lib/context-budget.mjs — shared context-budget math.
//
// The SINGLE SOURCE OF TRUTH for the mandatory Truss boot-metadata estimate,
// imported by the doctor check (checks/cx.mjs → CX-01). Keeping the file list
// and the token factor here guarantees every consumer places the same number
// against the 18k warn / 30k error bands.
//
// Method: words × 1.5. Empirically validated 2026-07-03 against real BPE
// tokenizers on the truss markdown corpus:
//   • GPT-4 / cl100k  ≈ 1.52–1.54 tokens/word  → words×1.5 lands within ~2%
//   • Claude (legacy) ≈ 1.73–1.78 tokens/word  → words×1.5 under-counts ~15%
// tokens/word is far more stable across truss files than chars/token (paths,
// IDs, tables and backticks inflate chars/token variance), which is why a
// word-based factor beats the "chars ÷ 4" rule of thumb for this corpus. The
// estimate is GPT-class-calibrated and slightly optimistic for Claude.

export const TOKENS_PER_WORD = 1.5

// Boot-metadata budget bands (token-equivalent). Recalibrated 2026-07-24 against
// measured projects instead of the empty template — the old 9k/15k bands were
// derived from a fresh `init` (≈3.6k) and left barely 3k of headroom for a
// project's entire lifetime:
//   • fresh init, empty templates ................ ≈ 3.2k (3.6k before D-028)
//   • fresh project, vision + structure filled ... ≈ 9k    (was already warning)
//   • truss forge itself, 24 decisions ........... ≈ 9.3k  (was already warning)
// A real project's structural floor is ≈5.5–6k (framework template + structure
// table + filled vision/profile) before any work happens, and only decisions.md
// grows without bound (≈160 tokens/entry). WARN at 18k therefore lands where
// archiving genuinely pays (~60–80 decisions on top of a full base) and still
// costs under 10% of a 200k window; ERROR at 30k (15%) is unambiguous ballast.
// The words×1.5 factor under-counts Claude ~15%, which these bands absorb.
export const WARN_TOKENS  = 18000
export const ERROR_TOKENS = 30000

// The shipped §1 load order — the FALLBACK and the reference set, no longer the
// measurement itself: `bootFilesFrom()` below reads the real list out of
// AGENTS.md §1 (D-095). A fixed list measured six fixed paths, so a workspace
// that split a boot file in two lowered the number without lowering what a
// session loads — the most effective way to quiet CX-01 was the only one that
// improved nothing. This list keeps two jobs: what a workspace is measured
// against when its §1 cannot be read, and the "what the old measurement saw"
// reference that keeps a previously green instance from turning red on the
// release that changes this.
//
// Why these six are the right default. open-decisions.md is only *conditionally*
// loaded per §1, but a static check cannot know the task, so it is counted
// unconditionally (conservative). The task-selected domain file and source/tool
// context are deliberately absent — unknowable statically; this metric must
// never be presented as total task context. The phase block is already inside
// AGENTS.md. And state/decisions-index.md, NOT state/decisions.md (D-075): with
// the index in place, §1 loads the full decision log only before a decision is
// made or proposed, which is task-dependent. A workspace that never ran `truss
// render` has no index file and nothing is counted in its place — ST-10 reports
// that state.
export const CONTEXT_FILES = [
  'AGENTS.md',
  'state/current.md',
  'VISION.md',
  'state/decisions-index.md',
  'state/open-decisions.md',
  'state/profile.md',
]

/** A §1 mention that is a shape, not a file: templates, globs, placeholders. */
const PLACEHOLDER_PATH = /NNN|[<>*?]|\.\.\./

/**
 * The boot files AGENTS.md §1 actually names, in load order.
 *
 * Anchored on the SECTION NUMBER (`## 1 …`), the same way parseStructureTable
 * finds §2 — the heading text is translatable, the number is the contract. Every
 * inline-code span in the section that looks like a workspace path counts;
 * placeholders (`state/decisions/D-NNN.md`, `<domain>.md`) do not, because they
 * name a shape rather than a file. AGENTS.md is added unconditionally: step 1
 * says "this file" and never spells the name.
 *
 * `ok:false` means "do not use this" — the caller falls back to CONTEXT_FILES
 * and says so. The bar is deliberately crude (a §1 that yields almost nothing is
 * a §1 this parser did not understand, whatever the reason): the failure that
 * matters is the silent one, where a reworded §1 quietly shrinks the metric that
 * backs the "constant boot" promise. Better to measure the shipped list loudly
 * than a derived list wrongly.
 *
 * @param {string[]} lines AGENTS.md, split
 * @returns {{files: string[], ok: boolean, reason: string|null}}
 */
export function bootFilesFrom(lines) {
  const off = (reason) => ({ files: [...CONTEXT_FILES], ok: false, reason })
  if (!Array.isArray(lines) || lines.length === 0) return off('no-agents-md')

  // `(\s|$)` and not just `\s`: a heading written as a bare `## 1` is a plausible
  // choice, and refusing it would leave that workspace with a permanent CX-02 it
  // could only clear by renaming its heading — the unclearable-finding trap.
  const start = lines.findIndex((l) => /^##\s+1(\s|$)/.test(l.trimEnd()))
  if (start === -1) return off('no-section-1')
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) { end = i; break }
  }

  const files = ['AGENTS.md']
  const seen = new Set(files)
  for (let i = start + 1; i < end; i++) {
    for (const m of lines[i].matchAll(/`([^`]+)`/g)) {
      const token = m[1].trim()
      if (!token || PLACEHOLDER_PATH.test(token)) continue
      // A path, not prose in backticks: a markdown file, or something under a
      // directory. Trailing-slash directories name a place, not a loaded file.
      if (!/\.md$/.test(token) && !token.includes('/')) continue
      if (token.endsWith('/')) continue
      if (seen.has(token)) continue
      seen.add(token)
      files.push(token)
    }
  }

  // Three is "§1 named the file itself plus at least two others" — below that
  // the section did not parse as a load order at all.
  if (files.length < 3) return off('too-few-paths')
  return { files, ok: true, reason: null }
}

export const wordCount = (content) => (content.trim().match(/\S+/g) || []).length
export const toTokens  = (words) => Math.round(words * TOKENS_PER_WORD)

// The current phase's `read:` targets (§1 load-order step 6, deterministic part).
// `phases` is the object returned by lib/md.mjs parsePhases() — { frontmatter, defs }.
// Splits on whitespace as well as , ; so "read: a.md b.md" also works.
export function phaseReadTargets(phases) {
  const currentId = phases?.frontmatter?.current
  const def = currentId ? phases?.defs?.get(currentId) : null
  if (!def?.read) return []
  return def.read.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean)
}
