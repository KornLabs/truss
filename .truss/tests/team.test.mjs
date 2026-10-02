// tests/team.test.mjs — team mode (D-112–D-120) and the CI templates (D-116).

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

import { runInit, InitError } from '../lib/commands/init.mjs'
import { enableTeam, runTeam, TeamError, SECTION2_ROWS, SECTION6_ROW, GITATTRIBUTES_LINE } from '../lib/commands/team.mjs'
import { runCi, ciState, CiError } from '../lib/commands/ci.mjs'
import {
  parseTeam, parseLinksFile, focusFileProblems, htAddressees, normalizeLogin, focusFileFor, isTeamMode,
} from '../lib/team.mjs'
import { loadWorkspace } from '../lib/workspace.mjs'
import { parsePrefsRows } from '../lib/render.mjs'
import { CATALOG_KEYS } from '../lib/prefs.mjs'
import { makeRoot, runChecks, exists, read } from './helpers.mjs'

// Commands print a report; keep the test output readable.
const quiet = async (fn) => {
  const log = console.log
  console.log = () => {}
  try { return await fn() } finally { console.log = log }
}

const tm = (findings, id) => findings.filter(f => f.id === id)
const teamIds = (findings) => findings.filter(f => f.id.startsWith('TM-'))

async function teamRoot(tag = 'truss-team-') {
  const root = await makeRoot(tag)
  await quiet(() => runInit(root, ['--name', 'Team', '--lang', 'English', '--team', '--as', '@alex']))
  return root
}

const write = (root, rel, text) =>
  fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true })
    .then(() => fs.writeFile(path.join(root, rel), text))

describe('team parsers', () => {
  it('normalizeLogin accepts GitHub logins with or without @ and rejects the rest', () => {
    assert.equal(normalizeLogin('@alex-x'), 'alex-x')
    assert.equal(normalizeLogin(' sam '), 'sam')
    assert.equal(normalizeLogin('-bad'), null)
    assert.equal(normalizeLogin('two words'), null)
    assert.equal(normalizeLogin(''), null)
    assert.equal(focusFileFor('Alex'), 'state/current/alex.md')
  })

  it('parseTeam reads members, optional role and domains, and names bad lines', () => {
    const { members, problems } = parseTeam([
      '# Team',
      '- @alex — Alex Example · role: product, engineering · domains: backend, infra',
      '- @sam — Sam',
      '- @Alex — duplicate',
      '- @kim Kim without dash',
      '- @lee — Lee · title: boss',
      '```',
      '- @fenced — not a member',
      '```',
    ])
    assert.deepEqual(members.map(m => m.login), ['alex', 'sam', 'lee'])
    assert.equal(members[0].role, 'product, engineering')
    assert.deepEqual(members[0].domains, ['backend', 'infra'])
    assert.equal(members[1].role, null)
    assert.equal(problems.length, 3)
    assert.match(problems[0].message, /listed twice/)
    assert.match(problems[1].message, /does not parse/)
    assert.match(problems[2].message, /unknown field/)
  })

  it('parseLinksFile reads links and requests and reports missing fields, bad and doubled requests', () => {
    const { links, problems } = parseLinksFile([
      '# Links',
      '## backend',
      'Repo: github.com/acme/backend',
      'Owner: @alex',
      'Holds: the code',
      '### Requests',
      '- [ ] 2026-10-02 @sam — company field',
      '- [x] 2026-10-01 @sam — logo',
      '- [x] 2026-10-02 @sam — company field',
      '- [ ] no date',
      '### Notes',
      '- [ ] 2026-10-02 — a note with a checkbox is not a request',
      '## infra',
      'Owner: two people',
    ])
    assert.equal(links.length, 2)
    assert.equal(links[0].requests.length, 3)
    assert.equal(links[0].requests.filter(r => !r.done).length, 1)
    const msgs = problems.map(p => p.message).join('\n')
    assert.match(msgs, /does not parse/)
    assert.match(msgs, /listed twice/)
    assert.match(msgs, /"infra" is missing Repo:, Holds:/)
    assert.match(msgs, /Owner must be one GitHub login/)
  })

  it('parseLinksFile accepts a decorated Requests heading', () => {
    const { links } = parseLinksFile([
      '## b', 'Repo: x', 'Owner: @a', 'Holds: y', '### Requests (open first)', '- [ ] 2026-10-02 @a — z',
    ])
    assert.equal(links[0].requests.length, 1)
  })

  it('focusFileProblems applies the current.md contract', () => {
    assert.deepEqual(focusFileProblems(['focus: x', 'next:', '  - a', 'blockers: none']), [])
    assert.match(focusFileProblems(['focus: x'])[0], /missing required keys: next, blockers/)
    const six = ['focus: x', 'next:', ...Array.from({ length: 6 }, (_, i) => `  - ${i}`), 'blockers: none']
    assert.match(focusFileProblems(six)[0], /lists 6 entries \(limit 5\)/)
  })

  it('htAddressees finds For: in the indented body, plain or bold, and ignores fences', () => {
    const map = htAddressees([
      '- [ ] HT-001 — **One**',
      '',
      '  **For:** @sam',
      '',
      '- [ ] HT-002 — **Two**',
      '  For: @alex',
      '- [ ] HT-003 — **Three**',
      'For: @nobody',
      '```',
      '- [ ] HT-004 — **Fenced**',
      '  For: @ghost',
      '```',
    ])
    assert.equal(map.get(1).login, 'sam')
    assert.equal(map.get(5).login, 'alex')
    assert.equal(map.has(7), false)
    assert.equal(map.has(10), false)
  })
})

