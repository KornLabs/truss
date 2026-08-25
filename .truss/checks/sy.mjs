// checks/sy.mjs — State-layer & entry-grammar checks (SY-01 … SY-05)
//
// SY-01  W  state/current.md missing a required key
// SY-02  —  retired (age-based staleness; a resting project is not a broken one) — id not reused
// SY-03  W  entry grammar violated (profile / decisions D-NNN / open-decisions OD-NNN / risks R-NNN / learnings L-NNN / findings TF-NNN / HUMAN-TODOS list form)
// SY-04  —  retired (INBOX.md removed from the baseline; id not reused)
// SY-08  W  ritual drift — state/ or context/ changed well after current.md (D-010, D-058)
// SY-09  I  state/decisions.md read cost grown large (≥ 6000 token-equivalent) — archive nudge
// SY-10  I  an open decision has been open ≥ 30 days — does the question still stand?
// SY-11  W  Challenged-by: names an OD that does not exist (stale challenge marker)
//
// SY-10 is NOT a revival of SY-02. SY-02 aged workspace state by the calendar and
// was retired because a resting project is not a broken one (D-029). An OD is the
// one entry type that is *waiting on a human*: there, age is the signal, not noise.
// Info severity, never a gate blocker — it asks, it does not condemn.
//
// SY-11 exists because RF-02 cannot cover it: since D-031 RF-02 deliberately stays
// silent for ids carrying a `Closes:` trace, which is exactly the state a resolved
// OD is in — so a forgotten `Challenged-by:` would point at a closed question with
// nothing complaining.
//
// Grammar is grounded in the *baseline* the `init` command renders, which is the
// canonical fresh-instance format (STRUKTUR.md §2.1). Notably current.md uses
// `key:` lines (focus:/next:/…), NOT `## Section` headings — so this module does
// not rely on parseHeadings for current.md.
//
// SY-05 nudges an overlay to declare its active branch. It is still pure: it only
// reads whether the configured code-root has `.git` (fs.access) — it never runs git. The
// live branch *comparison* (actual vs declared) is deliberately NOT here; it
// lives in `truss status` and the dashboard so the check engine stays hermetic.

import fs from 'node:fs/promises'
import path from 'node:path'
import { wordCount, toTokens } from '../lib/context-budget.mjs'
import { CHECKBOX_ANY, CHECKBOX_DONE } from '../lib/md.mjs'

// Built from the shared checkbox fragments (lib/md.mjs) so this module can never
// disagree with parseIdDefinitions about what a settled entry looks like — D-046.
const HT_DONE_RE    = new RegExp(`^[-*]\\s+${CHECKBOX_DONE}\\s+HT-\\d{3}\\b`)
const HT_GRAMMAR_RE = new RegExp(`^[-*]\\s+${CHECKBOX_ANY}\\s+HT-\\d{3}\\s+—\\s+\\S`)

export const meta = [
  { id: 'SY-01', severity: 'W', title: 'current.md missing a required key' },
  { id: 'SY-03', severity: 'W', title: 'state entry grammar violated (profile / decisions / open-decisions / risks / learnings / findings / HUMAN-TODOS)' },
  { id: 'SY-05', severity: 'W', title: 'code-root checkout present but no branch: declared in current.md' },
  { id: 'SY-06', severity: 'W', title: 'decided open-decision entry still present (tombstone)', description: 'On decision the OD entry is removed; the D-NNN Closes: line is the trace' },
  { id: 'SY-07', severity: 'I', title: 'HUMAN-TODOS.md accumulates checked-off entries', description: 'more than 5 settled [x] entries → move them to archive/human-todos.md' },
  { id: 'SY-08', severity: 'W', title: 'ritual drift — workspace state changed after current.md was last updated', description: 'mtime comparison of state/ + context/ vs current.md, with a grace window for the write-back that follows a change (D-010, D-058)' },
  { id: 'SY-09', severity: 'I', title: 'decisions.md read cost is growing large', description: '≥ 6000 token-equivalent (words × 1.5) → check for compressible superseded/absorbed entries (archive/decisions.md)' },
  { id: 'SY-10', severity: 'I', title: 'open decision has been waiting a long time', description: 'Opened: ≥ 30 days ago → decide it, re-brief it, or drop it; not SY-02 (that aged all state, this asks about a question waiting on a human)' },
  { id: 'SY-11', severity: 'W', title: 'Challenged-by: points at an open decision that does not exist', description: 'The challenge was resolved or removed but the marker on the decision stayed' },
]

