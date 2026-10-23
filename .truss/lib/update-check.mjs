// lib/update-check.mjs — is there a newer Truss release, and what is new in it (D-133)
//
// WHERE IT SPEAKS
// `truss status`, never `doctor`. The checks stay hermetic (D-101): a doctor
// whose verdict changes because someone published a release on GitHub would
// turn CI red over nothing in the repository. `status` is what every session
// runs first, and a line in its output is the one place a nudge is reliably
// seen — the same argument that put the Parallel block there.
//
// STATUS NEVER WAITS ON THE NETWORK
// `status` only reads a cache. When the cache is older than CHECK_EVERY_MS it
// starts `truss update --refresh` detached and moves on; the answer shows up on
// the next `status`. Offline, sandboxed or rate-limited simply means no line.
// Off in CI (`CI` set) and with TRUSS_NO_UPDATE_CHECK — the explicit
// `truss update` still works in both, because a human asked for it.
//
// DECLINING IS NOT A DECISION
// `truss update --skip <v>` writes <v> into the cache and nothing else: no
// D-entry, no tracked file. The line stays silent until a release newer than
// <v> appears. The cache is per clone, so another machine or a team member is
// asked once on their own — declining an engine version is a person's call
// about their session, not the project's.
//
// STORAGE
// `.truss/out/update.json` — gitignored runtime output next to presence/ and
// doctor.json: { checked, latest, skipped, seen }. `seen` is the engine version
// this clone last reported on; when a `git pull` brings a newer engine, status
// says so once and points at the notes. Per working tree: a fresh clone, a
// second git worktree, and the clone that just upgraded (the old out/ moves to
// .truss.bak-*) each start empty — at worst one extra question, never a wrong
// answer. Not in the git dir, because Truss must run without git.
//
// TRUSS_UPDATE_API replaces https://api.github.com — a test hook. Whoever sets
// it decides which code `update` runs, exactly like whoever sets PATH.

import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { verifyEngine } from './engine-manifest.mjs'

const execFileP = promisify(execFile)

export const UPDATE_REPO = 'KornLabs/truss'
export const CACHE_REL = path.join('.truss', 'out', 'update.json')
export const CHECK_EVERY_MS = 24 * 3600_000
/** After a failed refresh: try again in an hour, not in a day. */
export const RETRY_AFTER_MS = 3600_000
const FETCH_TIMEOUT_MS = 10_000

const apiBase = () => (process.env.TRUSS_UPDATE_API || 'https://api.github.com').replace(/\/+$/, '')

/** True when the automatic check must not run (the explicit command still may). */
export function autoCheckOff(env = process.env) {
  const set = (v) => !!v && !['0', 'false'].includes(String(v).toLowerCase())
  return set(env.TRUSS_NO_UPDATE_CHECK) || set(env.CI)
}

// ── Versions ────────────────────────────────────────────────────────────────

/**
 * '1.4.0' → { core: [1,4,0], pre: null }; '1.0.0-rc.4' → { core: [1,0,0], pre: 'rc.4' }.
 * A leading 'v' is accepted; anything else returns null.
 */
export function parseVersion(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(String(v ?? '').trim())
  if (!m) return null
  return { core: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ?? null }
}

/**
 * Negative when a < b, positive when a > b, 0 when equal. A prerelease sorts
 * before the release of the same core; two prereleases of one core compare as
 * strings, which is enough here — only stable releases are ever offered.
 * Unparseable versions compare as equal, so they never produce an offer.
 */
export function compareVersions(a, b) {
  const pa = parseVersion(a), pb = parseVersion(b)
  if (!pa || !pb) return 0
  for (let i = 0; i < 3; i++) if (pa.core[i] !== pb.core[i]) return pa.core[i] - pb.core[i]
  if (pa.pre === pb.pre) return 0
  if (pa.pre === null) return 1
  if (pb.pre === null) return -1
  return pa.pre < pb.pre ? -1 : 1
}

// ── Cache ───────────────────────────────────────────────────────────────────

/** Never throws: a missing or broken cache is an empty one. */
export async function readCache(root) {
  try {
    const data = JSON.parse(await fs.readFile(path.join(root, CACHE_REL), 'utf8'))
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  } catch {
    return {}
  }
}

