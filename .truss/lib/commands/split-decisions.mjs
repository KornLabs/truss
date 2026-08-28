// lib/commands/split-decisions.mjs — one-time migration to the split log (D-087).
//
// Moves each entry of state/decisions.md into state/decisions/<ID>.md. This is
// a SPLIT, not a rewrite: every body is copied byte-for-byte, and the command
// proves it by rebuilding the index before and after and refusing to keep a
// result whose index differs. If they differ, something was lost or reordered —
// the safe outcome is the workspace it started with, not a best effort.
//
// Why a command and not `render`: rewriting state/ as a side effect of a
// read-shaped command is exactly the trap L-004 recorded (`upgrade` silently
// overwrote state/). This is opt-in, does one thing, and says what it did.
//
// The preamble (everything above the first entry — the heading, the convention
// notes, any archive pointers) STAYS in state/decisions.md. Dropping it would
// lose real content, most of all the pointers to already-archived ranges. The
// leftover file is inert for indexing (readDecisionSource prefers a directory
// that holds bodies) and stays loaded, so its links keep being checked. Prune
// it by hand once its contents have been routed.

import fs from 'node:fs/promises'
import path from 'node:path'
import { writeFileAtomic } from '../scaffold.mjs'
import {
  buildIndex, parseDecisionEntries, writeIndex,
  SOURCE_REL, DECISIONS_DIR, decisionPath, DECISION_FILE_RE,
} from '../decisions-index.mjs'

/** Thrown for a user-facing refusal; bin/truss.mjs turns it into exit 2. */
class Refusal extends Error {}

export async function runSplitDecisions(root, args = []) {
  const dryRun = args.includes('--dry-run')

  let source
  try {
    source = await fs.readFile(path.join(root, SOURCE_REL), 'utf8')
  } catch {
    throw new Refusal(`truss split-decisions: no ${SOURCE_REL} — nothing to split.`)
  }

  // Never merge into an existing split: the two would silently disagree about
  // which body is current, and readDecisionSource would pick the directory.
  let existing = []
  try {
    existing = (await fs.readdir(path.join(root, DECISIONS_DIR)))
      .filter((n) => DECISION_FILE_RE.test(n))
  } catch { /* no directory yet — the normal case */ }
  if (existing.length) {
    throw new Refusal(
      `truss split-decisions: ${DECISIONS_DIR}/ already holds ${existing.length} `
      + `decision${existing.length === 1 ? '' : 's'} — this workspace is already split.`,
    )
  }

  const lines = source.split('\n')
  const entries = parseDecisionEntries(lines)
  if (!entries.length) {
    throw new Refusal(`truss split-decisions: no '## D-NNN' entries found in ${SOURCE_REL}.`)
  }

  // A duplicate id would have one body overwrite the other — silently, and only
  // the survivor would ever be read again. RF-03 reports duplicates; this
  // refuses to act on them.
  const seen = new Set()
  const dupes = entries.map(e => e.id).filter(id => seen.size === seen.add(id).size)
  if (dupes.length) {
    throw new Refusal(
      `truss split-decisions: duplicate id${dupes.length === 1 ? '' : 's'} in ${SOURCE_REL} `
      + `(${[...new Set(dupes)].join(', ')}) — fix them first, or one body would overwrite another.`,
    )
  }

  // Entry N runs from its heading to the line before entry N+1; the last runs to
  // the end of the file. Blank padding is trimmed and one newline restored, so a
  // body reads the same whether it was first, last or in the middle.
  const bodies = entries.map((e, i) => {
    const from = e.line - 1
    const to = i + 1 < entries.length ? entries[i + 1].line - 1 : lines.length
    return { id: e.id, text: lines.slice(from, to).join('\n').trimEnd() + '\n' }
  })
  const preamble = lines.slice(0, entries[0].line - 1).join('\n').trimEnd()

  // The proof: the index the split produces must equal the index the single
  // file produced. Built here, before anything is written.
  const expected = buildIndex(lines)
  const rebuilt = buildIndex(bodies.map(b => b.text.split('\n')).flat())
  if (rebuilt !== expected) {
    throw new Refusal(
      'truss split-decisions: the split would change the decision index — aborted, nothing written.\n'
      + 'This means an entry would be lost, reordered or altered. Report it rather than working around it.',
    )
  }

  if (dryRun) {
    console.log(`truss split-decisions --dry-run: would write ${bodies.length} files to ${DECISIONS_DIR}/`)
    console.log(`  ${bodies[0].id} … ${bodies[bodies.length - 1].id}`)
    console.log(preamble
      ? `  ${SOURCE_REL} would keep its preamble (${preamble.split('\n').length} lines) — route it, then prune by hand.`
      : `  ${SOURCE_REL} would be left empty — safe to delete once you have committed the split.`)
    return { entries: bodies.length, dryRun: true }
  }

  await fs.mkdir(path.join(root, DECISIONS_DIR), { recursive: true })
  const written = []
  try {
    for (const b of bodies) {
      const rel = decisionPath(b.id)
      await writeFileAtomic(path.join(root, rel), b.text)
      written.push(rel)
    }
    await writeFileAtomic(path.join(root, SOURCE_REL), preamble ? preamble + '\n' : '')
  } catch (err) {
    // Roll back to the workspace we started with rather than leave it half split.
    for (const rel of written) await fs.rm(path.join(root, rel), { force: true })
    await writeFileAtomic(path.join(root, SOURCE_REL), source)
    throw new Refusal(`truss split-decisions: failed partway (${err.message}) — rolled back, nothing changed.`)
  }

  const res = await writeIndex(root)
  console.log(`truss split-decisions: ${bodies.length} entries → ${DECISIONS_DIR}/ (${bodies[0].id} … ${bodies[bodies.length - 1].id})`)
  console.log(`  index rebuilt from ${res.form === 'dir' ? DECISIONS_DIR + '/' : SOURCE_REL}, unchanged in content`)
  console.log(preamble
    ? `  ${SOURCE_REL} kept its preamble (${preamble.split('\n').length} lines) — route it, then prune by hand.`
    : `  ${SOURCE_REL} is now empty — safe to delete once the split is committed.`)
  console.log(`  Next: node .truss/bin/truss.mjs map && node .truss/bin/truss.mjs doctor`)
  return { entries: bodies.length, written, preamble: Boolean(preamble) }
}
