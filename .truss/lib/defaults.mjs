// lib/defaults.mjs — the shared resolver for a preference's behaviour text.
//
// The behaviour column is never hard-coded: it is read from
// .truss/prefs/<key>/<value>.md. There is no project override any more — the
// engine reads no project files from inside .truss/ (D-132). `truss set` is the only caller —
// there is one, and only one, place that resolves a behaviour text (GE-13).
//
// No key has a default any more (D-028/D-108): "no preference" is the absence
// of a row, so `init` renders an empty block and needs no default rows.
//
// Zero external dependencies — node: built-ins only.

import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * Resolve the behavior text for a preference value.
 *
 * Reads the markdown body (everything after the frontmatter) of
 * .truss/prefs/<key>/<value>.md. Returns null if it is not found, so the
 * caller can decide how to fail (`set` → hard error).
 *
 * @param {string} root   Absolute workspace root.
 * @param {string} key    Preference key (e.g. 'subagents').
 * @param {string} value  Preference value (e.g. 'research').
 * @returns {Promise<string|null>}  The trimmed behavior text, or null if absent.
 */
export async function loadBehaviorText(root, key, value) {
  const candidates = [path.join(root, '.truss', 'prefs', key, `${value}.md`)]

  for (const p of candidates) {
    let raw
    try {
      raw = await fs.readFile(p, 'utf8')
    } catch {
      continue
    }
    // Body after frontmatter (--- ... ---), same parsing as the old runSet.
    const lines = raw.split('\n')
    let bodyStart = 0
    if (lines[0] === '---') {
      const end = lines.indexOf('---', 1)
      bodyStart = end === -1 ? 0 : end + 1
    }
    return lines.slice(bodyStart).join('\n').trim()
  }

  return null
}
