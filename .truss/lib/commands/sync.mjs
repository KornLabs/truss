// lib/commands/sync.mjs — truss sync [--no-push]
//
// One command for the git chores a team clone needs (D-125): fetch, rebase the
// local commits onto the upstream, regenerate the generated files where both
// sides touched them, push. The agent runs it at session start, after every
// commit and before it reports done — the people in a team workspace should
// never have to think about git.
//
// What sync does NOT do:
//   • commit — what to commit, and under which message, stays the agent's
//     call (`git commit -- <paths>`); uncommitted work is carried through the
//     rebase (--autostash) and reported, never committed behind its back;
//   • resolve a conflict in a file people write — it stops with the rebase in
//     progress, names the files, and continues when run again after the agent
//     resolved and `git add`-ed them.
//
// Exit codes: 0 in sync · 1 needs attention (conflict, offline, push refused)
// · 2 not usable here (no git, no repository).

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'
import { generateMapContent } from './map.mjs'
import { syncState } from '../team.mjs'

const execFileP = promisify(execFile)

export class SyncError extends Error {}

// Files the engine writes from other files. A conflict in one of them is never
// a disagreement between people: regenerating it from the merged sources is
// the resolution. AGENTS.md is not here — its prefs block is a source, and its
// phase block only changes when state/phases.md does (then that file conflicts
// too, and that one is a real conflict).
export const GENERATED = ['state/map.md', 'state/decisions-index.md']

const MAX_ROUNDS = 3   // fetch → rebase → push, again when a push races another

/**
 * @param {string} root
 * @param {string[]} argv
 * @returns {Promise<void>} sets process.exitCode to 1 when attention is needed
 */
export async function runSync(root, argv) {
  let push = true
  for (const a of argv) {
    if (a === '--no-push') push = false
    else throw new SyncError(`truss sync: unknown argument '${a}'`)
  }
  const r = await syncWorkspace(root, { push })
  printReport(r)
  if (r.attention) process.exitCode = 1
}

/**
 * The whole sync, without printing. Exported for tests.
 * @returns {Promise<{attention:boolean, inSync:boolean, lines:string[], incoming:number, pushed:number, regenerated:string[], conflicts:string[]}>}
 */
export async function syncWorkspace(root, { push = true } = {}) {
  if (process.env.TRUSS_NO_GIT) throw new SyncError('truss sync: git is disabled (TRUSS_NO_GIT).')
  const inside = await git(root, ['rev-parse', '--is-inside-work-tree'])
  if (!inside.ok) throw new SyncError('truss sync: this is not a git checkout — nothing to sync.')

  const out = { attention: false, inSync: false, lines: [], incoming: 0, pushed: 0, regenerated: [], conflicts: [] }
  const note = (s) => out.lines.push(s)
  const stop = (s) => { out.attention = true; note(s); return out }
  const stashBefore = await stashRef(root)
  let integrated = false   // upstream commits were rebased in during THIS run (or a resumed one)

  // A rebase left open by an earlier sync (or by hand): finish it first.
  let st = await syncState(root)
  if (st?.rebasing) {
    if (!(await continueRebase(root, out))) return out
    if (await afterRebase(root, out, stashBefore)) return out
    integrated = true
    st = await syncState(root)
  }

  if (await gitPathExists(root, 'MERGE_HEAD')) {
    return stop('a merge is in progress — finish it (`git commit`) or abort it (`git merge --abort`), then sync again.')
  }
  if ((await unmerged(root)).length) {
    return stop(`unresolved conflict markers in ${(await unmerged(root)).join(', ')} — resolve and \`git add\` them, then sync again.`)
  }
  if (!st?.branch) return stop('HEAD is detached — check out your branch (normally `main`), then sync again.')

  if (!st.upstream) {
    const remote = await git(root, ['remote'])
    if (!remote.ok || !remote.stdout.trim()) return stop('no remote — this clone has nowhere to sync with.')
    if (!push) return stop(`branch ${st.branch} has no upstream; run sync without --no-push to publish it.`)
    const r = await git(root, ['push', '-u', 'origin', 'HEAD'], 120000)
    if (!r.ok) {
      return stop(`could not publish ${st.branch}: ${reason(r.stderr)}\n` +
        `  If origin already has ${st.branch}: git branch --set-upstream-to=origin/${st.branch}, then sync again.`)
    }
    note(`published ${st.branch} to origin and set it as upstream`)
    st = await syncState(root)
  }

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const f = await git(root, ['fetch', '--quiet'], 120000)
    if (!f.ok) {
      return stop(`fetch failed — offline, or no access to the remote: ${reason(f.stderr)}\n` +
        '  Nothing was changed. If an agent sandbox blocks the network, allow it for git (see .truss/docs/team.md).')
    }
    st = await syncState(root)
    if (st.behind > 0) {
      const behind = st.behind
      const rb = await git(root, ['rebase', '--autostash', '@{u}'], 120000, { GIT_EDITOR: 'true' })
      if (!rb.ok) {
        if (!(await syncState(root))?.rebasing) return stop(`rebase failed, nothing changed: ${reason(rb.stderr || rb.stdout)}`)
        if (!(await continueRebase(root, out))) return out
      }
      if (await afterRebase(root, out, stashBefore)) return out
      out.incoming += behind
      integrated = true
    }

    // Regenerate after integrating the others' commits: a clean textual merge
    // of two maps is not necessarily the map of the merged tree.
    if (integrated) await regenerateAndCommit(root, out)

    st = await syncState(root)
    if (!push || st.ahead === 0) break
    const p = await git(root, ['push'], 120000)
    if (p.ok) { out.pushed += st.ahead; break }
    if (/rejected|fetch first|non-fast-forward/i.test(p.stderr) && round < MAX_ROUNDS) continue
    return stop(`push refused: ${reason(p.stderr)}`)
  }

  st = await syncState(root)
  if (st.dirty > 0) note(`${st.dirty} uncommitted path${st.dirty === 1 ? '' : 's'} — commit what is yours (\`git commit -- <paths>\`), then sync again`)
  if (st.ahead > 0) note(`${st.ahead} local commit${st.ahead === 1 ? '' : 's'} not pushed${push ? '' : ' (--no-push)'}`)
  if (st.branch !== 'main' && st.branch !== 'master') note(`you are on ${st.branch}, not main — the team flow works on main`)
  out.inSync = !out.attention && st.ahead === 0 && st.behind === 0
  return out
}

