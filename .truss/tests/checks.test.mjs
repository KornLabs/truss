// .truss/tests/checks-m5.test.mjs — SY/CX/HY checks + doctor report output (M5)
// Unit tests build a minimal ctx by hand (like workspace.test.mjs); the report
// tests drive the real CLI as a subprocess against a freshly-init'd instance.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import * as sy from '../checks/sy.mjs'
import * as cx from '../checks/cx.mjs'
import * as hy from '../checks/hy.mjs'
import { makeRoot, read, runChecks } from './helpers.mjs'
import { runInit } from '../lib/commands/init.mjs'

const execFileP = promisify(execFile)
const DAY = 86_400_000
const today  = () => new Date().toISOString().slice(0, 10)
const daysAgo = (n) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10)
const ids = (findings, id) => findings.filter(f => f.id === id)

function file(content, ageDays = 0) {
  const lines = content.split('\n')
  if (lines.at(-1) === '') lines.pop()
  return { lines, content, stat: { mtimeMs: Date.now() - ageDays * DAY } }
}
function ctxOf(files = {}, { phases, diskPaths = [], root = '/tmp/none' } = {}) {
  return {
    files: new Map(Object.entries(files)),
    phases: phases ?? { frontmatter: {}, defs: new Map() },
    diskPaths, root,
  }
}
const cleanCurrent = (date = today()) => `# Current

focus: shipping M5
next:
  - verify
blockers: none
recently-done:
  - built checks
updated: ${date}
`

// ── SY-01 ────────────────────────────────────────────────────────────────────
describe('SY-01 current.md', () => {
  it('is clean for a complete, fresh current.md', async () => {
    const f = await sy.run(ctxOf({ 'state/current.md': file(cleanCurrent()) }))
    assert.equal(ids(f, 'SY-01').length, 0, JSON.stringify(ids(f, 'SY-01')))
  })
  it('flags a missing required key', async () => {
    const f = await sy.run(ctxOf({ 'state/current.md': file(cleanCurrent().replace('blockers: none\n', '')) }))
    assert.equal(ids(f, 'SY-01').length, 1)
    assert.match(ids(f, 'SY-01')[0].message, /blockers/)
  })
  it('flags staleness from the updated: date', async () => {
    const f = await sy.run(ctxOf({ 'state/current.md': file(cleanCurrent(daysAgo(30))) }))
    assert.ok(ids(f, 'SY-01').some(x => /stale/.test(x.message)))
  })
  it('falls back to mtime when updated: is an unparsable placeholder', async () => {
    const placeholder = cleanCurrent('[YYYY-MM-DD]')
    const fresh = await sy.run(ctxOf({ 'state/current.md': file(placeholder, 0) }))
    assert.equal(ids(fresh, 'SY-01').filter(x => /stale/.test(x.message)).length, 0)
    const old = await sy.run(ctxOf({ 'state/current.md': file(placeholder, 20) }))
    assert.ok(ids(old, 'SY-01').some(x => /stale/.test(x.message)))
  })
})

// ── SY-02 ────────────────────────────────────────────────────────────────────
describe('SY-02 open-decisions.md', () => {
  const withEntry = `# Open Decisions\n\n## Should we X?\n\nOptions: a, b\nLeaning: a\n`
  const empty = `# Open Decisions\n\n<!-- OD entries go here. -->\n`
  const dated = (date) => `# Open Decisions\n\n## OD-001 — Should we X?\n\nOpened: ${date}\nOptions:\n  A. a — t\nTrade-offs: x\nLeaning: a\n`
  it('falls back to file mtime when no entry carries an Opened: date', async () => {
    assert.equal(ids(await sy.run(ctxOf({ 'state/open-decisions.md': file(withEntry, 31) })), 'SY-02').length, 1)
  })
  it('stays silent on an empty file even when old', async () => {
    assert.equal(ids(await sy.run(ctxOf({ 'state/open-decisions.md': file(empty, 90) })), 'SY-02').length, 0)
  })
  it('uses the per-entry Opened: date, not the file mtime, when present', async () => {
    // File is old by mtime but the entry was opened 5 days ago → silent.
    assert.equal(ids(await sy.run(ctxOf({ 'state/open-decisions.md': file(dated(daysAgo(5)), 99) })), 'SY-02').length, 0)
    // Entry opened 45 days ago, file freshly touched → still flagged, by entry.
    const f = ids(await sy.run(ctxOf({ 'state/open-decisions.md': file(dated(daysAgo(45)), 0) })), 'SY-02')
    assert.equal(f.length, 1)
    assert.match(f[0].message, /OD-001|Should we X/)
  })
})

