// checks/tm.mjs — Team-mode checks (TM-01 … TM-06)
//
// TM-01  W  state/team.md: a member line does not parse, a login is listed twice, or no member at all
// TM-02  W  team mode without `auto-commit=on` and `git-flow=team` (D-114/D-115)
// TM-03  W  team mode without the findings channel (state/truss-findings.md) (D-114)
// TM-04  W  state/links.md: a link misses Repo:/Owner:/Holds:, a request does not parse, or is listed twice
// TM-05  W  a personal focus file under state/current/ breaks the current.md contract or names no member
// TM-06  W  an HT entry is addressed (`For: @login`) to someone who is not a member
//
// Silent outside team mode, except TM-04: state/links.md is useful to any
// workspace that points at a repository it does not hold.
//
// Hermetic like every check family: file reads only — identity, git config and
// the network belong to `truss status` (lib/team.mjs, I/O half).

import { parsePrefsRows } from '../lib/render.mjs'
import { classById, fileForClass } from '../lib/schema.mjs'
import {
  TEAM_FILE, LINKS_FILE, FOCUS_DIR, FINDINGS_FILE,
  parseTeam, parseLinksFile, focusFileProblems, htAddressees, findMember, isTeamMode,
} from '../lib/team.mjs'

export const meta = [
  { id: 'TM-01', severity: 'W', title: 'state/team.md does not parse', description: 'One line per member: "- @login — Name · role: … · domains: …"; role and domains optional, each login once' },
  { id: 'TM-02', severity: 'W', title: 'team mode without the team git flow', description: 'D-114/D-115: in team mode every agent commits and pushes after each unit (auto-commit=on) and follows git-flow=team; without them clones drift apart' },
  { id: 'TM-03', severity: 'W', title: 'team mode without the findings channel', description: 'D-114: a team workspace records friction with Truss as TF-NNN in state/truss-findings.md; the AGENTS.md §2 row for it is missing' },
  { id: 'TM-04', severity: 'W', title: 'state/links.md does not parse', description: 'Each "## <name>" link needs Repo:, Owner: @login and Holds:; requests read "- [ ] YYYY-MM-DD @login — text"; a request listed twice is the trace of a union merge' },
  { id: 'TM-05', severity: 'W', title: 'personal focus file breaks the current.md contract', description: 'state/current/<login>.md carries focus:, next: (at most 5) and blockers:, and <login> is a member of state/team.md' },
  { id: 'TM-06', severity: 'W', title: 'HT entry addressed to someone who is not a member', description: 'D-120: "For: @login" names a member of state/team.md' },
]

/**
 * @param {import('../lib/workspace.mjs').WorkspaceContext} ctx
 * @returns {Promise<Array>}
 */