const CURRENT_REQUIRED_KEYS = ['focus', 'next', 'blockers', 'recently-done']
const HT_DONE_MAX           = 5
const DECISIONS_TOKENS_MAX  = 6000 // one third of the CX-01 warn budget (18k)
const OD_STALE_DAYS         = 30   // set, not derived — info only; correct it at the first false alarm
// SY-08 grace window: how long state may be newer than current.md before it is
// drift rather than a work unit still in progress. Set, not derived (D-058).
const RITUAL_GRACE_MS       = 90 * 60 * 1000


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

  }

  // ── SY-08: ritual drift — state changed after current.md's last update ─────
  // D-010: drift becomes *visible* in-band; no host hooks, no enforcement.
  // Event-granular since D-058: the calendar-day comparison it replaced could
  // not fire within the day most sessions live in, so the one mechanism backing
  // the write-back rule was silent exactly when it was needed. It now compares
  // mtimes directly, with a fixed grace window (RITUAL_GRACE_MS) that absorbs
  // the normal order inside one work unit — edit a state or domain file, then
  // write current.md minutes later. Longer than that is drift, same day or not.
  // mtime-based, no git shell-out (checks stay pure file reads); a fresh clone
  // writes near-uniform mtimes, so it stays quiet too. Scope: the agent-owned
  // ritual write surfaces (state/ and context/) minus current.md itself and the
  // script-generated map.md; HUMAN-TODOS.md is excluded — humans check things
  // off at any time.
  if (current?.stat) {
    const stamp = (ms) => {
      const d = new Date(ms)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` +
        ` ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
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
    const behindMs = newest ? newest.mtimeMs - current.stat.mtimeMs : 0
    if (behindMs > RITUAL_GRACE_MS) {
      const behind = behindMs >= 36 * 3600_000
        ? `${Math.round(behindMs / 86_400_000)} days`
        : `${Math.round(behindMs / 3_600_000)}h`
      findings.push({
        id: 'SY-08', severity: 'W',
        file: 'state/current.md',
        message: `workspace state changed after current.md's last update — ${newest.rel} was modified ${behind} later (${stamp(newest.mtimeMs)} vs ${stamp(current.stat.mtimeMs)}); the write-back per work unit may have been skipped`,
        fix: `Refresh state/current.md (focus / next / recently-done) so it reflects the newer state — AGENTS.md §4. If it is still accurate, saving it again clears this.`,
      })
    }
  }

  // ── SY-03: entry grammars ──────────────────────────────────────────────────
  checkProfileGrammar(ctx.files.get('state/profile.md'), findings)
  await checkCodeRootConfig(ctx, findings)
  checkDecisionsGrammar(ctx.files.get('state/decisions.md'), findings)
  checkOpenDecisionsGrammar(ctx.files.get('state/open-decisions.md'), findings)
  checkRisksGrammar(ctx.files.get('state/risks.md'), findings)
  checkLearningsGrammar(ctx.files.get('state/learnings.md'), findings)
  checkFindingsGrammar(ctx.files.get('state/truss-findings.md'), findings)
  checkHumanTodosGrammar(ctx.files.get('HUMAN-TODOS.md'), findings)

  // ── SY-05: code-root checkout present but branch: undeclared ───────────────
  // Pure fs read (no git): if the code root is a checkout, current.md declares the
  // branch the work belongs to so `truss status` / branch-guard can compare.
  await checkOverlayBranchDeclared(ctx, findings)

  // ── SY-06: decided OD entries left as tombstones ────────────────────────────
  checkDecidedTombstones(ctx.files.get('state/open-decisions.md'), findings)

  // ── SY-07: HUMAN-TODOS.md piling up checked-off entries ─────────────────────
  checkHumanTodosDonePile(ctx.files.get('HUMAN-TODOS.md'), findings)

  // ── SY-09: decisions.md read cost growing large ──────────────────────────────
  checkDecisionsSize(ctx.files.get('state/decisions.md'), findings)

  // ── SY-10: open decisions that have been waiting a long time ────────────────
  checkOpenDecisionsAge(ctx.files.get('state/open-decisions.md'), findings)

  // ── SY-11: stale Challenged-by: markers on decisions ────────────────────────
  checkStaleChallenges(
    ctx.files.get('state/decisions.md'),
    ctx.files.get('state/open-decisions.md'),
    findings
  )

  return findings
}

