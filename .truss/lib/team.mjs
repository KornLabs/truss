// lib/team.mjs — team mode: several people, each on their own machine and their
// own clone, identified by their GitHub login (D-112).
//
// Team mode is not a switch. A workspace is in team mode when `state/team.md`
// exists — the D-077 pattern: the files say which form applies, no version or
// flag has to agree with them.
//
// Roles DESCRIBE, they grant nothing. A role tells an agent whom it works for
// and which domains are that person's; nothing here blocks a write. Whatever
// must really be kept from someone lives in a repository they cannot access,
// named in `state/links.md` (D-113/D-119) — on a private GitHub Free repo, the
// repository boundary is the only thing GitHub enforces.
//
// Two layers, kept apart like the rest of the engine:
//   • pure parsers (parseTeam, parseLinksFile, parseFocusFile, htAddressees) —
//     used by checks/tm.mjs, which must stay hermetic (no git, no network);
//   • I/O helpers (resolveIdentity, localLinks, …) — used by `status` and the
//     `team` command only. They never throw: a team block that can break
//     `status` would be worse than none.
//
// Per-device facts (who am I, where does a linked workspace live on THIS disk)
// are stored in git config, not in a file: they must not be committed, they
// must survive `truss upgrade` (which replaces .truss/ wholesale, out/
// included), and team mode needs git anyway.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'
import { CHECKBOX_ANY, CHECKBOX_DONE, ignoredLines } from './md.mjs'

const execFileP = promisify(execFile)

export const TEAM_FILE = 'state/team.md'
export const LINKS_FILE = 'state/links.md'
export const FOCUS_DIR = 'state/current/'
export const FINDINGS_FILE = 'state/truss-findings.md'
export const IDENTITY_CACHE = '.truss/out/identity.json'
export const SEEN_CACHE = '.truss/out/team-seen.json'

// The keys and limit of state/current.md, applied to each personal focus file.
export const FOCUS_KEYS = ['focus', 'next', 'blockers']
export const FOCUS_NEXT_MAX = 5

// GitHub login: alphanumerics and single hyphens, 1–39 chars, no leading hyphen.
const LOGIN = '[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})'
export const LOGIN_RE = new RegExp(`^${LOGIN}$`)

/** Strip a leading `@` and validate. Returns the bare login, or null. */
export function normalizeLogin(raw) {
  if (typeof raw !== 'string') return null
  const v = raw.trim().replace(/^@/, '')
  return LOGIN_RE.test(v) ? v : null
}

/** The relative path of a member's personal focus file. */
export const focusFileFor = (login) => `${FOCUS_DIR}${login.toLowerCase()}.md`

/** Team mode is on when state/team.md was loaded. */
export const isTeamMode = (ctx) => !!ctx?.files?.has(TEAM_FILE)

// ── state/team.md ────────────────────────────────────────────────────────────

const MEMBER_LINE = /^\s*[-*]\s+@/
const MEMBER_RE = new RegExp(`^\\s*[-*]\\s+@(${LOGIN})\\s+[—–-]\\s+(.+?)\\s*$`)

/**
 * Parse state/team.md. A member is one list line:
 *   - @login — Name · role: free text · domains: a, b
 * `role:` and `domains:` are optional; the name is not.
 *
 * @param {string[]} lines
 * @returns {{members: Array<{login:string, name:string, role:string|null, domains:string[], line:number}>,
 *            problems: Array<{line:number, message:string}>}}
 */
export function parseTeam(lines) {
  const members = []
  const problems = []
  const skip = ignoredLines(lines)
  const seen = new Map()
  for (const [i, line] of lines.entries()) {
    if (skip.has(i) || !MEMBER_LINE.test(line)) continue
    const m = line.match(MEMBER_RE)
    if (!m) {
      problems.push({ line: i + 1, message: `member line does not parse: "${line.trim()}"` })
      continue
    }
    const [name, ...parts] = m[2].split(/\s+·\s+/)
    let role = null
    let domains = []
    let bad = false
    for (const part of parts) {
      const kv = part.match(/^(role|domains)\s*:\s*(.*)$/i)
      if (!kv) { bad = true; continue }
      if (kv[1].toLowerCase() === 'role') role = kv[2].trim() || null
      else domains = kv[2].split(',').map(s => s.trim()).filter(Boolean)
    }
    if (bad) problems.push({ line: i + 1, message: `unknown field in member line (allowed after the name: "role: …", "domains: …"): "${line.trim()}"` })
    const login = m[1]
    const key = login.toLowerCase()
    if (seen.has(key)) {
      problems.push({ line: i + 1, message: `@${login} is listed twice (first on line ${seen.get(key)})` })
      continue
    }
    seen.set(key, i + 1)
    members.push({ login, name: name.trim(), role, domains, line: i + 1 })
  }
  return { members, problems }
}

