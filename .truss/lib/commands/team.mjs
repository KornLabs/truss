// lib/commands/team.mjs — truss team <enable|whoami|link|unlink>
//
//   enable [--as @login]   switch this workspace to team mode (D-112): writes
//                          state/team.md with your line, the §1/§2/§6 lines that
//                          route to it, auto-commit=on + git-flow=team, and the
//                          union-merge rule for state/links.md
//   whoami [@login]        show who truss thinks you are, or set it for this clone
//   link <name> <path>     record where a linked workspace lives on THIS machine
//   unlink <name>          forget that
//
// Every write here is explicit and bounded, like `set`: the command knows the
// exact lines it adds and adds each one once — running `enable` twice changes
// nothing the second time.

import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { loadWorkspace } from '../workspace.mjs'
import { loadBehaviorText } from '../defaults.mjs'
import { writePrefRows } from '../prefs-writer.mjs'
import { generateMapContent } from './map.mjs'
import {
  TEAM_FILE, LINKS_FILE, FINDINGS_FILE,
  normalizeLogin, resolveIdentity, setIdentity, parseTeam, findMember, focusFileFor,
  isLinkName, setLocalLink, removeLocalLink,
} from '../team.mjs'

const execFileP = promisify(execFile)

export class TeamError extends Error {}

// The lines `enable` writes. Exported so tests and `init --team` agree with it.
export const SECTION1_SENTENCE = ' In team mode, also your own focus file under state/current/ — `truss status` names it.'
export const SECTION2_ROWS = [
  '| state/team.md | H+A | team mode: one line per member — GitHub login, name, role, domains. Roles describe whom you work for and whose a domain is; they grant nothing |',
  '| state/current/ (on demand) | A | team mode: one focus file per member, `state/current/<login>.md` — same keys and limits as state/current.md; `truss status` names yours |',
  '| state/links.md (on demand) | A | repositories and workspaces this one does not hold — owner, what lives there, requests to them, notes back. What a link holds is not yours to build here: add a request instead |',
]
export const SECTION6_ROW = '| .truss/docs/team.md | working in a team workspace — identity, git flow, focus files, links, CI |'
export const GITATTRIBUTES_LINE = `${LINKS_FILE} merge=union`

export async function runTeam(root, argv) {
  const [sub, ...rest] = argv
  switch (sub) {
    case 'enable': return runEnable(root, rest)
    case 'whoami': return runWhoami(root, rest)
    case 'link':   return runLink(root, rest)
    case 'unlink': return runUnlink(root, rest)
    default:
      throw new TeamError(
        'Usage: truss team enable [--as @login] | whoami [@login] | link <name> <path> | unlink <name>',
      )
  }
}

/**
 * Switch a workspace to team mode. Idempotent.
 * @param {string} root
 * @param {{as?: string|null, quiet?: boolean}} opts
 * @returns {Promise<{login:string, created:string[], changed:string[]}>}
 */
