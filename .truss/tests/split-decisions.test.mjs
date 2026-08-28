// .truss/tests/split-decisions.test.mjs — the one-time migration (D-087).
//
// The property that matters is not "it wrote files" but "it changed nothing it
// was not asked to change": same entries, same index, same doctor verdict. A
// migration that silently drops or reorders an entry is worse than no migration
// at all, because the loss is invisible afterwards.
//
// Run with: node --test .truss/tests/split-decisions.test.mjs
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

import { runSplitDecisions } from '../lib/commands/split-decisions.mjs'
import {
  buildIndex, readDecisionSource, parseDecisionEntries,
  INDEX_REL, SOURCE_REL, DECISIONS_DIR, decisionPath,
} from '../lib/decisions-index.mjs'
import { runInit } from '../lib/commands/init.mjs'
import { makeRoot, runChecks, errorsOf } from './helpers.mjs'

const ids = (findings, id) => findings.filter(f => f.id === id)

const PREAMBLE = `# Decisions

> Decided decisions. D-NNN, sequential, never reused. Never delete — supersede instead.
> D-001 – D-002 archived → archive/decisions-d001-d002.md (pre-beta; still valid).
`

const LOG = PREAMBLE + `
## D-003 — Files are the single source of truth
Date: 2026-01-03
Decision: Every operational fact lives in exactly one file.
Rationale: Two copies drift, silently.
Consequences: doctor grows a check per rule.

## D-004 — The engine ships as a directory
Date: 2026-01-04
Decision: \`.truss/\` is the distribution.
Rationale: Zero install surface.
Consequences: \`truss upgrade\` replaces the directory.
Superseded-by: D-005

> Superseded by D-005 (2026-01-05): packaging moved.

## D-005 — Decisions bind until superseded
Date: 2026-01-05
Decision: An entry binds until a later D-NNN supersedes it.
Rationale: Otherwise every session re-litigates the log.
Consequences: \`Superseded-by:\` is the only way out.
`

async function workspaceWith(log, prefix) {
  const root = await makeRoot(prefix)
  await runInit(root, ['--name', 'Split', '--lang', 'English'])
  await fs.writeFile(path.join(root, SOURCE_REL), log)
  return root
}

