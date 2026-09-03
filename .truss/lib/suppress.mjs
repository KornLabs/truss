// lib/suppress.mjs — silencing one info finding on one file, with a reason.
//
// THE PROBLEM (TF-008, from an external report). ST-05 told that workspace its
// five biggest domain files were over 450 lines and should be split; splitting
// them would have been wrong on the merits. A finding you are supposed to ignore
// forever is more expensive than no finding at all — it lowers the attention
// every other finding gets. lib/context-ack.mjs already makes this argument in
// its own header and built the way out, but only for CX-01 (`ACKABLE` is a
// closed set), and `.trussignore` is not a substitute: it removes the file from
// the map and from every OTHER check as well.
//
// THE MECHANISM. One line in the file the finding is about:
//
//     <!-- truss: st-05 ok — grammar table; splitting it would break the format -->
//
// The finding for that id on that path stops printing, and `doctor` says how
// many it dropped. Chosen over a central ignore file (OD-019 option C) because
// the justification then sits next to the thing it justifies and is read by
// whoever opens the file — the same "put it where the behaviour happens" rule
// that L-008 and L-010 arrived at independently. It is tracked, so it holds for
// every clone, and it is scoped to a path, so silencing ST-05 on one file leaves
// the file that really is too big still reported.
//
// THREE LIMITS, each load-bearing:
//   • INFO ONLY. A warning or an error is by definition something to act on, and
//     `doctor` exits non-zero at W. Info is the severity whose whole failure mode
//     is being ignored, which is what this addresses. Widening later is easy;
//     narrowing after adopters rely on it is not.
//   • A REASON IS REQUIRED. A marker without one is not honoured. A suppression
//     nobody explained becomes an unexplained exception to the next reader —
//     exactly the state this is meant to prevent.
//   • FENCED EXAMPLES DO NOT COUNT. This very file's syntax gets documented in
//     code blocks; a marker shown as an example must not silence anything. Note
//     that lib/md.mjs `ignoredLines` cannot be reused here: it skips HTML
//     comments too, and the marker IS an HTML comment.

/** `<!-- truss: <id> ok — <reason> -->`, anywhere on the line. */
const MARKER = /<!--\s*truss:\s*([a-z]{2,}-\d{2,})\s+ok\s*[—–-]\s*(\S.*?)\s*-->/i

/** Severities a marker may silence. See "INFO ONLY" above before widening. */
export const SUPPRESSIBLE = new Set(['I'])

/**
 * The check ids silenced in one file, with the reason given for each.
 * @param {string[]} lines
 * @returns {Map<string, string>} upper-case check id → reason
 */
export function suppressionsIn(lines) {
  const out = new Map()
  if (!Array.isArray(lines)) return out
  let fence = false
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; continue }
    if (fence) continue
    const m = line.match(MARKER)
    if (m) out.set(m[1].toUpperCase(), m[2])
  }
  return out
}

/**
 * Split findings into the ones that still count and the ones a marker silences.
 *
 * A finding is only ever silenced by a marker in the file it points AT — the
 * path is the scope, so a marker cannot reach past its own file. Findings about
 * files the workspace never loaded (disk-only paths) are never suppressed,
 * because there are no lines to have carried a marker.
 *
 * @param {Array<object>} findings
 * @param {{files: Map<string, {lines?: string[]}>}} ctx
 * @returns {{kept: Array<object>, suppressed: Array<object & {suppressedBy: string}>}}
 */
export function applySuppressions(findings, ctx) {
  const kept = []
  const suppressed = []
  const cache = new Map()

  for (const f of findings) {
    if (!SUPPRESSIBLE.has(f.severity) || !f.file) { kept.push(f); continue }
    if (!cache.has(f.file)) {
      cache.set(f.file, suppressionsIn(ctx?.files?.get(f.file)?.lines))
    }
    const reason = cache.get(f.file).get(String(f.id).toUpperCase())
    if (reason) suppressed.push({ ...f, suppressedBy: reason })
    else kept.push(f)
  }
  return { kept, suppressed }
}
