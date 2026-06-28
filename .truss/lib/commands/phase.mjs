// lib/commands/phase.mjs — `truss phase [<id>]`
//
// Human-facing, safe phase selection — the supported alternative to hand-editing
// `current:` in state/phases.md and remembering to re-render.
//
//   truss phase           → list the defined phases, mark the current one.
//   truss phase <id>      → validate <id> against state/phases.md, rewrite the
//                           `current:` frontmatter line, and re-render the
//                           AGENTS.md phase block so the two never drift.
//
// This does NOT bypass the phase-exit ritual (AGENTS.md §4): it is the human's
// deliberate set/override, and prints a reminder to confirm the previous phase's
// exit criteria were met. Phase changes stay human-only — the agent never calls
// this to self-advance.
//
// runPhase RETURNS a result object (testable in-process) and THROWS PhaseError on
// a fatal user error; the dispatcher maps that to a non-zero exit.

import fs from 'node:fs/promises'
import path from 'node:path'
import { parsePhases } from '../md.mjs'
import { renderPhaseBlock } from '../render.mjs'
import { writeBlock } from '../writer.mjs'
import { loadWorkspace } from '../workspace.mjs'

export class PhaseError extends Error {}

/** Replace the `current:` line inside the leading `---` frontmatter block. */
export function setCurrentInFrontmatter(raw, id) {
  const lines = raw.split('\n')
  if (lines[0]?.trim() !== '---') throw new PhaseError('phase: state/phases.md has no leading frontmatter block')
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') break // end of frontmatter without a current: line
    if (/^current:\s*/.test(lines[i])) {
      lines[i] = `current: ${id}`
      return lines.join('\n')
    }
  }
  throw new PhaseError('phase: no `current:` line found in state/phases.md frontmatter')
}

/**
 * @param {string}   root  Absolute workspace root.
 * @param {string[]} argv  Arguments after "phase" (argv[0] = target id, optional).
 * @returns {Promise<object>} Result summary (also printed). Throws PhaseError on fatal error.
 */
export async function runPhase(root, argv) {
  const target = argv[0]
  const phasesPath = path.join(root, 'state', 'phases.md')

  let raw
  try { raw = await fs.readFile(phasesPath, 'utf8') }
  catch { throw new PhaseError(`phase: state/phases.md not found at ${phasesPath} — is this a workspace?`) }

  const { ordered, defs, frontmatter } = parsePhases(raw.split('\n'))
  const currentId = frontmatter?.current

  // No argument → list and exit (read-only).
  if (!target) {
    const L = ['', `Current phase: ${currentId ?? '(none)'}`, '', '  Defined phases:']
    ordered.forEach((id, i) => {
      const d = defs.get(id)
      const mark = id === currentId ? '→' : ' '
      L.push(`   ${mark} ${i + 1}. ${id}${d?.label ? ` — ${d.label}` : ''}`)
    })
    L.push('', '  Set with: node .truss/bin/truss.mjs phase <id>', '')
    console.log(L.join('\n'))
    return { listed: true, current: currentId, ordered }
  }

  if (!defs.has(target)) {
    throw new PhaseError(`phase: '${target}' is not a defined phase. Known: ${ordered.join(', ')}`)
  }
  if (target === currentId) {
    console.log(`truss phase: already on '${target}' — nothing to change.`)
    return { changed: false, current: currentId }
  }

  // Write the new current:, then re-render the AGENTS.md phase block. Render
  // through loadWorkspace (identical to `truss render` and the BL-02 drift
  // check) so the written block is byte-identical to the canonical render.
  await fs.writeFile(phasesPath, setCurrentInFrontmatter(raw, target), 'utf8')
  const ctx = await loadWorkspace(root)
  const cp = ctx.phases
  const def = cp.defs.get(target)
  const pos = cp.ordered.indexOf(target) + 1
  const total = cp.ordered.length
  await writeBlock(path.join(root, 'AGENTS.md'), 'phase', renderPhaseBlock(def, target, pos, total))

  console.log(`truss phase: ${currentId ?? '(none)'} → ${target} (${pos}/${total}) — AGENTS.md re-rendered.`)
  console.log('  Reminder: phase changes are a human action — confirm the previous phase\'s')
  console.log('  exit criteria were met before working (AGENTS.md §4).')
  return { changed: true, from: currentId, current: target, position: pos, total }
}