describe('split-decisions — the split itself', () => {
  it('writes one file per entry and leaves the index byte-identical', async () => {
    const root = await workspaceWith(LOG, 'truss-split-happy-')
    const before = buildIndex(LOG.split('\n'))

    const res = await runSplitDecisions(root)
    assert.equal(res.entries, 3)

    for (const id of ['D-003', 'D-004', 'D-005']) {
      const body = await fs.readFile(path.join(root, decisionPath(id)), 'utf8')
      assert.match(body, new RegExp(`^## ${id} — `), `${id}.md starts with its own heading`)
      // Exactly one entry per file — a body that swallowed its neighbour would
      // still index correctly but would be unopenable by ID.
      assert.equal(parseDecisionEntries(body.split('\n')).length, 1)
    }

    const after = await readDecisionSource(root)
    assert.equal(after.form, 'dir')
    assert.equal(buildIndex(after.lines), before, 'the split must not change the index')
    assert.equal(await fs.readFile(path.join(root, INDEX_REL), 'utf8'), before)
  })

  it('carries a supersede note with the entry it belongs to', async () => {
    // The note sits between two entries in the flat file; it must land with the
    // entry above it, not with the one below.
    const root = await workspaceWith(LOG, 'truss-split-note-')
    await runSplitDecisions(root)

    const d004 = await fs.readFile(path.join(root, decisionPath('D-004')), 'utf8')
    assert.match(d004, /Superseded by D-005 \(2026-01-05\)/)
    const d005 = await fs.readFile(path.join(root, decisionPath('D-005')), 'utf8')
    assert.doesNotMatch(d005, /Superseded by D-005/)
  })

  it('keeps the preamble — archive pointers are real content', async () => {
    const root = await workspaceWith(LOG, 'truss-split-preamble-')
    const res = await runSplitDecisions(root)
    assert.equal(res.preamble, true)

    const left = await fs.readFile(path.join(root, SOURCE_REL), 'utf8')
    assert.match(left, /archive\/decisions-d001-d002\.md/,
      'the pointer to an already-archived range must survive the split')
    assert.doesNotMatch(left, /^## D-\d{3}/m, 'no entry may be left behind')
  })

  it('leaves the workspace exactly as healthy as it found it', async () => {
    // The adopter promise (D-081): migrating must not introduce a single finding.
    const root = await workspaceWith(LOG, 'truss-split-doctor-')
    const { runMap } = await import('../lib/commands/map.mjs')
    const { writeIndex } = await import('../lib/decisions-index.mjs')
    await writeIndex(root); await runMap(root, [])
    const before = await runChecks(root)

    await runSplitDecisions(root)
    await runMap(root, [])
    const after = await runChecks(root)

    assert.equal(errorsOf(after).length, 0, 'no errors introduced')
    // The fixture's preamble cites an archived range this test workspace does
    // not carry, so RF-02 has entries before AND after — comparing the whole
    // finding set below is the real proof. What must hold absolutely is that no
    // SPLIT entry became unresolvable.
    for (const id of ['D-003', 'D-004', 'D-005']) {
      assert.equal(ids(after, 'RF-02').filter(f => f.message.includes(id)).length, 0,
        `${id} must still resolve after its body moved`)
    }
    assert.deepEqual(ids(after, 'RF-03').map(f => f.message), [],
      'no id may end up defined twice')
    assert.deepEqual(ids(after, 'ST-10'), [], 'the index matches its new source')
    assert.deepEqual(
      after.map(f => f.id).sort(), before.map(f => f.id).sort(),
      'the finding set is unchanged — the split is not an excuse for new noise',
    )
  })

  it('keeps the bodies out of the map but inside the checks', async () => {
    const root = await workspaceWith(LOG, 'truss-split-map-')
    await runSplitDecisions(root)
    const { runMap, generateMapContent } = await import('../lib/commands/map.mjs')
    await runMap(root, [])

    const map = await generateMapContent(root)
    assert.doesNotMatch(map, /state\/decisions\/D-\d{3}\.md/,
      '40 decision rows would bury the domain files the map exists to show')

    // …but the loader still sees them, or every reference would be an RF-02.
    const findings = await runChecks(root)
    for (const id of ['D-003', 'D-004', 'D-005']) {
      assert.equal(ids(findings, 'RF-02').filter(f => f.message.includes(id)).length, 0,
        `${id} is defined in ${DECISIONS_DIR}/ and must be visible to RF`)
    }
  })
})

describe('split-decisions — refusals', () => {
  const rejects = async (root, re) =>
    assert.rejects(() => runSplitDecisions(root), (e) => (assert.match(e.message, re), true))

  it('refuses when there is nothing to split', async () => {
    const root = await makeRoot('truss-split-none-')
    await runInit(root, ['--name', 'Split', '--lang', 'English'])
    await fs.rm(path.join(root, SOURCE_REL), { force: true })
    await rejects(root, /nothing to split/)
  })

  it('refuses when the workspace is already split', async () => {
    const root = await workspaceWith(LOG, 'truss-split-twice-')
    await runSplitDecisions(root)
    await rejects(root, /already split/)
  })

  it('refuses on a duplicate id rather than let one body overwrite another', async () => {
    const dupe = LOG + '\n## D-004 — A second entry with the same id\nDate: 2026-01-06\nDecision: x\n'
    const root = await workspaceWith(dupe, 'truss-split-dupe-')
    await rejects(root, /duplicate id.*D-004/s)

    // Nothing was written: the refusal comes before any file is touched.
    await assert.rejects(() => fs.readdir(path.join(root, DECISIONS_DIR)))
  })

  it('refuses a log with no entries at all', async () => {
    const root = await workspaceWith(PREAMBLE, 'truss-split-empty-')
    await rejects(root, /no '## D-NNN' entries/)
  })
})

describe('split-decisions — --dry-run', () => {
  it('reports what it would do and writes nothing', async () => {
    const root = await workspaceWith(LOG, 'truss-split-dry-')
    const before = await fs.readFile(path.join(root, SOURCE_REL), 'utf8')

    const res = await runSplitDecisions(root, ['--dry-run'])
    assert.equal(res.dryRun, true)
    assert.equal(res.entries, 3)

    assert.equal(await fs.readFile(path.join(root, SOURCE_REL), 'utf8'), before)
    await assert.rejects(() => fs.readdir(path.join(root, DECISIONS_DIR)),
      'a dry run must not even create the directory')
  })
})
