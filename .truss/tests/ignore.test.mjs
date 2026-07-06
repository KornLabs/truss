// .truss/tests/ignore.test.mjs — the scan-exclusion layer (.trussignore/.gitignore)
//
// Covers three things:
//   1. The matcher's gitignore semantics (anchoring, dir-only, negation, globs).
//   2. Dedup of doctor findings (one cause × N → one row + occurrences).
//   3. End-to-end: a foreign bulk folder is kept out of BOTH map and doctor, and
//      .trussignore is honoured — the exact failure from the upstream bug report.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

import { parseIgnoreRules, makePredicate, loadIgnore } from '../lib/ignore.mjs'
import { dedupeFindings } from '../lib/severity.mjs'
import { generateMapContent } from '../lib/commands/map.mjs'
import { runInit } from '../lib/commands/init.mjs'
import { makeRoot, runChecks } from './helpers.mjs'

const pred = (text) => makePredicate(parseIgnoreRules(text))

describe('ignore matcher: gitignore semantics', () => {
  it('unanchored name matches a basename at any depth (dir + contents)', () => {
    const ig = pred('Claude')
    assert.equal(ig('Claude', true), true)
    assert.equal(ig('Claude/Cache/x_0', false), true)
    assert.equal(ig('src/Claude/a.md', false), true)   // matches at any depth
    assert.equal(ig('context/notes.md', false), false)
  })

  it('anchored (slash-bearing) pattern is rooted', () => {
    const ig = pred('/build/')
    assert.equal(ig('build/out.js', false), true)
    assert.equal(ig('src/build/out.js', false), false) // not at root → not matched
  })

  it('directory-only rule does not match a like-named file', () => {
    const ig = pred('logs/')
    assert.equal(ig('logs', true), true)
    assert.equal(ig('logs', false), false)             // a *file* named logs stays
  })

  it('negation re-includes (last rule wins)', () => {
    const ig = pred('.env.*\n!.env.example')
    assert.equal(ig('.env.local', false), true)
    assert.equal(ig('.env.example', false), false)
  })

  it('globs: * stays within a segment, ** spans segments', () => {
    assert.equal(pred('*.tmp')('a/b.tmp', false), true)
    assert.equal(pred('data/**')('data/2026/raw/x.csv', false), true)
    assert.equal(pred('a/**/z')('a/b/c/z', false), true)
  })

  it('blank lines and # comments are ignored', () => {
    const rules = parseIgnoreRules('# a comment\n\n   \nnode_modules/\n')
    assert.equal(rules.length, 1)
  })
})

describe('loadIgnore layering', () => {
  it('reads .trussignore and honours .gitignore by default; TRUSS_NO_GITIGNORE opts out', async () => {
    const root = await makeRoot('truss-ign-load-')
    await fs.writeFile(path.join(root, '.gitignore'), 'gitonly/\n')
    await fs.writeFile(path.join(root, '.trussignore'), 'trussonly/\n')

    const on = await loadIgnore(root)
    assert.equal(on.isIgnored('gitonly/x', false), true)
    assert.equal(on.isIgnored('trussonly/x', false), true)
    assert.deepEqual(on.sources, ['.gitignore', '.trussignore'])

    const off = await loadIgnore(root, { respectGitignore: false })
    assert.equal(off.isIgnored('gitonly/x', false), false)  // .gitignore not consulted
    assert.equal(off.isIgnored('trussonly/x', false), true)
    await fs.rm(root, { recursive: true, force: true })
  })
})

describe('dedupeFindings', () => {
  it('collapses identical id+message into one representative with occurrences/locations', () => {
    const raw = [
      { id: 'RF-01', severity: 'E', file: 'state/map.md', line: 10, message: 'broken link [X]' },
      { id: 'RF-01', severity: 'E', file: 'state/map.md', line: 20, message: 'broken link [X]' },
      { id: 'RF-01', severity: 'E', file: 'state/map.md', line: 30, message: 'broken link [X]' },
      { id: 'ST-05', severity: 'I', file: 'state/map.md', line: 602, message: 'file has 602 lines' },
    ]
    const out = dedupeFindings(raw)
    assert.equal(out.length, 2)
    const rf = out.find(f => f.id === 'RF-01')
    assert.equal(rf.occurrences, 3)
    assert.equal(rf.locations.length, 3)
    assert.equal(out.find(f => f.id === 'ST-05').occurrences, 1)
  })
})

describe('end-to-end: foreign bulk folder stays out of map and doctor', () => {
  it('a large gitignored tree is excluded from the map and does not flood ST-02', async () => {
    const root = await makeRoot('truss-ign-e2e-')
    await runInit(root, ['--name', 'E2E', '--lang', 'English'])

    // Simulate the reported scenario: a big foreign folder in the root, gitignored.
    await fs.appendFile(path.join(root, '.gitignore'), '\nClaude/\n')
    const foreign = path.join(root, 'Claude', 'sessions', 'uuid-1')
    await fs.mkdir(foreign, { recursive: true })
    for (let i = 0; i < 40; i++) {
      await fs.writeFile(path.join(foreign, `note-${i}.md`), `# Foreign ${i}\n\n> [CONNECTORS.md](CONNECTORS.md)\n`)
    }

    // Map must not enumerate the foreign tree.
    const map = await generateMapContent(root)
    assert.ok(!map.includes('Claude/sessions'), 'map must not list foreign UUID paths')
    assert.ok(!/note-3\d\.md/.test(map), 'map must not enumerate foreign files')

    // Doctor must not raise a wall of ST-02 hints for the foreign files, nor
    // RF-01 broken links sourced from them.
    const findings = await runChecks(root)
    const foreignHits = findings.filter(f => (f.file || '').startsWith('Claude/'))
    assert.equal(foreignHits.length, 0, 'no findings should originate under the excluded tree')
    await fs.rm(root, { recursive: true, force: true })
  })

  it('.trussignore alone (no .gitignore entry) also excludes a tree', async () => {
    const root = await makeRoot('truss-ign-trussonly-')
    await runInit(root, ['--name', 'TO', '--lang', 'English'])
    await fs.writeFile(path.join(root, '.trussignore'), 'data/raw/\n')
    const d = path.join(root, 'data', 'raw')
    await fs.mkdir(d, { recursive: true })
    for (let i = 0; i < 30; i++) await fs.writeFile(path.join(d, `r${i}.md`), `# r${i}\n`)

    const map = await generateMapContent(root)
    assert.ok(!/data\/raw/.test(map), 'map must not list .trussignore-excluded tree')
    await fs.rm(root, { recursive: true, force: true })
  })
})