export async function enableTeam(root, opts = {}) {
  const agentsPath = path.join(root, 'AGENTS.md')
  let agents
  try { agents = await fs.readFile(agentsPath, 'utf8') }
  catch { throw new TeamError('truss team enable: no AGENTS.md here — run `truss init` first.') }

  // D-114: team mode keeps the findings channel. Refuse rather than half-enable:
  // TM-03 would otherwise fire on the first doctor run after this command.
  if (!agents.includes(FINDINGS_FILE)) {
    throw new TeamError(
      `truss team enable: this workspace has no findings channel (${FINDINGS_FILE}) — team mode requires it (D-114).\n` +
      `  Restore its §2 row from .truss/baseline/AGENTS.md, then run this again.`,
    )
  }

  let login = null
  if (opts.as) {
    login = normalizeLogin(opts.as)
    if (!login) throw new TeamError(`truss team enable: '${opts.as}' is not a GitHub login.`)
  } else {
    login = (await resolveIdentity(root)).login
  }
  if (!login) {
    throw new TeamError(
      'truss team enable: cannot tell who you are. Pass --as @<your-github-login>,\n' +
      '  or log in with `gh auth login`, or set TRUSS_USER.',
    )
  }

  const created = []
  const changed = []
  const notes = []

  // state/team.md — written with the enabling member only; the others add
  // their own line (through a pull request: the file is a protected path).
  const teamPath = path.join(root, TEAM_FILE)
  let teamRaw = null
  try { teamRaw = await fs.readFile(teamPath, 'utf8') } catch { /* absent */ }
  if (teamRaw === null) {
    const name = await gitUserName(root) || login
    await fs.mkdir(path.dirname(teamPath), { recursive: true })
    await fs.writeFile(teamPath, [
      '# Team',
      '',
      '> One line per member: `- @login — Name · role: … · domains: a, b` (role and domains are optional).',
      '> Roles describe whom an agent works for and whose a domain is — they grant nothing (.truss/docs/team.md).',
      '',
      `- @${login} — ${name}`,
      '',
    ].join('\n'))
    created.push(TEAM_FILE)
  } else if (!findMember(parseTeam(teamRaw.split(/\r?\n/)).members, login)) {
    notes.push(`@${login} is not in ${TEAM_FILE} yet — add your line there (through a pull request: the file is a protected path).`)
  }

  // AGENTS.md: §1 sentence, §2 rows, §6 row — each added once.
  // Keep the file's own line endings: the rows are written with \n and the
  // whole text is re-joined with whatever the file used.
  const eol = agents.includes('\r\n') ? '\r\n' : '\n'
  const lf = agents.replace(/\r\n/g, '\n')
  let next = lf
  next = addSection1Sentence(next)
  next = addSection2Rows(next)
  next = addSection6Row(next)
  if (next !== lf) {
    await fs.writeFile(agentsPath, eol === '\n' ? next : next.replace(/\n/g, '\r\n'))
    changed.push('AGENTS.md (§1, §2, §6)')
  }

  // Preferences — through the one block writer.
  const changes = []
  for (const [key, value] of [['auto-commit', 'on'], ['git-flow', 'team']]) {
    const behavior = await loadBehaviorText(root, key, value)
    if (!behavior) throw new TeamError(`truss team enable: no behaviour text for ${key}=${value} under .truss/prefs/ — is the engine complete?`)
    changes.push({ key, row: { key, value, behavior } })
  }
  const prefsBefore = await fs.readFile(agentsPath, 'utf8')
  await writePrefRows(root, changes)
  if (await fs.readFile(agentsPath, 'utf8') !== prefsBefore) changed.push('AGENTS.md preferences (auto-commit=on, git-flow=team)')

  // An explicit --as also tells THIS clone who it is; without it, `status`
  // would keep resolving the gh account or nobody. Best effort — no git, no record.
  if (opts.as) {
    try { await setIdentity(root, login) } catch { notes.push(`could not record @${login} for this clone — run: node .truss/bin/truss.mjs team whoami @${login}`) }
  }

  // .gitattributes — union merge for the append-only request lists.
  const gaPath = path.join(root, '.gitattributes')
  let ga = ''
  try { ga = await fs.readFile(gaPath, 'utf8') } catch { /* absent */ }
  if (!ga.split(/\r?\n/).some(l => l.trim() === GITATTRIBUTES_LINE)) {
    const sep = ga && !ga.endsWith('\n') ? '\n' : ''
    await fs.writeFile(gaPath, `${ga}${sep}${GITATTRIBUTES_LINE}\n`)
    ;(ga ? changed : created).push('.gitattributes')
  }

  // The map lists state/ files; a workspace that keeps one must not go stale
  // (ST-07) because of a file this command just wrote.
  const mapPath = path.join(root, 'state', 'map.md')
  try {
    await fs.access(mapPath)
    const before = await fs.readFile(mapPath, 'utf8')
    const after = await generateMapContent(root)
    if (after !== before) { await fs.writeFile(mapPath, after); changed.push('state/map.md') }
  } catch { /* no map in this workspace — nothing to keep in step */ }

  return { login, created, changed, notes }
}

function addSection1Sentence(text) {
  // §2 rows carry the path too, so look at §1 only.
  const s1 = sectionRange(text, '1')
  if (s1 && text.slice(s1.start, s1.end).includes('state/current/')) return text
  const lines = text.split('\n')
  const i = lines.findIndex(l => /^2\.\s+`state\/current\.md`/.test(l))
  if (i === -1) return text
  lines[i] = lines[i].trimEnd() + SECTION1_SENTENCE
  return lines.join('\n')
}

