// .truss/tests/phase.test.mjs — `truss phase` tests
// Run with: node --test .truss/tests/phase.test.mjs
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { runInit } from '../lib/commands/init.mjs'
import { runPhase, PhaseError, setCurrentInFrontmatter } from '../lib/commands/phase.mjs'
import { parsePhases, parseBlocks } from '../lib/md.mjs'
import { makeRoot, runChecks, errorsOf, read } from './helpers.mjs'

async function phaseBlockOf(root) {
  const blocks = parseBlocks((await read(root, 'AGENTS.md')).split('\n'))
  return (blocks.get('phase')?.innerLines ?? []).join('\n')
}

describe('setCurrentInFrontmatter', () => {
  it('replaces the current: line in frontmatter only', () => {
    const raw = '---\ncurrent: ingest\n---\n\n## ingest\nlabel: Ingest\ncurrent: not-this\n'
    const out = setCurrentInFrontmatter(raw, 'operate')
    assert.match(out, /^---\ncurrent: operate\n---/)
    assert.match(out, /\ncurrent: not-this\n/) // body line untouched
  })
  it('throws when there is no frontmatter / no current line', () => {
    assert.throws(() => setCurrentInFrontmatter('## ingest\n', 'operate'), PhaseError)
    assert.throws(() => setCurrentInFrontmatter('---\nfoo: bar\n---\n', 'operate'), PhaseError)
  })
})

describe('runPhase', () => {
  it('lists phases without changing state when given no id', async () => {
    const root = await makeRoot('truss-phase-list-')
    await runInit(root, ['--name', 'L', '--lang', 'English', '--overlay'])
    const res = await runPhase(root, [])
    assert.equal(res.listed, true)
    assert.equal(res.current, 'ingest')
    assert.deepEqual(res.ordered, ['ingest', 'operate'])
    // unchanged
    const phases = parsePhases((await read(root, 'state/phases.md')).split('\n'))
    assert.equal(phases.frontmatter.current, 'ingest')
  })

  it('requires an explicit gate override, then re-renders atomically', async () => {
    const root = await makeRoot('truss-phase-set-')
    await runInit(root, ['--name', 'L', '--lang', 'English', '--overlay'])
    await assert.rejects(runPhase(root, ['operate']), /exit gate/)
    const res = await runPhase(root, ['operate', '--override-gate'])
    assert.equal(res.changed, true)
    assert.equal(res.from, 'ingest')
    assert.equal(res.current, 'operate')

    const phases = parsePhases((await read(root, 'state/phases.md')).split('\n'))
    assert.equal(phases.frontmatter.current, 'operate')
    assert.match(await phaseBlockOf(root), /\*\*Phase 2\/2 — operate/)
    assert.equal(errorsOf(await runChecks(root)).length, 0)
    assert.equal(res.gateOverridden, true)
  })

  it('throws on an unknown phase id', async () => {
    const root = await makeRoot('truss-phase-bad-')
    await runInit(root, ['--name', 'L', '--lang', 'English', '--overlay'])
    await assert.rejects(runPhase(root, ['nope']), PhaseError)
  })

  it('is a no-op when already on the target phase', async () => {
    const root = await makeRoot('truss-phase-noop-')
    await runInit(root, ['--name', 'L', '--lang', 'English', '--overlay'])
    const res = await runPhase(root, ['ingest'])
    assert.equal(res.changed, false)
  })
})
