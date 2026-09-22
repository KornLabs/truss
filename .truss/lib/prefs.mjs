// lib/prefs.mjs — Preferences catalog (single source of truth)
// Imported by checks/bl.mjs (validation) and the set/unset commands (validation
// + row ordering). Catalog order defines the canonical row order in the block.

// D-028: a key has NO default — "no preference" is the absence of a row, and a
// fresh AGENTS.md carries an empty preferences block (0 boot tokens). A
// directive exists only when the human explicitly sets a deviation from the
// host agent's native behavior.
// D-108: that absence is expressed by `truss unset <key>`, not by a sentinel
// value. `off` used to be that sentinel; it stays accepted as a legacy alias
// (see LEGACY_UNSET_VALUES) so an older workspace never goes red, but it is no
// longer listed, documented or written.
// D-029: the catalog is deliberately small. A key earns its place only when
// projects genuinely differ AND the exact wording is worth not reinventing.
// Everything whose floor is universally right lives as a fixed rule in
// AGENTS.md §3/§4.
export const PREFS_CATALOG = [
  { key: 'subagents',       values: ['never', 'research', 'full'] },
  { key: 'verify-inputs',   values: ['on'] },
  { key: 'clarify',         values: ['ask', 'infer'] },
  { key: 'scope',           values: ['minimal', 'balanced', 'thorough'] },
  { key: 'auto-commit',     values: ['never', 'suggest', 'on'] },
  { key: 'gate-advocate',   values: ['on', 'agentic'] },
  { key: 'branch-guard',    values: ['strict'] },
  { key: 'control-word',    values: [], free: true },
]

// Values that mean "no preference" and therefore render no line at all.
// D-108 replaced them with `truss unset`; they are accepted, never produced.
// A `set <key> off` is routed to the unset path and says so.
export const LEGACY_UNSET_VALUES = new Set(['off'])

// True when a (key, value) pair should produce no preferences-block line.
// Key-independent today; the signature keeps call sites stable if that changes.
export function isUnsetValue(_key, value) {
  return LEGACY_UNSET_VALUES.has(value)
}

// Keys retired in D-029. Their behaviour either became a fixed rule in AGENTS.md
// or merged into a surviving key. An existing workspace keeps rendering them
// until its next `truss set`; BL-03 reports them as a warning with the migration
// hint instead of an unknown-key error, so upgrading never turns doctor red.
export const RETIRED_KEYS = new Map([
  ['orchestration',   'merged into `subagents` (autonomy floor is AGENTS.md §4)'],
  ['research-agent',  'merged into `subagents` (use `subagents research`)'],
  ['review-agent',    'merged into `subagents` (use `subagents full`)'],
  ['criticality',     'now a fixed rule — AGENTS.md §3 names plan weaknesses before executing'],
  ['input-trust',     'renamed to `verify-inputs`'],
  ['source-citation', 'belongs in state/profile.md § Style & moral as a one-line preference'],
  ['post-task-check', 'now a fixed rule — AGENTS.md §4 runs doctor before reporting done'],
  ['phase-lock',      'now a fixed rule — AGENTS.md §4 names the conflict and asks'],
  ['response-style',  'now a fixed rule — AGENTS.md §4: record and report are two artefacts; the response form follows the task'],
])

// Keys whose value is free-form (not restricted to the listed values).
// `control-word` is any short word the human picks (session-health marker);
// removing it is `truss unset control-word`.
export const FREE_VALUE_KEYS = new Set(
  PREFS_CATALOG.filter(e => e.free).map(e => e.key)
)

// Validate a free value: a short word/token. `off` passes the pattern but is
// caught earlier as a legacy unset, so it cannot become a literal control word.
export function isValidFreeValue(value) {
  return /^[A-Za-z][A-Za-z0-9-]{0,23}$/.test(value)
}

// Map for bl.mjs validation and error messages: key → Set of canonical values.
// Legacy unset values are NOT in here — callers accept them separately, so a
// message never advertises a value the writer no longer produces.
export const CATALOG_KEYS = new Map(
  PREFS_CATALOG.map(e => [e.key, new Set(e.values)])
)
