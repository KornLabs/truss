// lib/prefs.mjs — Preferences catalog (single source of truth)
// Imported by checks/bl.mjs (validation) and the set command (validation + row ordering).
// Catalog order defines the canonical row order in the preferences block.

// D-028: every key defaults to 'off' and 'off' renders NO directive line —
// a fresh AGENTS.md carries an empty preferences block (0 boot tokens). A
// directive exists only when the human explicitly sets a deviation from the
// host agent's native behavior.
export const PREFS_CATALOG = [
  { key: 'orchestration',   values: ['off', 'low', 'medium', 'high'],           default: 'off', omit: ['off'] },
  { key: 'criticality',     values: ['off', 'low', 'medium', 'high'],           default: 'off', omit: ['off'] },
  { key: 'clarify',         values: ['off', 'ask', 'infer'],                    default: 'off', omit: ['off'] },
  { key: 'input-trust',     values: ['off', 'open', 'medium', 'critical'],      default: 'off', omit: ['off'] },
  { key: 'research-agent',  values: ['off', 'on'],                              default: 'off', omit: ['off'] },
  { key: 'review-agent',    values: ['off', 'on'],                              default: 'off', omit: ['off'] },
  { key: 'source-citation', values: ['off', 'on'],                              default: 'off', omit: ['off'] },
  { key: 'scope',           values: ['off', 'minimal', 'balanced', 'thorough'], default: 'off', omit: ['off'] },
  { key: 'auto-commit',     values: ['off', 'suggest', 'on'],                   default: 'off', omit: ['off'] },
  { key: 'post-task-check', values: ['off', 'inline', 'subagent'],              default: 'off', omit: ['off'] },
  { key: 'gate-advocate',   values: ['off', 'on', 'agentic'],                   default: 'off', omit: ['off'] },
  { key: 'phase-lock',      values: ['off', 'advisory'],                        default: 'off', omit: ['off'] },
  { key: 'branch-guard',    values: ['off', 'warn', 'strict'],                  default: 'off', omit: ['off'] },
  { key: 'response-style',  values: ['off', 'normal', 'compact', 'maxcompact'], default: 'off', omit: ['off'] },
  { key: 'control-word',    values: ['off'],                                    default: 'off', omit: ['off'], free: true },
]

// Keys whose value is free-form (not restricted to the listed values).
// `control-word` may be 'off' or any short word the human picks (session-health marker).
export const FREE_VALUE_KEYS = new Set(
  PREFS_CATALOG.filter(e => e.free).map(e => e.key)
)

// Validate a free value: 'off' or a short word/token.
export function isValidFreeValue(value) {
  return value === 'off' || /^[A-Za-z][A-Za-z0-9-]{0,23}$/.test(value)
}

// Map: key → Set of values that render NO directive in AGENTS.md at all.
// `set` skips behavior lookup and drops the row; renderPrefsBlock filters them
// defensively. `scope=off` means "impose no solution-scope bias — omit the line".
export const OMIT_VALUES = new Map(
  PREFS_CATALOG.filter(e => e.omit).map(e => [e.key, new Set(e.omit)])
)

// True when (key, value) should produce no preferences-block line.
export function isOmitValue(key, value) {
  return OMIT_VALUES.get(key)?.has(value) ?? false
}

// Map for bl.mjs validation: key → Set of valid values
export const CATALOG_KEYS = new Map(
  PREFS_CATALOG.map(e => [e.key, new Set(e.values)])
)
