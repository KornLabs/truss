// Context-budget reference data. Sourced from research (2026-06-19), documented in
// docs/context-management.md (repo root, outside /truss). Token estimate: chars / 4.
// Thresholds and framework figures are ESTIMATES; see docs for sources + caveats.

export const TOKEN_PER_CHAR = 0.25; // 1 token ≈ 4 chars (industry rule of thumb)

// Internal health bands for the total mandatory-reading tokens.
export const THRESHOLDS = { green: 6000, yellow: 12000 }; // > yellow = red

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