/** Members of a loaded workspace, or [] outside team mode. */
export function teamMembers(ctx) {
  const f = ctx?.files?.get(TEAM_FILE)
  return f ? parseTeam(f.lines).members : []
}

export function findMember(members, login) {
  if (!login) return null
  const key = login.toLowerCase()
  return members.find(m => m.login.toLowerCase() === key) || null
}

// ── state/links.md ───────────────────────────────────────────────────────────

const LINK_FIELDS = ['repo', 'owner', 'holds']
const REQUEST_RE = new RegExp(`^\\s*[-*]\\s+${CHECKBOX_ANY}\\s+(\\d{4}-\\d{2}-\\d{2})\\s+@(${LOGIN})\\s+[—–-]\\s+(.+?)\\s*$`)
const REQUEST_DONE = new RegExp(`^\\s*[-*]\\s+${CHECKBOX_DONE}\\s`)
const ANY_CHECKBOX = new RegExp(`^\\s*[-*]\\s+${CHECKBOX_ANY}\\s`)

/**
 * Parse state/links.md: one `## <name>` section per repository or workspace
 * this one does not hold.
 *
 *   ## <name>
 *   Repo: <url or description>
 *   Owner: @login
 *   Holds: <what lives there>
 *   ### Requests
 *   - [ ] YYYY-MM-DD @login — what is wanted
 *   ### Notes
 *   - YYYY-MM-DD — information back
 *
 * @returns {{links: Array<{name:string, line:number, repo:string|null, owner:string|null, holds:string|null,
 *            requests: Array<{done:boolean, date:string, login:string, text:string, line:number}>}>,
 *            problems: Array<{line:number, message:string}>}}
 */
