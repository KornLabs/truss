// checks/sy.mjs — State-layer & entry-grammar checks (SY-01 … SY-05)
//
// SY-01  W  state/current.md missing a required key OR stale (> 7 days)
// SY-02  I  state/open-decisions.md holds an entry open > 30 days (per-entry Opened: date)
// SY-03  W  entry grammar violated (profile / decisions D-NNN / open-decisions OD-NNN / risks R-NNN / learnings L-NNN / HUMAN-TODOS list form)
// SY-04  —  retired (INBOX.md removed from the baseline; id not reused)
// SY-08  W  ritual drift — state/ or context/ changed on a later day than current.md (D-010)
//
// Grammar is grounded in the *baseline* the `init` command renders, which is the
// canonical fresh-instance format (STRUKTUR.md §2.1). Notably current.md uses
// `key:` lines (focus:/next:/…), NOT `## Section` headings — so this module does
// not rely on parseHeadings for current.md.
//
// SY-02 prefers the per-entry `Opened: YYYY-MM-DD` date (open-decisions grammar,
// §11 / docs/conventions.md) so it can age each open question individually. It
// falls back to the file mtime only when no entry carries a parseable date
// (older instances or hand-written notes) — an honest, coarse signal that the
// finding labels as such. No git shell-out: checks stay pure file reads.
//
// SY-05 nudges an overlay to declare its active branch. It is still pure: it only
// reads whether the configured code-root has `.git` (fs.access) — it never runs git. The
// live branch *comparison* (actual vs declared) is deliberately NOT here; it
// lives in `truss status` and the dashboard so the check engine stays hermetic.

import fs from 'node:fs/promises'
import path from 'node:path'

export const meta = [
  { id: 'SY-01', severity: 'W', title: 'current.md missing a required key or stale (> 7 days)' },
  { id: 'SY-02', severity: 'I', title: 'open-decisions.md holds an entry open > 30 days', description: 'Per-entry Opened: date when present, else file mtime' },
  { id: 'SY-03', severity: 'W', title: 'state entry grammar violated (profile / decisions / open-decisions / risks / learnings / HUMAN-TODOS)' },
  { id: 'SY-05', severity: 'W', title: 'code-root checkout present but no branch: declared in current.md' },
  { id: 'SY-06', severity: 'W', title: 'decided open-decision entry still present (tombstone)', description: 'On decision the OD entry is removed; the D-NNN Closes: line is the trace' },
  { id: 'SY-07', severity: 'I', title: 'HUMAN-TODOS.md accumulates checked-off entries', description: 'more than 5 settled [x] entries → move them to archive/human-todos.md' },
  { id: 'SY-08', severity: 'W', title: 'ritual drift — workspace state changed after current.md was last updated', description: 'Day-granular mtime comparison of state/ + context/ vs current.md; same-day edits never fire (D-010)' },
]

const CURRENT_REQUIRED_KEYS = ['focus', 'next', 'blockers', 'recently-done', 'updated']
const CURRENT_STALE_DAYS    = 7
const OPEN_DECISIONS_DAYS   = 30
const HT_DONE_MAX           = 5
const DAY_MS = 86_400_000

const ageInDays = (sinceMs) => (Date.now() - sinceMs) / DAY_MS

/**
 * @param {import('../lib/workspace.mjs').WorkspaceContext} ctx
 * @returns {Promise<Array>}
 */