// ── SY-03 ────────────────────────────────────────────────────────────────────
describe('SY-03 entry grammar', () => {
  it('flags a D-NNN entry with incorrect heading format, passes a correct one', async () => {
    const bad  = `# Decisions\n\n## Pick a stack\n\nDecision: Node.\n`
    const good = `# Decisions\n\n## D-001 — Pick a stack\n\nDate: 2026-06-01\nDecision: Node.\nRationale: small runtime\nConsequences: use node --test\n`
    assert.equal(ids(await sy.run(ctxOf({ 'state/decisions.md': file(bad) })), 'SY-03').length, 1)
    assert.equal(ids(await sy.run(ctxOf({ 'state/decisions.md': file(good) })), 'SY-03').length, 0)
  })
  it('warns when D-NNN fields are missing, while accepting legacy Why as rationale', async () => {
    const missing = `# Decisions\n\n## D-001 — Pick a stack\n\nDate: 2026-06-01\nDecision: Node.\n`
    const legacy = `# Decisions\n\n## D-001 — Pick a stack\n\nDate: 2026-06-01\nDecision: Node.\nWhy: already installed\nConsequences: no install step\n`
    const f = ids(await sy.run(ctxOf({ 'state/decisions.md': file(missing) })), 'SY-03')
    assert.equal(f.length, 1)
    assert.match(f[0].message, /Rationale, Consequences/)
    assert.equal(ids(await sy.run(ctxOf({ 'state/decisions.md': file(legacy) })), 'SY-03').length, 0)
  })
  it('flags a malformed HT entry, ignores doc/comment lines', async () => {
    const bad  = `# Human ToDos\n\n> Format: \`- [x] HT-NNN — description\`\n\n## HT-001 — wrong form\n`
    const good = `# Human ToDos\n\n- [ ] HT-001 — sign the contract\n- [x] HT-002 — done thing\n`
    assert.equal(ids(await sy.run(ctxOf({ 'HUMAN-TODOS.md': file(bad) })), 'SY-03').length, 1)
    assert.equal(ids(await sy.run(ctxOf({ 'HUMAN-TODOS.md': file(good) })), 'SY-03').length, 0)
  })
  it('flags an OD entry missing Opened and an unnumbered entry, passes a complete one', async () => {
    const good        = `# Open Decisions\n\n## OD-001 — Should we X?\n\nOpened: 2026-06-01\nOptions:\n- A: a\n- B: b\nTrade-offs: x\nLeaning: a\n`
    const missingF    = `# Open Decisions\n\n## OD-001 — Should we X?\n\nLeaning: a\n`
    const unnumbered  = `# Open Decisions\n\n## Should we X?\n\nOpened: 2026-06-01\nLeaning: a\n`
    assert.equal(ids(await sy.run(ctxOf({ 'state/open-decisions.md': file(good) })), 'SY-03').length, 0)
    assert.equal(ids(await sy.run(ctxOf({ 'state/open-decisions.md': file(missingF) })), 'SY-03').length, 1)
    assert.equal(ids(await sy.run(ctxOf({ 'state/open-decisions.md': file(unnumbered) })), 'SY-03').length, 1)
  })
  it('warns when OD Opened is not a parseable YYYY-MM-DD date', async () => {
    const badDate = `# Open Decisions\n\n## OD-001 — Should we X?\n\nOpened: soon\nOptions: a\nTrade-offs: x\nLeaning: a\n`
    const f = ids(await sy.run(ctxOf({ 'state/open-decisions.md': file(badDate) })), 'SY-03')
    assert.equal(f.length, 1)
    assert.match(f[0].message, /Opened/)
  })
  it('warns when R-NNN and L-NNN required fields are missing, and keeps empty files clean', async () => {
    const emptyRisks = `# Risks\n\n<!-- entries go here -->\n`
    const goodRisk = `# Risks\n\n## R-001 — Launch slip\n\nOpened: 2026-06-01\nSeverity: medium\nStatus: open\nTrigger: beta date moves\nMitigation: cut scope\nOwner: shared\n`
    const badRisk = `# Risks\n\n## R-001 — Launch slip\n\nSeverity: medium\n`
    const goodLearning = `# Learnings\n\n## L-001 — Context drift\n\nTrigger: missed canonical file\nSystemic cause: load rule was vague\nAdjustment: tightened routing\n`
    const badLearning = `# Learnings\n\n## L-001 — Context drift\n\nTrigger: missed canonical file\n`
    assert.equal(ids(await sy.run(ctxOf({ 'state/risks.md': file(emptyRisks) })), 'SY-03').length, 0)
    assert.equal(ids(await sy.run(ctxOf({ 'state/risks.md': file(goodRisk) })), 'SY-03').length, 0)
    assert.equal(ids(await sy.run(ctxOf({ 'state/risks.md': file(badRisk) })), 'SY-03').length, 1)
    assert.equal(ids(await sy.run(ctxOf({ 'state/learnings.md': file(goodLearning) })), 'SY-03').length, 0)
    assert.equal(ids(await sy.run(ctxOf({ 'state/learnings.md': file(badLearning) })), 'SY-03').length, 1)
  })
  it('ignores OD entries shown inside fenced code blocks', async () => {
    const od = '# Open Decisions\n\n```\n## OD-009 — example, no fields\n```\n\n## OD-001 — real\n\nOpened: 2026-06-01\nOptions: a\nTrade-offs: x\nLeaning: a\n'
    assert.equal(ids(await sy.run(ctxOf({ 'state/open-decisions.md': file(od) })), 'SY-03').length, 0)
  })
  it('ignores HT / D ids shown inside fenced code blocks', async () => {
    const ht  = '# Human ToDos\n\n```\n## HT-009 — heading-form example\n```\n\n- [ ] HT-001 — real entry\n'
    const dec = '# Decisions\n\n```\n## D-009 — example, no fields\n```\n\n## D-001 — real\n\nDate: x\nDecision: x\nWhy: x\nConsequences: x\n'
    assert.equal(ids(await sy.run(ctxOf({ 'HUMAN-TODOS.md': file(ht) })), 'SY-03').length, 0)
    assert.equal(ids(await sy.run(ctxOf({ 'state/decisions.md': file(dec) })), 'SY-03').length, 0)
  })
})

