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
 * @returns {Promise<{attention:boolean, lines:string[], incoming:number, pushed:number, regenerated:string[], conflicts:string[]}>}
 */
export async function syncWorkspace(root, { push = true } = {}) {
  if (process.env.TRUSS_NO_GIT) throw new SyncError('truss sync: git is disabled (TRUSS_NO_GIT).')
  const inside = await git(root, ['rev-parse', '--is-inside-work-tree'])
  if (!inside.ok) throw new SyncError('truss sync: this is not a git checkout — nothing to sync.')

  const out = { attention: false, lines: [], incoming: 0, pushed: 0, regenerated: [], conflicts: [] }
  const note = (s) => out.lines.push(s)
  const stop = (s) => { out.attention = true; note(s); return out }

  // A rebase left open by an earlier sync (or by hand): finish it first.
  let st = await syncState(root)
  if (st?.rebasing) {
    const done = await continueRebase(root, out)
    if (!done) return out
    st = await syncState(root)
  }

  if (!st?.branch) return stop('HEAD is detached — check out your branch (normally `main`), then sync again.')

  if (!st.upstream) {
    const remote = await git(root, ['remote'])
    if (!remote.ok || !remote.stdout.trim()) return stop('no remote — this clone has nowhere to sync with.')
    if (!push) return stop(`branch ${st.branch} has no upstream; run sync without --no-push to publish it.`)
    const r = await git(root, ['push', '-u', 'origin', 'HEAD'], 120000)
    if (!r.ok) return stop(`could not publish ${st.branch}: ${firstLine(r.stderr)}`)
    note(`published ${st.branch} to origin and set it as upstream`)
    st = await syncState(root)
  }

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const f = await git(root, ['fetch', '--quiet'], 120000)
    if (!f.ok) {
      return stop(`fetch failed — offline, or no access to the remote: ${firstLine(f.stderr)}\n` +
        '  Nothing was changed. If an agent sandbox blocks the network, allow it for git (see .truss/docs/team.md).')
    }
    st = await syncState(root)
    if (st.behind > 0) {
      out.incoming += st.behind
      const rb = await git(root, ['rebase', '--autostash', '@{u}'], 120000, { GIT_EDITOR: 'true' })
      if (!rb.ok) {
        const now = await syncState(root)
        if (!now?.rebasing) return stop(`rebase failed: ${firstLine(rb.stderr || rb.stdout)}`)
        const done = await continueRebase(root, out)
        if (!done) return out
      }
      if (/autostash.*conflict/i.test(rb.stdout + rb.stderr)) {
        return stop('your uncommitted changes collide with what came in; they are kept in `git stash list` — re-apply them by hand (`git stash pop`) and resolve.')
      }
    }

    // Regenerate after a merge of both sides: a clean textual merge of two maps
    // is not necessarily the map of the merged tree.
    if (out.incoming > 0) await regenerateAndCommit(root, out)

    st = await syncState(root)
    if (!push || st.ahead === 0) break
    const p = await git(root, ['push'], 120000)
    if (p.ok) { out.pushed += st.ahead; break }
    if (/rejected|fetch first|non-fast-forward/i.test(p.stderr) && round < MAX_ROUNDS) continue
    return stop(`push refused: ${firstLine(p.stderr)}`)
  }

  st = await syncState(root)
  if (st.dirty > 0) note(`${st.dirty} uncommitted path${st.dirty === 1 ? '' : 's'} — commit what is yours (\`git commit -- <paths>\`), then sync again`)
  if (!push && st.ahead > 0) note(`${st.ahead} local commit${st.ahead === 1 ? '' : 's'} not pushed (--no-push)`)
  if (st.branch !== 'main' && st.branch !== 'master') note(`you are on ${st.branch}, not main — the team flow works on main`)
  return out
}

/**
 * Drive an open rebase to its end, regenerating generated files on the way.
 * @returns {Promise<boolean>} true when the rebase finished
 */
async function continueRebase(root, out) {
  for (let i = 0; i < 200; i++) {
    const u = await git(root, ['diff', '--name-only', '--diff-filter=U'])
    const conflicted = (u.stdout || '').split('\n').map(s => s.trim()).filter(Boolean)
    const generated = conflicted.filter(f => GENERATED.includes(f))
    const human = conflicted.filter(f => !GENERATED.includes(f))
    if (human.length) {
      out.attention = true
      out.conflicts = human
      out.lines.push(
        `conflict in ${human.join(', ')} — the rebase is paused.\n` +
        '  Resolve each file (keep both sides of a list, renumber a taken ID, merge edits that do not contradict;\n' +
        '  ask your human only when the two sides contradict), `git add` it, then run `truss sync` again.',
      )
      return false
    }
    if (generated.length) {
      await regenerate(root, generated)
      await git(root, ['add', '--', ...generated])
      for (const g of generated) if (!out.regenerated.includes(g)) out.regenerated.push(g)
    }
    const c = await git(root, ['-c', 'core.editor=true', 'rebase', '--continue'], 120000, { GIT_EDITOR: 'true' })
    const st = await syncState(root)
    if (!st?.rebasing) return true
    if (!c.ok && !/conflict/i.test(c.stdout + c.stderr)) {
      // Nothing to commit for this step (the regenerated file matched): skip it.
      const s = await git(root, ['rebase', '--skip'], 120000, { GIT_EDITOR: 'true' })
      if (!s.ok && !(await syncState(root))?.rebasing) return true
    }
  }
  out.attention = true
  out.lines.push('rebase did not finish — run `git status` and finish it by hand.')
  return false
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
  // Another uncommitted file would leak into the map the commit publishes.
  const others = ((await git(root, ['status', '--porcelain'])).stdout || '').split('\n').filter(Boolean)
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
}

function printReport(r) {
  console.log('\ntruss sync\n')
  if (r.incoming) console.log(`  pulled   ${r.incoming} commit${r.incoming === 1 ? '' : 's'} from the team`)
  if (r.regenerated.length) console.log(`  regenerated  ${r.regenerated.join(', ')}`)
  if (r.pushed) console.log(`  pushed   ${r.pushed} commit${r.pushed === 1 ? '' : 's'}`)
  for (const l of r.lines) console.log(`  ${r.attention && l === r.lines[r.lines.length - 1] ? 'STOP' : 'note'}     ${l}`)
  if (!r.attention && !r.incoming && !r.pushed && !r.regenerated.length) console.log('  already in sync')
  else if (!r.attention) console.log('  in sync')
  console.log('')
}

const firstLine = (s) => (s || '').split('\n').map(l => l.trim()).filter(Boolean)[0] || '(no message)'

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
