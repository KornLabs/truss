// lib/commands/repo-map.mjs — bounded, read-only code-root orientation.

import fs from 'node:fs/promises'
import path from 'node:path'
import { resolveCodeRoot } from '../code-root.mjs'
import { loadIgnore } from '../ignore.mjs'

export const REPO_MAP_LIMITS = Object.freeze({
  depth: 3,
  files: 500,
  lines: 200,
})

export class RepoMapError extends Error {}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`
}

export async function buildRepoMap(root) {
  const codeRoot = await resolveCodeRoot(root)
  if (codeRoot.error) {
    throw new RepoMapError(`repo-map: invalid code-root — ${codeRoot.error}`)
  }
  if (!codeRoot.rel) {
    throw new RepoMapError(
      'repo-map: no code-root configured in state/profile.md',
    )
  }

  try {
    if (!(await fs.stat(codeRoot.abs)).isDirectory()) throw new Error()
  } catch {
    throw new RepoMapError(`repo-map: code-root directory not found: ${codeRoot.rel}/`)
  }

  // Parent .gitignore commonly hides an overlay root on purpose; apply only the
  // parent .trussignore here, then the code checkout's own ignore files.
  const workspaceIgnore = await loadIgnore(root, { respectGitignore: false })
  const checkoutIgnore = await loadIgnore(codeRoot.abs)
  const ignored = (rel, isDir) =>
    workspaceIgnore.isIgnored(`${codeRoot.rel}/${rel}`, isDir) ||
    checkoutIgnore.isIgnored(rel, isDir)

  const entries = []
  let filesSeen = 0
  let directoriesSeen = 0
  let fileLimitReached = false

  async function walk(relDir, depth) {
    if (fileLimitReached || depth > REPO_MAP_LIMITS.depth) return
    const absDir = relDir ? path.join(codeRoot.abs, ...relDir.split('/')) : codeRoot.abs
    let children
    try {
      children = await fs.readdir(absDir, { withFileTypes: true })
    } catch {
      return
    }
    children.sort((a, b) => a.name.localeCompare(b.name))

    for (const child of children) {
      if (fileLimitReached) break
      if (child.name === '.git' || child.name === 'node_modules') continue
      const rel = relDir ? `${relDir}/${child.name}` : child.name
      if (child.isDirectory()) {
        if (ignored(rel, true)) continue
        directoriesSeen++
        entries.push(`D  ${rel}/`)
        await walk(rel, depth + 1)
      } else if (child.isFile()) {
        if (ignored(rel, false)) continue
        filesSeen++
        if (filesSeen > REPO_MAP_LIMITS.files) {
          fileLimitReached = true
          break
        }
        const stat = await fs.stat(path.join(codeRoot.abs, ...rel.split('/')))
        entries.push(`F  ${rel}  ${formatBytes(stat.size)}`)
      }
    }
  }

  await walk('', 1)
  const header = [
    `Code root: ${codeRoot.rel}/`,
    `Limits: depth ${REPO_MAP_LIMITS.depth}, files ${REPO_MAP_LIMITS.files}, lines ${REPO_MAP_LIMITS.lines}`,
    '',
  ]
  const summarySlots = 2
  const available = REPO_MAP_LIMITS.lines - header.length - summarySlots
  const shown = entries.slice(0, available)
  const outputLimited = entries.length > shown.length
  const summary = [
    '',
    `Summary: ${directoriesSeen} directories, ${Math.min(filesSeen, REPO_MAP_LIMITS.files)} files` +
      `${fileLimitReached || outputLimited ? ' (truncated)' : ''}`,
  ]
  return [...header, ...shown, ...summary].join('\n')
}

export async function runRepoMap(root, argv = []) {
  if (argv.length > 0) {
    throw new RepoMapError('repo-map: no flags are supported')
  }
  const output = await buildRepoMap(root)
  console.log(output)
  return output
}
