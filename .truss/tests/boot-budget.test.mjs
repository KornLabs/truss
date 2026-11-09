// .truss/tests/boot-budget.test.mjs — a workspace's own, lower warn band (D-136)
// and the per-file boot sizes in `doctor --json`.
//
// Locked here:
//   1. `boot-budget:` can only LOWER the CX-01 warn band, never raise it, and
//      never moves the error band — raising stays the reviewed `truss ack context`.
//   2. An unusable value is said out loud (CX-03), never silently ignored.
//   3. CX-01, `truss ack context` and `doctor --json` judge against the same band.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { WARN_TOKENS, ERROR_TOKENS, MIN_BUDGET_TOKENS, bootBudgetFrom, warnTokensFor, measureBootContext } from '../lib/context-budget.mjs'
import * as cx from '../checks/cx.mjs'
import { runInit } from '../lib/commands/init.mjs'
import { makeRoot, read } from './helpers.mjs'

const execFileP = promisify(execFile)
const binOf = (root) => path.join(root, '.truss', 'bin', 'truss.mjs')
const ids = (findings, id) => findings.filter(f => f.id === id)
const big = (words) => '# Big\n\n' + Array(words).fill('lorem').join(' ') + '\n'
function file(content) {
  const lines = content.split('\n')
  if (lines.at(-1) === '') lines.pop()
  return { lines, content, stat: { mtimeMs: Date.now() } }
}
const profile = (line) => file(`## Project\n\nname: Demo\nlanguage: English\n${line}\ncode-root:\n`)
function ctxOf(files = {}) {
  return { files: new Map(Object.entries(files)), phases: { frontmatter: {}, defs: new Map() }, diskPaths: [], root: '/tmp/none', contextAck: null }
}

describe('bootBudgetFrom', () => {
  it('absent or empty → no value, valid', () => {
    assert.deepEqual(bootBudgetFrom(null), { value: null, raw: null, valid: true })
    assert.deepEqual(bootBudgetFrom('name: x\nboot-budget:\n'), { value: null, raw: null, valid: true })
    assert.deepEqual(bootBudgetFrom('boot-budget: <!-- tokens -->\n'), { value: null, raw: null, valid: true })
  })
  it('a key inside an HTML comment block is documentation, the live line wins', () => {
    assert.equal(bootBudgetFrom('<!--\nboot-budget: 9000\n-->\nboot-budget: 7000\n').value, 7000)
    assert.deepEqual(bootBudgetFrom('<!-- boot-budget: 9000 -->\n'), { value: null, raw: null, valid: true })
  })
  it('CRLF, bullets and prose', () => {
    assert.equal(bootBudgetFrom('name: x\r\nboot-budget: 7000\r\n').value, 7000)
    assert.equal(bootBudgetFrom('- boot-budget: 8000').raw, null)
    assert.equal(bootBudgetFrom('Some prose boot-budget: 5000').raw, null)
  })
  it('two key lines are ambiguous → invalid, never first-wins', () => {
    const b = bootBudgetFrom('boot-budget: 7000\nboot-budget: 6000\n')
    assert.equal(b.valid, false)
    assert.equal(b.value, null)
    assert.match(b.raw, /2 boot-budget lines/)
  })
  it('separators only as thousands groups of one kind', () => {
    assert.equal(bootBudgetFrom('boot-budget: 12,000').value, 12000)
    assert.equal(bootBudgetFrom("boot-budget: 8'000").value, 8000)
    for (const raw of ['1,5,0,0', '12.5', '8_0', '8.000,000', '8 000']) assert.equal(bootBudgetFrom(`boot-budget: ${raw}`).valid, false, raw)
  })
  it('plain digits, digit groups and a trailing comment are read', () => {
    assert.equal(bootBudgetFrom('boot-budget: 8000').value, 8000)
    assert.equal(bootBudgetFrom('boot-budget: 8_000').value, 8000)
    assert.equal(bootBudgetFrom('boot-budget: 8.000').value, 8000)
    assert.equal(bootBudgetFrom('  Boot-Budget: 12000 <!-- small local agents -->').value, 12000)
  })
  it('only lowers: at or above the default band, below the minimum, or not a number → invalid', () => {
    for (const raw of [String(WARN_TOKENS), '25000', String(MIN_BUDGET_TOKENS - 1), '0', '8k', 'eight thousand', '-5000']) {
      const b = bootBudgetFrom(`boot-budget: ${raw}`)
      assert.equal(b.valid, false, raw)
      assert.equal(b.value, null, raw)
      assert.equal(b.raw, raw)
    }
    assert.equal(bootBudgetFrom(`boot-budget: ${MIN_BUDGET_TOKENS}`).value, MIN_BUDGET_TOKENS)
    assert.equal(bootBudgetFrom(`boot-budget: ${WARN_TOKENS - 1}`).value, WARN_TOKENS - 1)
  })
})

