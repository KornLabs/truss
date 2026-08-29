// .truss/tests/schema.test.mjs — the entry-class schema (D-079)
//
// docs/schema.md is the one place that says which ID classes exist, where their
// entries live and what shape they have. These tests cover the three things that
// makes it worth reading a file instead of keeping a constant: a project can add
// a class, a project can drop one, and a workspace that has no schema at all
// behaves exactly as before (D-081).
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

import { parseSchema, loadSchema, baselineSchemaPath, SCHEMA_REL } from '../lib/schema.mjs'
import { idMatchers, parseIdDefinitions } from '../lib/md.mjs'
import { runInit } from '../lib/commands/init.mjs'
import { makeRoot, runChecks, errorsOf, read, exists } from './helpers.mjs'

const NOWHERE = path.join(path.sep, 'truss-no-such-workspace')
const shipped = () => loadSchema(NOWHERE)

async function initWorkspace(tag) {
  const root = await makeRoot(tag)
  await runInit(root, ['--name', 'Schema Test', '--lang', 'English', '--skills', 'none'])
  return root
}

/** Replace the class table's rows, keeping the header the parser looks for. */
async function writeClasses(root, rows) {
  const src = (await read(root, SCHEMA_REL)).split('\n')
  const head = src.findIndex(l => /^\|\s*Class\s*\|/.test(l))
  const out = [...src.slice(0, head + 2), ...rows, '']
  await fs.writeFile(path.join(root, SCHEMA_REL), out.join('\n'))
}

const idsOf = (findings, id) => findings.filter(f => f.id === id)

describe('parseSchema — the shipped table', () => {
  it('yields the six classes the framework ships, with their files and forms', async () => {
    const { classes, problems } = parseSchema(
      (await fs.readFile(baselineSchemaPath(), 'utf8')).split('\n'))
    assert.deepEqual(problems, [])
    assert.deepEqual(classes.map(c => c.id), ['D', 'OD', 'HT', 'R', 'L', 'TF'])

    const d = classes.find(c => c.id === 'D')
    assert.equal(d.file, 'state/decisions/')
    assert.equal(d.dir, 'state/decisions')       // a File ending in / is one file per entry
    assert.equal(d.form, 'heading')
    assert.deepEqual(d.required, [['Date'], ['Decision'], ['Rationale', 'Why'], ['Consequences']])

    const ht = classes.find(c => c.id === 'HT')
    assert.equal(ht.form, 'list')
    assert.deepEqual(ht.required, [])            // an empty cell means no fields
    assert.equal(ht.dir, null)
  })

  it('reports what it cannot use instead of guessing', () => {
    const rows = (...r) => ['| Class | File | Form | Required | Optional |',
      '|---|---|---|---|---|', ...r]
    assert.match(parseSchema(rows('| bl | x.md | `## bl-NNN — t` | | |')).problems[0],
      /not a usable class prefix/)
    assert.match(parseSchema(rows('| BL | x.md | prose, not a form | | |')).problems[0],
      /no usable form/)
    assert.match(parseSchema(rows('| BL | x.md | `- BL-NNN — d` | | |',
      '| BL | y.md | `- BL-NNN — d` | | |')).problems[0], /listed more than once/)
    assert.match(parseSchema(['# nothing here']).problems[0], /no class rows/)
  })
})

