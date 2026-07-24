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
import * as ph from '../checks/ph.mjs'
import * as rf from '../checks/rf.mjs'
import { loadWorkspace } from '../lib/workspace.mjs'
import { makeRoot, read, runChecks, ENGINE_DIR } from './helpers.mjs'
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

// ── SY-06 ────────────────────────────────────────────────────────────────────
describe('SY-06 decided OD tombstones', () => {
  it('flags a DECIDED marker in the heading and a Decided: field in the body', async () => {
    const headingTomb = `# Open Decisions\n\n## OD-001 — Pick a source — DECIDED → D-008\n\nOpened: 2026-06-01\nOptions: a\nTrade-offs: x\nLeaning: a\n`
    const bodyTomb    = `# Open Decisions\n\n## OD-002 — Gateway mode?\n\nOpened: 2026-06-01\nDecided: 2026-06-09 → D-010\nOptions: a\nTrade-offs: x\nLeaning: a\n`
    const arrowTomb   = `# Open Decisions\n\n## OD-003 — Account dimension? -> D-011\n\nOpened: 2026-06-01\nOptions: a\nTrade-offs: x\nLeaning: a\n`
    assert.equal(ids(await sy.run(ctxOf({ 'state/open-decisions.md': file(headingTomb) })), 'SY-06').length, 1)
    assert.equal(ids(await sy.run(ctxOf({ 'state/open-decisions.md': file(bodyTomb) })), 'SY-06').length, 1)
    assert.equal(ids(await sy.run(ctxOf({ 'state/open-decisions.md': file(arrowTomb) })), 'SY-06').length, 1)
  })
  it('stays silent for genuinely open entries and fenced examples', async () => {
    const open = `# Open Decisions\n\n## OD-001 — Should we X?\n\nOpened: 2026-06-01\nOptions: a\nTrade-offs: x\nLeaning: a\n`
    const fenced = '# Open Decisions\n\n```\n## OD-009 — example — DECIDED → D-001\n```\n\n## OD-001 — real\n\nOpened: 2026-06-01\nOptions: a\nTrade-offs: x\nLeaning: a\n'
    assert.equal(ids(await sy.run(ctxOf({ 'state/open-decisions.md': file(open) })), 'SY-06').length, 0)
    assert.equal(ids(await sy.run(ctxOf({ 'state/open-decisions.md': file(fenced) })), 'SY-06').length, 0)
  })
})

// ── SY-07 ────────────────────────────────────────────────────────────────────
describe('SY-07 checked-off HT pile-up', () => {
  const htFile = (open, done) => '# Human ToDos\n\n'
    + Array.from({ length: open }, (_, i) => `- [ ] HT-${String(i + 1).padStart(3, '0')} — open thing ${i + 1}`).join('\n')
    + (open && done ? '\n' : '')
    + Array.from({ length: done }, (_, i) => `- [x] HT-${String(open + i + 1).padStart(3, '0')} — done thing ${i + 1}`).join('\n')
    + '\n'
  it('nudges once more than 5 checked-off entries pile up', async () => {
    const f = ids(await sy.run(ctxOf({ 'HUMAN-TODOS.md': file(htFile(2, 6)) })), 'SY-07')
    assert.equal(f.length, 1)
    assert.match(f[0].message, /6 checked-off/)
    assert.match(f[0].fix, /archive\/human-todos\.md/)
  })
  it('stays silent at or below the threshold and ignores fenced examples', async () => {
    assert.equal(ids(await sy.run(ctxOf({ 'HUMAN-TODOS.md': file(htFile(3, 5)) })), 'SY-07').length, 0)
    const fenced = '# Human ToDos\n\n```\n- [x] HT-001 — a\n- [x] HT-002 — b\n- [x] HT-003 — c\n- [x] HT-004 — d\n- [x] HT-005 — e\n- [x] HT-006 — f\n```\n\n- [ ] HT-007 — real\n'
    assert.equal(ids(await sy.run(ctxOf({ 'HUMAN-TODOS.md': file(fenced) })), 'SY-07').length, 0)
  })
})