describe('init --team / team enable', () => {
  it('writes team.md, routes AGENTS.md, sets the team prefs and the union rule — and is clean', async () => {
    const root = await teamRoot()
    assert.match(await read(root, 'state/team.md'), /^- @alex — /m)
    const agents = await read(root, 'AGENTS.md')
    for (const row of SECTION2_ROWS) assert.ok(agents.includes(row), row)
    assert.ok(agents.includes(SECTION6_ROW))
    assert.match(agents, /^2\. `state\/current\.md`.*state\/current\//m)
    assert.ok((await read(root, '.gitattributes')).includes(GITATTRIBUTES_LINE))

    const ctx = await loadWorkspace(root)
    assert.ok(isTeamMode(ctx))
    const prefs = new Map(parsePrefsRows(ctx.blocks.get('preferences').innerLines).map(r => [r.key, r.value]))
    assert.equal(prefs.get('auto-commit'), 'on')
    assert.equal(prefs.get('git-flow'), 'team')

    const findings = await runChecks(root)
    assert.deepEqual(teamIds(findings), [])
    assert.deepEqual(findings.filter(f => f.severity !== 'I').map(f => f.id), [])
  })

  it('enable is idempotent: a second run changes no file', async () => {
    const root = await teamRoot()
    const before = await Promise.all(['AGENTS.md', 'state/team.md', '.gitattributes'].map(r => read(root, r)))
    await enableTeam(root, { as: '@alex' })
    const after = await Promise.all(['AGENTS.md', 'state/team.md', '.gitattributes'].map(r => read(root, r)))
    assert.deepEqual(after, before)
  })

  it('enable switches an existing solo workspace and keeps its team.md', async () => {
    const root = await makeRoot()
    await quiet(() => runInit(root, ['--name', 'Solo', '--lang', 'English']))
    await write(root, 'state/team.md', '# Team\n\n- @sam — Sam\n')
    await quiet(() => runTeam(root, ['enable', '--as', '@alex']))
    assert.equal(await read(root, 'state/team.md'), '# Team\n\n- @sam — Sam\n')
    assert.deepEqual(teamIds(await runChecks(root)), [])
  })

  it('keeps CRLF line endings in AGENTS.md', async () => {
    const root = await makeRoot()
    await quiet(() => runInit(root, ['--name', 'X', '--lang', 'English']))
    await write(root, 'AGENTS.md', (await read(root, 'AGENTS.md')).replace(/\r?\n/g, '\r\n'))
    await enableTeam(root, { as: 'alex' })
    const text = await read(root, 'AGENTS.md')
    // The lines enable adds carry the file's CRLF. (The generated preferences
    // block is rewritten by writeBlock, the same writer `truss set` uses.)
    for (const row of [...SECTION2_ROWS, SECTION6_ROW]) assert.ok(text.includes(row + '\r\n'), row)
    assert.match(text, /state\/current\/ — `truss status` names it\.\r\n/)
  })

  it('team enable --as without a value is an error, not a fallback', async () => {
    const root = await teamRoot()
    await assert.rejects(runTeam(root, ['enable', '--as']), /--as expects/)
    await assert.rejects(runTeam(root, ['enable', '--as', '--x']), /--as expects/)
  })

  it('a second enable with someone not in the team says so', async () => {
    const root = await teamRoot()
    const r = await enableTeam(root, { as: 'bob' })
    assert.deepEqual(r.created, [])
    assert.deepEqual(r.changed, [])
    assert.match(r.notes.join('\n'), /@bob is not in state\/team\.md/)
  })

  it('refuses --team with --findings off, and --as without --team', async () => {
    const root = await makeRoot()
    await assert.rejects(runInit(root, ['--name', 'X', '--lang', 'English', '--team', '--as', 'a', '--findings', 'off']), InitError)
    await assert.rejects(runInit(root, ['--name', 'X', '--lang', 'English', '--as', 'a']), InitError)
  })

  it('refuses --team without a known identity — before writing anything', async () => {
    const root = await makeRoot()
    const saved = process.env.TRUSS_USER
    delete process.env.TRUSS_USER
    try {
      await assert.rejects(runInit(root, ['--name', 'X', '--lang', 'English', '--team']), /cannot tell who you are/)
      assert.equal(await exists(root, 'AGENTS.md'), false)
    } finally {
      if (saved !== undefined) process.env.TRUSS_USER = saved
    }
  })

  it('picks the login from TRUSS_USER', async () => {
    const root = await makeRoot()
    process.env.TRUSS_USER = '@kim'
    try {
      await quiet(() => runInit(root, ['--name', 'X', '--lang', 'English', '--team']))
      assert.match(await read(root, 'state/team.md'), /^- @kim — /m)
    } finally { delete process.env.TRUSS_USER }
  })

  it('enable refuses a workspace without the findings channel', async () => {
    const root = await makeRoot()
    await quiet(() => runInit(root, ['--name', 'X', '--lang', 'English', '--findings', 'off']))
    await assert.rejects(enableTeam(root, { as: 'alex' }), TeamError)
    assert.equal(await exists(root, 'state/team.md'), false)
  })
})

describe('TM checks', () => {
  it('stay silent in a solo workspace', async () => {
    const root = await makeRoot()
    await quiet(() => runInit(root, ['--name', 'Solo', '--lang', 'English']))
    await write(root, 'state/current/ghost.md', 'focus: x\n')
    await write(root, 'HUMAN-TODOS.md', '# Human Todos\n\n- [ ] HT-001 — **x**\n\n  For: @ghost\n')
    assert.deepEqual(teamIds(await runChecks(root)), [])
  })

  it('TM-01 reports an empty team and a bad member line', async () => {
    const root = await teamRoot()
    await write(root, 'state/team.md', '# Team\n')
    assert.match(tm(await runChecks(root), 'TM-01')[0].message, /lists no member/)
    await write(root, 'state/team.md', '# Team\n\n- @alex Alex\n')
    assert.match(tm(await runChecks(root), 'TM-01')[0].message, /does not parse/)
  })

  it('TM-02 reports team mode without the team git flow', async () => {
    const root = await teamRoot()
    await quiet(() => runTeam(root, ['enable', '--as', 'alex']))
    const { writePrefRows } = await import('../lib/prefs-writer.mjs')
    await writePrefRows(root, [{ key: 'git-flow', row: null }])
    assert.match(tm(await runChecks(root), 'TM-02')[0].message, /git-flow=\(unset\)/)
  })

  it('TM-03 reports team mode without the findings channel', async () => {
    const root = await teamRoot()
    const agents = await read(root, 'AGENTS.md')
    await write(root, 'AGENTS.md', agents.split('\n').filter(l => !l.includes('state/truss-findings.md')).join('\n'))
    assert.equal(tm(await runChecks(root), 'TM-03').length, 1)
  })

  it('TM-04 reports a malformed links file and logins outside the team', async () => {
    const root = await teamRoot()
    await write(root, 'state/links.md', [
      '# Links', '', '## backend', 'Repo: x', 'Owner: @alex', 'Holds: code', '', '### Requests', '',
      '- [ ] 2026-10-02 @stranger — please', '- [ ] broken',
    ].join('\n') + '\n')
    const msgs = tm(await runChecks(root), 'TM-04').map(f => f.message).join('\n')
    assert.match(msgs, /does not parse/)
    assert.match(msgs, /@stranger \(request in "backend"\) is not a member/)
  })

  it('TM-05 checks personal focus files; TM-06 checks HT addressees', async () => {
    const root = await teamRoot()
    await write(root, 'state/current/alex.md', 'focus: x\nnext:\n  - a\nblockers: none\n')
    await write(root, 'state/current/zed.md', 'focus: y\n')
    await write(root, 'HUMAN-TODOS.md', '# Human Todos\n\n- [ ] HT-001 — **x**\n\n  For: @alex\n\n- [ ] HT-002 — **y**\n\n  For: @nobody\n')
    const findings = await runChecks(root)
    const tm5 = tm(findings, 'TM-05')
    assert.equal(tm5.length, 2)
    assert.ok(tm5.every(f => f.file === 'state/current/zed.md'))
    const tm6 = tm(findings, 'TM-06')
    assert.equal(tm6.length, 1)
    assert.match(tm6[0].message, /@nobody/)
  })
})

describe('truss ci', () => {
  it('adds, lists and removes the workflow templates without touching edited files', async () => {
    const root = await makeRoot()
    await quiet(() => runCi(root, ['add', 'doctor', 'merge']))
    assert.deepEqual((await ciState(root)).map(s => s.state), ['installed', 'installed'])
    const merge = await read(root, '.github/workflows/truss-merge.yml')
    assert.match(merge, /gh pr merge "\$PR" --squash/)
    // Review fixes: merge only on a printed report with exit 0/1, check the
    // merge ref (no head.sha), and never keep the write token in the checkout.
    assert.match(merge, /grep -q '\^truss doctor' doctor\.txt/)
    assert.match(merge, /steps\.doctor\.outputs\.code == '0' \|\| steps\.doctor\.outputs\.code == '1'/)
    assert.doesNotMatch(merge, /head\.sha/)
    assert.match(merge, /persist-credentials: false/)

    await write(root, '.github/workflows/truss-doctor.yml', 'edited\n')
    await quiet(() => runCi(root, ['remove', 'doctor', 'merge']))
    assert.equal(await read(root, '.github/workflows/truss-doctor.yml'), 'edited\n')
    assert.equal(await exists(root, '.github/workflows/truss-merge.yml'), false)
    await quiet(() => runCi(root, ['add', 'doctor']))
    assert.equal(await read(root, '.github/workflows/truss-doctor.yml'), 'edited\n')
  })

  it('treats a CRLF checkout of the template as installed', async () => {
    const root = await makeRoot()
    await quiet(() => runCi(root, ['add', 'doctor']))
    const p = '.github/workflows/truss-doctor.yml'
    await write(root, p, (await read(root, p)).replace(/\n/g, '\r\n'))
    assert.equal((await ciState(root))[0].state, 'installed')
  })

  it('rejects unknown workflow names and a missing name', async () => {
    const root = await makeRoot()
    await assert.rejects(runCi(root, ['add', 'deploy']), CiError)
    await assert.rejects(runCi(root, ['add']), CiError)
  })

  it('a workspace with the workflows installed stays clean', async () => {
    const root = await teamRoot()
    await quiet(() => runCi(root, ['add', 'doctor', 'merge']))
    assert.deepEqual((await runChecks(root)).filter(f => f.severity !== 'I').map(f => f.id), [])
  })
})

describe('git-flow preference', () => {
  it('is in the catalog with a behaviour text', async () => {
    assert.deepEqual([...CATALOG_KEYS.get('git-flow')], ['team'])
    const root = await makeRoot()
    const text = await read(root, '.truss/prefs/git-flow/team.md')
    assert.match(text, /git pull --rebase/)
  })
})
