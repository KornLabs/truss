// tests/sync.test.mjs — `truss sync` (D-125), state/personal.md (D-123), and the
// render that keeps an unchanged phase block byte-stable.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { runInit } from '../lib/commands/init.mjs'
import { enableTeam, runTeam } from '../lib/commands/team.mjs'
import { syncWorkspace, SyncError } from '../lib/commands/sync.mjs'
import { generateMapContent } from '../lib/commands/map.mjs'
import { syncState, PERSONAL_FILE, PERSONAL_SEED } from '../lib/team.mjs'
import { makeRoot, exists, read } from './helpers.mjs'

// helpers.mjs switches git off for the whole process; this file is about git.
delete process.env.TRUSS_NO_GIT

const execFileP = promisify(execFile)
const git = (cwd, ...args) => execFileP('git', ['-C', cwd, ...args]).then(r => r.stdout)
const node = (cwd, ...args) => execFileP(process.execPath, [path.join(cwd, '.truss/bin/truss.mjs'), ...args], { cwd })
  .then(r => r.stdout, e => (e.stdout || '') + (e.stderr || ''))

const quiet = async (fn) => {
  const log = console.log
  console.log = () => {}
  try { return await fn() } finally { console.log = log }
}

const write = (root, rel, text) =>
  fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true })
    .then(() => fs.writeFile(path.join(root, rel), text))

async function identity(root, name) {
  await git(root, 'config', 'user.name', name)
  await git(root, 'config', 'user.email', `${name.toLowerCase()}@example.com`)
  await git(root, 'config', 'commit.gpgsign', 'false')
}

async function commitAll(root, msg) {
  await git(root, 'add', '-A')
  await git(root, 'commit', '--quiet', '--allow-empty', '-m', msg)
}

/** A team workspace pushed to a bare remote, and a second clone of it. */
async function twoClones() {
  const a = await makeRoot('truss-sync-a-')
  await quiet(() => runInit(a, ['--name', 'Team', '--lang', 'English', '--team', '--as', '@alex']))
  await identity(a, 'Alex')
  await git(a, 'checkout', '-q', '-B', 'main')
  await commitAll(a, 'init')
  const bare = await fs.mkdtemp(path.join(os.tmpdir(), 'truss-sync-bare-'))
  await git(bare, 'init', '-q', '--bare', '-b', 'main')
  await git(a, 'remote', 'add', 'origin', bare)
  await git(a, 'push', '-q', '-u', 'origin', 'main')
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'truss-sync-b-'))
  const b = path.join(parent, 'clone')
  await execFileP('git', ['clone', '-q', bare, b])
  await identity(b, 'Sam')
  return { a, b, bare }
}

