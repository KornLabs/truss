// lib/prefs-writer.mjs — the one writer of the preferences block (GE-13).
//
// `truss set`, `truss unset` and `truss team enable` all change the block
// through here, so they can never drift in how they rebuild it: rows in catalog
// order, unknown rows kept at the end, retired keys and the legacy `key=off`
// sentinel (D-108) dropped at the moment of a write.

import path from 'node:path'
import { loadWorkspace } from './workspace.mjs'
import { renderPrefsBlock, parsePrefsRows } from './render.mjs'
import { writeBlock } from './writer.mjs'
import { PREFS_CATALOG, RETIRED_KEYS, isUnsetValue } from './prefs.mjs'

/**
 * Apply row changes to the preferences block and write it back.
 * @param {string} root  workspace root
 * @param {Array<{key:string, row:({key:string,value:string,behavior:string}|null)}>} changes
 *        `row === null` removes the key
 * @returns {Promise<{dropped: Array<{key:string,value:string}>}>}
 * @throws on a workspace that cannot be loaded or a block that cannot be written
 */
export async function writePrefRows(root, changes) {
  const ctx = await loadWorkspace(root)
  const prefsBlock = ctx.blocks?.get('preferences')
  const currentRows = prefsBlock ? parsePrefsRows(prefsBlock.innerLines ?? []) : []

  const rowMap = new Map(currentRows.map(r => [r.key, r]))
  for (const { key, row } of changes) {
    if (row === null) rowMap.delete(key)
    else rowMap.set(key, row)
  }

  // Rebuild in catalog order; append any extra rows not in catalog at the end
  const catalogKeys = PREFS_CATALOG.map(e => e.key)
  const ordered = [
    ...catalogKeys.filter(k => rowMap.has(k)).map(k => rowMap.get(k)),
    ...[...rowMap.values()].filter(r => !catalogKeys.includes(r.key)),
  ]
  // Retired keys never reach the writer — a write is the migration moment.
  const kept = ordered.filter(r => !RETIRED_KEYS.has(r.key))

  // Lines an older instance wrote that no longer belong: the legacy `key=off`
  // sentinel (D-108) and keys retired by D-029. Both are dropped here rather
  // than silently carried in the OTHER group.
  const touched = new Set(changes.map(c => c.key))
  const dropped = ordered.filter(r =>
    !touched.has(r.key) && (isUnsetValue(r.key, r.value) || RETIRED_KEYS.has(r.key)))

  await writeBlock(path.join(root, 'AGENTS.md'), 'preferences', renderPrefsBlock(kept))
  return { dropped }
}
