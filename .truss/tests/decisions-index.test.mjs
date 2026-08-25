// .truss/tests/decisions-index.test.mjs — the decision index (D-075) and ST-10.
//
// The load-bearing test in this file is "the index defines nothing". The index
// carries every D-NNN in the workspace a second time, so its FORM is the only
// thing standing between it and one RF-03 error per decision. A future refactor
// to `## D-NNN — …` headings must turn this file red instead of quietly turning
// a healthy workspace into a 40-error one.
//
// Run with: node --test .truss/tests/decisions-index.test.mjs
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

import {
  buildIndex, parseDecisionEntries, writeIndex,
  INDEX_REL, SOURCE_REL, NO_DECISION_MARK,
} from '../lib/decisions-index.mjs'
import { parseIdDefinitions, parseIdReferences } from '../lib/md.mjs'
import { runInit } from '../lib/commands/init.mjs'
import { makeRoot, runChecks, errorsOf, read } from './helpers.mjs'

const ids = (findings, id) => findings.filter(f => f.id === id)

/** A decisions.md with the shapes that actually occur in a real log. */
const SOURCE = `# Decisions

> Decided decisions. D-NNN, sequential, never reused.

## D-001 — Files are the single source of truth
Date: 2026-01-01
Decision: Every operational fact lives in exactly one file; scripts only report.
Rationale: Two copies drift, and the drift is silent.
Consequences: doctor grows a check per rule, never a second store.

## D-002 — The engine ships as a directory, not a package

Date: 2026-01-02
Decision: \`.truss/\` is the distribution; nothing is published to npm.
Rationale: Zero install surface.
Consequences: \`truss upgrade\` replaces the directory.
Rejected: npm — a second version to keep in step with D-001.

## D-003 — Decisions bind until superseded
Date: 2026-01-03
Decision: An entry binds until a later D-NNN supersedes it, with the human's go-ahead.
Rationale: Otherwise every session re-litigates the log.
Consequences: \`Superseded-by:\` is the only way out.
`