/** Merge `patch` into the cache; tmp + rename. Never throws. */
export async function writeCache(root, patch) {
  try {
    const file = path.join(root, CACHE_REL)
    const next = { ...await readCache(root), ...patch }
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k]
    await fs.mkdir(path.dirname(file), { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    await fs.writeFile(tmp, JSON.stringify(next) + '\n', 'utf8')
    await fs.rename(tmp, file).catch(async (err) => { await fs.rm(tmp, { force: true }); throw err })
    return true
  } catch {
    return false
  }
}

/**
 * The release to offer, or null: newer than the running engine and newer than
 * whatever was declined.
 */
export function pendingVersion(cache, current) {
  const latest = cache?.latest
  if (!latest || !parseVersion(latest) || !parseVersion(current)) return null
  if (compareVersions(latest, current) <= 0) return null
  if (cache.skipped && compareVersions(latest, cache.skipped) <= 0) return null
  return latest
}

// ── Releases ────────────────────────────────────────────────────────────────

export class UpdateError extends Error {}

/** The useful part of a fetch failure: undici hides the errno in `cause`, sometimes one level deeper. */
const reasonOf = (err) => err?.cause?.code || err?.cause?.errors?.[0]?.code || (err?.name === 'TimeoutError' ? 'timed out' : null)
  || err?.cause?.message || err?.message || String(err)

// Release notes are text from GitHub, written by whoever writes them — print
// them, never let them steer the terminal: control characters (ANSI/OSC
// escapes included) go, tabs and newlines stay, and one release is capped.
const NOTES_MAX = 12_000
export function cleanNotes(body) {
  const text = String(body ?? '').replace(/\r\n?/g, '\n')
    .replace(/\u001B\][^\u0007\u001B]*(?:\u0007|\u001B\\)?/g, '')        // OSC (titles, hyperlinks)
    .replace(/\u001B\[[0-?]*[ -\/]*[@-~]/g, '')                           // CSI (colours, cursor)
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, '').trim()
  return text.length > NOTES_MAX ? `${text.slice(0, NOTES_MAX)}\n[… cut at ${NOTES_MAX} characters — the full notes are on the release page]` : text
}

/** Downloads come from GitHub unless the test hook moved the API. */
function allowedDownload(url) {
  if (process.env.TRUSS_UPDATE_API) return true
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && ['api.github.com', 'codeload.github.com', 'github.com'].includes(u.host)
  } catch { return false }
}

/**
 * Every stable, published release of Truss, oldest first:
 * [{ version, tag, date, body, url, tarball }]. Drafts, GitHub prereleases and
 * tags with a prerelease suffix are left out — an `-rc` is never offered.
 * Throws UpdateError with a readable reason.
 */
