import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { applyTree } from '../lib/scaffold.mjs'
import { buildExcludes, CORE_GROUPS, discoverGroups, droppedSelectedGroups, readSelectedGroups, SKILL_SELECTION_REL } from '../lib/skill-groups.mjs'
import { runSkills } from '../lib/commands/skills.mjs'
import { runInit } from '../lib/commands/init.mjs'
import { makeRoot, exists, runChecks, ENGINE_DIR } from './helpers.mjs'

const execFileP = promisify(execFile)

async function runCli(root, args) {
  try {
    const { stdout, stderr } = await execFileP(
      process.execPath,
      [path.join(root, '.truss', 'bin', 'truss.mjs'), ...args],
      { cwd: root, env: { ...process.env, TRUSS_NO_GIT: '1' } },
    )
    return { code: 0, stdout, stderr }
  } catch (err) {
    return { code: err.code ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' }
  }
}

// Groups discovered from a small synthetic baseline built fresh per test —
// exercising the grouping/exclude LOGIC must not depend on the exact names
// or counts of the shipped 83-skill catalog (that coupling turned a content
// change to the baseline into a broken logic test).
async function buildSyntheticBaseline() {
  const baselineDir = await fs.mkdtemp(path.join(os.tmpdir(), 'truss-skill-groups-baseline-'))
  const skillsDir = path.join(baselineDir, '.claude', 'skills')
  const agentsDir = path.join(baselineDir, '.claude', 'agents')
  await fs.mkdir(skillsDir, { recursive: true })
  await fs.mkdir(agentsDir, { recursive: true })

  // 'alpha' group: shared prefix across both a skill pair and an agent.
  for (const name of ['alpha-one', 'alpha-two']) {
    await fs.mkdir(path.join(skillsDir, name), { recursive: true })
    await fs.writeFile(path.join(skillsDir, name, 'SKILL.md'), `# ${name}\n`)
  }
  await fs.writeFile(path.join(agentsDir, 'alpha-helper.md'), '# alpha-helper\n')

  // 'zeta' group: agents-only, still grouped by shared prefix.
  for (const name of ['zeta-one.md', 'zeta-two.md']) {
    await fs.writeFile(path.join(agentsDir, name), `# ${name}\n`)
  }

  // A lone prefix is a group of its own (D-126); only a dash-free name lands in misc.
  await fs.mkdir(path.join(skillsDir, 'solo-skill'), { recursive: true })
  await fs.writeFile(path.join(skillsDir, 'solo-skill', 'SKILL.md'), '# solo-skill\n')
  await fs.mkdir(path.join(skillsDir, 'nodash'), { recursive: true })
  await fs.writeFile(path.join(skillsDir, 'nodash', 'SKILL.md'), '# nodash\n')

  return baselineDir
}

describe('skill groups', () => {
  it('groups assets by name prefix, adds the plugin groups, sorted alphabetically', async () => {
    const baselineDir = await buildSyntheticBaseline()
    const groups = await discoverGroups(baselineDir)

    assert.deepEqual([...groups.keys()], ['alpha', 'design', 'misc', 'solo', 'superpowers', 'zeta'])
    assert.deepEqual(groups.get('alpha').skills, ['alpha-one', 'alpha-two'])
    assert.deepEqual(groups.get('alpha').agents, ['alpha-helper.md'])
    assert.deepEqual(groups.get('zeta').skills, [])
    assert.deepEqual(groups.get('zeta').agents, ['zeta-one.md', 'zeta-two.md'])
    assert.deepEqual(groups.get('solo').skills, ['solo-skill'])
    assert.deepEqual(groups.get('misc').skills, ['nodash'])
    assert.deepEqual(groups.get('design').skills, [])
    assert.equal(groups.get('design').plugin.key, 'impeccable@impeccable')
  })

  it('builds excludes for every unselected skill and agent path', async () => {
    const baselineDir = await buildSyntheticBaseline()
    const groups = await discoverGroups(baselineDir)
    const excludes = buildExcludes(groups, new Set(['alpha']))

    assert.equal(excludes.has('.claude/skills/solo-skill'), true)
    assert.equal(buildExcludes(groups, new Set(['alpha']), { 'alpha-two': 'x' }).has('.claude/skills/alpha-two'), true,
      'a skill skipped for a global copy is excluded even inside a selected group')
    assert.equal(excludes.has('.claude/skills/nodash'), true)
    assert.equal(excludes.has('.claude/agents/zeta-one.md'), true)
    assert.equal(excludes.has('.claude/agents/zeta-two.md'), true)
    assert.equal(excludes.has('.claude/skills/alpha-one'), false)
    assert.equal(excludes.has('.claude/skills/alpha-two'), false)
    assert.equal(excludes.has('.claude/agents/alpha-helper.md'), false)
  })

  // Cheap smoke test against the REAL shipped baseline: structure only, no
  // exact names or counts (those belong to baseline content, not this logic).
  it('discovers at least one group with at least one asset in the shipped baseline', async () => {
    const root = await makeRoot('truss-skill-groups-smoke-')
    const groups = await discoverGroups(path.join(root, '.truss', 'baseline'))

    assert.ok(groups.size >= 1, 'expected the shipped baseline to discover at least one group')
    for (const [group, assets] of groups) {
      assert.ok(
        assets.plugin || assets.skills.length + assets.agents.length > 0,
        `group '${group}' should have at least one skill or agent, or be a plugin group`,
      )
    }
    for (const core of CORE_GROUPS) assert.ok(groups.has(core), `core group '${core}' must ship`)
  })
})

describe('applyTree exclusion', () => {
  it('skips excluded source prefixes', async () => {
    const source = await fs.mkdtemp(path.join(os.tmpdir(), 'truss-tree-source-'))
    const destination = await fs.mkdtemp(path.join(os.tmpdir(), 'truss-tree-destination-'))
    await fs.mkdir(path.join(source, 'include'), { recursive: true })
    await fs.mkdir(path.join(source, 'exclude', 'nested'), { recursive: true })
    await fs.writeFile(path.join(source, 'include', 'kept.txt'), 'kept')
    await fs.writeFile(path.join(source, 'exclude', 'nested', 'skipped.txt'), 'skipped')

    await applyTree(source, destination, { exclude: new Set(['exclude']) })

    assert.equal(await fs.readFile(path.join(destination, 'include', 'kept.txt'), 'utf8'), 'kept')
    await assert.rejects(fs.access(path.join(destination, 'exclude', 'nested', 'skipped.txt')))
  })
})

describe('skills command', () => {
  it('is available through the CLI after a skills-none init', async () => {
    const root = await makeRoot('truss-skills-cli-')
    const initialized = await runCli(root, [
      'init', '--name', 'CLI skills', '--lang', 'English', '--skills', 'none',
    ])
    assert.equal(initialized.code, 0)

    const listed = await runCli(root, ['skills', 'list'])
    assert.equal(listed.code, 0)
    assert.match(listed.stdout, /Group\s+Skills\s+Kind\s+Installed/)
    assert.match(listed.stdout, /code\s+4\s+opt-in\s+—/)
    assert.match(listed.stdout, /superpowers\s+—\s+plugin\s+—/)

    const help = await runCli(root, ['skills', 'list', '--help'])
    assert.equal(help.code, 0)
    assert.match(help.stdout, /truss skills <list\|add\|remove> \[group\]/)
  })

  it('lists, adds, and removes only the selected baseline group', async () => {
    const root = await makeRoot('truss-skills-command-')
    await runInit(root, ['--name', 'Skills', '--lang', 'English', '--skills', 'none'])

    const before = await runSkills(root, ['list'])
    assert.equal(before.find(row => row.group === 'code').installed, false)

    await runSkills(root, ['add', 'code'])
    assert.equal(await exists(root, '.claude/skills/code-api-design/SKILL.md'), true)
    assert.equal(await exists(root, '.claude/skills/marketing-ads/SKILL.md'), false)
    assert.deepEqual(
      JSON.parse(await fs.readFile(path.join(root, '.claude', '.truss-skills.json'), 'utf8')),
      { groups: ['code'] },
    )

    const after = await runSkills(root, ['list'])
    assert.equal(after.find(row => row.group === 'code').installed, true)

    await runSkills(root, ['remove', 'code'])
    assert.equal(await exists(root, '.claude/skills/code-api-design'), false)
    assert.equal(await exists(root, '.claude', 'SOURCES.md'), true)
  })

  it('preserves pre-existing or modified assets when removing a group', async () => {
    const root = await makeRoot('truss-skills-preserve-')
    await runInit(root, ['--name', 'Preserve', '--lang', 'English', '--skills', 'none'])
    const custom = path.join(root, '.claude', 'skills', 'code-api-design', 'SKILL.md')
    await fs.mkdir(path.dirname(custom), { recursive: true })
    await fs.writeFile(custom, '# Custom skill\n')

    await runSkills(root, ['add', 'code'])
    const modifiedSkill = path.join(root, '.claude', 'skills', 'code-changelog-generator', 'SKILL.md')
    await fs.appendFile(modifiedSkill, '\nCustom addition.\n')

    const result = await runSkills(root, ['remove', 'code'])
    assert.equal(result.preserved.length, 2)
    assert.equal(await exists(root, '.claude/skills/code-changelog-generator'), true)
    assert.equal(await fs.readFile(custom, 'utf8'), '# Custom skill\n')
  })
})

// ── A selection naming a group the baseline no longer has ────────────────────
// readSelectedGroups drops such a name on purpose: a renamed group must not turn
// an upgrade into an error. But dropping it silently leaves the adopter with old
// skills "kept as yours" and no hint where their successor went — observed after
// D-102 folded a `misc` singleton into the `slop` group. The report reads this.
describe('droppedSelectedGroups', () => {
  const groupsWith = (...names) => new Map(names.map(n => [n, { skills: [], agents: [] }]))

  async function withSelection(json, fn) {
    const root = await makeRoot('truss-stale-groups-')
    try {
      await fs.mkdir(path.join(root, '.claude'), { recursive: true })
      await fs.writeFile(path.join(root, SKILL_SELECTION_REL), json)
      await fn(root)
    } finally { await fs.rm(root, { recursive: true, force: true }) }
  }

  it('names the groups that are gone, and only those', async () => {
    await withSelection('{"groups":["misc","slop","gone-too"]}\n', async (root) => {
      const groups = groupsWith('slop', 'marketing')
      assert.deepEqual(await droppedSelectedGroups(root, groups), ['misc', 'gone-too'])
      // The reader used for the actual install must still silently keep the rest.
      assert.deepEqual([...await readSelectedGroups(root, groups)], ['slop'])
    })
  })

  it('says nothing when every selected group still exists', async () => {
    await withSelection('{"groups":["slop"]}\n', async (root) => {
      assert.deepEqual(await droppedSelectedGroups(root, groupsWith('slop')), [])
    })
  })

  it('reports nothing rather than throwing on a missing or unreadable selection', async () => {
    // This runs inside `upgrade`, whose job is to finish. A selection file that
    // is absent (all groups enabled) or corrupt must not abort the report — the
    // strict reader already raises for the corrupt case where it matters.
    const root = await makeRoot('truss-stale-groups-none-')
    try {
      assert.deepEqual(await droppedSelectedGroups(root, groupsWith('slop')), [])
      await fs.mkdir(path.join(root, '.claude'), { recursive: true })
      await fs.writeFile(path.join(root, SKILL_SELECTION_REL), 'not json at all')
      assert.deepEqual(await droppedSelectedGroups(root, groupsWith('slop')), [])
    } finally { await fs.rm(root, { recursive: true, force: true }) }
  })
})

// ── Plugin groups (D-126): a switch in .claude/settings.json, no files ───────
describe('plugin groups', () => {
  it('enables and disables the plugin without touching the rest of settings.json', async () => {
    const root = await makeRoot('truss-skills-plugin-')
    await runInit(root, ['--name', 'Plugin', '--lang', 'English', '--skills', 'none'])
    const settingsPath = path.join(root, '.claude', 'settings.json')
    await fs.writeFile(settingsPath, `${JSON.stringify({ model: 'opus', enabledPlugins: { 'other@elsewhere': true } }, null, 2)}\n`)

    await runSkills(root, ['add', 'superpowers'])
    let settings = JSON.parse(await fs.readFile(settingsPath, 'utf8'))
    assert.equal(settings.model, 'opus')
    assert.equal(settings.enabledPlugins['other@elsewhere'], true)
    assert.equal(settings.enabledPlugins['superpowers@superpowers-marketplace'], true)
    assert.deepEqual(settings.extraKnownMarketplaces['superpowers-marketplace'],
      { source: { source: 'github', repo: 'obra/superpowers-marketplace' } })
    assert.equal(await exists(root, '.claude/skills'), false, 'a plugin group copies nothing')
    assert.equal((await runSkills(root, ['list'])).find(row => row.group === 'superpowers').installed, true)

    await runSkills(root, ['remove', 'superpowers'])
    settings = JSON.parse(await fs.readFile(settingsPath, 'utf8'))
    assert.deepEqual(settings, { model: 'opus', enabledPlugins: { 'other@elsewhere': true } })
  })

  it('removes a settings.json it leaves empty, and refuses to rewrite one that is not JSON', async () => {
    const root = await makeRoot('truss-skills-plugin-empty-')
    await runInit(root, ['--name', 'Plugin', '--lang', 'English', '--skills', 'none'])
    await runSkills(root, ['add', 'design'])
    assert.equal(await exists(root, '.claude/settings.json'), true)
    await runSkills(root, ['remove', 'design'])
    assert.equal(await exists(root, '.claude/settings.json'), false)

    await fs.writeFile(path.join(root, '.claude', 'settings.json'), '{ not json')
    await assert.rejects(runSkills(root, ['add', 'design']), /not valid JSON/)
    assert.equal(await fs.readFile(path.join(root, '.claude', 'settings.json'), 'utf8'), '{ not json')
  })
})

// ── Skills the user already has globally (D-127) ─────────────────────────────
describe('global skills', () => {
  async function withGlobal(fn) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'truss-global-claude-'))
    const real = await fs.mkdtemp(path.join(os.tmpdir(), 'truss-global-real-'))
    // Linked in from a clone, the way a personal skill repo installs it: no
    // source header, a different version, reached through a symlink.
    const description = (await fs.readFile(path.join(ENGINE_DIR, 'baseline', '.claude', 'skills', 'code-api-design', 'SKILL.md'), 'utf8'))
      .match(/^description: (.*)$/m)[1]
    await fs.mkdir(path.join(real, 'api-design'))
    await fs.writeFile(path.join(real, 'api-design', 'SKILL.md'), `---\nname: api-design\ndescription: ${description}\n---\nother body\n`)
    // Same upstream name as code-changelog-generator, different description: not the same skill.
    await fs.mkdir(path.join(real, 'changelog-generator'))
    await fs.writeFile(path.join(real, 'changelog-generator', 'SKILL.md'), '---\nname: changelog-generator\ndescription: my own\n---\nx\n')
    await fs.mkdir(path.join(dir, 'skills'), { recursive: true })
    await fs.symlink(path.join(real, 'api-design'), path.join(dir, 'skills', 'api-design'))
    await fs.symlink(path.join(real, 'changelog-generator'), path.join(dir, 'skills', 'changelog-generator'))
    await fs.writeFile(path.join(dir, 'settings.json'), JSON.stringify({ enabledPlugins: { 'impeccable@impeccable': true } }))
    const saved = process.env.TRUSS_GLOBAL_CLAUDE_DIR
    process.env.TRUSS_GLOBAL_CLAUDE_DIR = dir
    try { await fn(dir) } finally { process.env.TRUSS_GLOBAL_CLAUDE_DIR = saved }
  }

  it('skips a global skill and plugin on add, and records the skill for upgrade', async () => {
    await withGlobal(async () => {
      const root = await makeRoot('truss-skills-global-')
      await runInit(root, ['--name', 'Global', '--lang', 'English', '--skills', 'none'])
      const added = await runSkills(root, ['add', 'code'])
      assert.deepEqual(added.global, { 'code-api-design': 'api-design' })
      assert.equal(await exists(root, '.claude/skills/code-api-design'), false)
      assert.equal(await exists(root, '.claude/skills/code-database-migrations/SKILL.md'), true)
      assert.deepEqual(JSON.parse(await fs.readFile(path.join(root, SKILL_SELECTION_REL), 'utf8')),
        { groups: ['code'], skippedGlobal: { 'code-api-design': 'api-design' } })
      assert.equal((await runSkills(root, ['list'])).find(row => row.group === 'code').installed, true)

      await runSkills(root, ['add', 'design'])
      assert.equal(await exists(root, '.claude/settings.json'), false, 'globally enabled plugin is not enabled twice')
      assert.equal((await runSkills(root, ['list'])).find(row => row.group === 'design').installed, true,
        'a plugin covered globally counts as installed, so upgrade does not nag about it')

      // --no-global-check installs it after all and drops the record.
      await runSkills(root, ['add', 'code', '--no-global-check'])
      assert.equal(await exists(root, '.claude/skills/code-api-design/SKILL.md'), true)
      assert.deepEqual(JSON.parse(await fs.readFile(path.join(root, SKILL_SELECTION_REL), 'utf8')), { groups: ['code', 'design'] })

      // doctor names the pair now that both exist.
      const findings = await runChecks(root)
      const st12 = findings.filter(f => f.id === 'ST-12')
      assert.equal(st12.length, 1)
      assert.equal(st12[0].file, '.claude/skills/code-api-design')
      assert.match(st12[0].fix, /rm -r \.claude\/skills\/code-api-design/)
    })
  })

  it('installs anyway in a team workspace and keeps doctor quiet there', async () => {
    await withGlobal(async () => {
      const root = await makeRoot('truss-skills-global-team-')
      await runInit(root, ['--name', 'Team', '--lang', 'English', '--skills', 'none'])
      await fs.writeFile(path.join(root, 'state', 'team.md'), '# Team\n')
      const added = await runSkills(root, ['add', 'code'])
      assert.deepEqual(added.global, {})
      assert.equal(await exists(root, '.claude/skills/code-api-design/SKILL.md'), true)
      await runSkills(root, ['add', 'design'])
      assert.equal(await exists(root, '.claude/settings.json'), true)
      assert.deepEqual((await runChecks(root)).filter(f => f.id === 'ST-12'), [], 'ST-12 is silent in team mode')
    })
  })

  it('reports a plugin enabled both here and globally as ST-12', async () => {
    await withGlobal(async () => {
      const root = await makeRoot('truss-skills-global-plugin-')
      await runInit(root, ['--name', 'Both', '--lang', 'English', '--skills', 'none'])
      await runSkills(root, ['add', 'design', '--no-global-check'])
      const st12 = (await runChecks(root)).filter(f => f.id === 'ST-12')
      assert.equal(st12.length, 1)
      assert.equal(st12[0].file, '.claude/settings.json')
    })
  })

  it('installs the skipped skills when the workspace becomes a team workspace', async () => {
    await withGlobal(async () => {
      const root = await makeRoot('truss-skills-global-to-team-')
      await runInit(root, ['--name', 'Later team', '--lang', 'English', '--skills', 'code'])
      assert.equal(await exists(root, '.claude/skills/code-api-design'), false)
      const { enableTeam } = await import('../lib/commands/team.mjs')
      const res = await enableTeam(root, { as: '@alex' })
      assert.equal(await exists(root, '.claude/skills/code-api-design/SKILL.md'), true)
      assert.match(res.notes.join('\n'), /code-api-design/)
      assert.deepEqual(JSON.parse(await fs.readFile(path.join(root, SKILL_SELECTION_REL), 'utf8')), { groups: ['code'] })
    })
  })
})