export function parseLinksFile(lines) {
  const links = []
  const problems = []
  const skip = ignoredLines(lines)
  let cur = null
  let sub = null
  for (const [i, line] of lines.entries()) {
    if (skip.has(i)) continue
    const h2 = line.match(/^##\s+(.+?)\s*$/)
    if (h2 && !line.startsWith('###')) {
      cur = { name: h2[1], line: i + 1, repo: null, owner: null, holds: null, requests: [] }
      links.push(cur)
      sub = null
      continue
    }
    if (!cur) continue
    const h3 = line.match(/^###\s+(.+?)\s*$/)
    if (h3) { sub = h3[1].toLowerCase(); continue }
    if (sub === null) {
      const f = line.match(/^(Repo|Owner|Holds)\s*:\s*(.*)$/i)
      if (f) cur[f[1].toLowerCase()] = f[2].trim() || null
      continue
    }
    if (sub === 'requests' && ANY_CHECKBOX.test(line)) {
      const r = line.match(REQUEST_RE)
      if (!r) {
        problems.push({ line: i + 1, message: `request does not parse (expected "- [ ] YYYY-MM-DD @login — text"): "${line.trim()}"` })
        continue
      }
      cur.requests.push({ done: REQUEST_DONE.test(line), date: r[1], login: r[2], text: r[3], line: i + 1 })
    }
  }

  for (const l of links) {
    const missing = LINK_FIELDS.filter(k => !l[k])
    if (missing.length) {
      problems.push({ line: l.line, message: `link "${l.name}" is missing ${missing.map(k => `${k[0].toUpperCase()}${k.slice(1)}:`).join(', ')}` })
    }
    if (l.owner && !normalizeLogin(l.owner)) {
      problems.push({ line: l.line, message: `link "${l.name}": Owner must be one GitHub login (@login), got "${l.owner}"` })
    }
    // `merge=union` keeps both sides of a conflicting hunk. When the owner ticks
    // a request off while someone appends right below it, the open AND the done
    // version of that request both survive the merge. Name it, so the stale open
    // copy is deleted instead of being worked twice.
    const byKey = new Map()
    for (const r of l.requests) {
      const key = `${r.date} ${r.login.toLowerCase()} ${r.text}`
      if (byKey.has(key)) {
        problems.push({ line: r.line, message: `link "${l.name}": request is listed twice (also line ${byKey.get(key)}) — a union merge keeps both copies; delete the stale one` })
      } else byKey.set(key, r.line)
    }
  }
  return { links, problems }
}

/** Open requests of one parsed link. */
export const openRequests = (link) => link.requests.filter(r => !r.done)

// ── state/current/<login>.md ─────────────────────────────────────────────────

/**
 * Check one personal focus file against the state/current.md contract:
 * `focus:`, `next:`, `blockers:` present, `next:` at most FOCUS_NEXT_MAX items.
 * @returns {string[]} problems (empty when fine)
 */
export function focusFileProblems(lines) {
  const out = []
  const lc = lines.map(l => l.toLowerCase())
  const missing = FOCUS_KEYS.filter(k => !lc.some(l => l.startsWith(`${k}:`)))
  if (missing.length) out.push(`missing required key${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`)
  const start = lc.findIndex(l => l.startsWith('next:'))
  if (start !== -1) {
    let n = 0
    for (let i = start + 1; i < lines.length; i++) {
      if (/^\s+[-*]\s+\S/.test(lines[i])) { n++; continue }
      if (lines[i].trim() === '') continue
      break
    }
    if (n > FOCUS_NEXT_MAX) out.push(`next: lists ${n} entries (limit ${FOCUS_NEXT_MAX})`)
  }
  return out
}

// ── HUMAN-TODOS.md addressee (D-120) ─────────────────────────────────────────

/**
 * For every HT entry line, the login its body names in `For: @login`, if any.
 * The body is the indented block below the entry line (docs/conventions.md).
 * @param {string[]} lines   HUMAN-TODOS.md
 * @param {string} htId      the HT class id (usually 'HT')
 * @returns {Map<number, {login:string, line:number}>}  entry line (1-based) → addressee
 */
export function htAddressees(lines, htId = 'HT') {
  const entryRe = new RegExp(`^\\s*[-*]\\s+${CHECKBOX_ANY}\\s+${htId}-\\d{3}\\b`)
  const forRe = new RegExp(`^\\s+(?:\\*\\*)?For:(?:\\*\\*)?\\s*@(${LOGIN})\\b`)
  const skip = ignoredLines(lines)
  const out = new Map()
  let entry = null
  for (const [i, line] of lines.entries()) {
    if (skip.has(i)) continue
    if (entryRe.test(line)) { entry = i + 1; continue }
    if (entry === null) continue
    if (line.trim() !== '' && !/^\s/.test(line)) { entry = null; continue }
    const m = line.match(forRe)
    if (m && !out.has(entry)) out.set(entry, { login: m[1], line: i + 1 })
  }
  return out
}

// ── I/O: identity, local links, feed ─────────────────────────────────────────

async function git(root, args) {
  if (process.env.TRUSS_NO_GIT) return null
  try {
    const { stdout } = await execFileP('git', ['-C', root, ...args], { timeout: 5000, maxBuffer: 1 << 20 })
    return stdout
  } catch { return null }
}

/**
 * Who is working here, as a GitHub login. Never throws.
 *
 * Order: TRUSS_USER → git config truss.user (set by `truss team whoami`) →
 * git config github.user (a common convention) → `gh api user`, whose answer
 * is cached under .truss/out/ because it costs a network round trip.
 *
 * Local identity is a hint, not authentication: anyone can set any of these.
 * Only the server knows who pushed (PR author, `github.actor`).
 *
 * @returns {Promise<{login:string|null, source:string|null}>}
 */
export async function resolveIdentity(root, { allowNetwork = true } = {}) {
  const env = normalizeLogin(process.env.TRUSS_USER || '')
  if (env) return { login: env, source: 'TRUSS_USER' }
  for (const key of ['truss.user', 'github.user']) {
    const v = normalizeLogin((await git(root, ['config', '--get', key])) || '')
    if (v) return { login: v, source: `git config ${key}` }
  }
  const cachePath = path.join(root, IDENTITY_CACHE)
  try {
    const cached = JSON.parse(await fs.readFile(cachePath, 'utf8'))
    const v = normalizeLogin(cached?.login || '')
    if (v) return { login: v, source: 'gh (cached)' }
  } catch { /* no cache yet */ }
  if (!allowNetwork || process.env.TRUSS_NO_GIT) return { login: null, source: null }
  try {
    const { stdout } = await execFileP('gh', ['api', 'user', '--jq', '.login'], { timeout: 4000 })
    const v = normalizeLogin(stdout)
    if (v) {
      try {
        await fs.mkdir(path.dirname(cachePath), { recursive: true })
        await fs.writeFile(cachePath, JSON.stringify({ login: v }) + '\n')
      } catch { /* a cache we cannot write only costs the next lookup */ }
      return { login: v, source: 'gh' }
    }
  } catch { /* no gh, not logged in, offline */ }
  return { login: null, source: null }
}

/** Set this clone's identity (git config --local truss.user). Throws on failure. */
export async function setIdentity(root, login) {
  if (process.env.TRUSS_NO_GIT) throw new Error('git is disabled (TRUSS_NO_GIT) — set TRUSS_USER instead')
  const out = await git(root, ['config', '--local', 'truss.user', login])
  if (out === null) throw new Error('git config failed — is this a git checkout? Without git, set TRUSS_USER instead')
}

const LINK_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
export const isLinkName = (n) => LINK_NAME_RE.test(n || '')

/**
 * Where linked workspaces live on THIS machine: git config truss-link.<name>.path.
 * @returns {Promise<Array<{name:string, path:string}>>}
 */
export async function localLinks(root) {
  const out = await git(root, ['config', '--get-regexp', '^truss-link\\..*\\.path$'])
  if (!out) return []
  const links = []
  for (const line of out.split('\n').filter(Boolean)) {
    const m = line.match(/^truss-link\.(.+)\.path\s+(.+)$/)
    if (m) links.push({ name: m[1], path: m[2].trim() })
  }
  return links
}

export async function setLocalLink(root, name, absPath) {
  if (process.env.TRUSS_NO_GIT) throw new Error('git is disabled (TRUSS_NO_GIT)')
  const out = await git(root, ['config', '--local', `truss-link.${name}.path`, absPath])
  if (out === null) throw new Error('git config failed — is this a git checkout?')
}

export async function removeLocalLink(root, name) {
  if (process.env.TRUSS_NO_GIT) throw new Error('git is disabled (TRUSS_NO_GIT)')
  const out = await git(root, ['config', '--local', '--remove-section', `truss-link.${name}`])
  if (out === null) throw new Error(`no local link named "${name}"`)
}

/**
 * Commits by OTHER people since this clone's last `status`, newest first.
 * "Other" = author email differs from this clone's user.email. The first run
 * only records HEAD and reports nothing; a rewritten history resets the mark.
 * Never throws.
 * @returns {Promise<{commits: Array<{author:string, paths:string[]}>}|null>}
 */
export async function othersSinceLastRun(root) {
  const head = (await git(root, ['rev-parse', 'HEAD']))?.trim()
  if (!head) return null
  const seenPath = path.join(root, SEEN_CACHE)
  let last = null
  try { last = JSON.parse(await fs.readFile(seenPath, 'utf8'))?.head || null } catch { /* first run */ }
  const remember = async () => {
    try {
      await fs.mkdir(path.dirname(seenPath), { recursive: true })
      await fs.writeFile(seenPath, JSON.stringify({ head }) + '\n')
    } catch { /* best effort */ }
  }
  if (!last || last === head) { await remember(); return null }
  const me = ((await git(root, ['config', '--get', 'user.email'])) || '').trim().toLowerCase()
  const log = await git(root, ['log', '--no-merges', '--format=%x1e%an%x1f%ae', '--name-only', `${last}..${head}`])
  await remember()
  if (log === null) return null
  const commits = []
  for (const rec of log.split('\x1e').slice(1)) {
    const [header, ...rest] = rec.split('\n')
    const [author, email] = header.split('\x1f')
    if (me && (email || '').trim().toLowerCase() === me) continue
    commits.push({ author: (author || '?').trim(), paths: rest.map(s => s.trim()).filter(Boolean) })
  }
  return { commits }
}

/** Read and parse another workspace's state/links.md. Never throws. */
export async function readLinkedLinks(absWorkspace) {
  try {
    const raw = await fs.readFile(path.join(absWorkspace, LINKS_FILE), 'utf8')
    return parseLinksFile(raw.split(/\r?\n/))
  } catch { return null }
}
