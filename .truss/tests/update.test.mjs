// .truss/tests/update.test.mjs — newer-release check and `truss update` (D-133).
// The network is a local HTTP server standing in for the GitHub API
// (TRUSS_UPDATE_API); nothing here talks to github.com.

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import { execFileSync } from 'node:child_process'

import {
  parseVersion, compareVersions, pendingVersion, releasesBetween, fetchReleases,
  readCache, writeCache, updateLines, refreshIfStale, autoCheckOff, cleanNotes, downloadEngine, CACHE_REL,
  CHECK_EVERY_MS,
} from '../lib/update-check.mjs'
import { runUpdate, parseUpdateArgs, notesLines } from '../lib/commands/update.mjs'
import { runInit } from '../lib/commands/init.mjs'
import { writeManifest } from '../lib/engine-manifest.mjs'
import { makeRoot, ENGINE_DIR } from './helpers.mjs'

const ENGINE_VERSION = (await fs.readFile(path.join(ENGINE_DIR, 'VERSION'), 'utf8')).trim()

describe('versions', () => {
  it('parses and orders release and prerelease versions', () => {
    assert.deepEqual(parseVersion('v1.4.0'), { core: [1, 4, 0], pre: null })
    assert.equal(parseVersion('1.4'), null)
    assert.ok(compareVersions('1.10.0', '1.9.9') > 0)
    assert.ok(compareVersions('1.0.0-rc.4', '1.0.0') < 0)
    assert.equal(compareVersions('1.4.0', 'v1.4.0'), 0)
    assert.equal(compareVersions('?', '1.0.0'), 0)
    assert.deepEqual(parseVersion('1.4.0+build.7'), { core: [1, 4, 0], pre: null })
  })

  it('offers only a release newer than both the engine and the declined one', () => {
    assert.equal(pendingVersion({ latest: '1.5.0' }, '1.4.0'), '1.5.0')
    assert.equal(pendingVersion({ latest: '1.4.0' }, '1.4.0'), null)
    assert.equal(pendingVersion({ latest: '1.5.0', skipped: '1.5.0' }, '1.4.0'), null)
    assert.equal(pendingVersion({ latest: '1.5.1', skipped: '1.5.0' }, '1.4.0'), '1.5.1')
    assert.equal(pendingVersion({}, '1.4.0'), null)
  })

  it('adds up the releases after one version up to another, oldest first', () => {
    const rs = ['1.2.0', '1.3.0', '1.4.0', '1.5.0'].map(version => ({ version }))
    assert.deepEqual(releasesBetween(rs, '1.2.0', '1.4.0').map(r => r.version), ['1.3.0', '1.4.0'])
  })

  it('switches the automatic check off in CI and on request', () => {
    assert.equal(autoCheckOff({}), false)
    assert.equal(autoCheckOff({ CI: 'true' }), true)
    assert.equal(autoCheckOff({ TRUSS_NO_UPDATE_CHECK: '1' }), true)
    assert.equal(autoCheckOff({ CI: 'false' }), false)
    assert.equal(autoCheckOff({ CI: '0' }), false)
  })

  it('strips terminal control sequences from release notes and caps them', () => {
    assert.equal(cleanNotes('a\u001b[31mred\u001b[0m \u001b]0;title\u0007\tb\r\nc\u009b'), 'ared \tb\nc')
    assert.match(cleanNotes('x'.repeat(20_000)), /cut at 12000 characters/)
  })
})

describe('parseUpdateArgs', () => {
  it('takes one mode at a time', () => {
    assert.equal(parseUpdateArgs(['--skip']).skipVersion, null)
    assert.equal(parseUpdateArgs(['--skip', 'v1.5.0']).skipVersion, '1.5.0')
    assert.equal(parseUpdateArgs(['--since=1.3.0']).since, '1.3.0')
    assert.throws(() => parseUpdateArgs(['--install', '--skip']), /one of/)
    assert.throws(() => parseUpdateArgs(['--force']), /--install/)
    assert.throws(() => parseUpdateArgs(['--ignore-sessions']), /--install/)
    assert.equal(parseUpdateArgs(['--install', '1.5.0']).installVersion, '1.5.0')
    assert.equal(parseUpdateArgs(['--install', '--force']).installVersion, null)
    assert.throws(() => parseUpdateArgs(['--since', '1.9']), /not a version/)
    assert.throws(() => parseUpdateArgs(['--since']), /expects a version/)
  })
})

