// lib/severity.mjs — shared severity metadata for findings (E/W/I).
// Single source for sort order, human labels, check-family names and TTY colour,
// so bin/truss.mjs and any future consumer don't keep private copies.

// Sort/priority order: errors first, then warnings, then info.
export const SEV_ORDER = { E: 0, W: 1, I: 2 }

// Human-readable severity labels (used in the HTML report).
export const SEV_LABEL = { E: 'error', W: 'warning', I: 'info' }

// Check-family display names (id prefix → name).
export const FAMILY_NAMES = {
  ST: 'Structure', BL: 'Block', RF: 'Reference', SY: 'State',
  PH: 'Phase', CX: 'Context', HY: 'Hygiene',
}

// ANSI colours per severity (terminal only).
const SEV_COLOR = {
  E: s => `\x1b[31m${s}\x1b[0m`,
  W: s => `\x1b[33m${s}\x1b[0m`,
  I: s => `\x1b[36m${s}\x1b[0m`,
}

/** Colourise text for a severity when stdout is a TTY; plain otherwise. */
export function col(sev, text) {
  return process.stdout.isTTY ? (SEV_COLOR[sev] || (s => s))(text) : text
}