export async function fetchReleases({ fetchImpl = globalThis.fetch, userAgent = 'truss' } = {}) {
  const url = `${apiBase()}/repos/${UPDATE_REPO}/releases?per_page=100`
  let res
  try {
    res = await fetchImpl(url, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': userAgent },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch (err) {
    throw new UpdateError(`update: could not reach ${new URL(url).host} (${reasonOf(err)})`)
  }
  if (!res.ok) {
    const hint = res.status === 403 || res.status === 429 ? ' — GitHub rate limit, try again in an hour' : ''
    throw new UpdateError(`update: the release list answered HTTP ${res.status}${hint}`)
  }
  let list
  try { list = await res.json() } catch { throw new UpdateError('update: the release list was not JSON') }
  if (!Array.isArray(list)) throw new UpdateError('update: the release list has an unexpected shape')
  return list
    .filter(r => r && !r.draft && !r.prerelease)
    .map(r => ({
      version: String(r.tag_name ?? '').replace(/^v/, ''),
      tag: r.tag_name,
      date: String(r.published_at ?? '').slice(0, 10),
      body: cleanNotes(r.body),
      url: r.html_url ?? null,
      tarball: r.tarball_url ?? null,
    }))
    .filter(r => { const p = parseVersion(r.version); return p && p.pre === null })
    .sort((a, b) => compareVersions(a.version, b.version))
}

/** Releases with from < version <= to, oldest first — the notes to add up. */
export function releasesBetween(releases, from, to) {
  return releases.filter(r => compareVersions(r.version, from) > 0 && compareVersions(r.version, to) <= 0)
}

// ── Status integration ──────────────────────────────────────────────────────

/**
 * Start `truss update --refresh` detached when the cache is stale. The stamp is
 * written first, so a burst of `status` calls starts one refresh, not one each
 * (two calls in the same millisecond may still both start one — harmless).
 * The refresh rewrites the stamp: on success to now, on failure to an hour
 * before it would be due, so one offline `status` does not mute a whole day.
 * A stamp in the future (clock moved back) counts as stale.
 */
export async function refreshIfStale(root, cache, { now = Date.now(), engineScript } = {}) {
  if (autoCheckOff()) return false
  const checked = Date.parse(cache?.checked ?? '')
  if (Number.isFinite(checked) && now - checked >= 0 && now - checked < CHECK_EVERY_MS) return false
  if (!await writeCache(root, { checked: new Date(now).toISOString() })) return false
  try {
    const child = spawn(process.execPath, [engineScript, 'update', '--refresh'], {
      cwd: root, detached: true, stdio: 'ignore', windowsHide: true,
      env: { ...process.env, TRUSS_NO_PRESENCE: '1' },
    })
    child.on('error', () => {})
    child.unref()
    return true
  } catch {
    return false
  }
}

/**
 * The `Update:` lines for `truss status`, or []. Reads the cache, says what it
 * knows, and kicks off a refresh when the cache is stale. Never throws.
 */
export async function updateLines(root, current, { engineScript, now = Date.now() } = {}) {
  try {
    if (!parseVersion(current) || autoCheckOff()) return []
    const cache = await readCache(root)
    const out = []

    // An engine that arrived by `git pull` (or by an upgrade in another clone)
    // is news once: the notes say what changed, nobody else will.
    if (cache.seen && compareVersions(current, cache.seen) > 0) {
      out.push(`Truss was raised from ${cache.seen} to ${current} since this clone last looked — \`truss update --since ${cache.seen}\` shows what is new.`)
    }
    if (cache.seen !== current) await writeCache(root, { seen: current })

    const pending = pendingVersion(cache, current)
    if (pending) {
      out.push(`Truss ${pending} is out (this workspace runs ${current}). Ask the human whether to install it — once per session, until they answer: \`truss update\` shows every release note since ${current} and what the upgrade would change here, and names the commands that install or decline.`)
    }
    await refreshIfStale(root, cache, { now, engineScript })
    return out
  } catch {
    return []
  }
}

// ── Download ────────────────────────────────────────────────────────────────

/**
 * Download one release and unpack it into a fresh temp directory. Returns the
 * path of its `.truss/` engine and a cleanup function. The engine is checked
 * against its own MANIFEST.sha256 — integrity (a truncated or corrupted
 * download), not authenticity: the trust is HTTPS to GitHub, the same as the
 * `git clone` this replaces.
 */
export async function downloadEngine(release, { fetchImpl = globalThis.fetch, userAgent = 'truss' } = {}) {
  if (!release.tarball) throw new UpdateError(`update: release ${release.version} has no download`)
  if (!allowedDownload(release.tarball)) throw new UpdateError(`update: release ${release.version} points its download outside GitHub (${release.tarball}) — refused`)
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `truss-${release.version}-`))
  const cleanup = () => fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  try {
    let res
    try {
      res = await fetchImpl(release.tarball, {
        headers: { 'User-Agent': userAgent },
        signal: AbortSignal.timeout(120_000),
      })
    } catch (err) {
      throw new UpdateError(`update: the download of ${release.version} failed (${reasonOf(err)})`)
    }
    if (!res.ok) throw new UpdateError(`update: the download of ${release.version} answered HTTP ${res.status}`)
    if (!allowedDownload(res.url || release.tarball)) throw new UpdateError(`update: the download of ${release.version} was redirected outside GitHub (${res.url}) — refused`)
    const archive = path.join(dir, 'release.tar.gz')
    await fs.writeFile(archive, Buffer.from(await res.arrayBuffer()))
    const unpacked = path.join(dir, 'src')
    await fs.mkdir(unpacked)
    // Relative names from inside the temp dir: GNU tar (Git Bash on Windows)
    // reads `C:\…` as a remote host. The default modes of bsdtar and GNU tar
    // refuse `..`, absolute paths and writing through a symlink, which is the
    // traversal guard here; the manifest check below catches what is left.
    try {
      await execFileP('tar', ['-xzf', 'release.tar.gz', '-C', 'src'], { cwd: dir, windowsHide: true })
    } catch (err) {
      throw new UpdateError(`update: could not unpack ${release.version} with tar (${err.code || err.message})`)
    }
    // GitHub wraps the tree in one directory named after the commit.
    const top = (await fs.readdir(unpacked, { withFileTypes: true })).filter(e => e.isDirectory())
    if (top.length !== 1) throw new UpdateError(`update: the ${release.version} archive has an unexpected layout`)
    const engine = path.join(unpacked, top[0].name, '.truss')

    const version = (await fs.readFile(path.join(engine, 'VERSION'), 'utf8').catch(() => '')).trim()
    if (version !== release.version) {
      throw new UpdateError(`update: the ${release.version} archive carries engine version '${version || 'none'}'`)
    }
    const check = await verifyEngine(engine)
    if (check === null) throw new UpdateError(`update: the ${release.version} engine ships no MANIFEST.sha256 to check it against`)
    const bad = [...check.modified, ...check.missing, ...check.unreadable]
    if (bad.length) throw new UpdateError(`update: the ${release.version} engine does not match its manifest (${bad.slice(0, 3).join(', ')}${bad.length > 3 ? ', …' : ''})`)
    return { engine, cleanup }
  } catch (err) {
    await cleanup()
    throw err
  }
}
