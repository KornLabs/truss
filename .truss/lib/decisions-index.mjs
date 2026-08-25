// lib/decisions-index.mjs — the boot-sized index of state/decisions.md (D-075).
//
// state/decisions.md is boot context and the only §1 file that grows without
// bound (≈160 tokens per entry). Archiving fights the symptom; the real waste is
// that a session loads every `Rationale:` and `Consequences:` line to find out
// *which* decisions exist. So the full file leaves the always-loaded set and an
// index takes its place: one entry per decision, title plus its `Decision:`
// line. The full file is loaded on demand — before making or proposing a
// decision (AGENTS.md §1). The source file itself is never touched.
//
// ── FORM CONTRACT — do not "clean this up" into headings ────────────────────
// Entries are **bold list items with an indented continuation line**:
//
//   - **D-074** — Dashboard und Prompt-Bibliothek verlassen den Motor
//     Decision: …
//
// This is not a style choice, it is what keeps the index a pure *reference*:
//
//   • `parseIdDefinitions` (lib/md.mjs) reads `## D-074 — …` as a DEFINITION.
//     An index written with headings would define every D-NNN a second time —
//     RF-03 `E`, once per decision, on a workspace that did nothing wrong.
//   • `ID_LIST_RE` requires the id token immediately after `- `; the two
//     asterisks block that, so a bold list item is a reference, not a
//     definition.
//   • The continuation line is indented by two spaces: neither a heading nor a
//     list item, so it defines nothing either — and two spaces (not four) keep
//     it out of `parseIdReferences`' indented-code-block skip, which is what
//     lets RF-01 still validate links carried over from a `Decision:` line.
//
// RF-02 stays satisfied because state/decisions.md remains loaded (it is
// table-managed), so every id the index mentions is still defined exactly once.
// No loader special-case is needed anywhere. tests/decisions-index.test.mjs
// nails the form down: a refactor to headings must go red, not silently produce
// one RF-03 error per decision.
//
// The provenance line carries no timestamp on purpose: ST-10 compares the index
// against a freshly built one BY CONTENT (not by mtime), and a timestamp would
// make every comparison differ.

import fs from 'node:fs/promises'
import path from 'node:path'
import { writeFileAtomic } from './scaffold.mjs'

/** Where the index lives, and what it is generated from. */
export const INDEX_REL  = 'state/decisions-index.md'
export const SOURCE_REL = 'state/decisions.md'

const HEADING_RE  = /^##\s+(D-\d{3})\b\s*(.*)$/
const DECISION_RE = /^Decision:\s*(.*)$/
// A decision the index shows without its status would be a LIE the drift check
// cannot catch: ST-10 only proves the index matches its source, never that it
// says enough. An entry that has been superseded or is under challenge reads as
// live and uncontested to any session that stops at the index — and §1 only
// mandates the full file before *making or proposing* a decision, not before
// citing one. So the status rides on the title line, inside the two-line form.
const SUPERSEDED_RE = /^Superseded-by:\s*(.*)$/
const CHALLENGED_RE = /^Challenged-by:\s*(.*)$/

/**
 * Marker for an entry whose body has no `Decision:` line. The title still gets
 * an index entry — an entry the index silently dropped would be invisible to
 * every session, which is worse than an entry that says what is missing. The
 * marker deliberately does NOT start with `Decision:` so that comparing index
 * lines against source lines stays unambiguous.
 */
export const NO_DECISION_MARK = '(no `Decision:` line — read the full entry in state/decisions.md)'

const HEADER = [
  '# Decisions — Index',
  '',
  '> Auto-generated from `state/decisions.md` by `node .truss/bin/truss.mjs render` — do not edit; edit the source and re-run.',
  '> Title, status and `Decision:` line per entry. Load `state/decisions.md` in full before making or proposing a decision (AGENTS.md §1).',
]

/**
 * Extract the indexable entries from state/decisions.md lines.
 * Fenced code blocks are skipped so a `## D-NNN` shown as a format example
 * (docs style) never becomes an entry.
 *
 * @param {string[]} lines
 * @returns {Array<{ id: string, title: string, decision: string|null, line: number }>}
 */
export function parseDecisionEntries(lines) {
  const entries = []
  let fenced = false
  let current = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\s+$/, '')

    if (line.startsWith('```') || line.startsWith('~~~')) { fenced = !fenced; continue }
    if (fenced) continue

    const heading = line.match(HEADING_RE)
    if (heading) {
      // A leading em/en dash or hyphen is the grammar's title separator, not
      // part of the title.
      const title = heading[2].replace(/^[—–-]\s*/, '').trim()
      current = { id: heading[1], title, decision: null, superseded: null, challenged: null, line: i + 1 }
      entries.push(current)
      continue
    }
    // Any other ## heading ends the entry (e.g. a section between decisions).
    if (/^##\s/.test(line)) { current = null; continue }

    if (!current) continue

    const superseded = line.match(SUPERSEDED_RE)
    if (superseded && current.superseded === null) current.superseded = superseded[1].trim()
    const challenged = line.match(CHALLENGED_RE)
    if (challenged && current.challenged === null) current.challenged = challenged[1].trim()

    if (current.decision !== null) continue
    const decision = line.match(DECISION_RE)
    if (decision) current.decision = decision[1].trim()
  }

  return entries
}

/**
 * Build the full index file content from state/decisions.md lines.
 * Pure — no I/O — so ST-10 can compare against it without writing anything.
 *
 * @param {string[]} lines
 * @returns {string}
 */
function statusMark(entry) {
  const marks = []
  if (entry.superseded) marks.push(`superseded by ${entry.superseded}`)
  if (entry.challenged) marks.push(`challenged by ${entry.challenged}`)
  return marks.length ? ` (${marks.join(' · ')})` : ''
}

export function buildIndex(lines) {
  const out = [...HEADER]
  for (const entry of parseDecisionEntries(lines)) {
    out.push('')
    out.push(`- **${entry.id}**${statusMark(entry)} — ${entry.title}`)
    out.push('  ' + (entry.decision ? `Decision: ${entry.decision}` : NO_DECISION_MARK))
  }
  return out.join('\n') + '\n'
}

/**
 * Read state/decisions.md and write state/decisions-index.md next to it.
 * Returns null when there is no source file (nothing to index is not an error),
 * otherwise { entries, path }.
 *
 * @param {string} root  absolute workspace root
 */
export async function writeIndex(root) {
  let source
  try {
    source = await fs.readFile(path.join(root, SOURCE_REL), 'utf8')
  } catch {
    return null
  }
  const lines = source.split('\n')
  const content = buildIndex(lines)
  await writeFileAtomic(path.join(root, INDEX_REL), content)
  return { entries: parseDecisionEntries(lines).length, path: INDEX_REL }
}