/**
 * After a rebase finished: the autostash may not have come back cleanly.
 * @returns {Promise<boolean>} true when the run must stop
 */
async function afterRebase(root, out, stashBefore) {
  const files = await unmerged(root)
  const stashNow = await stashRef(root)
  if (!files.length && stashNow === stashBefore) return false
  out.attention = true
  out.conflicts = files
  out.lines.push(
    'your uncommitted changes collide with what came in' +
    (files.length ? ` (conflict markers in ${files.join(', ')})` : '') + '.\n' +
    '  Your commits are rebased; the uncommitted changes are kept in `git stash list` (stash@{0}).\n' +
    '  Resolve the markers, or `git checkout -- <file> && git stash pop` and resolve there; never commit a file with markers.',
  )
  return true
}

/**
 * Drive an open rebase to its end, regenerating generated files on the way.
 * Never skips a step that still carries changes: a failing `--continue` (a
 * signing or hook failure, say) pauses the rebase with the commit intact.
 * @returns {Promise<boolean>} true when the rebase finished
 */
async function continueRebase(root, out) {
  for (let i = 0; i < 200; i++) {
    const conflicted = await unmerged(root)
    const generated = conflicted.filter(f => GENERATED.includes(f))
    const human = conflicted.filter(f => !GENERATED.includes(f))
    if (human.length) {
      const stashed = await gitPathExists(root, 'rebase-merge/autostash') || await gitPathExists(root, 'rebase-apply/autostash')
      out.attention = true
      out.conflicts = human
      out.lines.push(
        `conflict in ${human.join(', ')} — the rebase is paused.\n` +
        '  Resolve each file (keep both sides of a list, renumber a taken ID, merge edits that do not contradict;\n' +
        '  ask your human only when the two sides contradict), `git add` it, then run `truss sync` again.' +
        (stashed ? '\n  Your uncommitted changes are stashed and come back when the rebase finishes.' : ''),
      )
      return false
    }
    if (generated.length) {
      await regenerate(root, generated)
      await git(root, ['add', '--', ...generated])
      for (const g of generated) if (!out.regenerated.includes(g)) out.regenerated.push(g)
    }
    const c = await git(root, ['-c', 'core.editor=true', 'rebase', '--continue'], 120000, { GIT_EDITOR: 'true' })
    if (!(await syncState(root))?.rebasing) return true
    if (c.ok || /conflict/i.test(c.stdout + c.stderr)) continue      // next step, or its conflicts
    // --continue failed without a conflict. Skip only a step that is truly
    // empty (index equals HEAD) — anything else is real work.
    const empty = await git(root, ['diff', '--cached', '--quiet'])
    if (!empty.ok) {
      out.attention = true
      out.lines.push(`rebase --continue failed: ${reason(c.stderr || c.stdout)}\n` +
        '  Your commit is intact and the rebase is paused. Fix the cause (signing, hook), then run `truss sync` again.')
      return false
    }
    await git(root, ['rebase', '--skip'], 120000, { GIT_EDITOR: 'true' })
    if (!(await syncState(root))?.rebasing) return true
  }
  out.attention = true
  out.lines.push('rebase did not finish — run `git status` and finish it by hand.')
  return false
}

