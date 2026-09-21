// tests/doctor-output.test.mjs — the plain (human) output of `doctor` and `render`.
//
// The JSON report has its own tests; these run the real CLI and read what a
// person sees, because three findings from the field were about that surface
// alone: the fix text existed but never printed (TF-018), the timestamp was UTC
// without saying so (TF-014), and `render` advised adding phases.md on every
// run of a workspace that runs without phases on purpose (TF-018).

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { makeRoot } from './helpers.mjs'

const execFileP = promisify(execFile)
const BIN = (root) => path.join(root, '.truss', 'bin', 'truss.mjs')

async function run(root, args) {
  try {
    const { stdout, stderr } = await execFileP(process.execPath, [BIN(root), ...args], {
      env: { ...process.env, TRUSS_NO_GIT: '1', TRUSS_NO_PRESENCE: '1' },
      cwd: root,
    })
    return { code: 0, stdout, stderr }
  } catch (err) {
    return { code: err.code ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' }
  }
}

describe('doctor plain output', () => {
  it('stamps its header in local time and says so', async () => {
    const root = await makeRoot('truss-doctor-out-ts-')
    try {
      await run(root, ['init', '--name', 'Out', '--lang', 'English'])
      const res = await run(root, ['doctor'])
      assert.match(res.stdout, /truss doctor — \d{4}-\d{2}-\d{2} \d{2}:\d{2} \(local\)/)
    } finally { await fs.rm(root, { recursive: true, force: true }) }
  })

  it('prints the fix under a warning, and not under an info', async () => {
    const root = await makeRoot('truss-doctor-out-fix-')
    try {
      await run(root, ['init', '--name', 'Out', '--lang', 'English'])
      // A stale map is the exact TF-018 case: ST-07 knows `truss map` fixes it.
      await fs.mkdir(path.join(root, 'context'), { recursive: true })
      await fs.writeFile(path.join(root, 'context', 'extra.md'), '# Extra\n\nA new domain file.\n')
      const res = await run(root, ['doctor'])
      assert.equal(res.code, 1)
      assert.match(res.stdout, /W\s+ST-07/)
      assert.match(res.stdout, /→ Run 'node \.truss\/bin\/truss\.mjs map'/)
      // Info lines keep to one line: no "→" follows an I finding.
      const lines = res.stdout.split('\n')
      for (let i = 0; i < lines.length - 1; i++) {
        if (/^\s+I\s+[A-Z]{2}-\d{2}/.test(lines[i])) assert.doesNotMatch(lines[i + 1], /^\s+→/)
      }
    } finally { await fs.rm(root, { recursive: true, force: true }) }
  })
})

describe('doctor and markers that answer nothing', () => {
  it('names a marker with no open finding and keeps exit 0', async () => {
    const root = await makeRoot('truss-doctor-out-unused-')
    try {
      await run(root, ['init', '--name', 'Out', '--lang', 'English'])
      await fs.writeFile(path.join(root, 'VISION.md'),
        '<!-- truss: st-05 ok — young file, far under the limit -->\n' + await fs.readFile(path.join(root, 'VISION.md'), 'utf8'))
      const res = await run(root, ['doctor'])
      assert.equal(res.code, 0)
      assert.match(res.stdout, /the ST-05 marker in VISION\.md silences nothing: no ST-05 finding is open on that file/)
      const json = await run(root, ['doctor', '--json'])
      assert.equal(json.code, 0)
      const report = JSON.parse(await fs.readFile(path.join(root, '.truss', 'out', 'doctor.json'), 'utf8'))
      assert.deepEqual(report.unusedMarkers.map(u => `${u.file}:${u.id}`), ['VISION.md:ST-05'])
    } finally { await fs.rm(root, { recursive: true, force: true }) }
  })
})

describe('render without a phase model', () => {
  it('says what it did in one line and does not advise adding phases.md', async () => {
    const root = await makeRoot('truss-render-nophase-')
    try {
      await run(root, ['init', '--name', 'Out', '--lang', 'English'])
      await fs.rm(path.join(root, 'state', 'phases.md'))
      const res = await run(root, ['render'])
      assert.equal(res.code, 0)
      assert.match(res.stdout, /no state\/phases\.md — phase block kept as the no-phases notice/)
      assert.doesNotMatch(res.stdout, /Add state\/phases\.md/)
    } finally { await fs.rm(root, { recursive: true, force: true }) }
  })
})