export async function run(ctx) {
  const findings = []

  // ── TM-04: links.md, in or out of team mode ─────────────────────────────
  const links = ctx.files.get(LINKS_FILE)
  let linkLogins = []
  if (links) {
    const parsed = parseLinksFile(links.lines)
    for (const p of parsed.problems) {
      findings.push({
        id: 'TM-04', severity: 'W', file: LINKS_FILE, line: p.line,
        message: p.message,
        fix: 'Shape per link: "## <name>", then "Repo: …", "Owner: @login", "Holds: …", "### Requests" with "- [ ] YYYY-MM-DD @login — text", "### Notes" (.truss/docs/team.md).',
      })
    }
    linkLogins = parsed.links.flatMap(l => [
      ...(l.owner ? [{ login: l.owner.replace(/^@/, ''), line: l.line, what: `owner of "${l.name}"` }] : []),
      ...l.requests.map(r => ({ login: r.login, line: r.line, what: `request in "${l.name}"` })),
    ])
  }

  if (!isTeamMode(ctx)) return findings

  // ── TM-01: team.md ──────────────────────────────────────────────────────
  const team = parseTeam(ctx.files.get(TEAM_FILE).lines)
  for (const p of team.problems) {
    findings.push({
      id: 'TM-01', severity: 'W', file: TEAM_FILE, line: p.line,
      message: p.message,
      fix: 'Write one line per member: "- @login — Name · role: … · domains: a, b" (role and domains are optional).',
    })
  }
  if (team.members.length === 0 && team.problems.length === 0) {
    findings.push({
      id: 'TM-01', severity: 'W', file: TEAM_FILE,
      message: 'state/team.md lists no member — team mode is on, but nobody is in the team',
      fix: 'Add a line per member: "- @login — Name · role: … · domains: …", or delete state/team.md to leave team mode.',
    })
  }
  const members = team.members

  // ── TM-02: the team git flow ────────────────────────────────────────────
  const prefs = new Map(parsePrefsRows(ctx.blocks?.get('preferences')?.innerLines ?? []).map(r => [r.key, r.value]))
  const wrong = []
  if (prefs.get('auto-commit') !== 'on') wrong.push(`auto-commit=${prefs.get('auto-commit') ?? '(unset)'}`)
  if (prefs.get('git-flow') !== 'team') wrong.push(`git-flow=${prefs.get('git-flow') ?? '(unset)'}`)
  if (wrong.length) {
    findings.push({
      id: 'TM-02', severity: 'W', file: 'AGENTS.md',
      message: `team mode needs auto-commit=on and git-flow=team; found ${wrong.join(', ')} — clones on different machines drift apart`,
      fix: 'node .truss/bin/truss.mjs set auto-commit on && node .truss/bin/truss.mjs set git-flow team',
    })
  }

  // ── TM-03: findings channel ─────────────────────────────────────────────
  const agents = ctx.files.get('AGENTS.md')
  if (agents && !agents.lines.some(l => l.includes(FINDINGS_FILE))) {
    findings.push({
      id: 'TM-03', severity: 'W', file: 'AGENTS.md',
      message: `team mode needs the findings channel — AGENTS.md §2 has no row for ${FINDINGS_FILE}`,
      fix: `Restore the §2 row for ${FINDINGS_FILE} from .truss/baseline/AGENTS.md (and the TF-NNN id in §3).`,
    })
  }

  if (members.length === 0) return findings

  // ── TM-04 (team half): logins in links.md belong to the team ────────────
  for (const l of linkLogins) {
    if (findMember(members, l.login)) continue
    findings.push({
      id: 'TM-04', severity: 'W', file: LINKS_FILE, line: l.line,
      message: `@${l.login} (${l.what}) is not a member of ${TEAM_FILE}`,
      fix: `Add @${l.login} to ${TEAM_FILE}, or correct the login.`,
    })
  }

  // ── TM-05: personal focus files ─────────────────────────────────────────
  for (const [rel, f] of ctx.files) {
    if (!rel.startsWith(FOCUS_DIR) || !rel.endsWith('.md')) continue
    const login = rel.slice(FOCUS_DIR.length, -3)
    if (login.includes('/')) continue
    if (!findMember(members, login)) {
      findings.push({
        id: 'TM-05', severity: 'W', file: rel,
        message: `${rel} belongs to @${login}, who is not a member of ${TEAM_FILE}`,
        fix: `Rename it to the member's login (lower case), or add @${login} to ${TEAM_FILE}.`,
      })
    }
    for (const problem of focusFileProblems(f.lines)) {
      findings.push({
        id: 'TM-05', severity: 'W', file: rel,
        message: `${rel}: ${problem}`,
        fix: 'Same contract as state/current.md: focus:, next: (at most 5 entries), blockers:.',
      })
    }
  }

  // ── TM-06: HT addressees ────────────────────────────────────────────────
  const cls = classById(ctx.schema?.classes, 'HT')
  const ht = cls ? fileForClass(ctx, cls) : null
  if (ht) {
    for (const [, a] of htAddressees(ht.lines, cls.id)) {
      if (findMember(members, a.login)) continue
      findings.push({
        id: 'TM-06', severity: 'W', file: ht.relPath, line: a.line,
        message: `HT entry is addressed to @${a.login}, who is not a member of ${TEAM_FILE}`,
        fix: `Correct the login, add @${a.login} to ${TEAM_FILE}, or drop "For:" so the entry is for everyone.`,
      })
    }
  }

  return findings
}