describe('a project adds a class of its own', () => {
  it('gets SY-03 grammar and RF-02/RF-03 on it, with no engine change', async () => {
    const root = await initWorkspace('truss-schema-add-')
    const src = (await read(root, SCHEMA_REL)).split('\n')
    const head = src.findIndex(l => /^\|\s*Class\s*\|/.test(l))
    src.splice(head + 2, 0, '| BL | state/backlog.md | `## BL-NNN — title` | Opened, Size | Owner |')
    await fs.writeFile(path.join(root, SCHEMA_REL), src.join('\n'))

    await fs.writeFile(path.join(root, 'state/backlog.md'),
      '# Backlog\n\n## BL-001 — Import from CSV\n\nOpened: 2026-01-02\nSize: M\n\n' +
      '## Later maybe\n\nsomething\n')
    await fs.appendFile(path.join(root, 'state/current.md'), '\nnote: blocked by BL-002\n')

    const f = await runChecks(root)
    // the well-formed entry is accepted, the unnumbered heading beside it is not
    const sy03 = idsOf(f, 'SY-03').filter(x => x.file === 'state/backlog.md')
    assert.equal(sy03.length, 1, JSON.stringify(sy03))
    assert.match(sy03[0].message, /not a numbered BL entry/)
    // BL-002 is now a structured ID, so a reference with no entry is a warning
    const rf02 = idsOf(f, 'RF-02').filter(x => x.message.includes('BL-002'))
    assert.equal(rf02.length, 1)
    assert.match(rf02[0].fix, /state\/backlog\.md/)
    assert.match(rf02[0].fix, /## BL-NNN — title/)
  })

  it('a class the project removed stops being checked at all', async () => {
    const root = await initWorkspace('truss-schema-drop-')
    await writeClasses(root, ['| D | state/decisions/ | `## D-NNN — title` | Date | |'])
    await fs.writeFile(path.join(root, 'state/risks.md'),
      '# Risks\n\n## R-001 — no fields at all\n')
    await fs.appendFile(path.join(root, 'state/current.md'), '\nnote: see R-009\n')

    const f = await runChecks(root)
    assert.equal(idsOf(f, 'SY-03').filter(x => x.file === 'state/risks.md').length, 0)
    assert.equal(idsOf(f, 'RF-02').filter(x => x.message.includes('R-009')).length, 0)
    assert.equal(idsOf(f, 'ST-11').length, 0)   // a smaller table is a choice, not a defect
  })
})

describe('the fallback keeps an unmigrated workspace working', () => {
  it('no docs/schema.md at all: the shipped classes, no finding (D-081)', async () => {
    const root = await initWorkspace('truss-schema-absent-')
    await fs.rm(path.join(root, SCHEMA_REL))
    const before = await runChecks(root)

    const schema = await loadSchema(root)
    assert.equal(schema.source, 'baseline')
    assert.equal(schema.rel, null)
    assert.deepEqual(schema.ids, (await shipped()).ids)
    assert.equal(idsOf(before, 'ST-11').length, 0)
    assert.equal(errorsOf(before).length, 0, JSON.stringify(errorsOf(before)))
  })

  it('an unusable docs/schema.md: falls back, and ST-11 says so', async () => {
    const root = await initWorkspace('truss-schema-broken-')
    await fs.writeFile(path.join(root, SCHEMA_REL), '# Schema\n\nsomebody deleted the table.\n')

    const schema = await loadSchema(root)
    assert.equal(schema.source, 'baseline')
    // the classes still work — the alternative is silently unstructured IDs
    assert.deepEqual(schema.ids, (await shipped()).ids)

    const f = await runChecks(root)
    assert.equal(idsOf(f, 'ST-11').length, 1)
    assert.match(idsOf(f, 'ST-11')[0].message, /no class rows/)
    assert.equal(idsOf(f, 'ST-11')[0].severity, 'W')
  })

  it('idMatchers refuses an empty class list rather than matching bare -042', () => {
    assert.throws(() => idMatchers([]), /at least one/)
    assert.deepEqual(parseIdDefinitions(['## D-001 — x'], ['D']).map(d => d.id), ['D-001'])
    assert.deepEqual(parseIdDefinitions(['## D-001 — x'], ['R']), [])
  })
})

describe('docs and code cannot drift apart', () => {
  it('init ships the schema, and AGENTS.md names exactly the classes it defines', async () => {
    const root = await initWorkspace('truss-schema-ship-')
    assert.ok(await exists(root, SCHEMA_REL))

    const { ids } = await loadSchema(root)
    const agents = await read(root, 'AGENTS.md')
    const named = [...agents.matchAll(/\b([A-Z]{1,4})-NNN\b/g)].map(m => m[1])
    for (const id of ids) {
      assert.ok(named.includes(id), `AGENTS.md never mentions ${id}-NNN`)
    }
    for (const id of new Set(named)) {
      assert.ok(ids.includes(id), `AGENTS.md names ${id}-NNN but docs/schema.md has no such class`)
    }
  })

  it('RF-02 names the file the schema names, not a path that moved (D-087)', async () => {
    const root = await initWorkspace('truss-schema-fix-')
    await fs.appendFile(path.join(root, 'state/current.md'), '\nnote: see D-404\n')
    const rf02 = idsOf(await runChecks(root), 'RF-02').filter(x => x.message.includes('D-404'))
    assert.equal(rf02.length, 1)
    assert.match(rf02[0].fix, /state\/decisions\/D-404\.md/)
    assert.doesNotMatch(rf02[0].fix, /state\/decisions\.md/)
  })
})

// ── The one place where two files carry the same field names ─────────────────
// schema.md's table is the machine contract; conventions.md's templates are the
// form an agent copies. Keeping both is deliberate — an agent writing its first
// D-entry should not have to open two files — but a field present in one and
// missing from the other is exactly the drift that makes a warning unfixable:
// you write what the template shows and doctor asks for something else.
describe('schema.md and conventions.md name the same fields', () => {
  const templates = (text) => {
    const found = new Map()
    let block = null
    for (const line of text.split('\n')) {
      if (line.startsWith('```')) { block = block === null ? [] : (collect(found, block), null); continue }
      if (block) block.push(line)
    }
    return found
  }
  const collect = (found, block) => {
    const body = block.filter(l => l.trim())
    if (!body.length) return
    const head = body[0].match(/^##\s+([A-Z]{1,4})-NNN/) || body[0].match(/^-\s+\[[ x]\]\s+([A-Z]{1,4})-NNN/)
    if (!head) return
    const fields = body.slice(1)
      .map(l => l.match(/^([A-Za-z][A-Za-z -]*?):/))
      .filter(Boolean).map(m => m[1])
    found.set(head[1], new Set(fields))
  }

  it('every class in the table has a template with exactly its fields', async () => {
    const { classes } = parseSchema((await fs.readFile(baselineSchemaPath(), 'utf8')).split('\n'))
    const forms = templates(await fs.readFile(
      path.join(baselineSchemaPath(), '..', 'conventions.md'), 'utf8'))

    for (const cls of classes) {
      const written = forms.get(cls.id)
      assert.ok(written, `conventions.md has no template for ${cls.id}`)
      // Only the first name of an "A or B" pair is the one to write, so only it
      // has to appear in the template — the alternative is there for old entries.
      const expected = new Set([...cls.required.map(alts => alts[0]), ...cls.optional])
      assert.deepEqual([...written].sort(), [...expected].sort(),
        `${cls.id}: docs/schema.md and docs/conventions.md disagree about the fields`)
    }
  })
})
