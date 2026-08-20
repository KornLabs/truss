import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { applyTree } from '../lib/scaffold.mjs'
import { buildExcludes, discoverGroups } from '../lib/skill-groups.mjs'
import { runSkills } from '../lib/commands/skills.mjs'
import { runInit } from '../lib/commands/init.mjs'
import { makeRoot, exists } from './helpers.mjs'

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

describe('skill groups', () => {
  it('discovers the baseline groups and their assets without a catalog', async () => {
    const root = await makeRoot('truss-skill-groups-')
    const groups = await discoverGroups(path.join(root, '.truss', 'baseline'))

    assert.deepEqual([...groups.keys()], [
      'anthropic', 'composio', 'context7', 'ecc', 'marketing', 'misc', 'superpowers', 'uiux',
    ])
    assert.equal(groups.get('superpowers').skills.length, 9)
    assert.equal(groups.get('marketing').skills.length, 40)
    assert.equal(groups.get('ecc').agents.length, 6)
    assert.deepEqual(groups.get('misc').skills, ['stop-slop'])
    assert.deepEqual(groups.get('misc').agents, ['code-reviewer.md'])
  })

  it('builds excludes for every unselected skill and agent path', async () => {
    const root = await makeRoot('truss-skill-excludes-')
    const groups = await discoverGroups(path.join(root, '.truss', 'baseline'))
    const excludes = buildExcludes(groups, new Set(['superpowers', 'ecc']))

    assert.equal(excludes.has('.claude/skills/marketing-seo-audit'), true)
    assert.equal(excludes.has('.claude/agents/anthropic-code-architect.md'), true)
    assert.equal(excludes.has('.claude/skills/superpowers-brainstorming'), false)
    assert.equal(excludes.has('.claude/agents/ecc-architect.md'), false)
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
    assert.match(listed.stdout, /Group\s+Skills\s+Agents\s+Installed/)
    assert.match(listed.stdout, /context7\s+4\s+1\s+—/)

    const help = await runCli(root, ['skills', 'list', '--help'])
    assert.equal(help.code, 0)
    assert.match(help.stdout, /truss skills <list\|add\|remove> \[group\]/)
  })

  it('lists, adds, and removes only the selected baseline group', async () => {
    const root = await makeRoot('truss-skills-command-')
    await runInit(root, ['--name', 'Skills', '--lang', 'English', '--skills', 'none'])

    const before = await runSkills(root, ['list'])
    assert.equal(before.find(row => row.group === 'context7').installed, false)

    await runSkills(root, ['add', 'context7'])
    assert.equal(await exists(root, '.claude/skills/context7-context7-cli/SKILL.md'), true)
    assert.equal(await exists(root, '.claude/agents/context7-docs-researcher.md'), true)
    assert.equal(await exists(root, '.claude/skills/ecc-api-design/SKILL.md'), false)
    assert.deepEqual(
      JSON.parse(await fs.readFile(path.join(root, '.claude', '.truss-skills.json'), 'utf8')),
      { groups: ['context7'] },
    )

    const after = await runSkills(root, ['list'])
    assert.equal(after.find(row => row.group === 'context7').installed, true)

    await runSkills(root, ['remove', 'context7'])
    assert.equal(await exists(root, '.claude/skills/context7-context7-cli'), false)
    assert.equal(await exists(root, '.claude/agents/context7-docs-researcher.md'), false)
    assert.equal(await exists(root, '.claude', 'SOURCES.md'), true)
  })

  it('preserves pre-existing or modified assets when removing a group', async () => {
    const root = await makeRoot('truss-skills-preserve-')
    await runInit(root, ['--name', 'Preserve', '--lang', 'English', '--skills', 'none'])
    const customAgent = path.join(root, '.claude', 'agents', 'context7-docs-researcher.md')
    await fs.mkdir(path.dirname(customAgent), { recursive: true })
    await fs.writeFile(customAgent, '# Custom agent\n')

    await runSkills(root, ['add', 'context7'])
    const modifiedSkill = path.join(
      root, '.claude', 'skills', 'context7-context7-cli', 'SKILL.md',
    )
    await fs.appendFile(modifiedSkill, '\nCustom addition.\n')

    const result = await runSkills(root, ['remove', 'context7'])
    assert.equal(result.preserved.length, 2)
    assert.equal(await exists(root, '.claude/skills/context7-context7-cli'), true)
    assert.equal(await fs.readFile(customAgent, 'utf8'), '# Custom agent\n')
  })
})