// ── CX-01 ────────────────────────────────────────────────────────────────────
describe('CX-01 context size', () => {
  const big = (words) => '# Big\n\n' + Array(words).fill('lorem').join(' ') + '\n'
  it('is silent for a small boot context', async () => {
    const f = await cx.run(ctxOf({ 'AGENTS.md': file('# A\n\nshort'), 'VISION.md': file('# V\n\nshort') }))
    assert.equal(ids(f, 'CX-01').length, 0)
  })
  it('warns past ~9k tokens and errors past ~15k', async () => {
    const w = ids(await cx.run(ctxOf({ 'VISION.md': file(big(7000)) })), 'CX-01')
    assert.equal(w.length, 1); assert.equal(w[0].severity, 'W')
    const e = ids(await cx.run(ctxOf({ 'VISION.md': file(big(11000)) })), 'CX-01')
    assert.equal(e[0].severity, 'E')
  })
  it('counts the current phase read: target', async () => {
    const phases = { frontmatter: { current: 'discover' }, defs: new Map([['discover', { read: 'big.md' }]]) }
    assert.equal(ids(await cx.run(ctxOf({ 'big.md': file(big(7000)) }, { phases })), 'CX-01').length, 1)
  })
  it('counts whitespace-separated read: targets (not just comma/semicolon)', async () => {
    const phases = { frontmatter: { current: 'discover' }, defs: new Map([['discover', { read: 'a.md b.md' }]]) }
    assert.equal(ids(await cx.run(ctxOf({ 'a.md': file(big(3500)), 'b.md': file(big(3500)) }, { phases })), 'CX-01').length, 1)
  })
})