// ── SY-10 — an OD is a question parked on a human's desk. Nothing expires by the
//    calendar (D-029 settled that), but a briefing nobody has answered in a month
//    is either still load-bearing and should be pushed, or it has quietly been
//    overtaken and should go. Info severity: the check asks, the human answers. ──
function checkOpenDecisionsAge(file, findings, now = Date.now()) {
  if (!file) return
  const { lines } = file
  const fenced = ignoredLines(lines)

  for (let i = 0; i < lines.length; i++) {
    if (fenced.has(i)) continue
    const m = lines[i].match(/^##\s+(OD-\d{3})\b/)
    if (!m) continue

    const opened = parseOpenedDate(entryBody(lines, i, fenced))
    if (opened == null) continue                       // missing/malformed → SY-03's job

    const days = Math.floor((now - opened) / 86_400_000)
    if (days < OD_STALE_DAYS) continue

    findings.push({
      id: 'SY-10', severity: 'I',
      file: 'state/open-decisions.md', line: i + 1,
      message: `${m[1]} has been open for ${days} days`,
      fix: `Does the question still stand? Decide it (D-NNN with 'Closes: ${m[1]}'), re-brief it if the options have moved, or remove it if events answered it — say which in state/current.md. Age alone is not a defect; an unanswered briefing usually is.`,
    })
  }
}

// ── SY-11 — `Challenged-by: OD-NNN` is the only transient field in the decision
//    grammar: set when a decision is contested, removed when the challenge
//    resolves. A marker left behind makes a settled decision read as contested in
//    boot context, which is exactly the misreading the field exists to prevent. ──
function checkStaleChallenges(decisions, openDecisions, findings) {
  if (!decisions) return

  const defined = new Set()
  if (openDecisions) {
    const odFenced = ignoredLines(openDecisions.lines)
    for (let i = 0; i < openDecisions.lines.length; i++) {
      if (odFenced.has(i)) continue
      const m = openDecisions.lines[i].match(/^##\s+(OD-\d{3})\b/)
      if (m) defined.add(m[1])
    }
  }

  const { lines } = decisions
  const fenced = ignoredLines(lines)
  for (let i = 0; i < lines.length; i++) {
    if (fenced.has(i)) continue
    const m = lines[i].match(/^\s*Challenged-by\s*:\s*(.+)$/i)
    if (!m) continue

    for (const id of m[1].match(/OD-\d{3}/g) || []) {
      if (defined.has(id)) continue
      findings.push({
        id: 'SY-11', severity: 'W',
        file: 'state/decisions.md', line: i + 1,
        message: `Challenged-by: ${id} — no such entry in state/open-decisions.md`,
        fix: `If the challenge was decided, the superseding D-NNN carries 'Closes: ${id}' and this line goes. If it was rejected, this line goes and the tested alternative belongs in the decision's Rationale:. If the OD was lost, restore it. See docs/conventions.md.`,
      })
    }
  }
}

// ── SY-09 — decisions.md is mandatory boot context, read every session, and it
//    only ever grows (entries are superseded, never deleted). Info-level nudge
//    once its estimated read cost passes DECISIONS_TOKENS_MAX — one third of the
//    CX-01 warn budget in a single file. Deliberately NOT a hard budget check
//    (that is CX-01's aggregate job): this is the targeted archiving prompt the
//    conventions promise. Same words × 1.5 estimate as CX-01 / `truss map`, so
//    the numbers never disagree. A workspace whose decisions are all still
//    load-bearing may legitimately sit above the line — the check asks for a
//    review, it does not demand deletion (deleting decisions is forbidden). ────
function checkDecisionsSize(file, findings) {
  if (!file) return
  const tokens = toTokens(wordCount(file.content))
  if (tokens < DECISIONS_TOKENS_MAX) return
  findings.push({
    id: 'SY-09', severity: 'I',
    file: 'state/decisions.md', line: 1,
    message: `state/decisions.md costs ≈ ${tokens} tokens at every session boot (≥ ${DECISIONS_TOKENS_MAX})`,
    fix: `Review for compressible entries (docs/conventions.md): superseded entries shrink to heading + supersede note; entries whose consequences are fully absorbed into canonical files shrink to heading + Decision: line + pointer. Move bodies to archive/decisions.md — never delete an entry, IDs and traces stay here. The \`cleanup\` prompt (.truss/prompts/rituals/cleanup.md) runs this as a proposal-first pass over the whole boot context.`,
  })
}

// ── SY-06 — an OD entry that records its own decision is a tombstone: the
//    convention (docs/conventions.md) is to remove the entry when the D-NNN
//    (with `Closes: OD-NNN`) is written. Detected via a `Decided:` field in the
//    body or a DECIDED / "→ D-NNN" marker in the heading. Warning, not error:
//    old workspaces migrate at their own pace. ────────────────────────────────
function checkDecidedTombstones(file, findings) {
  if (!file) return
  const { lines } = file
  const fenced = ignoredLines(lines)

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
  const fenced = ignoredLines(file.lines)
  const done = []
  for (let i = 0; i < file.lines.length; i++) {
    if (fenced.has(i)) continue
    if (HT_DONE_RE.test(file.lines[i].trimStart())) done.push(i + 1)
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
// Lines that look like entries but are not: fenced code blocks AND HTML comment
// blocks. The baseline state files carry their entry template in a `<!-- ... -->`
// block (the file is usually empty, so it cannot teach its grammar by example) —
// without this the template's own "## OD-NNN — [question title]" line would be
// read as a malformed entry and every fresh workspace would boot with a warning.
function ignoredLines(lines) {
  const inside = new Set()
  let fence = false
  let comment = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!comment && /^\s*(```|~~~)/.test(line)) { inside.add(i); fence = !fence; continue }
    if (fence) { inside.add(i); continue }

    // A comment block only OPENS at the start of a line. Prose that mentions the
    // syntax mid-sentence ("…deckt `<!-- -->` mit ab") is not a comment, and
    // treating it as one swallowed the rest of that entry's fields.
    const opens = /^\s*<!--/.test(line)
    const closes = /-->/.test(line)
    if (comment) { inside.add(i); if (closes) comment = false; continue }
    if (opens) { inside.add(i); if (!closes) comment = true; continue }
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
  const fenced = ignoredLines(lines)

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
  const fenced = ignoredLines(lines)

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

// ── truss-findings.md: check heading format + upstream-feedback fields ──
function checkFindingsGrammar(file, findings) {
  if (!file) return
  const { lines } = file
  const fenced = ignoredLines(lines)

  for (let i = 0; i < lines.length; i++) {
    if (fenced.has(i)) continue
    // Only check level-2 headings that aren't the file title.
    if (!/^##\s+\S/.test(lines[i])) continue

    const m = lines[i].match(/^##\s+(TF-\d{3})\b/)
    if (!m) {
      findings.push({
        id: 'SY-03', severity: 'W',
        file: 'state/truss-findings.md', line: i + 1,
        message: `finding entry must be numbered '## TF-NNN — title'`,
        fix: `Number the entry '## TF-NNN — title'. See docs/conventions.md.`,
      })
      continue
    }

    const body = entryBody(lines, i, fenced)
    warnMissingFields(
      findings,
      'state/truss-findings.md',
      i + 1,
      m[1],
      missingFields(body, ['Date', 'Observed', 'Impact', 'Suggestion'])
    )
  }
}

// ── risks.md: check heading format + migration-friendly fields ──
function checkRisksGrammar(file, findings) {
  if (!file) return
  const { lines } = file
  const fenced = ignoredLines(lines)

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


// ── open-decisions.md: check heading format and Opened date ──
function checkOpenDecisionsGrammar(file, findings) {
  if (!file) return
  const { lines } = file
  const fenced = ignoredLines(lines)
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
    checkOptionLines(body, m[1], i + 1, findings)
  }
}

// ── The option lines are a machine contract: the dashboard builds its chooser
//    from them (docs/conventions.md). A line without a key or without the
//    ` — ` separator still renders, but as one undifferentiated block of text —
//    the human then re-reads the prose instead of choosing, and nothing in the
//    file says why. Warn at the point of writing instead. ───────────────────────
function checkOptionLines(body, id, entryLine, findings) {
  let inOptions = false
  for (const line of body) {
    if (/^\*{0,2}\s*options\s*:?\s*\*{0,2}\s*$/i.test(line.trim())) { inOptions = true; continue }
    if (!inOptions) continue

    const item = line.match(/^\s*(?:\d+[.)]|[-*])\s+(.+)$/)
    if (!item) { if (line.trim()) inOptions = false; continue }

    const text = item[1].replace(/\*\*/g, '').trim()
    const keyed = /^(?:[A-Za-z]|\d{1,2})\s*[:.)]\s+\S/.test(text)
    const dashed = /\s+[—–]\s+\S/.test(text)
    if (keyed && dashed) continue

    findings.push({
      id: 'SY-03', severity: 'W',
      file: 'state/open-decisions.md', line: entryLine,
      message: `${id}: option line is not in chooser form${keyed ? ' (no " — " after the label)' : dashed ? ' (no A:/B: key)' : ' (no key, no " — ")'} — "${text.slice(0, 60)}${text.length > 60 ? '…' : ''}"`,
      fix: `Write options as '- A: [short label] — [what it means] +[upside] / –[downside]'; mark at most one '(recommended)'. The dashboard builds its option chooser from this shape. See docs/conventions.md.`,
    })
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
  const fenced = ignoredLines(file.lines)
  for (let i = 0; i < file.lines.length; i++) {
    if (fenced.has(i)) continue                        // examples inside ``` blocks are not entries
    const line = file.lines[i]
    if (!/\bHT-\d{3}\b/.test(line)) continue           // only lines that define/mention a real HT id
    const t = line.trimStart()
    if (t.startsWith('>') || t.startsWith('<!--')) continue   // doc/comment lines, not entries
    if (!HT_GRAMMAR_RE.test(t)) {
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