describe('truss sync', () => {
  it('pushes local commits and pulls the others', async () => {
    const { a, b } = await twoClones()
    await write(a, 'context/a.md', '# A\n')
    await commitAll(a, 'a')
    const ra = await syncWorkspace(a)
    assert.equal(ra.attention, false)
    assert.equal(ra.pushed, 1)

    const rb = await syncWorkspace(b)
    assert.equal(rb.attention, false)
    assert.equal(rb.incoming, 1)
    assert.ok(await exists(b, 'context/a.md'))
    const st = await syncState(b)
    assert.deepEqual([st.ahead, st.behind], [0, 0])
  })

  it('regenerates the map when both sides changed it, and pushes the merge', async () => {
    const { a, b } = await twoClones()
    for (const [root, f] of [[a, 'context/alpha.md'], [b, 'context/beta.md']]) {
      await write(root, f, '# x\n')
      await write(root, 'state/map.md', await generateMapContent(root))
      await commitAll(root, f)
    }
    assert.equal((await syncWorkspace(a)).pushed, 1)
    const r = await syncWorkspace(b)
    assert.equal(r.attention, false, r.lines.join('\n'))
    assert.ok(r.regenerated.includes('state/map.md'))
    const map = await read(b, 'state/map.md')
    assert.match(map, /alpha\.md/)
    assert.match(map, /beta\.md/)
    assert.equal(map, await generateMapContent(b))
    assert.equal((await syncState(b)).ahead, 0)
  })

  it('stops on a conflict people wrote, and finishes after it is resolved', async () => {
    const { a, b } = await twoClones()
    await write(a, 'context/shared.md', '# Shared\n\nprice: 10\n')
    await commitAll(a, 'base')
    await syncWorkspace(a)
    await syncWorkspace(b)

    await write(a, 'context/shared.md', '# Shared\n\nprice: 12\n')
    await commitAll(a, 'a says 12')
    await syncWorkspace(a)
    await write(b, 'context/shared.md', '# Shared\n\nprice: 15\n')
    await commitAll(b, 'b says 15')

    const stop = await syncWorkspace(b)
    assert.equal(stop.attention, true)
    assert.deepEqual(stop.conflicts, ['context/shared.md'])
    assert.equal((await syncState(b)).rebasing, true)

    await write(b, 'context/shared.md', '# Shared\n\nprice: 15\n')
    await git(b, 'add', 'context/shared.md')
    const done = await syncWorkspace(b)
    assert.equal(done.attention, false, done.lines.join('\n'))
    const st = await syncState(b)
    assert.equal(st.rebasing, false)
    assert.deepEqual([st.ahead, st.behind], [0, 0])
  })

  it('carries uncommitted work through and says so, without committing it', async () => {
    const { a, b } = await twoClones()
    await write(a, 'context/a.md', '# A\n')
    await commitAll(a, 'a')
    await syncWorkspace(a)
    await write(b, 'context/draft.md', '# draft\n')
    const r = await syncWorkspace(b)
    assert.equal(r.incoming, 1)
    assert.match(r.lines.join('\n'), /1 uncommitted path/)
    assert.ok(await exists(b, 'context/draft.md'))
    assert.equal((await syncState(b)).ahead, 0)
  })

  it('never skips a commit whose --continue fails for another reason (signing)', async () => {
    const { a, b } = await twoClones()
    for (const [root, f] of [[a, 'context/alpha.md'], [b, 'context/important.md']]) {
      await write(root, f, '# x\n')
      await write(root, 'state/map.md', await generateMapContent(root))
      await commitAll(root, f)
    }
    await syncWorkspace(a)
    await git(b, 'config', 'commit.gpgsign', 'true')
    await git(b, 'config', 'gpg.program', 'false')
    const r = await syncWorkspace(b)
    assert.equal(r.attention, true)
    assert.match(r.lines.join('\n'), /commit is intact/)
    // the work is still there: in the index of the paused rebase
    assert.ok(await exists(b, 'context/important.md'))
    // the rebase remembers its signing option; abort it, the commit must survive
    await git(b, 'rebase', '--abort')
    assert.match(await git(b, 'log', '--format=%s', '-1'), /context\/important\.md/)
    await git(b, 'config', 'commit.gpgsign', 'false')
    const done = await syncWorkspace(b)
    assert.equal(done.attention, false, done.lines.join('\n'))
    assert.match(await git(b, 'log', '--format=%s', '-3'), /context\/important\.md/)
    assert.equal(await read(b, 'state/map.md'), await generateMapContent(b))
  })

  it('reports uncommitted changes that collide after a paused rebase, and keeps the stash', async () => {
    const { a, b } = await twoClones()
    await write(a, 'context/x.md', '# x\n\nv: 1\n')
    await commitAll(a, 'x')
    await syncWorkspace(a)
    await syncWorkspace(b)
    // a: edits x and the map; b: commits a map change, and leaves x dirty
    await write(a, 'context/x.md', '# x\n\nv: 2\n')
    await write(a, 'context/alpha.md', '# a\n')
    await write(a, 'state/map.md', await generateMapContent(a))
    await commitAll(a, 'a side')
    await syncWorkspace(a)
    await write(b, 'context/beta.md', '# b\n')
    await write(b, 'state/map.md', await generateMapContent(b))
    await git(b, 'add', '-A'); await git(b, 'commit', '-q', '-m', 'b side')
    await write(b, 'context/x.md', '# x\n\nv: 3\n')
    const r = await syncWorkspace(b)
    assert.equal(r.attention, true)
    assert.match(r.lines.join('\n'), /collide with what came in/)
    assert.match(await git(b, 'stash', 'list'), /stash@\{0\}/)
  })

  it('regenerates the map when a resumed rebase finishes', async () => {
    const { a, b } = await twoClones()
    await write(a, 'context/shared.md', '# S\n\nv: 1\n')
    await commitAll(a, 'base'); await syncWorkspace(a); await syncWorkspace(b)
    await write(a, 'context/shared.md', '# S\n\nv: 2\n')
    await write(a, 'context/alpha.md', '# a\n')
    await write(a, 'state/map.md', await generateMapContent(a))
    await commitAll(a, 'a'); await syncWorkspace(a)
    await write(b, 'context/shared.md', '# S\n\nv: 3\n')
    await write(b, 'context/beta.md', '# b\n')
    await write(b, 'state/map.md', await generateMapContent(b))
    await commitAll(b, 'b')
    assert.equal((await syncWorkspace(b)).attention, true)
    await write(b, 'context/shared.md', '# S\n\nv: 3\n')
    await git(b, 'add', 'context/shared.md')
    const r = await syncWorkspace(b)
    assert.equal(r.attention, false, r.lines.join('\n'))
    assert.equal(await read(b, 'state/map.md'), await generateMapContent(b))
  })

  it('refuses outside a git checkout', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'truss-sync-nogit-'))
    await assert.rejects(syncWorkspace(dir), SyncError)
  })
})