describe('warnTokensFor', () => {
  it('default without a profile line', () => {
    assert.deepEqual(warnTokensFor(ctxOf({ 'state/profile.md': profile('') })), { warn: WARN_TOKENS, source: 'default', invalid: null })
  })
  it('profile value when valid', () => {
    assert.deepEqual(warnTokensFor(ctxOf({ 'state/profile.md': profile('boot-budget: 8000') })), { warn: 8000, source: 'profile', invalid: null })
  })
  it('default plus the rejected text when invalid', () => {
    assert.deepEqual(warnTokensFor(ctxOf({ 'state/profile.md': profile('boot-budget: 40000') })), { warn: WARN_TOKENS, source: 'default', invalid: '40000' })
  })
})

describe('CX-01 against a workspace budget', () => {
  // 6000 words ≈ 9000 tokens: under the default band, over a budget of 8000.
  const boot = { 'AGENTS.md': file(big(6000)) }

  it('without a budget, 9k tokens is clean', async () => {
    const f = await cx.run(ctxOf({ ...boot, 'state/profile.md': profile('') }))
    assert.equal(ids(f, 'CX-01').length, 0)
    assert.equal(ids(f, 'CX-03').length, 0)
  })

  it('with boot-budget 8000 the same size warns and names the budget as its source', async () => {
    const [w] = ids(await cx.run(ctxOf({ ...boot, 'state/profile.md': profile('boot-budget: 8000') })), 'CX-01')
    assert.equal(w.severity, 'W')
    assert.match(w.message, /8000 warn \(boot-budget in state\/profile\.md\)/)
  })

  it('the error band does not move with the budget', async () => {
    const [e] = ids(await cx.run(ctxOf({ 'AGENTS.md': file(big(Math.ceil(ERROR_TOKENS / 1.5) + 10)), 'state/profile.md': profile('boot-budget: 8000') })), 'CX-01')
    assert.equal(e.severity, 'E')
    assert.match(e.message, new RegExp(`${ERROR_TOKENS} error`))
  })

  it('an unusable budget is reported as CX-03 and CX-01 keeps the default band', async () => {
    const f = await cx.run(ctxOf({ ...boot, 'state/profile.md': profile('boot-budget: 25000') }))
    const [i] = ids(f, 'CX-03')
    assert.equal(i.severity, 'I')
    assert.equal(i.file, 'state/profile.md')
    assert.match(i.message, /ignored \("25000"\)/)
    assert.equal(ids(f, 'CX-01').length, 0)
  })

  it('a reviewed ack still downgrades a warning under a workspace budget (same headroom)', async () => {
    const ctx = ctxOf({ ...boot, 'state/profile.md': profile('boot-budget: 8000') })
    ctx.contextAck = { version: 1, acks: { 'CX-01': { tokens: 9000, date: '2026-11-10' } } }
    const [i] = ids(await cx.run(ctx), 'CX-01')
    assert.equal(i.severity, 'I')
    assert.match(i.message, /8000 warn \(boot-budget in state\/profile\.md\)/)
  })

  it('CX-03 is in the catalogue', () => {
    assert.ok(cx.meta.some(m => m.id === 'CX-03' && m.severity === 'I'))
  })
})

describe('measureBootContext carries chars per file', () => {
  it('chars equal the content length', async () => {
    const content = '# A\n\nÄpfel und Birnen\n'
    const m = await measureBootContext(ctxOf({ 'AGENTS.md': file(content) }))
    const a = m.counted.find(c => c.file === 'AGENTS.md')
    assert.equal(a.chars, content.length)
  })
})

describe('doctor --json bootContext and ack share the band', () => {
  it('reports per-file sizes that add up, and the band with its source', async () => {
    const root = await makeRoot('truss-bootbudget-')
    await runInit(root, ['--name', 'Demo', '--lang', 'English'])
    const p = path.join(root, 'state', 'profile.md')
    const before = await fs.readFile(p, 'utf8')
    const after = before.replace(/^code-root:/m, 'boot-budget: 1500\ncode-root:')
    assert.notEqual(after, before, 'the init profile template has a code-root: line to anchor on')
    await fs.writeFile(p, after)
    const env = { ...process.env, TRUSS_NO_GIT: '1' }
    // Exit 1 = warnings only, which is expected here; anything else is a crash.
    const run = await execFileP('node', [binOf(root), 'doctor', '--json'], { cwd: root, env }).catch(e => e)
    assert.ok(run.code === undefined || run.code === 1, `doctor exited ${run.code}: ${run.stderr ?? ''}`)
    const j = JSON.parse(await read(root, '.truss/out/doctor.json'))
    const b = j.bootContext
    assert.ok(b, 'bootContext present')
    assert.equal(b.warnTokens, 1500)
    assert.equal(b.warnSource, 'profile')
    assert.equal(b.errorTokens, ERROR_TOKENS)
    assert.equal(b.list, 'section-1')
    assert.ok(b.files.some(f => f.file === 'AGENTS.md'))
    assert.equal(b.files.reduce((s, f) => s + f.words, 0), b.words)
    assert.equal(b.files.reduce((s, f) => s + f.chars, 0), b.chars)
    // A fresh init is ≈3k tokens: over 1500, so CX-01 warns and ack accepts it.
    assert.ok(b.tokens >= 1500)
    assert.ok(j.findings.some(f => f.id === 'CX-01' && f.severity === 'W'))
    const { stdout } = await execFileP('node', [binOf(root), 'ack', 'context'], { cwd: root, env })
    assert.doesNotMatch(stdout, /already under/)
  })
})
