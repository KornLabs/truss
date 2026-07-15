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
      { name: 'A', lang: 'English', overlay: false, repo: null, codeRoot: null, adoptAgents: false })
    assert.deepEqual(parseInitArgs(['--name=A B', '--overlay']),
      { name: 'A B', lang: null, overlay: true, repo: null, codeRoot: null, adoptAgents: false })
  })
  it('parses --repo (spaced and =) with overlay', () => {
    assert.deepEqual(parseInitArgs(['--overlay', '--repo', '/p/code']),
      { name: null, lang: null, overlay: true, repo: '/p/code', codeRoot: null, adoptAgents: false })
    assert.deepEqual(parseInitArgs(['--overlay', '--repo=https://x/y.git']),
      { name: null, lang: null, overlay: true, repo: 'https://x/y.git', codeRoot: null, adoptAgents: false })
  })
  it('parses and validates --code-root', () => {
    assert.equal(
      parseInitArgs(['--overlay', '--code-root', 'product/source/']).codeRoot,
      'product/source',
    )
    assert.throws(() => parseInitArgs(['--code-root', 'product']), InitError)
    assert.throws(
      () => parseInitArgs(['--overlay', '--repo', '/p/code', '--code-root', 'product']),
      InitError,
    )
    assert.throws(() => parseInitArgs(['--overlay', '--code-root', '../code']), InitError)
  })
  it('parses explicit AGENTS.md adoption', () => {
    assert.equal(parseInitArgs(['--adopt-agents']).adoptAgents, true)
  })
  it('rejects --repo without --overlay', () => {
    assert.throws(() => parseInitArgs(['--repo', '/p/code']), InitError)
  })
  it('throws on unknown flag', () => {
    assert.throws(() => parseInitArgs(['--bogus']), InitError)
  })
  it('rejects a missing or flag-like value (N-4)', () => {
    assert.throws(() => parseInitArgs(['--lang']), InitError)
    assert.throws(() => parseInitArgs(['--name', '--overlay']), InitError)
    assert.throws(() => parseInitArgs(['--name']), InitError)
    assert.throws(() => parseInitArgs(['--overlay', '--repo']), InitError)
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

  it('--repo <local path> symlinks the code into repo/', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const os = await import('node:os')
    // A throwaway "existing project" to bring in.
    const src = await fs.mkdtemp(path.join(os.tmpdir(), 'truss-src-'))
    await fs.writeFile(path.join(src, 'index.js'), '// code\n')

    const root = await makeRoot('truss-init-repo-')
    const res = await runInit(root, ['--name', 'Legacy', '--lang', 'English', '--overlay', '--repo', src])

    const lst = await fs.lstat(path.join(root, 'repo'))
    assert.ok(lst.isSymbolicLink(), 'repo/ is a symlink to the source')
    assert.equal(await read(root, 'repo/index.js'), '// code\n', 'code reachable through repo/')
    assert.match(res.repo, /symlinked/)
    assert.equal(errorsOf(await runChecks(root)).length, 0)
  })

  it('--repo with a missing local path is reported, not fatal', async () => {
    const root = await makeRoot('truss-init-repo-missing-')
    const res = await runInit(root, ['--name', 'L', '--lang', 'English', '--overlay', '--repo', '/no/such/path'])
    assert.match(res.repo, /not found/)
    assert.equal(errorsOf(await runChecks(root)).length, 0)
  })

  it('uses an existing configured code root without moving or ignoring it', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const root = await makeRoot('truss-init-code-root-')
    await fs.mkdir(path.join(root, 'truss'))
    await fs.writeFile(path.join(root, 'truss', 'index.js'), '// product\n')

    const res = await runInit(root, [
      '--name', 'Truss Dev', '--lang', 'English', '--overlay',
      '--code-root', 'truss',
    ])

    assert.equal(res.codeRoot, 'truss')
    assert.equal(res.codeRootReady, true)
    assert.match(await read(root, 'state/profile.md'), /^code-root: truss$/m)
    assert.match(await read(root, 'AGENTS.md'), /^\| truss\/ \(on demand\) \|/m)
    assert.match(await read(root, 'state/phases.md'), /forbidden-globs: truss\/\*\*/)
    assert.doesNotMatch(await read(root, 'state/phases.md'), /forbidden-globs: repo\/\*\*/)
    assert.doesNotMatch(await read(root, '.gitignore'), /(?:^|\n)truss\/(?:\n|$)/)
    assert.equal(errorsOf(await runChecks(root)).length, 0)
  })

  it('rejects a missing configured code root before writing', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const root = await makeRoot('truss-init-code-root-missing-')
    await assert.rejects(
      runInit(root, [
        '--name', 'Missing', '--lang', 'English', '--overlay',
        '--code-root', 'missing',
      ]),
      /does not exist/,
    )
    await assert.rejects(fs.access(path.join(root, 'VISION.md')))
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

  it('rejects a marker-free AGENTS.md before writing anything', async () => {
    const root = await makeRoot('truss-init-agents-refuse-')
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    await fs.writeFile(path.join(root, 'AGENTS.md'), '# Existing instructions\n')
    await assert.rejects(
      runInit(root, ['--name', 'A', '--lang', 'English']),
      /--adopt-agents/
    )
    await assert.rejects(fs.access(path.join(root, 'VISION.md')))
    assert.equal(await read(root, 'AGENTS.md'), '# Existing instructions\n')
  })

  it('adopts a marker-free AGENTS.md only with explicit opt-in', async () => {
    const root = await makeRoot('truss-init-agents-adopt-')
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    await fs.writeFile(path.join(root, 'AGENTS.md'), '# Existing instructions\n\nKeep this rule.\n')
    const res = await runInit(root, ['--name', 'A', '--lang', 'English', '--adopt-agents'])
    const agents = await read(root, 'AGENTS.md')
    assert.match(agents, /^# Existing instructions/)
    assert.match(agents, /Keep this rule\./)
    assert.match(agents, /<!-- truss:begin phase -->/)
    assert.equal(res.adoptedAgents, true)
    assert.equal(errorsOf(await runChecks(root)).length, 0)
  })

  it('merges repo/ into an existing overlay .gitignore', async () => {
    const root = await makeRoot('truss-init-gitignore-')
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    await fs.writeFile(path.join(root, '.gitignore'), 'dist/\n')
    await runInit(root, ['--name', 'A', '--lang', 'English', '--overlay'])
    assert.equal(await read(root, '.gitignore'), 'dist/\nrepo/\n')
  })

  it('rejects destination parent blockers during preflight', async () => {
    const root = await makeRoot('truss-init-preflight-')
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    await fs.writeFile(path.join(root, 'docs'), 'blocks the baseline directory\n')
    await assert.rejects(
      runInit(root, ['--name', 'A', '--lang', 'English']),
      /preflight failed/
    )
    await assert.rejects(fs.access(path.join(root, 'VISION.md')))
    await assert.rejects(fs.access(path.join(root, 'AGENTS.md')))
    assert.equal(await read(root, 'docs'), 'blocks the baseline directory\n')
  })

  it('rejects an invalid generated-map target and can retry cleanly', async () => {
    const root = await makeRoot('truss-init-map-preflight-')
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const blocker = path.join(root, 'state', 'map.md')
    await fs.mkdir(blocker, { recursive: true })
    await assert.rejects(
      runInit(root, ['--name', 'A', '--lang', 'English']),
      /preflight failed/
    )
    await assert.rejects(fs.access(path.join(root, 'VISION.md')))
    await assert.rejects(fs.access(path.join(root, 'AGENTS.md')))
    await fs.rm(blocker, { recursive: true, force: true })
    const res = await runInit(root, ['--name', 'A', '--lang', 'English'])
    assert.equal(res.currentPhase, 'discover')
  })
})

describe('init missing args (non-TTY)', () => {
  it('errors instead of hanging when name/lang are missing', async () => {
    const root = await makeRoot('truss-init-missing-')
    await assert.rejects(runInit(root, ['--name', 'only']), InitError)
  })
})
