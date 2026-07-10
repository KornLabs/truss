// checks/hy.mjs — Hygiene / archive-candidate check (HY-01)
//
// HY-01  I  a domain file has been untouched > 90 days (archive candidate).
//
// Scope: the real archive candidates are user-created domain files under
// context/. For migration, legacy root-level domain .md files are still nudged
// too. Nudging to archive AGENTS.md, the state layer or package.json would be
// nonsense — a file ST-01 requires to exist can never be an archive candidate.
//
// mtime-based: a fresh `git clone` resets mtimes, so HY-01 stays silent on new
// instances and only speaks up on genuinely long-lived ones. That is intended —
// HY-01 is a lifecycle hint, not an init check. (Per-file age has no git fallback:
// checks are pure file reads.)

import fs from 'node:fs/promises'
import path from 'node:path'

export const meta = [
  { id: 'HY-01', severity: 'I', title: 'archive candidate: context domain file untouched > 90 days', description: 'mtime-based and reset by a fresh clone, so it only fires on long-lived instances' },
]

const STALE_DAYS = 90
const DAY_MS = 86_400_000

// Legacy template/root files that are never archive candidates.
const TEMPLATE_ROOT_FILES = new Set([
  'AGENTS.md', 'README.md', 'VISION.md', 'HUMAN-TODOS.md',
  'CLAUDE.md', 'GEMINI.md', '.cursorrules', 'package.json', '.gitignore',
])

/**
 * @param {import('../lib/workspace.mjs').WorkspaceContext} ctx
 * @returns {Promise<Array>}
 */
export async function run(ctx) {
  const findings = []
  const now = Date.now()

  for (const rel of ctx.diskPaths) {
    if (rel.endsWith('/')) continue          // directories
    if (!rel.endsWith('.md')) continue        // domains are markdown
    const isCurrentDomain = rel.startsWith('context/')
    const isLegacyRootDomain = !rel.includes('/') && !rel.startsWith('.') && !TEMPLATE_ROOT_FILES.has(rel)
    if (!isCurrentDomain && !isLegacyRootDomain) continue

    let stat
    try { stat = await fs.stat(path.join(ctx.root, rel)) }
    catch { continue }

    const days = (now - stat.mtimeMs) / DAY_MS
    if (days > STALE_DAYS) {
      findings.push({
        id: 'HY-01', severity: 'I',
        file: rel,
        message: `${rel} untouched for ${Math.floor(days)} days (> ${STALE_DAYS}) — archive candidate`,
        fix: `If ${rel} is superseded, move it to archive/ with a one-line invalidation note; otherwise touch it or confirm it is still current.`,
      })
    }
  }

  return findings
}
