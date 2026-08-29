// lib/schema.mjs — the entry-class catalogue, read from docs/schema.md
//
// D-079: which ID classes exist, where their entries live, what shape they have
// and which fields they owe is workspace data, not source code. This module is
// the only reader; md.mjs, checks/rf.mjs and SY-03 take what it returns.
//
// TWO SOURCES, ONE FORM. A workspace that has `docs/schema.md` uses its own —
// that is the whole point: adding a class is a table row, not a fork. A
// workspace that does not (never upgraded, or upgraded before this version)
// falls back to the copy the engine ships in `baseline/docs/schema.md`. That
// fallback is not a default kept in code beside the file: it IS the file, read
// from the engine instead of the project, so the two can never drift and no
// instance changes behaviour just because the engine moved under it (D-081).

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseTableRow } from './md.mjs'

export const SCHEMA_REL = 'docs/schema.md'

/** The engine's own copy — the fallback, and the source a fresh `init` copies. */
export function baselineSchemaPath() {
  return path.resolve(fileURLToPath(import.meta.url), '..', '..', 'baseline', SCHEMA_REL)
}

const CLASS_ID_RE = /^[A-Z]{1,4}$/
const KNOWN_COLUMNS = ['class', 'file', 'form', 'required', 'optional']

/** Cell text as written: strip markdown emphasis and code ticks, collapse space. */
function cell(text) {
  return String(text ?? '').replace(/[`*]/g, '').replace(/\s+/g, ' ').trim()
}

/** "Date, Rationale or Why" → [['Date'], ['Rationale', 'Why']] — one entry per
 *  required field, each holding the names that satisfy it. */
function fieldList(text) {
  return cell(text)
    .split(',')
    .map(item => item.split(/\s+or\s+/i).map(s => s.trim()).filter(Boolean))
    .filter(alts => alts.length > 0)
}

/**
 * Parse the class table out of a schema file.
 * Returns { classes, problems } — problems are human-readable strings; a file
 * that yields no class at all is unusable and the caller falls back.
 */
export function parseSchema(lines) {
  const classes = []
  const problems = []
  let columns = null

  for (let i = 0; i < lines.length; i++) {
    const row = parseTableRow(lines[i])
    if (!row) { if (columns && !lines[i].startsWith('|')) columns = null; continue }

    if (!columns) {
      // The class table is the one whose first column is headed "Class". Any
      // other table in the file (or in a project's additions) is prose to us.
      const heads = row.map(c => cell(c).toLowerCase())
      if (heads[0] !== 'class') continue
      columns = heads
      const missing = KNOWN_COLUMNS.filter(name => !columns.includes(name))
      if (missing.length) {
        problems.push(`the class table has no ${missing.join(', ')} column`)
        columns = null
      }
      continue
    }

    const at = (name) => row[columns.indexOf(name)]
    const id = cell(at('class'))
    if (!id) continue                                   // spacer row
    if (!CLASS_ID_RE.test(id)) {
      problems.push(`'${id}' is not a usable class prefix (one to four uppercase letters)`)
      continue
    }
    if (classes.some(c => c.id === id)) {
      problems.push(`class ${id} is listed more than once`)
      continue
    }

    const file = cell(at('file'))
    if (!file) { problems.push(`class ${id} names no file`); continue }

    const formText = cell(at('form'))
    const form = /^#{1,6}\s/.test(formText) ? 'heading'
      : /^[-*]\s/.test(formText) ? 'list'
      : null
    if (!form) {
      problems.push(`class ${id} has no usable form — write '## ${id}-NNN — title' or '- [ ] ${id}-NNN — description'`)
      continue
    }

    classes.push({
      id,
      file,
      dir: file.endsWith('/') ? file.slice(0, -1) : null,
      form,
      formText,
      required: fieldList(at('required')),
      optional: fieldList(at('optional')).flat(),
    })
  }

  if (!classes.length) problems.push('no class rows found')
  return { classes, problems }
}

async function readLines(abs) {
  try {
    const content = await fs.readFile(abs, 'utf8')
    const lines = content.split('\n')
    if (lines.at(-1) === '') lines.pop()
    return lines
  } catch { return null }
}

/**
 * Load the schema for a workspace.
 * Returns { classes, ids, source: 'workspace'|'baseline', rel, problems }.
 * `problems` is only ever non-empty for a workspace file the engine could not
 * use — the shipped baseline is covered by the test suite.
 */
export async function loadSchema(root) {
  const own = await readLines(path.join(root, SCHEMA_REL))
  if (own) {
    const parsed = parseSchema(own)
    if (parsed.classes.length) {
      return { ...parsed, source: 'workspace', rel: SCHEMA_REL, ids: parsed.classes.map(c => c.id) }
    }
    const fallback = parseSchema(await readLines(baselineSchemaPath()) ?? [])
    return {
      classes: fallback.classes,
      ids: fallback.classes.map(c => c.id),
      source: 'baseline',
      rel: SCHEMA_REL,
      problems: parsed.problems,
    }
  }

  const shipped = parseSchema(await readLines(baselineSchemaPath()) ?? [])
  return {
    classes: shipped.classes,
    ids: shipped.classes.map(c => c.id),
    source: 'baseline',
    rel: null,
    problems: [],
  }
}
