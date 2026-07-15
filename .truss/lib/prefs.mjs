// lib/prefs.mjs — Preferences catalog (single source of truth)
// Imported by checks/bl.mjs (validation) and the set command (validation + row ordering).
// Catalog order defines the canonical row order in the preferences block.

export const PREFS_CATALOG = [
  { key: 'orchestration',   values: ['low', 'medium', 'high'],      default: 'medium'   },
  { key: 'criticality',     values: ['low', 'medium', 'high'],        default: 'high'     },
  { key: 'clarify',         values: ['ask', 'infer'],                default: 'ask'      },
  { key: 'input-trust',     values: ['open', 'medium', 'critical'],  default: 'medium'   },
  { key: 'research-agent',  values: ['off', 'on'],                   default: 'on'       },
  { key: 'review-agent',    values: ['off', 'on'],                   default: 'on'       },
  { key: 'source-citation', values: ['off', 'on'],                   default: 'off'      },
  { key: 'scope',           values: ['off', 'minimal', 'balanced', 'thorough'], default: 'off', omit: ['off'] },
  { key: 'auto-commit',     values: ['off', 'suggest', 'on'],        default: 'suggest'  },
  { key: 'post-task-check', values: ['off', 'inline', 'subagent'],   default: 'inline' },
  { key: 'gate-advocate',   values: ['off', 'on', 'agentic'],        default: 'agentic'  },
  { key: 'phase-lock',      values: ['off', 'advisory'],             default: 'advisory' },
  { key: 'branch-guard',    values: ['off', 'warn', 'strict'],       default: 'warn'     },
  { key: 'response-style',  values: ['normal', 'compact', 'maxcompact'], default: 'normal' },
  { key: 'control-word',    values: ['off'],                         default: 'TRUSS', free: true },
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