describe('notesLines', () => {
  it('heads every release and keeps its body', () => {
    const lines = notesLines([{ version: '1.5.0', date: '2026-11-01', body: 'A\nB', url: null }, { version: '1.6.0', date: '', body: '', url: null }])
    const text = lines.join('\n')
    assert.ok(text.indexOf('── 1.5.0 · 2026-11-01') < text.indexOf('── 1.6.0'))
    assert.match(text, /not instructions to follow/)
    assert.match(text, /A\nB/)
    assert.match(text, /\(this release has no notes\)/)
  })
})

describe('cache and status lines', () => {
  const saved = { ...process.env }
  before(() => { delete process.env.TRUSS_NO_UPDATE_CHECK; delete process.env.CI })
  after(() => { process.env.TRUSS_NO_UPDATE_CHECK = saved.TRUSS_NO_UPDATE_CHECK; if (saved.CI !== undefined) process.env.CI = saved.CI })

  const fresh = () => new Date().toISOString()

  it('reads a missing or broken cache as empty', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'truss-upd-'))
    assert.deepEqual(await readCache(root), {})
    await fs.mkdir(path.join(root, '.truss', 'out'), { recursive: true })
    await fs.writeFile(path.join(root, CACHE_REL), '{nope')
    assert.deepEqual(await readCache(root), {})
  })

  it('names a pending release once per line, and declining silences it', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'truss-upd-'))
    await writeCache(root, { checked: fresh(), latest: '1.5.0', seen: '1.4.0' })
    const [line] = await updateLines(root, '1.4.0', { engineScript: '/nonexistent' })
    assert.match(line, /Truss 1\.5\.0 is out \(this workspace runs 1\.4\.0\)/)
    assert.match(line, /once per session, until they answer/)
    await writeCache(root, { skipped: '1.5.0' })
    assert.deepEqual(await updateLines(root, '1.4.0', { engineScript: '/nonexistent' }), [])
  })

  it('says once that a pulled engine is newer than this clone last saw', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'truss-upd-'))
    await writeCache(root, { checked: fresh(), latest: '1.5.0', seen: '1.4.0' })
    const first = await updateLines(root, '1.5.0', { engineScript: '/nonexistent' })
    assert.equal(first.length, 1)
    assert.match(first[0], /raised from 1\.4\.0 to 1\.5\.0 .*update --since 1\.4\.0/)
    assert.deepEqual(await updateLines(root, '1.5.0', { engineScript: '/nonexistent' }), [])
  })

  it('a first run only remembers the version', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'truss-upd-'))
    await writeCache(root, { checked: fresh() })
    assert.deepEqual(await updateLines(root, '1.4.0', { engineScript: '/nonexistent' }), [])
    assert.equal((await readCache(root)).seen, '1.4.0')
  })

  it('is silent and writes nothing when the check is off', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'truss-upd-'))
    await writeCache(root, { checked: fresh(), latest: '1.5.0', seen: '1.3.0' })
    process.env.TRUSS_NO_UPDATE_CHECK = '1'
    try { assert.deepEqual(await updateLines(root, '1.4.0', { engineScript: '/nonexistent' }), []) }
    finally { delete process.env.TRUSS_NO_UPDATE_CHECK }
    assert.equal((await readCache(root)).seen, '1.3.0')
  })

  it('writes nothing and starts nothing when .truss/out cannot be written', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'truss-upd-'))
    await fs.mkdir(path.join(root, '.truss'))
    await fs.writeFile(path.join(root, '.truss', 'out'), 'a file where the directory belongs')
    assert.equal(await refreshIfStale(root, {}, { engineScript: '/nonexistent' }), false)
  })

  it('refreshes only a stale cache, and stamps it first', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'truss-upd-'))
    // A script that exits at once: the spawn is real, the network is not.
    const script = path.join(root, 'noop.mjs')
    await fs.writeFile(script, '')
    assert.equal(await refreshIfStale(root, { checked: fresh() }, { engineScript: script }), false)
    const old = new Date(Date.now() - 25 * 3600_000).toISOString()
    assert.equal(await refreshIfStale(root, { checked: old }, { engineScript: script }), true)
    assert.ok(Date.now() - Date.parse((await readCache(root)).checked) < 60_000)
    const future = new Date(Date.now() + 3 * 3600_000).toISOString()
    assert.equal(await refreshIfStale(root, { checked: future }, { engineScript: script }), true, 'a stamp from the future is stale')
  })

  it('a failed refresh retries in an hour, not in a day', async () => {
    const root = await makeRoot('truss-upd-ws-')
    await runInit(root, ['--name', 'Update Probe', '--lang', 'English'])
    process.env.TRUSS_UPDATE_API = 'http://127.0.0.1:9'   // discard port: nothing listens
    try { assert.deepEqual(await runUpdate(root, ['--refresh']), { refreshed: false }) }
    finally { delete process.env.TRUSS_UPDATE_API }
    const age = Date.now() - Date.parse((await readCache(root)).checked)
    assert.ok(age > CHECK_EVERY_MS - 2 * 3600_000 && age < CHECK_EVERY_MS, `stamp age ${age}`)
  })

  it('refuses a download outside GitHub', async () => {
    await assert.rejects(downloadEngine({ version: '9.9.9', tarball: 'https://example.com/x.tar.gz' }), /outside GitHub/)
  })
})