describe('state/personal.md', () => {
  it('team enable creates it and keeps it out of git', async () => {
    const root = await makeRoot('truss-personal-')
    await quiet(() => runInit(root, ['--name', 'T', '--lang', 'English', '--team', '--as', '@alex']))
    assert.equal(await read(root, PERSONAL_FILE), PERSONAL_SEED)
    assert.match(await read(root, '.gitignore'), /^state\/personal\.md$/m)
    const agents = await read(root, 'AGENTS.md')
    assert.match(agents, /\| state\/personal\.md \| H\+A \|/)
    assert.match(agents, /and state\/personal\.md, your human's own notes/)
    // gitignored → not in the map that every clone shares
    assert.doesNotMatch(await generateMapContent(root), /personal\.md/)
  })

  it('a 1.2.0 team workspace gets the new lines from a second enable, once', async () => {
    const root = await makeRoot('truss-personal-up-')
    await quiet(() => runInit(root, ['--name', 'T', '--lang', 'English', '--team', '--as', '@alex']))
    const old = (await read(root, 'AGENTS.md'))
      .replace(" — `truss status` names it — and state/personal.md, your human's own notes (this clone only).", ' — `truss status` names it.')
      .split('\n').filter(l => !l.startsWith('| state/personal.md |')).join('\n')
    await write(root, 'AGENTS.md', old)
    await fs.rm(path.join(root, PERSONAL_FILE))
    await write(root, '.gitignore', (await read(root, '.gitignore')).replace(/^state\/personal\.md$/m, ''))

    const r = await enableTeam(root, { as: 'alex' })
    assert.ok(r.created.some(c => c.startsWith(PERSONAL_FILE)))
    const agents = await read(root, 'AGENTS.md')
    assert.equal(agents.match(/state\/personal\.md, your human's own notes/g).length, 1)
    assert.equal(agents.match(/^\| state\/personal\.md \|/gm).length, 1)
    const again = await enableTeam(root, { as: 'alex' })
    assert.deepEqual([again.created, again.changed], [[], []])
  })

  it('team whoami creates it in a fresh clone and never overwrites it', async () => {
    const { b } = await twoClones()
    assert.equal(await exists(b, PERSONAL_FILE), false)   // gitignored: the clone has none
    await quiet(() => runTeam(b, ['whoami', '@sam']))
    assert.equal(await read(b, PERSONAL_FILE), PERSONAL_SEED)
    await write(b, PERSONAL_FILE, PERSONAL_SEED + '- new to git\n')
    await quiet(() => runTeam(b, ['whoami', '@sam']))
    assert.match(await read(b, PERSONAL_FILE), /new to git/)
    assert.equal((await git(b, 'status', '--porcelain')).trim(), '')
  })

  it('a fresh clone without it passes doctor (gitignored table paths are per clone)', async () => {
    const { b } = await twoClones()
    const out = await node(b, 'doctor')
    assert.doesNotMatch(out, /ST-01/)
  })

  it('status names the notes file and where the clone stands', async () => {
    const { a } = await twoClones()
    await write(a, 'context/a.md', '# A\n')
    await commitAll(a, 'a')
    const out = await node(a, 'status')
    assert.match(out, /your notes: state\/personal\.md \(this clone only\)/)
    assert.match(out, /Sync: +1 commit not pushed/)
  })
})

describe('render', () => {
  it('keeps the provenance timestamp when the phase block did not change', async () => {
    const root = await makeRoot('truss-render-')
    await quiet(() => runInit(root, ['--name', 'T', '--lang', 'English']))
    const stamped = (await read(root, 'AGENTS.md')).replace(/> Rendered \d{4}-\d{2}-\d{2}T\d{2}:\d{2} /, '> Rendered 2000-01-01T00:00 ')
    await write(root, 'AGENTS.md', stamped)
    await node(root, 'render')
    assert.equal(await read(root, 'AGENTS.md'), stamped)
  })
})
