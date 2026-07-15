import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import test from 'node:test'

import { runInit } from '../lib/commands/init.mjs'
import { runStatus } from '../lib/commands/status.mjs'
import { makeRoot } from './helpers.mjs'

test('status uses the configured project name instead of the folder name', async () => {
  const root = await makeRoot('truss-status-name-')
  const output = []
  const originalLog = console.log

  try {
    await runInit(root, ['--name', 'Truss Forge', '--lang', 'English'])
    console.log = (...args) => output.push(args.join(' '))
    await runStatus(root, [])
  } finally {
    console.log = originalLog
    await fs.rm(root, { recursive: true, force: true })
  }

  assert.match(output.join('\n'), /Truss Forge — truss status/)
})
