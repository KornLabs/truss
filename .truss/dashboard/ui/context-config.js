// Boot-metadata budget reference data. See PROJECT.md for sources + caveats.
//
// The HEALTH GAUGE total (what the bands below judge) is computed server-side with
// the SAME method as the doctor's CX-01 check — words × 1.5 over the shared
// CONTEXT_FILES set (lib/context-budget.mjs) — so doctor and dashboard never
// disagree.

export const TOKEN_PER_CHAR = 0.25; // 1 token ≈ 4 chars

// Truss' fixed framework overhead: the §1 load order at a fresh `init` (empty
// templates), remeasured 2026-07-24 from baseline/ via the shared words×1.5 method
// (context-budget.mjs CONTEXT_FILES) at ≈3.3k tokens (AGENTS.md 2618 + current 132
// + VISION 143 + decisions 68 + open-decisions 72 + profile 240 = 3272). This is the
// cost the FRAMEWORK imposes — independent of how much project content a given project
// has accumulated. It floors the health gauge (a running project can never sit below
// framework overhead). Keep in sync with baseline/ when the templates change.
export const TRUSS_BASELINE = 3272;

// Internal health bands for the total mandatory-reading tokens (a running project).
// MUST match WARN_TOKENS / ERROR_TOKENS in lib/context-budget.mjs — this is a
// browser module and cannot import from lib/, so the values are mirrored here and
// dashboard/tests/dashboard-instance.test.mjs asserts the two never drift apart.
// Rationale for the numbers lives next to the constants in lib/context-budget.mjs.
// floor  ≈ Truss default (gauge starts here, not 0 — you can't go below framework overhead)
// green  = healthy ceiling: a full project base plus a mature decision log fits under it
// yellow = watch ceiling; above it cleanup clearly pays off.
export const THRESHOLDS = { floor: TRUSS_BASELINE, green: 18000, yellow: 30000 }; // > yellow = red

export const SEG_COLORS = ['#1d9e6a', '#378add', '#7f77dd', '#d98a00', '#e5484d', '#1aa3a3', '#c64fb0'];

export function budgetStatus(tokens) {
  if (tokens <= THRESHOLDS.green) return { tone: 'ok', label: 'Lightweight' };
  if (tokens <= THRESHOLDS.yellow) return { tone: 'warn', label: 'Growing' };
  return { tone: 'err', label: 'Heavy' };
}

export const CLEANUP_PROMPT =
  `The mandatory per-session reading (AGENTS.md §1 load order) has grown large and ` +
  `risks crowding out working context. Review AGENTS.md, state/current.md, VISION.md, ` +
  `state/decisions.md, state/open-decisions.md, state/profile.md, and the current phase's ` +
  `read: targets. Identify what is stale, duplicated, in the wrong canonical file, too large, ` +
  `bulk data that belongs in .trussignore, or archive-worthy. Propose a safe compaction: move ` +
  `superseded material to archive/ with a one-line invalidation note, tighten verbose passages, ` +
  `split oversized domain files, and keep each file lean. Do not delete decided decisions — ` +
  `supersede them, and state what you moved and why.`;