// ── SY-09 ────────────────────────────────────────────────────────────────────
describe('SY-09 decisions.md read cost', () => {
  // words × 1.5 (lib/context-budget.mjs): 4000 words ≈ 6000 tokens → at threshold.
  const decisionsOf = (words) => '# Decisions\n\n## D-001 — big\n\nDate: 2026-01-01\nDecision: x\nRationale: y\nConsequences: z\n'
    + Array(words).fill('lorem').join(' ') + '\n'
  it('nudges once the estimated read cost reaches 6000 tokens', async () => {
    const f = ids(await sy.run(ctxOf({ 'state/decisions.md': file(decisionsOf(4000)) })), 'SY-09')
    assert.equal(f.length, 1)
    assert.equal(f[0].severity, 'I')
    assert.match(f[0].message, /tokens at every session boot/)
    assert.match(f[0].fix, /archive\/decisions\.md/)
    assert.match(f[0].fix, /never delete/i)
  })
  it('stays silent below the threshold and for a missing file', async () => {
    assert.equal(ids(await sy.run(ctxOf({ 'state/decisions.md': file(decisionsOf(500)) })), 'SY-09').length, 0)
    assert.equal(ids(await sy.run(ctxOf({})), 'SY-09').length, 0)
  })
})

// ── CX-01 ────────────────────────────────────────────────────────────────────
describe('CX-01 context size', () => {
  const big = (words) => '# Big\n\n' + Array(words).fill('lorem').join(' ') + '\n'
  it('is silent for a small boot context', async () => {
    const f = await cx.run(ctxOf({ 'AGENTS.md': file('# A\n\nshort'), 'VISION.md': file('# V\n\nshort') }))
    assert.equal(ids(f, 'CX-01').length, 0)
  })
  it('stays silent at a realistic project size (~9k) — bands are for bloat, not for setup', async () => {
    const f = await cx.run(ctxOf({ 'VISION.md': file(big(6000)) })) // ≈9k tokens
    assert.equal(ids(f, 'CX-01').length, 0)
  })
  it('warns past ~18k tokens and errors past ~30k', async () => {
    const w = ids(await cx.run(ctxOf({ 'VISION.md': file(big(13000)) })), 'CX-01')
    assert.equal(w.length, 1); assert.equal(w[0].severity, 'W')
    const e = ids(await cx.run(ctxOf({ 'VISION.md': file(big(21000)) })), 'CX-01')
    assert.equal(e[0].severity, 'E')
  })
  it('counts the current phase read: target', async () => {
    const phases = { frontmatter: { current: 'discover' }, defs: new Map([['discover', { read: 'big.md' }]]) }
    assert.equal(ids(await cx.run(ctxOf({ 'big.md': file(big(13000)) }, { phases })), 'CX-01').length, 1)
  })
  it('counts whitespace-separated read: targets (not just comma/semicolon)', async () => {
    const phases = { frontmatter: { current: 'discover' }, defs: new Map([['discover', { read: 'a.md b.md' }]]) }
    assert.equal(ids(await cx.run(ctxOf({ 'a.md': file(big(6500)), 'b.md': file(big(6500)) }, { phases })), 'CX-01').length, 1)
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

  describe('RF operational context coverage', () => {
    it('checks duplicate IDs, undefined learnings, and broken links in context/', async () => {
      const root = await makeRoot('truss-rf-context-')
      await runInit(root, ['--name', 'RF Context', '--lang', 'English'])
      await fs.mkdir(path.join(root, 'context'), { recursive: true })
      await fs.appendFile(
        path.join(root, 'state', 'decisions.md'),
        '\n## D-001 — Canonical choice\n\nDate: 2026-07-15\nDecision: Use A.\nWhy: evidence.\nConsequences: proceed.\n'
      )
      await fs.writeFile(
        path.join(root, 'context', 'domain.md'),
        '# Domain\n\n## D-001 — Duplicate choice\n\nSee L-999 and [missing](missing.md).\n'
      )
      const findings = await runChecks(root)
      assert.ok(findings.some(f => f.id === 'RF-03' && /D-001/.test(f.message)))
      assert.ok(findings.some(f => f.id === 'RF-02' && /L-999/.test(f.message)))
      assert.ok(findings.some(f => f.id === 'RF-01' && f.file === 'context/domain.md'))
      await fs.rm(root, { recursive: true, force: true })
    })
  })

  describe('bundled phase fixtures', () => {
    it('parses every bundled profile with the same list grammar', async () => {
      for (const name of ['software', 'founders-thinking']) {
        const root = await makeRoot(`truss-profile-${name}-`)
        await runInit(root, ['--name', name, '--lang', 'English'])
        const profile = await fs.readFile(path.join(ENGINE_DIR, 'phase-profiles', `${name}.md`), 'utf8')
        await fs.writeFile(path.join(root, 'state', 'phases.md'), profile)
        const ctx = await loadWorkspace(root)
        const findings = [...await ph.run(ctx), ...await rf.run(ctx)]
        assert.equal(findings.filter(f => f.id === 'PH-01').length, 0, name)
        assert.equal(findings.filter(f => f.id === 'RF-04').length, 0, name)
        await fs.rm(root, { recursive: true, force: true })
      }
    })

    it('accepts the artifact produced by the official overlay onboarding ritual', async () => {
      const root = await makeRoot('truss-overlay-gate-')
      await runInit(root, ['--name', 'Overlay', '--lang', 'English', '--overlay'])
      await fs.mkdir(path.join(root, 'context'), { recursive: true })
      await fs.writeFile(path.join(root, 'context', 'import-log.md'), '# Import log\n')
      const ctx = await loadWorkspace(root)
      ctx.gate = true
      const findings = await ph.run(ctx)
      assert.equal(
        findings.filter(f => f.id === 'PH-04' && f.severity === 'E').length,
        0,
        JSON.stringify(findings)
      )
      await fs.rm(root, { recursive: true, force: true })
    })

    it('checks a symlinked overlay checkout and honors .trussignore', async () => {
      const priorNoGit = process.env.TRUSS_NO_GIT
      delete process.env.TRUSS_NO_GIT
      const src = await fs.mkdtemp(path.join(os.tmpdir(), 'truss-overlay-src-'))
      const root = await makeRoot('truss-overlay-symlink-')
      try {
        await execFileP('git', ['init'], { cwd: src })
        await fs.writeFile(path.join(src, 'blocked.js'), 'export const value = 1\n')
        await fs.writeFile(path.join(src, 'ignored.js'), 'export const ignored = 1\n')
        await execFileP('git', ['add', '.'], { cwd: src })
        await execFileP(
          'git',
          ['-c', 'user.name=Truss Test', '-c', 'user.email=truss@example.invalid', 'commit', '-m', 'baseline'],
          { cwd: src }
        )
        await runInit(root, ['--name', 'Overlay', '--lang', 'English', '--overlay', '--repo', src])
        await fs.writeFile(path.join(src, 'blocked.js'), 'export const value = 2\n')
        await fs.writeFile(path.join(src, 'ignored.js'), 'export const ignored = 2\n')
        await fs.writeFile(path.join(root, '.trussignore'), 'repo/ignored.js\n')

        const ctx = await loadWorkspace(root)
        const findings = await ph.run(ctx)
        const violation = findings.find(f => f.id === 'PH-03')
        assert.match(violation?.message || '', /repo\/blocked\.js/)
        assert.doesNotMatch(violation?.message || '', /ignored\.js/)
      } finally {
        if (priorNoGit == null) delete process.env.TRUSS_NO_GIT
        else process.env.TRUSS_NO_GIT = priorNoGit
        await fs.rm(root, { recursive: true, force: true })
        await fs.rm(src, { recursive: true, force: true })
      }
    })

    it('checks changed paths inside a custom configured code root', async () => {
      const priorNoGit = process.env.TRUSS_NO_GIT
      delete process.env.TRUSS_NO_GIT
      const root = await makeRoot('truss-code-root-phase-')
      const product = path.join(root, 'product')
      try {
        await fs.mkdir(product)
        await execFileP('git', ['init'], { cwd: product })
        await fs.writeFile(path.join(product, 'blocked.js'), 'export const value = 1\n')
        await execFileP('git', ['add', '.'], { cwd: product })
        await execFileP(
          'git',
          ['-c', 'user.name=Truss Test', '-c', 'user.email=truss@example.invalid', 'commit', '-m', 'baseline'],
          { cwd: product },
        )
        await runInit(root, [
          '--name', 'Custom', '--lang', 'English', '--overlay',
          '--code-root', 'product',
        ])
        const phasesPath = path.join(root, 'state', 'phases.md')
        const phases = await fs.readFile(phasesPath, 'utf8')
        await fs.writeFile(
          phasesPath,
          phases.replaceAll('repo/**', 'product/**'),
        )
        await fs.writeFile(path.join(product, 'blocked.js'), 'export const value = 2\n')

        const ctx = await loadWorkspace(root)
        const findings = await ph.run(ctx)
        const violation = findings.find(f => f.id === 'PH-03')
        assert.match(violation?.message || '', /product\/blocked\.js/)
      } finally {
        if (priorNoGit == null) delete process.env.TRUSS_NO_GIT
        else process.env.TRUSS_NO_GIT = priorNoGit
        await fs.rm(root, { recursive: true, force: true })
      }
    })
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

// ── SY-08 ritual drift (D-010) ───────────────────────────────────────────────
describe('SY-08 ritual drift', () => {
  // Real files + real mtimes: SY-08 stats ctx.root/<rel> for every state/ and
  // context/ candidate from ctx.mdFiles and compares local days.
  async function driftRoot() {
    const root = await makeRoot('truss-sy08-')
    await fs.mkdir(path.join(root, 'state'), { recursive: true })
    await fs.writeFile(path.join(root, 'state', 'current.md'), cleanCurrent())
    await fs.writeFile(path.join(root, 'state', 'decisions.md'), '# Decisions\n')
    return root
  }
  async function ctxFor(root) {
    const content = await fs.readFile(path.join(root, 'state', 'current.md'), 'utf8')
    const stat = await fs.stat(path.join(root, 'state', 'current.md'))
    return {
      files: new Map([['state/current.md', { lines: content.split('\n'), content, stat }]]),
      phases: { frontmatter: {}, defs: new Map() },
      diskPaths: [], root,
      mdFiles: ['state/current.md', 'state/decisions.md', 'state/map.md'],
    }
  }
  it('fires when state changed on a later day than current.md', async () => {
    const root = await driftRoot()
    const old = new Date(Date.now() - 2 * DAY)
    await fs.utimes(path.join(root, 'state', 'current.md'), old, old)
    const f = await sy.run(await ctxFor(root))
    assert.equal(ids(f, 'SY-08').length, 1)
    assert.match(ids(f, 'SY-08')[0].message, /decisions\.md/)
    await fs.rm(root, { recursive: true, force: true })
  })
  it('stays quiet for same-day edits and when current.md is newest', async () => {
    const root = await driftRoot()
    // Same day (both just written) → quiet.
    assert.equal(ids(await sy.run(await ctxFor(root)), 'SY-08').length, 0)
    // current.md refreshed after older state → quiet.
    const old = new Date(Date.now() - 3 * DAY)
    await fs.utimes(path.join(root, 'state', 'decisions.md'), old, old)
    assert.equal(ids(await sy.run(await ctxFor(root)), 'SY-08').length, 0)
    await fs.rm(root, { recursive: true, force: true })
  })
  it('ignores the excluded surfaces (map.md, missing files)', async () => {
    const root = await driftRoot()
    const old = new Date(Date.now() - 2 * DAY)
    await fs.utimes(path.join(root, 'state', 'current.md'), old, old)
    await fs.utimes(path.join(root, 'state', 'decisions.md'), old, old)
    // A fresh script-generated map must NOT count as drift (excluded rel).
    await fs.writeFile(path.join(root, 'state', 'map.md'), '# Truss Map\n')
    const f = await sy.run(await ctxFor(root))
    assert.equal(ids(f, 'SY-08').length, 0)
    await fs.rm(root, { recursive: true, force: true })
  })
})
