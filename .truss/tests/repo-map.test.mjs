import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

import { runInit } from '../lib/commands/init.mjs'
import {
  buildRepoMap,
  REPO_MAP_LIMITS,
  RepoMapError,
} from '../lib/commands/repo-map.mjs'
import { makeRoot } from './helpers.mjs'

async function configuredRoot(tag = 'truss-repo-map-') {
  const root = await makeRoot(tag)
  const code = path.join(root, 'product')
  await fs.mkdir(path.join(code, 'src', 'nested'), { recursive: true })
  await fs.writeFile(path.join(code, 'README.md'), '# Product\n')
  await fs.writeFile(path.join(code, 'src', 'index.js'), 'export {}\n')
  await fs.writeFile(path.join(code, 'src', 'ignored.js'), 'secret\n')
  await fs.writeFile(path.join(code, 'src', 'nested', 'deep.js'), 'deep\n')
  await fs.writeFile(path.join(code, '.gitignore'), 'src/ignored.js\n')
  await runInit(root, [
    '--name', 'Product', '--lang', 'English', '--overlay',
    '--code-root', 'product',
  ])
  return { root, code }
}

describe('repo-map', () => {
  it('prints a bounded deterministic map and honors both ignore layers', async () => {
    const { root } = await configuredRoot()
    await fs.writeFile(path.join(root, '.trussignore'), 'product/src/nested/\n')

    const output = await buildRepoMap(root)
    assert.match(output, /^Code root: product\//)
    assert.match(output, /F  README\.md/)
    assert.match(output, /F  src\/index\.js/)
    assert.doesNotMatch(output, /ignored\.js/)
    assert.doesNotMatch(output, /deep\.js/)
    assert.ok(output.split('\n').length <= REPO_MAP_LIMITS.lines)
  })

  it('truncates large trees at the hard output bound', async () => {
    const { root, code } = await configuredRoot('truss-repo-map-large-')
    await fs.mkdir(path.join(code, 'many'), { recursive: true })
    await Promise.all(
      Array.from({ length: REPO_MAP_LIMITS.lines + 25 }, (_, i) =>
        fs.writeFile(path.join(code, 'many', `file-${String(i).padStart(3, '0')}.js`), 'x\n'),
      ),
    )

    const output = await buildRepoMap(root)
    assert.ok(output.split('\n').length <= REPO_MAP_LIMITS.lines)
    assert.match(output, /\(truncated\)$/)
  })

  it('fails clearly without a configured code root', async () => {
    const root = await makeRoot('truss-repo-map-none-')
    await runInit(root, ['--name', 'Core', '--lang', 'English'])
    await assert.rejects(buildRepoMap(root), RepoMapError)
  })
})
