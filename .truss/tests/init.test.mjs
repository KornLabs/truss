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
      { name: 'A', lang: 'English', overlay: false, repo: null, codeRoot: null, adoptAgents: false, root: null })
    assert.deepEqual(parseInitArgs(['--name=A B', '--overlay']),
      { name: 'A B', lang: null, overlay: true, repo: null, codeRoot: null, adoptAgents: false, root: null })
  })
  it('parses --repo (spaced and =) with overlay', () => {
    assert.deepEqual(parseInitArgs(['--overlay', '--repo', '/p/code']),
      { name: null, lang: null, overlay: true, repo: '/p/code', codeRoot: null, adoptAgents: false, root: null })
    assert.deepEqual(parseInitArgs(['--overlay', '--repo=https://x/y.git']),
      { name: null, lang: null, overlay: true, repo: 'https://x/y.git', codeRoot: null, adoptAgents: false, root: null })
  })
  it('parses --root (spaced and =)', () => {
    assert.equal(parseInitArgs(['--root', '/p/ws']).root, '/p/ws')
    assert.equal(parseInitArgs(['--root=/p/ws']).root, '/p/ws')
    assert.throws(() => parseInitArgs(['--root']), InitError)
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

describe('init root separation (D-024 / OD-005)', () => {
  it('refuses a --root target without its own engine and writes nothing', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const os = await import('node:os')
    const root = await makeRoot('truss-init-engine-')
    const target = await fs.mkdtemp(path.join(os.tmpdir(), 'truss-init-target-'))
    await assert.rejects(
      runInit(root, ['--name', 'A', '--lang', 'English', '--root', target]),
      /no \.truss\/ engine/,
    )
    // Neither the target nor the engine's own directory was scaffolded.
    assert.deepEqual(await fs.readdir(target), [])
    await assert.rejects(fs.access(path.join(root, 'AGENTS.md')))
  })

  it('refuses when the CLI cwd (invokedCwd) is a foreign engine-less directory', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const os = await import('node:os')
    const root = await makeRoot('truss-init-engine-')
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'truss-init-cwd-'))
    await assert.rejects(
      runInit(root, ['--name', 'A', '--lang', 'English'], cwd),
      /no \.truss\/ engine/,
    )
    await assert.rejects(fs.access(path.join(root, 'AGENTS.md')))
  })

  it('refuses on engine version mismatch between caller and target', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const root = await makeRoot('truss-init-engine-')
    const target = await makeRoot('truss-init-target-')
    await fs.writeFile(path.join(target, '.truss', 'VERSION'), '0.0.0-other\n', 'utf8')
    await assert.rejects(
      runInit(root, ['--name', 'A', '--lang', 'English', '--root', target]),
      /version mismatch/,
    )
    await assert.rejects(fs.access(path.join(target, 'AGENTS.md')))
  })

  it('refuses when the target engine has no VERSION (partial copy)', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const root = await makeRoot('truss-init-engine-')
    const target = await makeRoot('truss-init-target-')
    await fs.rm(path.join(target, '.truss', 'VERSION'), { force: true })
    await assert.rejects(
      runInit(root, ['--name', 'A', '--lang', 'English', '--root', target]),
      /version mismatch or undetermined/,
    )
    await assert.rejects(fs.access(path.join(target, 'AGENTS.md')))
  })

  it('initialises a foreign target that carries its own same-version engine', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const root = await makeRoot('truss-init-engine-')
    const target = await makeRoot('truss-init-target-')
    const res = await runInit(root, ['--name', 'T', '--lang', 'English', '--root', target])
    assert.equal(res.currentPhase, 'discover')
    await fs.access(path.join(target, 'AGENTS.md'))
    await assert.rejects(fs.access(path.join(root, 'AGENTS.md')))
  })

  it('--root pointing at the engine root behaves exactly as before', async () => {
    const root = await makeRoot('truss-init-selfroot-')
    const res = await runInit(root, ['--name', 'S', '--lang', 'English', '--root', root])
    assert.equal(res.currentPhase, 'discover')
    await read(root, 'AGENTS.md')
  })

  it('deletability preflight rejects a read-only target before any write', async (t) => {
    if (process.getuid?.() === 0) { t.skip('running as root — chmod is not enforced'); return }
    // On Windows, fs.chmod maps only the read-only bit and does not stop file
    // creation/deletion inside a directory, so a 0o555 dir stays writable and the
    // preflight has nothing to reject. The behaviour is POSIX-permission-specific.
    if (process.platform === 'win32') { t.skip('chmod does not restrict directory writes on Windows'); return }
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const root = await makeRoot('truss-init-ro-')
    await fs.chmod(root, 0o555)
    try {
      await assert.rejects(
        runInit(root, ['--name', 'A', '--lang', 'English']),
        /not writable\/deletable/,
      )
      await assert.rejects(fs.access(path.join(root, 'AGENTS.md')))
    } finally {
      await fs.chmod(root, 0o755)
    }
  })
})