export async function run(ctx) {
  const findings = []

  // ── SY-01: current.md required keys + staleness ────────────────────────────
  const current = ctx.files.get('state/current.md')
  if (current) {
    const lc = current.lines.map(l => l.toLowerCase())

    const missing = CURRENT_REQUIRED_KEYS.filter(
      k => !lc.some(l => l.startsWith(`${k}:`))
    )
    if (missing.length) {
      findings.push({
        id: 'SY-01', severity: 'W',
        file: 'state/current.md',
        message: `current.md is missing required key${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
        fix: `Add ${missing.map(k => `'${k}:'`).join(', ')} to state/current.md (required keys: ${CURRENT_REQUIRED_KEYS.join(', ')}).`,
      })
    }

    // Staleness: prefer the file's own `updated:` date, fall back to mtime.
    const updatedLine = current.lines.find(l => l.toLowerCase().startsWith('updated:'))
    const dateMatch = updatedLine && updatedLine.match(/(\d{4})-(\d{2})-(\d{2})/)
    let days = null
    let basis = ''
    if (dateMatch) {
      const parsed = Date.parse(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}T00:00:00Z`)
      if (!Number.isNaN(parsed)) { days = ageInDays(parsed); basis = `the 'updated:' date (${dateMatch[0]})` }
    }
    if (days === null && current.stat) { days = ageInDays(current.stat.mtimeMs); basis = 'the file mtime (no parseable updated: date)' }

    if (days !== null && days > CURRENT_STALE_DAYS) {
      findings.push({
        id: 'SY-01', severity: 'W',
        file: 'state/current.md',
        message: `current.md looks stale — ${Math.floor(days)} days since ${basis} (> ${CURRENT_STALE_DAYS})`,
        fix: `Refresh state/current.md (focus / next / blockers / recently-done) at the session end and set 'updated:' to today, or confirm it is still current.`,
      })
    }
  }

  // ── SY-08: ritual drift — state changed after current.md's last update ─────
  // D-010: drift becomes *visible* in-band; no host hooks, no enforcement.
  // Day-granular ON PURPOSE: mid-session doctor runs (post-task-check) see
  // domain edits before current.md is refreshed at session end — those
  // same-day gaps must not fire. Only a change on a LATER day than
  // current.md's last touch is drift evidence. mtime-based, no git shell-out
  // (checks stay pure file reads); a fresh clone writes uniform mtimes, so it
  // stays quiet too. Scope: the agent-owned ritual write surfaces (state/ and
  // context/) minus current.md itself and the script-generated map.md;
  // HUMAN-TODOS.md is excluded — humans check things off at any time.
  if (current?.stat) {
    const localDay = (ms) => {
      const d = new Date(ms)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    const candidates = (ctx.mdFiles || []).filter(rel =>
      (rel.startsWith('state/') || rel.startsWith('context/'))
      && rel !== 'state/current.md' && rel !== 'state/map.md')
    let newest = null
    for (const rel of candidates) {
      try {
        const st = await fs.stat(path.join(ctx.root, rel))
        if (!newest || st.mtimeMs > newest.mtimeMs) newest = { rel, mtimeMs: st.mtimeMs }
      } catch { /* deleted between walk and stat — irrelevant */ }
    }
    if (newest && localDay(newest.mtimeMs) > localDay(current.stat.mtimeMs)) {
      findings.push({
        id: 'SY-08', severity: 'W',
        file: 'state/current.md',
        message: `workspace state changed after current.md's last update — ${newest.rel} was modified on ${localDay(newest.mtimeMs)}, current.md last on ${localDay(current.stat.mtimeMs)}; the session-end ritual may have been skipped`,
        fix: `Refresh state/current.md (focus / next / recently-done, set 'updated:' to today) so it reflects the newer state — AGENTS.md §4. If it is still accurate, saving it again clears this.`,
      })
    }
  }

  // ── SY-02: open-decisions.md staleness — prefer per-entry Opened: date ──────
  const openDec = ctx.files.get('state/open-decisions.md')
  if (openDec) {
    const entries = openDecisionEntries(openDec.lines)
    if (entries.length) {
      const dated = entries.filter(e => e.openedMs !== null)
      if (dated.length) {
        // Real per-entry age: flag the stalest entry that has been open too long.
        const stalest = dated.reduce((a, b) => (a.openedMs <= b.openedMs ? a : b))
        const days = ageInDays(stalest.openedMs)
        if (days > OPEN_DECISIONS_DAYS) {
          findings.push({
            id: 'SY-02', severity: 'I',
            file: 'state/open-decisions.md', line: stalest.line,
            message: `open decision "${stalest.title}" has been open ${Math.floor(days)} days (> ${OPEN_DECISIONS_DAYS})`,
            fix: `Resolve it (→ D-NNN in state/decisions.md, then remove the entry here) or confirm it is still genuinely open.`,
          })
        }
      } else if (openDec.stat) {
        // No parseable Opened: date on any entry → fall back to the coarse file mtime.
        const days = ageInDays(openDec.stat.mtimeMs)
        if (days > OPEN_DECISIONS_DAYS) {
          findings.push({
            id: 'SY-02', severity: 'I',
            file: 'state/open-decisions.md',
            message: `open-decisions.md untouched for ${Math.floor(days)} days (> ${OPEN_DECISIONS_DAYS}) — no entry carries an 'Opened:' date, so this is the file mtime`,
            fix: `Add an 'Opened: YYYY-MM-DD' line per entry for precise per-entry ageing, or review the open decisions now.`,
          })
        }
      }
    }
  }

  // ── SY-03: entry grammars ──────────────────────────────────────────────────
  checkProfileGrammar(ctx.files.get('state/profile.md'), findings)
  await checkCodeRootConfig(ctx, findings)
  checkDecisionsGrammar(ctx.files.get('state/decisions.md'), findings)
  checkOpenDecisionsGrammar(ctx.files.get('state/open-decisions.md'), findings)
  checkRisksGrammar(ctx.files.get('state/risks.md'), findings)
  checkLearningsGrammar(ctx.files.get('state/learnings.md'), findings)
  checkHumanTodosGrammar(ctx.files.get('HUMAN-TODOS.md'), findings)

  // ── SY-05: code-root checkout present but branch: undeclared ───────────────
  // Pure fs read (no git): if the code root is a checkout, current.md declares the
  // branch the work belongs to so `truss status` / branch-guard can compare.
  await checkOverlayBranchDeclared(ctx, findings)

  // ── SY-06: decided OD entries left as tombstones ────────────────────────────
  checkDecidedTombstones(ctx.files.get('state/open-decisions.md'), findings)

  // ── SY-07: HUMAN-TODOS.md piling up checked-off entries ─────────────────────
  checkHumanTodosDonePile(ctx.files.get('HUMAN-TODOS.md'), findings)

  return findings
}

// ── SY-06 — an OD entry that records its own decision is a tombstone: the
//    convention (docs/conventions.md) is to remove the entry when the D-NNN
//    (with `Closes: OD-NNN`) is written. Detected via a `Decided:` field in the
//    body or a DECIDED / "→ D-NNN" marker in the heading. Warning, not error:
//    old workspaces migrate at their own pace. ────────────────────────────────
function checkDecidedTombstones(file, findings) {
  if (!file) return
  const { lines } = file
  const fenced = fencedLines(lines)

  for (let i = 0; i < lines.length; i++) {
    if (fenced.has(i)) continue
    const m = lines[i].match(/^##\s+(OD-\d{3})\b(.*)$/)
    if (!m) continue

    const headingDecided = /\bDECIDED\b/i.test(m[2]) || /(?:→|->)\s*D-\d{3}\b/.test(m[2])
    const body = entryBody(lines, i, fenced)
    const bodyDecided = body.some(l => /^\s*decided:\s*\S/i.test(l))

    if (headingDecided || bodyDecided) {
      findings.push({
        id: 'SY-06', severity: 'W',
        file: 'state/open-decisions.md', line: i + 1,
        message: `${m[1]} is decided but still parked here as a tombstone`,
        fix: `Ensure the resolving D-NNN carries 'Closes: ${m[1]}', point any references at that D-NNN, then delete the ${m[1]} entry. The Closes: line is the permanent trace (docs/conventions.md).`,
      })
    }
  }
}

// ── SY-07 — HUMAN-TODOS.md is working memory, not history: settled [x] entries
//    move to archive/human-todos.md (docs/protocols.md). Info-level nudge once
//    more than HT_DONE_MAX checked-off entries have piled up. ─────────────────
function checkHumanTodosDonePile(file, findings) {
  if (!file) return
  const fenced = fencedLines(file.lines)
  const done = []
  for (let i = 0; i < file.lines.length; i++) {
    if (fenced.has(i)) continue
    if (/^[-*]\s+\[[xX]\]\s+HT-\d{3}\b/.test(file.lines[i].trimStart())) done.push(i + 1)
  }
  if (done.length > HT_DONE_MAX) {
    findings.push({
      id: 'SY-07', severity: 'I',
      file: 'HUMAN-TODOS.md', line: done[0],
      message: `${done.length} checked-off HT entries have piled up (> ${HT_DONE_MAX})`,
      fix: `Move settled [x] lines verbatim to archive/human-todos.md (create on demand); keep only recently checked-off entries here. The HT counter continues across archived entries (docs/protocols.md).`,
    })
  }
}

/** SY-05 — code-root/.git exists but current.md has no non-empty `branch:` line. */
async function checkOverlayBranchDeclared(ctx, findings) {
  if (!ctx.codeRoot?.rel || ctx.codeRoot.error) return
  let isCheckout = false
  try { await fs.access(path.join(ctx.codeRoot.abs, '.git')); isCheckout = true } catch { /* no code checkout */ }
  if (!isCheckout) return

  const current = ctx.files.get('state/current.md')
  const branchLine = current?.lines?.find(l => l.toLowerCase().startsWith('branch:'))
  const declared = branchLine ? branchLine.slice(branchLine.indexOf(':') + 1).trim() : ''
  if (declared) return

  findings.push({
    id: 'SY-05', severity: 'W',
    file: 'state/current.md',
    message: `${ctx.codeRoot.rel}/ is a git checkout but no active branch is declared (branch:)`,
    fix: `Add 'branch: <name>' to state/current.md (the ${ctx.codeRoot.rel}/ branch this focus belongs to). \`truss status\` then flags a mismatch.`,
  })
}

async function checkCodeRootConfig(ctx, findings) {
  if (ctx.codeRoot?.error) {
    findings.push({
      id: 'SY-03', severity: 'W',
      file: 'state/profile.md',
      message: `invalid code-root '${ctx.codeRoot.raw}': ${ctx.codeRoot.error}`,
      fix: "Set 'code-root:' to one relative directory outside Truss-managed paths, or leave it blank.",
    })
    return
  }
  if (!ctx.codeRoot?.rel) return

  try {
    if (!(await fs.stat(ctx.codeRoot.abs)).isDirectory()) throw new Error()
  } catch {
    findings.push({
      id: 'SY-03', severity: 'W',
      file: 'state/profile.md',
      message: `configured code-root does not exist: ${ctx.codeRoot.rel}/`,
      fix: `Create ${ctx.codeRoot.rel}/, correct code-root in state/profile.md, or leave it blank.`,
    })
    return
  }

  const listed = ctx.structureTable.some(
    row => row.paths.some(item => item.replace(/\/$/, '') === ctx.codeRoot.rel),
  )
  if (!listed) {
    findings.push({
      id: 'SY-03', severity: 'W',
      file: 'AGENTS.md',
      message: `configured code-root ${ctx.codeRoot.rel}/ is missing from the §2 structure table`,
      fix: `Add '${ctx.codeRoot.rel}/ (on demand)' as a summary row in AGENTS.md §2.`,
    })
  }
}

// Indices of lines inside fenced code blocks (``` or ~~~). Entry-grammar checks
// skip these so a documented example like `## HT-009 — …` or `## D-001` shown in a
// code block is not mistaken for a real (malformed) entry. Mirrors parseIdReferences.
function fencedLines(lines) {
  const inside = new Set()
  let open = false
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) { inside.add(i); open = !open; continue }
    if (open) inside.add(i)
  }
  return inside
}

function entryBody(lines, startIdx, fenced) {
  const body = []
  for (let j = startIdx + 1; j < lines.length; j++) {
    if (/^##\s/.test(lines[j]) && !fenced.has(j)) break
    if (!fenced.has(j)) body.push(lines[j])
  }
  return body
}

function hasField(body, field) {
  const re = new RegExp(`^\\s*${field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`, 'i')
  return body.some(l => re.test(l))
}

function missingFields(body, fields) {
  return fields
    .filter(field => {
      const options = Array.isArray(field) ? field : [field]
      return !options.some(option => hasField(body, option))
    })
    .map(field => Array.isArray(field) ? field[0] : field)
}

function warnMissingFields(findings, file, line, entryId, missing) {
  if (!missing.length) return
  findings.push({
    id: 'SY-03', severity: 'W',
    file, line,
    message: `${entryId} is missing recommended field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
    fix: `Add ${missing.map(f => `'${f}:'`).join(', ')} under ${entryId}. See docs/conventions.md.`,
  })
}

// ── decisions.md: check heading format + migration-friendly fields ──
function checkDecisionsGrammar(file, findings) {
  if (!file) return
  const { lines } = file
  const fenced = fencedLines(lines)

  for (let i = 0; i < lines.length; i++) {
    if (fenced.has(i)) continue
    // Only check level-2 headings that aren't the file title.
    if (!/^##\s+\S/.test(lines[i])) continue

    const m = lines[i].match(/^##\s+(D-\d{3})\b/)
    if (!m) {
      findings.push({
        id: 'SY-03', severity: 'W',
        file: 'state/decisions.md', line: i + 1,
        message: `decision entry must be numbered '## D-NNN — title'`,
        fix: `Number the entry '## D-NNN — title'. See docs/conventions.md.`,
      })
      continue
    }

    const body = entryBody(lines, i, fenced)
    warnMissingFields(
      findings,
      'state/decisions.md',
      i + 1,
      m[1],
      missingFields(body, ['Date', 'Decision', ['Rationale', 'Why'], 'Consequences'])
    )
  }
}

// ── learnings.md: check heading format + migration-friendly fields ──
function checkLearningsGrammar(file, findings) {
  if (!file) return
  const { lines } = file
  const fenced = fencedLines(lines)

  for (let i = 0; i < lines.length; i++) {
    if (fenced.has(i)) continue
    // Only check level-2 headings that aren't the file title.
    if (!/^##\s+\S/.test(lines[i])) continue

    const m = lines[i].match(/^##\s+(L-\d{3})\b/)
    if (!m) {
      findings.push({
        id: 'SY-03', severity: 'W',
        file: 'state/learnings.md', line: i + 1,
        message: `learning entry must be numbered '## L-NNN — title'`,
        fix: `Number the entry '## L-NNN — title'. See docs/conventions.md.`,
      })
      continue
    }

    const body = entryBody(lines, i, fenced)
    warnMissingFields(
      findings,
      'state/learnings.md',
      i + 1,
      m[1],
      missingFields(body, ['Trigger', 'Systemic cause', 'Adjustment'])
    )
  }
}

// ── risks.md: check heading format + migration-friendly fields ──
function checkRisksGrammar(file, findings) {
  if (!file) return
  const { lines } = file
  const fenced = fencedLines(lines)

  for (let i = 0; i < lines.length; i++) {
    if (fenced.has(i)) continue
    // Only check level-2 headings that aren't the file title.
    if (!/^##\s+\S/.test(lines[i])) continue

    const m = lines[i].match(/^##\s+(R-\d{3})\b/)
    if (!m) {
      findings.push({
        id: 'SY-03', severity: 'W',
        file: 'state/risks.md', line: i + 1,
        message: `risk entry must be numbered '## R-NNN — title'`,
        fix: `Number the entry '## R-NNN — title'. See docs/conventions.md.`,
      })
      continue
    }

    const body = entryBody(lines, i, fenced)
    warnMissingFields(
      findings,
      'state/risks.md',
      i + 1,
      m[1],
      missingFields(body, ['Severity', 'Status', 'Trigger', 'Mitigation'])
    )
  }
}

// ── open-decisions.md entries: level-2 headings other than the file title, with
//    their `Opened: YYYY-MM-DD` date when present. Skips fenced examples. Shared
//    by SY-02 (ageing) and informs SY-03 (grammar). ──────────────────────────
function openDecisionEntries(lines) {
  const fenced = fencedLines(lines)
  // The file title is an H1 (`# Open Decisions`); restrict to H1 so a title-less
  // file starting straight with `## OD-001` does not swallow its first entry.
  const titleIdx = lines.findIndex((l, i) => !fenced.has(i) && /^#\s+\S/.test(l))
  const entries = []
  for (let i = 0; i < lines.length; i++) {
    if (fenced.has(i) || i === titleIdx) continue
    if (!/^##\s+\S/.test(lines[i])) continue
    const title = lines[i].replace(/^##\s+/, '').trim()
    let openedMs = null
    for (let j = i + 1; j < lines.length; j++) {
      if (/^##\s/.test(lines[j]) && !fenced.has(j)) break
      const m = lines[j].match(/^\s*opened:\s*(\d{4})-(\d{2})-(\d{2})/i)
      if (m) {
        const t = Date.parse(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`)
        if (!Number.isNaN(t)) { openedMs = t; break }
      }
    }
    entries.push({ title, line: i + 1, openedMs })
  }
  return entries
}

// ── open-decisions.md: check heading format and Opened date ──
function checkOpenDecisionsGrammar(file, findings) {
  if (!file) return
  const { lines } = file
  const fenced = fencedLines(lines)
  const titleIdx = lines.findIndex((l, i) => !fenced.has(i) && /^#\s+\S/.test(l))

  for (let i = 0; i < lines.length; i++) {
    if (fenced.has(i) || i === titleIdx) continue
    if (!/^##\s+\S/.test(lines[i])) continue        // only level-2 entry headings

    const m = lines[i].match(/^##\s+(OD-\d{3})\b/)
    if (!m) {
      findings.push({
        id: 'SY-03', severity: 'W',
        file: 'state/open-decisions.md', line: i + 1,
        message: `open-decision entry must be numbered '## OD-NNN — title'`,
        fix: `Number the entry '## OD-NNN — title' (sequential, never reused — the OD counter is its own). See docs/conventions.md.`,
      })
      continue
    }

    const body = entryBody(lines, i, fenced)
    const missing = missingFields(body, ['Options', 'Trade-offs', 'Leaning'])
    if (!parseOpenedDate(body)) missing.unshift('Opened')
    warnMissingFields(
      findings,
      'state/open-decisions.md',
      i + 1,
      m[1],
      missing
    )
  }
}

function parseOpenedDate(body) {
  const opened = body.find(l => /^\s*opened:\s*/i.test(l))
  const m = opened?.match(/^\s*opened:\s*(\d{4})-(\d{2})-(\d{2})\s*$/i)
  if (!m) return null
  const parsed = Date.parse(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`)
  return Number.isNaN(parsed) ? null : parsed
}

// ── HUMAN-TODOS.md: entries must be the checkbox list form ───────────────────
// Canonical (AGENTS.md §2 + STRUKTUR.md §11 + the shipped file):
// `- [ ] HT-NNN — description` (checkbox list form, em-dash separator).
function checkHumanTodosGrammar(file, findings) {
  if (!file) return
  const fenced = fencedLines(file.lines)
  for (let i = 0; i < file.lines.length; i++) {
    if (fenced.has(i)) continue                        // examples inside ``` blocks are not entries
    const line = file.lines[i]
    if (!/\bHT-\d{3}\b/.test(line)) continue           // only lines that define/mention a real HT id
    const t = line.trimStart()
    if (t.startsWith('>') || t.startsWith('<!--')) continue   // doc/comment lines, not entries
    if (!/^[-*]\s+\[[ xX]\]\s+HT-\d{3}\s+—\s+\S/.test(t)) {
      findings.push({
        id: 'SY-03', severity: 'W',
        file: 'HUMAN-TODOS.md', line: i + 1,
        message: `HT entry does not match the list grammar '- [ ] HT-NNN — description'`,
        fix: `Rewrite as '- [ ] HT-NNN — description' (use '[x]' when the human has done it; never delete). See docs/conventions.md.`,
      })
    }
  }
}

// ── profile.md: strict headings for core config ───────────────────────────────
function checkProfileGrammar(file, findings) {
  if (!file) return
  const { lines } = file
  const REQUIRED = ['## Project', '## Tools & subscriptions', '## Style & moral']
  
  const lcLines = lines.map(l => l.trim().toLowerCase().replace(/\s+/g, ' '))
  const missing = REQUIRED.filter(
    key => !lcLines.some(l => l.startsWith(key.toLowerCase()))
  )

  if (missing.length) {
    findings.push({
      id: 'SY-03', severity: 'W',
      file: 'state/profile.md', line: 1,
      message: `profile.md is missing required section${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
      fix: `Restore the missing sections: ${missing.join(', ')} (see STRUKTUR.md §11).`,
    })
  }

}