const unmerged = async (root) =>
  ((await git(root, ['diff', '--name-only', '--diff-filter=U'])).stdout || '').split('\n').map(x => x.trim()).filter(Boolean)

const stashRef = async (root) => ((await git(root, ['rev-parse', '-q', '--verify', 'refs/stash'])).stdout || '').trim()

async function gitPathExists(root, rel) {
  const r = await git(root, ['rev-parse', '--git-path', rel])
  if (!r.ok) return false
  const p = r.stdout.trim()
  try { await fs.access(path.isAbsolute(p) ? p : path.join(root, p)); return true } catch { return false }
}

/** Write the generated files listed (or all present) from the current tree. */
async function regenerate(root, which = GENERATED) {
  for (const rel of which) {
    if (rel === 'state/map.md') {
      await fs.writeFile(path.join(root, rel), await generateMapContent(root))
    } else if (rel === 'state/decisions-index.md') {
      const { writeIndex } = await import('../decisions-index.mjs')
      await writeIndex(root)
    }
  }
}

/** Regenerate the generated files that exist; commit them alone if they changed. */
async function regenerateAndCommit(root, out) {
  const present = []
  for (const rel of GENERATED) {
    try { await fs.access(path.join(root, rel)); present.push(rel) } catch { /* not kept here */ }
  }
  if (!present.length) return
  // Another uncommitted markdown file would leak into the map the commit
  // publishes; other untracked files (.DS_Store, a PDF) do not reach it.
  const others = ((await git(root, ['status', '--porcelain'])).stdout || '').split('\n').filter(Boolean)
    .filter(l => !l.startsWith('??') || /\.md$|\/$/.test(l.trim()))
    .map(l => l.slice(3).trim()).filter(f => !GENERATED.includes(f))
  if (others.length) {
    out.lines.push('generated files not regenerated: uncommitted work in the tree — run `truss render` / `truss map` after you commit it')
    return
  }
  // Leave a file alone that already carries uncommitted edits: those are
  // someone's work in progress, not ours to commit.
  const dirtyBefore = new Set(((await git(root, ['status', '--porcelain', '--', ...present])).stdout || '')
    .split('\n').filter(Boolean).map(l => l.slice(3).trim()))
  const mine = present.filter(f => !dirtyBefore.has(f))
  if (!mine.length) return
  await regenerate(root, mine)
  const d = await git(root, ['status', '--porcelain', '--', ...mine])
  const changed = (d.stdout || '').split('\n').filter(Boolean).map(l => l.slice(3).trim())
  if (!changed.length) return
  const c = await git(root, ['commit', '--quiet', '-m', 'chore: regenerate generated files after sync', '--', ...changed])
  if (c.ok) for (const g of changed) if (!out.regenerated.includes(g)) out.regenerated.push(g)
  else out.lines.push(`regenerated ${changed.join(', ')} but could not commit: ${reason(c.stderr || c.stdout)} — commit them yourself`)
}

function printReport(r) {
  console.log('\ntruss sync\n')
  if (r.incoming) console.log(`  pulled   ${r.incoming} commit${r.incoming === 1 ? '' : 's'} from the team`)
  if (r.regenerated.length) console.log(`  regenerated  ${r.regenerated.join(', ')}`)
  if (r.pushed) console.log(`  pushed   ${r.pushed} commit${r.pushed === 1 ? '' : 's'}`)
  r.lines.forEach((l, i) => console.log(`  ${r.attention && i === r.lines.length - 1 ? 'STOP' : 'note'}     ${l}`))
  if (r.inSync) console.log(r.incoming || r.pushed || r.regenerated.length ? '  in sync' : '  already in sync')
  console.log('')
}

/** The lines of git's stderr that say why — not the `To <url>` preamble. */
function reason(text) {
  const lines = (text || '').split('\n').map(l => l.replace(/\s+$/, '')).filter(l => l.trim())
  const out = []
  for (let i = 0; i < lines.length && out.length < 6; i++) {
    if (/^\s*(error|fatal|hint: Updates were rejected)|^\s*!|^\s*remote:/i.test(lines[i])) {
      out.push(lines[i].trim())
      while (i + 1 < lines.length && /^\s/.test(lines[i + 1]) && out.length < 6) out.push(lines[++i].trim())
    }
  }
  return (out.length ? out : lines.slice(0, 1).map(l => l.trim())).join(' · ') || '(no message)'
}

async function git(root, args, timeout = 30000, env = {}) {
  try {
    const { stdout, stderr } = await execFileP('git', ['-C', root, ...args], {
      timeout, maxBuffer: 8 << 20, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...env },
    })
    return { ok: true, stdout, stderr }
  } catch (err) {
    return { ok: false, stdout: err.stdout || '', stderr: err.stderr || err.message || '' }
  }
}