// ── HY-01 ────────────────────────────────────────────────────────────────────
describe('HY-01 archive candidate', () => {
  it('flags an old context domain file; skips template and docs files', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'truss-hy-'))
    await fs.mkdir(path.join(root, 'context'), { recursive: true })
    await fs.writeFile(path.join(root, 'context', 'market.md'), '# Market\n')
    await fs.writeFile(path.join(root, 'AGENTS.md'), '# A\n')
    await fs.writeFile(path.join(root, 'VISION.md'), '# V\n')
    await fs.mkdir(path.join(root, 'docs'), { recursive: true })
    await fs.writeFile(path.join(root, 'docs', 'conventions.md'), '# C\n')
    const old = new Date(Date.now() - 100 * DAY)
    for (const rel of ['context/market.md', 'AGENTS.md', 'VISION.md', 'docs/conventions.md']) {
      await fs.utimes(path.join(root, rel), old, old)
    }
    const diskPaths = ['context/', 'context/market.md', 'AGENTS.md', 'VISION.md', 'docs/', 'docs/conventions.md']
    const h = ids(await hy.run(ctxOf({}, { diskPaths, root })), 'HY-01')
    assert.equal(h.length, 1, JSON.stringify(h))
    assert.equal(h[0].file, 'context/market.md')
    await fs.rm(root, { recursive: true, force: true })
  })
  it('is silent on a fresh context domain file', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'truss-hy2-'))
    await fs.mkdir(path.join(root, 'context'), { recursive: true })
    await fs.writeFile(path.join(root, 'context', 'market.md'), '# Market\n')
    const f = await hy.run(ctxOf({}, { diskPaths: ['context/', 'context/market.md'], root }))
    assert.equal(ids(f, 'HY-01').length, 0)
    await fs.rm(root, { recursive: true, force: true })
  })
  it('still nudges old root-level domain files for migration', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'truss-hy-legacy-'))
    await fs.writeFile(path.join(root, 'market.md'), '# Market\n')
    const old = new Date(Date.now() - 100 * DAY)
    await fs.utimes(path.join(root, 'market.md'), old, old)
    const h = ids(await hy.run(ctxOf({}, { diskPaths: ['market.md'], root })), 'HY-01')
    assert.equal(h.length, 1)
    assert.equal(h[0].file, 'market.md')
    await fs.rm(root, { recursive: true, force: true })
  })
})

// ── doctor --html / --json (Dashboard v0), real CLI subprocess ───────────────
describe('doctor report output', () => {
  const BIN = (root) => path.join(root, '.truss', 'bin', 'truss.mjs')
  const runCli = async (root, args) => {
    try { await execFileP(process.execPath, [BIN(root), ...args], { env: { ...process.env, TRUSS_NO_GIT: '1' } }) }
    catch { /* non-zero exit (warnings/errors) still writes the report file before exiting */ }
  }

  it('writes a clean HTML report listing every check family', async () => {
    const root = await makeRoot('truss-report-')
    await runInit(root, ['--name', 'Report', '--lang', 'English'])
    await runCli(root, ['doctor', '--html'])
    const html = await read(root, '.truss/out/doctor.html')
    assert.match(html, /<title>truss doctor/)
    assert.match(html, /All checks passed/)
    for (const probe of ['ST-01', 'BL-01', 'RF-01', 'SY-01', 'PH-01', 'CX-01', 'HY-01']) {
      assert.ok(html.includes(probe), `catalog should list ${probe}`)
    }
  })

  it('writes a JSON report whose catalog includes the M5 checks', async () => {
    const root = await makeRoot('truss-json-')
    await runInit(root, ['--name', 'Json', '--lang', 'English'])
    await runCli(root, ['doctor', '--json'])
    const json = JSON.parse(await read(root, '.truss/out/doctor.json'))
    const catalogIds = json.checks.map(c => c.id)
    for (const id of ['SY-01', 'SY-02', 'SY-03', 'CX-01', 'HY-01']) {
      assert.ok(catalogIds.includes(id), `JSON catalog should include ${id}`)
    }
  })
})