describe('buildIndex — content', () => {
  it('carries every title and its Decision: line, verbatim', () => {
    const srcLines = SOURCE.split('\n')
    const index = buildIndex(srcLines)

    // Independently re-derive the pairs from the source and require an exact
    // match — the index must never paraphrase, truncate or re-order.
    const sourcePairs = []
    for (let i = 0; i < srcLines.length; i++) {
      const h = srcLines[i].match(/^##\s+(D-\d{3})\s+—\s+(.+)$/)
      if (!h) continue
      let decision = null
      for (let j = i + 1; j < srcLines.length && !/^##\s/.test(srcLines[j]); j++) {
        const d = srcLines[j].match(/^Decision:\s*(.*)$/)
        if (d) { decision = d[1]; break }
      }
      sourcePairs.push([h[1], h[2], decision])
    }
    assert.equal(sourcePairs.length, 3, 'fixture sanity: three entries')

    const indexLines = index.split('\n')
    for (const [id, title, decision] of sourcePairs) {
      const at = indexLines.indexOf(`- **${id}** — ${title}`)
      assert.notEqual(at, -1, `${id} title must appear verbatim in the index`)
      assert.equal(indexLines[at + 1], `  Decision: ${decision}`,
        `${id}'s Decision: line must appear verbatim on the indented continuation line`)
    }
  })

  it('gives an entry with no Decision: line a title and a visible mark', () => {
    const index = buildIndex([
      '# Decisions',
      '',
      '## D-009 — A decision recorded without its Decision: line',
      'Date: 2026-01-09',
      'Rationale: someone was in a hurry.',
    ].join('\n').split('\n'))

    const lines = index.split('\n')
    const at = lines.indexOf('- **D-009** — A decision recorded without its Decision: line')
    assert.notEqual(at, -1, 'the title is indexed even when the body is incomplete')
    assert.equal(lines[at + 1], '  ' + NO_DECISION_MARK)
    // The mark must not impersonate a real Decision: line.
    assert.doesNotMatch(lines[at + 1].trim(), /^Decision:/)
  })

  it('ignores D-NNN headings inside fenced code (format examples are not entries)', () => {
    const entries = parseDecisionEntries([
      '# Decisions',
      '```',
      '## D-999 — template shown as an example',
      'Decision: …',
      '```',
      '## D-010 — a real one',
      'Decision: real.',
    ])
    assert.deepEqual(entries.map(e => e.id), ['D-010'])
  })

  it('is a pure function of the source — same input, same bytes', () => {
    assert.equal(buildIndex(SOURCE.split('\n')), buildIndex(SOURCE.split('\n')))
  })

  it('marks a superseded or challenged entry on its title line, not on a third line', () => {
    // ST-10 proves the index MATCHES its source, never that it SAYS ENOUGH. An
    // entry that is dead or contested would otherwise read as live and
    // uncontested to any session that stops at the index.
    const index = buildIndex([
      '# Decisions',
      '',
      '## D-001 — Live one',
      '',
      'Decision: Stays.',
      '',
      '## D-002 — Dead one',
      '',
      'Decision: Replaced.',
      'Superseded-by: D-004',
      '',
      '## D-003 — Contested one',
      '',
      'Decision: Under review.',
      'Challenged-by: OD-009',
    ].join('\n').split('\n'))
    assert.match(index, /- \*\*D-001\*\* — Live one/)
    assert.match(index, /- \*\*D-002\*\* \(superseded by D-004\) — Dead one/)
    assert.match(index, /- \*\*D-003\*\* \(challenged by OD-009\) — Contested one/)
    // The marker must not cost a third line — that is D-075's abort condition.
    for (const block of index.split('\n\n').slice(1)) {
      assert.equal(block.split('\n').filter(Boolean).length, 2)
    }
  })

  it('holds one entry to exactly two lines (the abort condition of D-075)', () => {
    // If a real entry ever needs more, the decision grammar is the problem —
    // not the file size. Guard it here rather than discovering it as bloat.
    const body = buildIndex(SOURCE.split('\n')).split('\n\n').slice(1)
    for (const block of body) {
      const lines = block.split('\n').filter(Boolean)
      assert.equal(lines.length, 2, `one entry = title line + Decision line, got:\n${block}`)
    }
  })
})

// ── THE FORM LOCK ────────────────────────────────────────────────────────────
describe('buildIndex — form (this is what keeps RF-03 at zero)', () => {
  it('defines no ID at all — the index is pure reference', () => {
    const index = buildIndex(SOURCE.split('\n'))
    assert.deepEqual(
      parseIdDefinitions(index.split('\n')),
      [],
      'an index entry must never parse as an ID definition — headings here would '
      + 'mean one RF-03 error per decision in the workspace',
    )
  })

  it('still references every ID, so nothing goes invisible', () => {
    const refs = parseIdReferences(buildIndex(SOURCE.split('\n')).split('\n')).map(r => r.id)
    assert.deepEqual([...new Set(refs)].sort(), ['D-001', 'D-002', 'D-003'])
  })

  it('writes bold list items and a two-space continuation, not headings', () => {
    for (const line of buildIndex(SOURCE.split('\n')).split('\n')) {
      if (!line.trim()) continue
      assert.doesNotMatch(line, /^#{1,6}\s+D-\d{3}/, 'no heading may carry an ID')
      if (line.startsWith('- ')) {
        assert.match(line, /^- \*\*D-\d{3}\*\* — /,
          'the ID token must be wrapped in ** so ID_LIST_RE cannot match it')
      } else if (line.startsWith('  ')) {
        assert.doesNotMatch(line, /^ {4}|^\t/,
          'the continuation is indented by two spaces — four would make it an '
          + 'indented code block and hide its links from RF-01')
      }
    }
  })

  it('survives a source whose own IDs would collide — 42 entries, still zero definitions', () => {
    const many = ['# Decisions', '']
    for (let n = 1; n <= 42; n++) {
      const id = `D-${String(n).padStart(3, '0')}`
      many.push(`## ${id} — Entry number ${n}`, `Date: 2026-01-01`, `Decision: Do thing ${n}.`, '')
    }
    const index = buildIndex(many)
    assert.equal(parseIdDefinitions(index.split('\n')).length, 0)
    assert.equal((index.match(/^- \*\*D-\d{3}\*\*/gm) || []).length, 42)
  })
})

describe('ST-10 — the index against its source', () => {
  it('is silent right after init, and init ships the index', async () => {
    const root = await makeRoot('truss-didx-init-')
    await runInit(root, ['--name', 'Indexed', '--lang', 'English'])

    await assert.doesNotReject(() => read(root, INDEX_REL), 'init writes the index')
    const findings = await runChecks(root)
    assert.deepEqual(ids(findings, 'ST-10'), [], 'a fresh workspace has nothing to report')
    // …and the index did not make the generated map stale either.
    assert.deepEqual(ids(findings, 'ST-07'), [], 'init writes the index before the map')
    assert.equal(errorsOf(findings).length, 0)
  })

  it('reports I — not W — when the index has never been generated', async () => {
    const root = await makeRoot('truss-didx-absent-')
    await runInit(root, ['--name', 'Indexed', '--lang', 'English'])
    await fs.rm(path.join(root, INDEX_REL))

    const f = ids(await runChecks(root), 'ST-10')
    assert.equal(f.length, 1)
    // D-081: `doctor` exits 1 on a W, so a missing index must not un-green every
    // workspace that predates the index. Not having taken a step is not a defect.
    assert.equal(f[0].severity, 'I')
    assert.match(f[0].fix, /render/)
  })

  it('reports W when the index disagrees with decisions.md', async () => {
    const root = await makeRoot('truss-didx-stale-')
    await runInit(root, ['--name', 'Indexed', '--lang', 'English'])
    await fs.appendFile(
      path.join(root, SOURCE_REL),
      '\n## D-001 — Added after the index was written\nDate: 2026-01-01\n'
      + 'Decision: Something the index has never heard of.\n'
      + 'Rationale: r.\nConsequences: c.\n',
    )

    const f = ids(await runChecks(root), 'ST-10')
    assert.equal(f.length, 1)
    assert.equal(f[0].severity, 'W')
    assert.equal(f[0].file, INDEX_REL)
  })

  it('reports W for a hand-edit of the index itself', async () => {
    const root = await makeRoot('truss-didx-handedit-')
    await runInit(root, ['--name', 'Indexed', '--lang', 'English'])
    const abs = path.join(root, INDEX_REL)
    await fs.writeFile(abs, (await fs.readFile(abs, 'utf8')) + '\n- **D-404** — invented by hand\n  Decision: none.\n')

    const f = ids(await runChecks(root), 'ST-10')
    assert.equal(f.length, 1)
    assert.equal(f[0].severity, 'W')
  })

  it('compares content, not mtime — touching decisions.md changes nothing', async () => {
    const root = await makeRoot('truss-didx-mtime-')
    await runInit(root, ['--name', 'Indexed', '--lang', 'English'])
    const later = new Date(Date.now() + 60_000)
    await fs.utimes(path.join(root, SOURCE_REL), later, later)

    assert.deepEqual(ids(await runChecks(root), 'ST-10'), [])
  })

  it('stays silent when there is no decisions.md to be stale against', async () => {
    const root = await makeRoot('truss-didx-nosource-')
    await runInit(root, ['--name', 'Indexed', '--lang', 'English'])
    await fs.rm(path.join(root, SOURCE_REL))
    await fs.rm(path.join(root, INDEX_REL))

    // ST-01 owns the missing file; ST-10 has nothing to say about it.
    assert.deepEqual(ids(await runChecks(root), 'ST-10'), [])
  })
})

describe('writeIndex on a real workspace', () => {
  it('indexes a full decision log without producing a single RF-02/RF-03', async () => {
    const root = await makeRoot('truss-didx-real-')
    await runInit(root, ['--name', 'Indexed', '--lang', 'English'])

    const log = ['# Decisions', '']
    for (let n = 1; n <= 42; n++) {
      const id = `D-${String(n).padStart(3, '0')}`
      log.push(
        `## ${id} — Entry number ${n}`,
        'Date: 2026-01-01',
        `Decision: Do thing ${n}${n > 1 ? `, replacing what D-001 said` : ''}.`,
        'Rationale: r.',
        'Consequences: c.',
        '',
      )
    }
    await fs.writeFile(path.join(root, SOURCE_REL), log.join('\n'))

    const res = await writeIndex(root)
    assert.equal(res.entries, 42)

    const findings = await runChecks(root)
    assert.deepEqual(ids(findings, 'ST-10'), [])
    assert.deepEqual(
      ids(findings, 'RF-03').map(f => f.message), [],
      'the index must not define any ID a second time',
    )
    assert.deepEqual(ids(findings, 'RF-02').map(f => f.message), [])
  })

  it('returns null (not a throw) when there is nothing to index', async () => {
    const root = await makeRoot('truss-didx-null-')
    assert.equal(await writeIndex(root), null)
  })
})
