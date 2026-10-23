// lib/commands/sessions.mjs — which agent sessions in this tree are still working (D-131).
//
// `status` names the other live sessions in one line and stays silent when there
// are none. This is the explicit check: every record, with its first and last
// truss call and the verdict. Reading prunes, as everywhere in lib/presence.mjs —
// a session whose process is gone disappears here. An ENDED session is a living
// process whose last truss call is older than ENDED_AFTER_MS; it is not counted
// anywhere and becomes active again on its next truss call.

import { ENDED_AFTER_MS, idleMs, listSessions, spanOf } from '../presence.mjs'

const ago = (ms) => (ms === null ? '—' : `${spanOf(new Date(Date.now() - ms).toISOString())} ago`)

export async function runSessions(root, args = []) {
  if (args.length) throw new Error(`truss sessions: takes no arguments (got '${args[0]}').`)
  if (process.env.TRUSS_NO_PRESENCE) {
    console.log('truss sessions: presence is switched off (TRUSS_NO_PRESENCE).')
    return { live: [], ended: [] }
  }
  const { self, live, ended, foreignHost } = await listSessions(root)
  const hours = ENDED_AFTER_MS / 3600_000
  const rows = [
    ...live.map(rec => ({ rec, state: self && rec.pid === self.pid ? 'active (this session)' : 'active' })),
    ...ended.map(rec => ({ rec, state: 'ended' })),
  ]

  console.log(`truss sessions — ${live.length} active, ${ended.length} ended (no truss call for ${hours} h)`)
  if (!rows.length) {
    console.log('  No session has run truss in this tree — or none is left: records of finished processes are removed on read.')
  } else {
    const cells = rows.map(({ rec, state }) => [
      String(rec.pid),
      rec.tool || rec.comm || 'session',
      spanOf(rec.started) ?? '—',
      ago(idleMs(rec)),
      state,
    ])
    const header = ['PID', 'Tool', 'Since', 'Last truss call', 'State']
    const widths = header.map((title, i) => Math.max(title.length, ...cells.map(cell => cell[i].length)))
    const line = (cell) => `  ${cell.map((value, i) => (i === cell.length - 1 ? value : value.padEnd(widths[i]))).join('  ')}`
    console.log(line(header))
    for (const cell of cells) console.log(line(cell))
  }
  if (!self) console.log('  This session could not be identified here (no process ancestry, e.g. on Windows) — it is not listed.')
  else if (!live.some(rec => rec.pid === self.pid)) console.log('  This session has no record yet — `truss status` creates one, after which the others can see it.')
  if (foreignHost) console.log(`  ${foreignHost} record(s) from another machine — not judged from here.`)
  if (ended.length) console.log(`  An ended session counts again as soon as it runs any truss command.`)
  return { self, live, ended, foreignHost }
}
