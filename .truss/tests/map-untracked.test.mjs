// tests/map-untracked.test.mjs — `truss map` names the untracked files it mapped.
//
// The walk reads the working tree, so a file another session is still writing
// enters the map the moment it exists; committed like that, the map points at a
// path the repository does not have (TF-001). The map itself is right — the
// file IS there — but `map` has to say what it took.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

import { makeRoot } from './helpers.mjs'
import { runInit } from '../lib/commands/init.mjs'
import { runMap } from '../lib/commands/map.mjs'

const capture = async (fn) => {
  const out = []
  const orig = console.log
  console.log = (...a) => out.push(a.join(' '))
  try { await fn() } finally { console.log = orig }
  return out.join('\n')
}

const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { stdio: 'pipe' }).toString()

describe('truss map and untracked files', () => {
  it('names a mapped file git does not track yet, and stays quiet once it is committed', async () => {
    const root = await makeRoot('truss-map-untracked-')
    const env = process.env.TRUSS_NO_GIT
    delete process.env.TRUSS_NO_GIT
    try {
      await runInit(root, ['--name', 'Map', '--lang', 'English'])
      git(root, 'init', '-q')
      git(root, '-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A')
      git(root, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'init')

      await fs.mkdir(path.join(root, 'context'), { recursive: true })
      await fs.writeFile(path.join(root, 'context', 'laufzeit.md'), '# Laufzeit\n\nstill being written by someone\n')

      const first = await capture(() => runMap(root, []))
      assert.match(first, /1 mapped file is not tracked by git yet: context\/laufzeit\.md/)
      assert.match(first, /leave the map to that session/)

      git(root, '-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A')
      git(root, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'laufzeit')
      const second = await capture(() => runMap(root, []))
      assert.doesNotMatch(second, /not tracked by git/)
    } finally {
      if (env !== undefined) process.env.TRUSS_NO_GIT = env
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('says nothing about tracking outside a git checkout', async () => {
    const root = await makeRoot('truss-map-nogit-')
    try {
      await runInit(root, ['--name', 'Map', '--lang', 'English'])
      const out = await capture(() => runMap(root, []))
      assert.match(out, /successfully generated/)
      assert.doesNotMatch(out, /tracked by git/)
    } finally { await fs.rm(root, { recursive: true, force: true }) }
  })
})
