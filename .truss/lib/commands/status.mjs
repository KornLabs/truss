// lib/commands/status.mjs — truss status (CLI-Summary)

import path from 'node:path'
import fs from 'node:fs/promises'
import { loadWorkspace } from '../workspace.mjs'

export async function runStatus(root, argv) {
  let ctx
  try {
    ctx = await loadWorkspace(root)
  } catch (err) {
    console.error(`truss status: failed to load workspace — ${err.message}`)
    process.exit(2)
  }

  // ── Init guard ──────────────────────────────────────────────────────────
  // Mirror doctor's behaviour: a clear message instead of confusing output.
  if (ctx.agentsMissing) {
    console.log(
      '\nThis folder is not a Truss workspace yet. Start with:\n\n' +
      '  node .truss/bin/truss.mjs init\n\n' +
      '  For an existing project, use:  node .truss/bin/truss.mjs init --overlay\n'
    )
    process.exit(0)
  }

  const projectName = path.basename(root)
  const currentPhaseId = ctx.phases?.frontmatter?.current || 'unknown'
  const ordered = ctx.phases?.ordered || []
  const position = ordered.indexOf(currentPhaseId) + 1
  const total = ordered.length
  
  let doctorSummary = 'unknown (run `truss doctor` to generate)'
  try {
    const docPath = path.join(root, '.truss', 'out', 'doctor.json')
    const docStr = await fs.readFile(docPath, 'utf8')
    const doc = JSON.parse(docStr)
    const s = doc.summary
    const useColor = !!process.stdout.isTTY
    if (s) {
       if ((s.errors || 0) > 0) doctorSummary = useColor ? `\x1b[31m${s.errors} errors\x1b[0m, ${s.warnings} warnings` : `${s.errors} errors, ${s.warnings} warnings`
       else if ((s.warnings || 0) > 0) doctorSummary = useColor ? `\x1b[33m${s.warnings} warnings\x1b[0m, ${s.infos} infos` : `${s.warnings} warnings, ${s.infos} infos`
       else doctorSummary = useColor ? '\x1b[32mAll checks passed\x1b[0m' : 'All checks passed'
    }
  } catch (e) {}

  let inboxCount = 0
  try {
    const inboxStr = await fs.readFile(path.join(root, 'INBOX.md'), 'utf8')
    inboxCount = inboxStr.split('\n').filter(l => l.trim().startsWith('- [ ]')).length
  } catch {}

  const useColorGlobal = !!process.stdout.isTTY
  const boldPrefix = useColorGlobal ? '\x1b[1m' : ''
  const boldSuffix = useColorGlobal ? '\x1b[0m' : ''

  console.log(`\n${boldPrefix}${projectName}${boldSuffix} — truss status\n`)
  console.log(`  Phase:   ${currentPhaseId} (${total > 0 ? (position > 0 ? position : '?') : '?'} / ${total})`)
  console.log(`  Health:  ${doctorSummary}`)
  console.log(`  Inbox:   ${inboxCount} pending items\n`)
}