function addSection2Rows(text) {
  const lines = text.split('\n')
  const missing = SECTION2_ROWS.filter(r => !lines.some(l => l.startsWith(r.slice(0, r.indexOf(' |', 2) + 2))))
  if (missing.length === 0) return text
  let at = lines.findIndex(l => l.startsWith('| state/current.md |'))
  if (at === -1) {
    const s2 = lines.findIndex(l => /^##\s+2(\s|$)/.test(l))
    if (s2 === -1) return text
    at = s2
    while (at + 1 < lines.length && !lines[at + 1].startsWith('|')) at++
    while (at + 1 < lines.length && lines[at + 1].startsWith('|')) at++
  }
  lines.splice(at + 1, 0, ...missing)
  return lines.join('\n')
}

function addSection6Row(text) {
  if (text.includes(SECTION6_ROW.slice(0, SECTION6_ROW.indexOf(' |', 2)))) return text
  const lines = text.split('\n')
  const s6 = lines.findIndex(l => /^##\s+6(\s|$)/.test(l))
  if (s6 === -1) return text
  let last = -1
  for (let i = s6 + 1; i < lines.length && !/^##\s/.test(lines[i]); i++) {
    if (lines[i].startsWith('|')) last = i
  }
  if (last === -1) return text
  lines.splice(last + 1, 0, SECTION6_ROW)
  return lines.join('\n')
}

function sectionRange(text, n) {
  const re = new RegExp(`^##\\s+${n}(\\s|$)`, 'm')
  const m = re.exec(text)
  if (!m) return null
  const after = text.slice(m.index + m[0].length)
  const next = /^##\s/m.exec(after)
  return { start: m.index, end: next ? m.index + m[0].length + next.index : text.length }
}

async function gitUserName(root) {
  if (process.env.TRUSS_NO_GIT) return null
  try {
    const { stdout } = await execFileP('git', ['-C', root, 'config', '--get', 'user.name'], { timeout: 5000 })
    return stdout.trim() || null
  } catch { return null }
}

async function runEnable(root, rest) {
  let as = null
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--as') {
      as = rest[++i]
      if (!as || as.startsWith('-')) throw new TeamError('truss team enable: --as expects your GitHub login, e.g. --as @alex')
    }
    else if (rest[i].startsWith('--as=')) {
      as = rest[i].slice(5)
      if (!as) throw new TeamError('truss team enable: --as expects your GitHub login, e.g. --as @alex')
    }
    else throw new TeamError(`truss team enable: unknown argument '${rest[i]}'`)
  }
  const r = await enableTeam(root, { as })
  console.log(`\ntruss team enable — team mode is on (you: @${r.login})\n`)
  for (const c of r.created) console.log(`  created  ${c}`)
  for (const c of r.changed) console.log(`  updated  ${c}`)
  if (!r.created.length && !r.changed.length) console.log('  nothing to change — this workspace was already in team mode')
  for (const n of r.notes) console.log(`  note     ${n}`)
  console.log('\nNext:')
  console.log(`  1. Complete your line in ${TEAM_FILE} (role, domains) and add the other members.`)
  console.log(`  2. Optional: node .truss/bin/truss.mjs ci add doctor merge  — the doctor check and the merge workflow.`)
  console.log('  3. Commit and push. Each member clones, then runs: node .truss/bin/truss.mjs team whoami @<their-login>')
  console.log('  How the team works: .truss/docs/team.md\n')
}

async function runWhoami(root, rest) {
  if (rest.length > 1) throw new TeamError('Usage: truss team whoami [@login]')
  if (rest.length === 1) {
    const login = normalizeLogin(rest[0])
    if (!login) throw new TeamError(`truss team whoami: '${rest[0]}' is not a GitHub login.`)
    try { await setIdentity(root, login) }
    catch (err) { throw new TeamError(`truss team whoami: ${err.message}`) }
    console.log(`truss team whoami: this clone is @${login} (git config --local truss.user)`)
    return
  }
  const id = await resolveIdentity(root)
  if (!id.login) {
    console.log('truss team whoami: unknown — set it once: node .truss/bin/truss.mjs team whoami @<your-github-login>')
    return
  }
  let member = null
  try {
    const ctx = await loadWorkspace(root)
    const f = ctx.files.get(TEAM_FILE)
    if (f) member = findMember(parseTeam(f.lines).members, id.login)
  } catch { /* no workspace: identity alone */ }
  console.log(`truss team whoami: @${id.login} (from ${id.source})`)
  if (member) {
    console.log(`  member: ${member.name}${member.role ? ` · role: ${member.role}` : ''}${member.domains.length ? ` · domains: ${member.domains.join(', ')}` : ''}`)
    console.log(`  focus file: ${focusFileFor(id.login)}`)
  }
}

async function runLink(root, rest) {
  const [name, target, ...extra] = rest
  if (!name || !target || extra.length) throw new TeamError('Usage: truss team link <name> <path-to-the-linked-workspace>')
  if (!isLinkName(name)) throw new TeamError(`truss team link: '${name}' — use letters, digits, '-' or '_' (the name of the "## <name>" section in ${LINKS_FILE}).`)
  const abs = path.resolve(process.cwd(), target)
  try { await fs.access(path.join(abs, 'AGENTS.md')) }
  catch { throw new TeamError(`truss team link: ${abs} has no AGENTS.md — point it at the root of a Truss workspace.`) }
  try { await setLocalLink(root, name, abs) }
  catch (err) { throw new TeamError(`truss team link: ${err.message}`) }
  console.log(`truss team link: "${name}" → ${abs} (this machine only; git config --local)`)
  console.log(`  truss status now shows the open requests in ${path.join(abs, LINKS_FILE)} that are addressed to you.`)
}

async function runUnlink(root, rest) {
  const [name, ...extra] = rest
  if (!name || extra.length) throw new TeamError('Usage: truss team unlink <name>')
  try { await removeLocalLink(root, name) }
  catch (err) { throw new TeamError(`truss team unlink: ${err.message}`) }
  console.log(`truss team unlink: forgot "${name}" on this machine`)
}