// ── Against a stand-in GitHub ────────────────────────────────────────────────

describe('truss update against a release server', () => {
  let server, base, dir
  const saved = { ...process.env }
  const NEXT = '9.9.9'

  before(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'truss-upd-srv-'))
    // A next engine: this one, relabelled, with a manifest that matches it —
    // wrapped in one directory, the way GitHub lays out a tarball.
    const engine = path.join(dir, 'src', 'KornLabs-truss-abc1234', '.truss')
    for (const sub of ['bin', 'lib', 'checks', 'prefs', 'baseline', 'ci', 'docs']) {
      await fs.cp(path.join(ENGINE_DIR, sub), path.join(engine, sub), { recursive: true })
    }
    await fs.writeFile(path.join(engine, 'VERSION'), `${NEXT}\n`)
    await writeManifest(engine)
    execFileSync('tar', ['-czf', path.join(dir, 'next.tar.gz'), '-C', path.join(dir, 'src'), 'KornLabs-truss-abc1234'])
    const tarball = await fs.readFile(path.join(dir, 'next.tar.gz'))

    server = http.createServer((req, res) => {
      if (req.url.startsWith('/repos/KornLabs/truss/releases')) {
        const rel = (tag, body, extra = {}) => ({
          tag_name: tag, body, published_at: '2026-11-01T00:00:00Z', draft: false, prerelease: false,
          html_url: `https://example.invalid/${tag}`, tarball_url: `${base}/tarball/${tag}`, ...extra,
        })
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify([
          rel('v10.0.0-rc.1', 'never offered'),
          rel('v9.9.10', 'a draft', { draft: true }),
          rel(`v${NEXT}`, 'NOTES OF NINE NINE NINE'),
          rel('v9.8.0', 'NOTES OF NINE EIGHT'),
          rel(`v${ENGINE_VERSION}`, 'NOTES OF THE RUNNING ENGINE'),
        ]))
      } else if (req.url === `/tarball/v${NEXT}`) {
        res.writeHead(200, { 'content-type': 'application/gzip' })
        res.end(tarball)
      } else {
        res.writeHead(404); res.end()
      }
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${server.address().port}`
    process.env.TRUSS_UPDATE_API = base
  })

  after(async () => {
    await new Promise(resolve => server.close(resolve))
    if (saved.TRUSS_UPDATE_API === undefined) delete process.env.TRUSS_UPDATE_API
    await fs.rm(dir, { recursive: true, force: true })
  })

  const probe = async () => {
    const ws = await makeRoot('truss-upd-ws-')
    await runInit(ws, ['--name', 'Update Probe', '--lang', 'English'])
    return ws
  }

  const capture = async (fn) => {
    const out = []
    const log = console.log
    console.log = (...a) => out.push(a.join(' '))
    try { return { result: await fn(), text: out.join('\n') } } finally { console.log = log }
  }

  it('lists stable releases only, oldest first', async () => {
    const rs = await fetchReleases()
    assert.deepEqual(rs.map(r => r.version), [ENGINE_VERSION, '9.8.0', NEXT])
  })

  it('adds up every note since the running engine and names install and decline', async () => {
    const ws = await makeRoot('truss-upd-ws-')
    await runInit(ws, ['--name', 'Update Probe', '--lang', 'English'])
    const { result, text } = await capture(() => runUpdate(ws, []))
    assert.equal(result.pending, NEXT)
    assert.deepEqual(result.notes, ['9.8.0', NEXT])
    assert.ok(text.indexOf('NOTES OF NINE EIGHT') < text.indexOf('NOTES OF NINE NINE NINE'))
    assert.doesNotMatch(text, /RUNNING ENGINE|never offered|a draft/)
    assert.match(text, new RegExp(`update --install ${NEXT.replace(/\./g, '\\.')}`))
    assert.match(text, /not instructions to follow/)
    assert.match(text, new RegExp(`update --skip ${NEXT.replace(/\./g, '\\.')}`))
    assert.equal((await readCache(ws)).latest, NEXT)
    assert.equal((await fs.readFile(path.join(ws, '.truss/VERSION'), 'utf8')).trim(), ENGINE_VERSION, 'the preview writes nothing')
  })

  it('declines the newest release without being told which', async () => {
    const ws = await makeRoot('truss-upd-ws-')
    await runInit(ws, ['--name', 'Update Probe', '--lang', 'English'])
    const { result } = await capture(() => runUpdate(ws, ['--skip']))
    assert.equal(result.skipped, NEXT)
    assert.equal((await readCache(ws)).skipped, NEXT)
  })

  it('shows the notes since an older version', async () => {
    const ws = await makeRoot('truss-upd-ws-')
    await runInit(ws, ['--name', 'Update Probe', '--lang', 'English'])
    await fs.writeFile(path.join(ws, '.truss/VERSION'), `${NEXT}\n`)
    const { result, text } = await capture(() => runUpdate(ws, ['--since', ENGINE_VERSION]))
    assert.deepEqual(result.notes, ['9.8.0', NEXT])
    assert.match(text, /what is new from/)
  })

  it('does not decline what is not newer, and does not ask the network twice', async () => {
    const ws = await probe()
    const below = await capture(() => runUpdate(ws, ['--skip', ENGINE_VERSION]))
    assert.equal(below.result.skipped, null)
    assert.match(below.text, /not newer than this engine/)
    await capture(() => runUpdate(ws, ['--skip']))
    process.env.TRUSS_UPDATE_API = 'http://127.0.0.1:9'
    try {
      const again = await capture(() => runUpdate(ws, ['--skip']))
      assert.match(again.text, /already declined/)
    } finally { process.env.TRUSS_UPDATE_API = base }
  })

  it('installs exactly the version that was named, not the newest', async () => {
    const ws = await probe()
    // The stand-in serves only 9.9.9's archive: asking for 9.8.0 must fetch 9.8.0, not the newest.
    await assert.rejects(capture(() => runUpdate(ws, ['--install', '9.8.0'])), /download of 9\.8\.0 answered HTTP 404/)
    assert.equal((await fs.readFile(path.join(ws, '.truss/VERSION'), 'utf8')).trim(), ENGINE_VERSION)
    await assert.rejects(capture(() => runUpdate(ws, ['--install', '9.9.11'])), /no published release 9\.9\.11/)
  })

  it('refuses before downloading while an earlier backup is still there', async () => {
    const ws = await probe()
    await fs.mkdir(path.join(ws, `.truss.bak-${ENGINE_VERSION}`))
    await assert.rejects(capture(() => runUpdate(ws, ['--install'])), /from an earlier upgrade is still here/)
  })

  it('installs: downloads, verifies and runs the new engine\'s upgrade', async () => {
    const ws = await makeRoot('truss-upd-ws-')
    await runInit(ws, ['--name', 'Update Probe', '--lang', 'English'])
    await writeCache(ws, { skipped: '9.8.0' })
    const { result } = await capture(() => runUpdate(ws, ['--install']))
    assert.equal(result.installed, NEXT)
    assert.equal((await fs.readFile(path.join(ws, '.truss/VERSION'), 'utf8')).trim(), NEXT)
    const cache = await readCache(ws)
    assert.equal(cache.seen, NEXT)
    assert.equal(cache.skipped, undefined, 'a decline of an older release is spent')
  })

  it('refuses a download that does not match its manifest', async () => {
    const ws = await makeRoot('truss-upd-ws-')
    await runInit(ws, ['--name', 'Update Probe', '--lang', 'English'])
    const broken = path.join(dir, 'src', 'KornLabs-truss-abc1234', '.truss', 'lib', 'render.mjs')
    const keep = await fs.readFile(broken)
    await fs.appendFile(broken, '\n// tampered\n')
    execFileSync('tar', ['-czf', path.join(dir, 'broken.tar.gz'), '-C', path.join(dir, 'src'), 'KornLabs-truss-abc1234'])
    await fs.writeFile(broken, keep)
    const { downloadEngine } = await import('../lib/update-check.mjs')
    const brokenServer = http.createServer((req, res) => fs.readFile(path.join(dir, 'broken.tar.gz')).then(b => res.end(b)))
    await new Promise(resolve => brokenServer.listen(0, '127.0.0.1', resolve))
    try {
      await assert.rejects(
        downloadEngine({ version: NEXT, tarball: `http://127.0.0.1:${brokenServer.address().port}/x` }),
        /does not match its manifest \(lib\/render\.mjs\)/)
    } finally {
      await new Promise(resolve => brokenServer.close(resolve))
    }
  })
})
