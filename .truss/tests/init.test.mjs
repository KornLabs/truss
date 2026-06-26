// .truss/tests/init.test.mjs — WP-INIT tests (`truss init`)
// Run with: node --test .truss/tests/init.test.mjs
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { runInit, parseInitArgs, InitError } from '../lib/commands/init.mjs'
import { parsePhases, parseBlocks } from '../lib/md.mjs'
import { makeRoot, runChecks, errorsOf, read } from './helpers.mjs'

async function phaseBlockOf(root) {
  const blocks = parseBlocks((await read(root, 'AGENTS.md')).split('\n'))
  return (blocks.get('phase')?.innerLines ?? []).join('\n')
}

describe('parseInitArgs', () => {
  it('parses spaced and = forms', () => {
    assert.deepEqual(parseInitArgs(['--name', 'A', '--lang', 'English']),
      { name: 'A', lang: 'English', overlay: false })
    assert.deepEqual(parseInitArgs(['--name=A B', '--overlay']),
      { name: 'A B', lang: null, overlay: true })
  })
  it('throws on unknown flag', () => {
    assert.throws(() => parseInitArgs(['--bogus']), InitError)
  })
  it('rejects a missing or flag-like value (N-4)', () => {
    assert.throws(() => parseInitArgs(['--lang']), InitError)
    assert.throws(() => parseInitArgs(['--name', '--overlay']), InitError)
    assert.throws(() => parseInitArgs(['--name']), InitError)
  })
})

describe('init (core)', () => {
  it('scaffolds a clean, doctor-green core instance', async () => {
    const root = await makeRoot('truss-init-core-')
    const res = await runInit(root, ['--name', 'Acme', '--lang', 'English'])

    // phases.md = core (discover → validate → plan → build)
    const phases = parsePhases((await read(root, 'state/phases.md')).split('\n'))
    assert.equal(phases.frontmatter.current, 'discover')
    assert.deepEqual(phases.ordered, ['discover', 'validate', 'plan', 'build'])

    // placeholder substitution
    const profile = await read(root, 'state/profile.md')
    assert.match(profile, /name: Acme/)
    assert.match(profile, /language: English/)
    assert.match(await read(root, 'VISION.md'), /Acme/)

    // rendered blocks (C1 defaults + phase 1/4)
    const agents = await read(root, 'AGENTS.md')
    assert.match(agents, /- orchestration=medium ::/)
    assert.match(agents, /- phase-lock=advisory ::/)
    assert.doesNotMatch(agents, /- emoji=/)
    assert.match(await phaseBlockOf(root), /\*\*Phase 1\/4 — discover/)

    assert.equal(res.conflicts.length, 0)
    assert.equal(errorsOf(await runChecks(root)).length, 0)
  })
})

describe('init --overlay', () => {
  it('uses ingest→operate phases and adds repo/ to .gitignore', async () => {
    const root = await makeRoot('truss-init-overlay-')
    await runInit(root, ['--name', 'Legacy', '--lang', 'English', '--overlay'])

    const phases = parsePhases((await read(root, 'state/phases.md')).split('\n'))
    assert.equal(phases.frontmatter.current, 'ingest')
    assert.deepEqual(phases.ordered, ['ingest', 'operate'])
    assert.match(await read(root, '.gitignore'), /repo\//)
    assert.match(await phaseBlockOf(root), /\*\*Phase 1\/2 — ingest/)
    assert.equal(errorsOf(await runChecks(root)).length, 0)
  })
})

describe('init no-overwrite & pre-flight', () => {
  it('refuses to re-init an already-initialised workspace', async () => {
    const root = await makeRoot('truss-init-reinit-')
    await runInit(root, ['--name', 'A', '--lang', 'English'])
    await assert.rejects(runInit(root, ['--name', 'B', '--lang', 'English']), /already/i)
  })

  it('preserves a pre-existing file on partial re-run and reports it as a conflict', async () => {
    const root = await makeRoot('truss-init-partial-')
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    await fs.writeFile(path.join(root, 'HUMAN-TODOS.md'), '# custom todos\n')
    const res = await runInit(root, ['--name', 'A', '--lang', 'English'])
    assert.ok(res.conflicts.some(p => p.endsWith('HUMAN-TODOS.md')), 'pre-existing file reported as conflict')
    assert.equal(await read(root, 'HUMAN-TODOS.md'), '# custom todos\n', 'pre-existing file untouched')
  })
})

describe('init missing args (non-TTY)', () => {
  it('errors instead of hanging when name/lang are missing', async () => {
    const root = await makeRoot('truss-init-missing-')
    await assert.rejects(runInit(root, ['--name', 'only']), InitError)
  })
})
