// Context-budget reference data. See PROJECT.md "Context budget" for sources + caveats.
//
// The HEALTH GAUGE total (what the bands below judge) is computed server-side with
// the SAME method as the doctor's CX-01 check — words × 1.5 over the shared
// CONTEXT_FILES set (lib/context-budget.mjs) — so doctor and dashboard never
// disagree. The peer FRAMEWORKS figures below are external chars/4 estimates, so
// the comparison chart mixes methods by a few %; treat all peer numbers as rough.

export const TOKEN_PER_CHAR = 0.25; // 1 token ≈ 4 chars — basis of the external peer estimates only

// Truss' fixed framework overhead: the §1 load order at a fresh `init` (empty
// templates), measured 2026-07-03 from baseline/ via the shared words×1.5 method
// ≈ 2.7k tokens (real BPE ground truth on that corpus: GPT-4 ≈ 2.75k, Claude ≈ 3.1k;
// words×1.5 = 2679). This is the cost the FRAMEWORK imposes — independent of how
// much project content a given project has accumulated. It floors the health gauge
// (a running project can never sit below framework overhead).
export const TRUSS_BASELINE = 2700;

// Internal health bands for the total mandatory-reading tokens (a running project).
// floor  ≈ Truss default (gauge starts here, not 0 — you can't go below framework overhead)
// green  = healthy ceiling: room for a mature decision log + filled vision on top of overhead
// yellow = watch ceiling; above it cleanup clearly pays off.
export const THRESHOLDS = { floor: TRUSS_BASELINE, green: 9000, yellow: 15000 }; // > yellow = red

// Comparable agent frameworks and their boot/mandatory context per run (approximate;
// see docs/context-management.md for sources + caveats). Truss is the lightweight reference.
export const FRAMEWORKS = [
  { name: 'OpenClaw', tokens: 9600, note: 'autonomous agent — full workspace bootstrap (/context: ~9.6k)' },
  { name: 'Hermes Agent', tokens: 13000, note: 'fixed core + memory files per turn (~12–16k)' },
  // Paperclip removed: it is a company-orchestrator that drives other agents
  // (each carrying its own context), not a per-workspace agent framework — its
  // boot footprint isn't comparable to Truss. See docs/context-management.md.
];

export const SEG_COLORS = ['#1d9e6a', '#378add', '#7f77dd', '#d98a00', '#e5484d', '#1aa3a3', '#c64fb0'];

export function budgetStatus(tokens) {
  if (tokens <= THRESHOLDS.green) return { tone: 'ok', label: 'Lightweight' };
  if (tokens <= THRESHOLDS.yellow) return { tone: 'warn', label: 'Growing' };
  return { tone: 'err', label: 'Heavy' };
}

export const CLEANUP_PROMPT =
  `The mandatory per-session reading (AGENTS.md §1 load order) has grown large and ` +
  `risks crowding out working context. Review AGENTS.md, state/current.md, VISION.md, ` +
  `state/decisions.md and state/profile.md. Identify completed, obsolete, or duplicated ` +
  `instructions and propose a safe compaction: move superseded material to archive/ with a ` +
  `one-line invalidation note, tighten verbose passages, and keep each file lean. Do not ` +
  `delete decided decisions — supersede them. Show a diff before writing anything.`;