describe('risk migration bridge', () => {
  it('loads state/risks.md when present even if an old AGENTS.md table omits it', async () => {
    const root = await makeRoot('truss-risk-bridge-')
    await runInit(root, ['--name', 'Risk Bridge', '--lang', 'English'])
    const agentsPath = path.join(root, 'AGENTS.md')
    const agents = await fs.readFile(agentsPath, 'utf8')
    await fs.writeFile(
      agentsPath,
      agents.replace(/\| state\/risks\.md \|[^\n]+\n/, '')
    )
    await fs.appendFile(
      path.join(root, 'VISION.md'),
      '\n\nThis launch depends on R-001.\n'
    )
    await fs.writeFile(
      path.join(root, 'state', 'risks.md'),
      '# Risks\n\n## R-001 — Launch slip\n\nSeverity: medium\nStatus: open\nTrigger: beta moves\nMitigation: cut scope\n'
    )
    const findings = await runChecks(root)
    assert.equal(
      findings.filter(f => f.id === 'RF-02' && /R-001/.test(f.message)).length,
      0
    )
    await fs.rm(root, { recursive: true, force: true })
  })
})

// ── doctor exit codes via the real CLI (0 ok · 1 warnings · 2 errors) ─────────
describe('doctor exit codes (CLI)', () => {
  const BIN = (root) => path.join(root, '.truss', 'bin', 'truss.mjs')
  const exitCode = async (root) => {
    try {
      await execFileP(process.execPath, [BIN(root), 'doctor'], { env: { ...process.env, TRUSS_NO_GIT: '1' } })
      return 0
    } catch (e) { return e.code }
  }

  it('exits 0 on a clean instance', async () => {
    const root = await makeRoot('truss-exit0-')
    await runInit(root, ['--name', 'Exit', '--lang', 'English'])
    assert.equal(await exitCode(root), 0)
    await fs.rm(root, { recursive: true, force: true })
  })

  it('exits 1 when only warnings are present', async () => {
    const root = await makeRoot('truss-exit1-')
    await runInit(root, ['--name', 'Exit', '--lang', 'English'])
    // A root domain file absent from the §2 table is a pure ST-02 warning.
    await fs.writeFile(path.join(root, 'stray.md'), '# Stray\n\n> not in the structure table.\n')
    assert.equal(await exitCode(root), 1)
    await fs.rm(root, { recursive: true, force: true })
  })

  it('exits 0 with init-guard when AGENTS.md is missing', async () => {
    const root = await makeRoot('truss-initguard-')
    await runInit(root, ['--name', 'Exit', '--lang', 'English'])
    await fs.rm(path.join(root, 'AGENTS.md'))   // triggers init-guard
    assert.equal(await exitCode(root), 0)
    await fs.rm(root, { recursive: true, force: true })
  })

  it('exits 2 when errors are present in an initialised workspace', async () => {
    const root = await makeRoot('truss-exit2-')
    await runInit(root, ['--name', 'Exit', '--lang', 'English'])
    // Corrupt AGENTS.md so BL checks fail — but file still exists, so no init-guard.
    const agentsMd = path.join(root, 'AGENTS.md')
    const content = await fs.readFile(agentsMd, 'utf8')
    await fs.writeFile(agentsMd, content.replace('<!-- truss:begin phase -->', '<!-- broken -->'))
    assert.equal(await exitCode(root), 2)
    await fs.rm(root, { recursive: true, force: true })
  })
})
