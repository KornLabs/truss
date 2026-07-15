// lib/context-budget.mjs — shared context-budget math.
//
// The SINGLE SOURCE OF TRUTH for the mandatory Truss boot-metadata estimate,
// imported by BOTH the doctor check (checks/cx.mjs → CX-01) and the dashboard
// budget endpoint (dashboard/server.mjs). Keeping the file list and the token
// factor here guarantees the two can never disagree on the number they place
// against the 9k warn / 15k error bands.
//
// Method: words × 1.5. Empirically validated 2026-07-03 against real BPE
// tokenizers on the truss markdown corpus:
//   • GPT-4 / cl100k  ≈ 1.52–1.54 tokens/word  → words×1.5 lands within ~2%
//   • Claude (legacy) ≈ 1.73–1.78 tokens/word  → words×1.5 under-counts ~15%
// tokens/word is far more stable across truss files than chars/token (paths,
// IDs, tables and backticks inflate chars/token variance), which is why a
// word-based factor beats the "chars ÷ 4" rule of thumb for this corpus. The
// estimate is GPT-class-calibrated and slightly optimistic for Claude — fine for
// a nudge-level gate, and a reason not to loosen the 9k/15k bands.

export const TOKENS_PER_WORD = 1.5

// Always-loaded boot context (AGENTS.md §1 load order, by file identity).
// open-decisions.md is only *conditionally* loaded per §1, but a static check
// cannot know the task, so it is counted unconditionally (conservative). The one
// task-selected domain file and source/tool context are intentionally NOT
// counted — they are unknowable statically. This metric must not be presented as
// total task context. The phase block itself is already inside AGENTS.md.
export const CONTEXT_FILES = [
  'AGENTS.md',
  'state/current.md',
  'VISION.md',
  'state/decisions.md',
  'state/open-decisions.md',
  'state/profile.md',
]

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
