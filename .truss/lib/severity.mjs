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
  PH: 'Phase', TM: 'Team', CX: 'Context', HY: 'Hygiene',
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

/**
 * Collapse repeated findings so one underlying cause surfaces once, not N times.
 * A single broken link referenced from 30 places, or one check firing across a
 * whole tree, used to bury the one genuinely actionable finding under dozens of
 * identical rows — the worst outcome for a health tool. Findings that share the
 * same (id + message) are folded into a single representative carrying:
 *   occurrences: number         — how many raw findings collapsed into it
 *   locations:   Array<{file,line}>  — every place it fired (surfaced on demand)
 * The representative keeps the shape of a normal finding (id/severity/file/line/
 * message/fix), so every existing consumer keeps working; order is preserved.
 *
 * A check may override the grouping with `dedupeKey`. The message is the right
 * key only while it names the CAUSE. RF-01's names the *link* that led to the
 * cause, so one dead target reached through 33 differently-worded links stayed
 * 33 rows — exactly the flood this function exists to stop, in the check that
 * produces it most. A check that knows its own cause states it here instead of
 * having it inferred from prose. `dedupeKey` only groups: it is stripped from the
 * representative below, so no consumer — `--json`, the HTML report, `--fix-prompt`
 * — ever sees a field that exists to answer a question they do not ask.
 *
 * @param {Array<Finding>} findings
 * @returns {Array<Finding & {occurrences:number, locations:Array<{file,line}>}>}
 */
// Separator for the composite group key: a control character, never a space, so
// an id and a message can never be re-split ambiguously. Written as an ESCAPE on
// purpose — until 2026-09-02 this file carried the literal byte, which made git
// classify the whole module as binary and silently suppress every diff of it
// since the commit that introduced this function.
const KEY_SEP = '\u0000'

export function dedupeFindings(findings) {
  const groups = new Map()
  const order = []
  for (const f of findings) {
    const key = f.dedupeKey
      ? `${f.id}${KEY_SEP}k${KEY_SEP}${f.dedupeKey}`
      : `${f.id}${KEY_SEP}m${KEY_SEP}${f.message}`
    if (!groups.has(key)) {
      const { dedupeKey, ...finding } = f
      groups.set(key, { ...finding, occurrences: 0, locations: [] })
      order.push(key)
    }
    const g = groups.get(key)
    g.occurrences++
    g.locations.push({ file: f.file ?? null, line: f.line ?? null })
  }
  return order.map(k => groups.get(k))
}
