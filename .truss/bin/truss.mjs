#!/usr/bin/env node
// .truss/bin/truss.mjs — Truss CLI dispatcher
// Node >= 20, ESM, zero external dependencies.
// Usage: node .truss/bin/truss.mjs <command> [flags]

// ── Node version guard (must use CJS-safe syntax to run on older Nodes) ──────
const _maj = parseInt(process.versions.node.split('.')[0], 10)
if (_maj < 20) {
  process.stderr.write(
    `Truss requires Node >= 20 (found: v${process.versions.node}).\n` +
    `Please update Node.js: https://nodejs.org/\n`
  )
  process.exit(1)
}
//
// M2: doctor (ST/BL/RF checks) + --fix-prompt + --json + exit codes
// M3: render, set, --gate, PH checks
// M4: init (workspace scaffolding)
// M5: SY/CX/HY checks, doctor --html
// M6: dashboard server

import path from 'node:path'
import fs from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { loadWorkspace, resolveRoot } from '../lib/workspace.mjs'
import { renderPhaseBlock, renderPrefsBlock, parsePrefsRows } from '../lib/render.mjs'
import { writeBlock } from '../lib/writer.mjs'
import { PREFS_CATALOG, CATALOG_KEYS, FREE_VALUE_KEYS, isValidFreeValue, isOmitValue } from '../lib/prefs.mjs'
import { loadBehaviorText } from '../lib/defaults.mjs'
import { runInit } from '../lib/commands/init.mjs'
import { runMap } from '../lib/commands/map.mjs'
import { runStatus } from '../lib/commands/status.mjs'
import { runPrompt } from '../lib/commands/prompt.mjs'
import { runPhase } from '../lib/commands/phase.mjs'
import { COMMAND_META } from '../lib/command-meta.mjs'
import { SEV_ORDER, SEV_LABEL, FAMILY_NAMES, col } from '../lib/severity.mjs'

const root = resolveRoot(import.meta.url)
const agentsMdPath = path.join(root, 'AGENTS.md')

const [,, command, ...args] = process.argv

// ── Helpers ───────────────────────────────────────────────────────────────────
function getVersion() {
  try { return readFileSync(path.join(root, '.truss', 'VERSION'), 'utf8').trim() }
  catch { return '?' }
}

// ── HTML report (Dashboard v0) ──────────────────────────────────────────────
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/**
 * Render the doctor report as a self-contained dark-theme HTML page (GE-14:
 * zero dependencies, no CDN, no build). Lists every finding plus the full check
 * catalog (all families ST/BL/RF/SY/PH/CX/HY) with a fired-count per check.
 */
function renderHtmlReport({ root, version, timestamp, gate, summary, registry, findings }) {
  const ts = timestamp.replace('T', ' ').slice(0, 16) + ' UTC'
  const projectName = root.split('/').filter(Boolean).pop() || root
  const status =
    summary.errors   > 0 ? { cls: 'err',  text: `${summary.errors} error${summary.errors   !== 1 ? 's' : ''} — fix before proceeding` } :
    summary.warnings > 0 ? { cls: 'warn', text: `${summary.warnings} warning${summary.warnings !== 1 ? 's' : ''}` } :
                           { cls: 'ok',   text: 'All checks passed' }

  const findingRows = findings.length === 0
    ? `<tr><td colspan="4" class="muted center">No findings — workspace is clean.</td></tr>`
    : findings.map(f => {
        const loc = f.line ? `${f.file}:${f.line}` : (f.file || '')
        return `      <tr>
        <td><span class="sev sev-${f.severity}">${SEV_LABEL[f.severity] || f.severity}</span></td>
        <td class="mono">${escapeHtml(f.id)}</td>
        <td class="mono">${escapeHtml(loc)}</td>
        <td>${escapeHtml(f.message)}${f.fix ? `<div class="fix">${escapeHtml(f.fix)}</div>` : ''}</td>
      </tr>`
      }).join('\n')

  const firedById = new Map()
  const firedSevById = new Map()   // highest actual severity a check fired (PH-04/CX-01 can escalate past their nominal severity)
  const SEV_RANK = { I: 0, W: 1, E: 2 }
  for (const f of findings) {
    firedById.set(f.id, (firedById.get(f.id) || 0) + 1)
    const prev = firedSevById.get(f.id)
    if (prev === undefined || SEV_RANK[f.severity] > SEV_RANK[prev]) firedSevById.set(f.id, f.severity)
  }

  const families = new Map()
  for (const c of registry) {
    const fam = c.id.split('-')[0]
    if (!families.has(fam)) families.set(fam, [])
    families.get(fam).push(c)
  }
  const catalogRows = [...families.entries()].map(([fam, checks]) => {
    const head = `      <tr class="fam"><td colspan="4">${fam} — ${FAMILY_NAMES[fam] || fam}</td></tr>`
    const rows = checks.map(c => {
      const fired = firedById.get(c.id) || 0
      const firedSev = firedSevById.get(c.id) || c.severity
      const badge = fired > 0 ? `<span class="sev sev-${firedSev}">${fired}</span>` : `<span class="muted">—</span>`
      return `      <tr>
        <td class="mono">${escapeHtml(c.id)}</td>
        <td class="mono muted">${escapeHtml(c.severity)}</td>
        <td>${escapeHtml(c.title)}</td>
        <td class="center">${badge}</td>
      </tr>`
    }).join('\n')
    return `${head}\n${rows}`
  }).join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>truss doctor — ${escapeHtml(projectName)}</title>
<style>
  :root { --bg:#0f1117; --surface:#1a1d27; --border:#2a2d3a; --text:#e2e4ed;
    --muted:#6b7080; --accent:#6c8fff; --error:#ff6b6b; --warning:#ffa94d; --ok:#69db7c; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text);
    font:14px/1.55 ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace; }
  .wrap { max-width:960px; margin:0 auto; padding:32px 20px 64px; }
  h1 { font-size:18px; margin:0 0 2px; font-weight:600; }
  h2 { font-size:13px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); margin:32px 0 10px; }
  .sub { color:var(--muted); font-size:13px; }
  .banner { margin:20px 0 6px; padding:12px 16px; border-radius:8px; border:1px solid var(--border);
    background:var(--surface); font-weight:600; }
  .banner.ok { color:var(--ok); border-color:#2c4a36; }
  .banner.warn { color:var(--warning); border-color:#4a3c24; }
  .banner.err { color:var(--error); border-color:#4a2c2c; }
  .counts { display:flex; gap:10px; margin:14px 0 4px; flex-wrap:wrap; }
  .chip { background:var(--surface); border:1px solid var(--border); border-radius:6px; padding:6px 12px; font-size:13px; }
  table { width:100%; border-collapse:collapse; background:var(--surface); border:1px solid var(--border);
    border-radius:8px; overflow:hidden; }
  th, td { text-align:left; padding:9px 12px; border-bottom:1px solid var(--border); vertical-align:top; }
  th { color:var(--muted); font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:.05em; }
  tr:last-child td { border-bottom:none; }
  .center { text-align:center; }
  .muted { color:var(--muted); }
  .fix { color:var(--muted); font-size:12.5px; margin-top:4px; }
  .sev { display:inline-block; min-width:58px; text-align:center; padding:2px 8px; border-radius:5px; font-size:12px; font-weight:700; }
  .sev-E { background:rgba(255,107,107,.16); color:var(--error); }
  .sev-W { background:rgba(255,169,77,.16); color:var(--warning); }
  .sev-I { background:rgba(108,143,255,.16); color:var(--accent); }
  tr.fam td { background:#13161f; font-weight:700; }
  footer { color:var(--muted); font-size:12px; margin-top:36px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>truss doctor${gate ? ' --gate' : ''}</h1>
  <div class="sub">${escapeHtml(projectName)} · truss ${escapeHtml(version)} · ${escapeHtml(ts)}</div>

  <div class="banner ${status.cls}">${status.text}</div>

  <div class="counts">
    <span class="chip"><b style="color:var(--error)">${summary.errors}</b> errors</span>
    <span class="chip"><b style="color:var(--warning)">${summary.warnings}</b> warnings</span>
    <span class="chip"><b style="color:var(--accent)">${summary.infos}</b> info</span>
    <span class="chip"><b>${summary.total}</b> total</span>
  </div>

  <h2>Findings</h2>
  <table>
    <thead><tr><th>Severity</th><th>Check</th><th>Location</th><th>Message &amp; fix</th></tr></thead>
    <tbody>
${findingRows}
    </tbody>
  </table>

  <h2>Check catalog</h2>
  <table>
    <thead><tr><th>ID</th><th>Sev</th><th>What it checks</th><th>Fired</th></tr></thead>
    <tbody>
${catalogRows}
    </tbody>
  </table>

  <footer>Generated by <span class="mono">truss doctor --html</span> — static snapshot, no auto-refresh. Re-run to update.</footer>
</div>
</body>
</html>
`
}

// ── Help ──────────────────────────────────────────────────────────────────────
function showHelp() {
  // Commands list is generated from the single command-meta source (COMMAND_META),
  // so help can never drift from what the dispatcher actually handles.
  const commandLines = COMMAND_META
    .map(c => `  ${c.display.padEnd(17)} ${c.summary}`)
    .join('\n')
  console.log(`truss ${getVersion()} — workspace health and state management
Workspace: ${root}

Commands:
${commandLines}

Init flags:
  --name <name>     project name (skips the interactive prompt)
  --lang <lang>     primary language for agent output (e.g. English)
  --overlay         existing-project mode: ingest→operate phases, .gitignore repo/

Doctor flags:
  --gate        also run PH-04 phase-exit checks
  --html        write report as HTML (Dashboard v0) to .truss/out/doctor.html
  --json        write report as JSON to .truss/out/doctor.json
  --fix-prompt  output a copyable remediation prompt for all findings

Dashboard flags:
  --port <n>    pin a specific port (fails if taken). Without it, starts at 3741
                and hops to the next free port so other projects can run too.
  --no-open     do not open dashboard in default browser automatically
  --read-only   start dashboard in read-only mode
                (one dashboard per project; a second launch opens the running one)

Exit codes: 0 = clean · 1 = warnings only · 2 = errors present
`)
}

// ── doctor ────────────────────────────────────────────────────────────────────
async function runDoctor(flags) {
  const wantJson      = flags.includes('--json')
  const wantFixPrompt = flags.includes('--fix-prompt')
  const wantHtml      = flags.includes('--html')
  const gate          = flags.includes('--gate')

  let ctx
  try {
    ctx = await loadWorkspace(root)
  } catch (err) {
    console.error(`truss doctor: failed to load workspace — ${err.message}`)
    process.exit(2)
  }

  ctx.gate = gate  // PH-04 reads this

  // ── Init guard ──────────────────────────────────────────────────────────
  // If AGENTS.md doesn't exist the workspace is uninitialised.  Instead of
  // running all checks (which would produce ~10 confusing errors) we emit a
  // single, friendly message and exit 0.
  if (ctx.agentsMissing) {
    const msg = 'This folder is not a Truss workspace yet. Start with:\n\n'
      + '  node .truss/bin/truss.mjs init\n\n'
      + '  For an existing project, use:  node .truss/bin/truss.mjs init --overlay'

    if (wantJson) {
      const report = { initialized: false, message: msg, timestamp: new Date().toISOString(), root, version: getVersion() }
      const outDir  = path.join(root, '.truss', 'out')
      const outFile = path.join(outDir, 'doctor.json')
      await fs.mkdir(outDir, { recursive: true })
      await fs.writeFile(outFile, JSON.stringify(report, null, 2), 'utf8')
      console.error('Report written to .truss/out/doctor.json')
      process.exit(0)
    }
    if (wantHtml) {
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>truss doctor</title>
<style>body{font-family:system-ui,sans-serif;max-width:600px;margin:60px auto;color:#333}
.box{border:2px solid #6c8;border-radius:8px;padding:24px 28px;background:#f6fff6}
code{background:#eee;padding:2px 6px;border-radius:4px;font-size:14px}</style></head>
<body><div class="box"><h2>Workspace not initialised</h2>
<p>${msg.replace(/\n/g, '<br>')}</p></div></body></html>`
      const outDir  = path.join(root, '.truss', 'out')
      const outFile = path.join(outDir, 'doctor.html')
      await fs.mkdir(outDir, { recursive: true })
      await fs.writeFile(outFile, html, 'utf8')
      console.error('Report written to .truss/out/doctor.html')
      process.exit(0)
    }
    if (wantFixPrompt) {
      console.log('This folder is not a Truss workspace yet. Run `truss init` to get started.')
      process.exit(0)
    }
    // Human-readable default
    console.log(`\n${msg}\n`)
    process.exit(0)
  }

  const loadTasks = [
    import('../checks/st.mjs'),
    import('../checks/bl.mjs'),
    import('../checks/rf.mjs'),
    import('../checks/ph.mjs'),
    import('../checks/sy.mjs'),
    import('../checks/cx.mjs'),
    import('../checks/hy.mjs'),
  ]

  // All core check modules run in parallel; no first-fail
  const settled = await Promise.allSettled(loadTasks)
  const modules = settled.filter(r => r.status === 'fulfilled').map(r => r.value)

  // Declarative check registry (A2): the full catalog of checks, gathered from
  // each module's `meta` export. Lets --json consumers enumerate ALL checks,
  // not only the ones that fired this run.
  const registry = modules.flatMap(mod => mod.meta ?? [])

  const allFindings = []
  for (const err of settled.filter(r => r.status === 'rejected').map(r => r.reason)) {
    allFindings.push({
      id: 'INTERNAL', severity: 'E',
      file: '(check loader)',
      message: `Failed to load check module: ${err?.message || String(err)}`,
      fix: 'Check the module file for syntax errors or invalid imports.',
    })
  }

  // Run all module checks in parallel
  const runTasks = modules.map(async mod => {
    try {
      return await mod.run(ctx)
    } catch (err) {
      return [{
        id: 'INTERNAL', severity: 'E',
        file: '(check runner)',
        message: `check threw an unexpected error: ${err?.message || String(err)}`,
        fix: 'Report this as a truss bug — include the stack trace from stderr',
      }]
    }
  })
  
  const results = await Promise.all(runTasks)
  allFindings.push(...results.flat())

  // Sort: E → W → I, then by file+line
  allFindings.sort((a, b) =>
    ((SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9)) ||
    (a.file || '').localeCompare(b.file || '') ||
    ((a.line || 0) - (b.line || 0))
  )

  const errors   = allFindings.filter(f => f.severity === 'E')
  const warnings = allFindings.filter(f => f.severity === 'W')
  const infos    = allFindings.filter(f => f.severity === 'I')
  const exitCode = errors.length > 0 ? 2 : warnings.length > 0 ? 1 : 0

  // ── JSON output ─────────────────────────────────────────────────────────
  if (wantJson) {
    const report = {
      initialized: true,       // reached only past the agentsMissing guard → workspace exists.
                               // Stamped so a fresh doctor run self-heals a stale uninit report.
      timestamp: new Date().toISOString(),
      root,
      version: getVersion(),
      gate,
      summary: { errors: errors.length, warnings: warnings.length, infos: infos.length, total: allFindings.length },
      checks: registry,        // full catalog of all checks (A2), independent of what fired
      findings: allFindings,
    }
    const outDir  = path.join(root, '.truss', 'out')
    const outFile = path.join(outDir, 'doctor.json')
    await fs.mkdir(outDir, { recursive: true })
    await fs.writeFile(outFile, JSON.stringify(report, null, 2), 'utf8')
    console.error('Report written to .truss/out/doctor.json')
  }

  // ── HTML output (Dashboard v0) ─────────────────────────────────────────────
  if (wantHtml) {
    const html = renderHtmlReport({
      root, version: getVersion(), timestamp: new Date().toISOString(), gate,
      summary: { errors: errors.length, warnings: warnings.length, infos: infos.length, total: allFindings.length },
      registry, findings: allFindings,
    })
    const outDir  = path.join(root, '.truss', 'out')
    const outFile = path.join(outDir, 'doctor.html')
    await fs.mkdir(outDir, { recursive: true })
    await fs.writeFile(outFile, html, 'utf8')
    console.error('Report written to .truss/out/doctor.html')
  }

  // ── Fix-prompt output ────────────────────────────────────────────────────
  if (wantFixPrompt) {
    if (allFindings.length === 0) {
      console.log('No findings — nothing to fix.')
    } else {
      const lines = [
        'Fix the following truss findings exactly as described below.',
        'Do not change anything else.',
        'After fixing, run:  node .truss/bin/truss.mjs doctor',
        '',
      ]
      for (const f of allFindings) {
        const loc = f.line ? `${f.file}:${f.line}` : (f.file || '')
        lines.push(`${f.severity}  ${f.id}  ${loc}`)
        lines.push(`  Problem: ${f.message}`)
        lines.push(`  Fix:     ${f.fix}`)
        lines.push('')
      }
      console.log(lines.join('\n'))
    }
    process.exit(exitCode)
  }

  // JSON/HTML report modes are non-interactive: exit once the file(s) are written.
  if (wantJson || wantHtml) process.exit(exitCode)

  // ── Human-readable output ────────────────────────────────────────────────
  const now = new Date().toISOString().replace('T', ' ').slice(0, 16)
  const gateLabel = gate ? ' --gate' : ''
  console.log(`\ntruss doctor${gateLabel} — ${now}\n`)

  if (allFindings.length === 0) {
    console.log('  ✓  All checks passed.\n')
  } else {
    for (const f of allFindings) {
      const loc = f.line ? `${f.file}:${f.line}` : (f.file || '')
      console.log(
        `  ${col(f.severity, f.severity)}  ` +
        `${col(f.severity, f.id.padEnd(8))}  ` +
        `${loc.padEnd(38)}  ` +
        `${f.message}`
      )
    }
    console.log('')
  }

  const parts = []
  if (errors.length)   parts.push(col('E', `${errors.length} error${errors.length !== 1 ? 's' : ''}`))
  if (warnings.length) parts.push(col('W', `${warnings.length} warning${warnings.length !== 1 ? 's' : ''}`))
  if (infos.length)    parts.push(col('I', `${infos.length} info`))
  console.log(
    parts.length
      ? `  ${allFindings.length} finding${allFindings.length !== 1 ? 's' : ''} (${parts.join(', ')})\n`
      : '  0 findings\n'
  )
  if (errors.length > 0) console.log('  Run with --fix-prompt for a copyable remediation prompt.\n')

  process.exit(exitCode)
}

// ── render ────────────────────────────────────────────────────────────────────
async function runRender() {
  let ctx
  try {
    ctx = await loadWorkspace(root)
  } catch (err) {
    console.error(`truss render: failed to load workspace — ${err.message}`)
    process.exit(2)
  }

  const { phases } = ctx
  if (!phases) {
    console.error('truss render: state/phases.md missing or unparseable')
    process.exit(2)
  }

  const { ordered, defs, frontmatter } = phases
  const currentId = frontmatter?.current

  if (!currentId || !defs.has(currentId)) {
    const known = [...defs.keys()].join(', ')
    console.error(`truss render: current phase '${currentId}' not found in phases.md (defined: ${known})`)
    process.exit(2)
  }

  const phaseDef = defs.get(currentId)
  const position = ordered.indexOf(currentId) + 1
  const total    = ordered.length
  const lines    = renderPhaseBlock(phaseDef, currentId, position, total)

  try {
    await writeBlock(agentsMdPath, 'phase', lines)
    console.log(`truss render: phase block updated (${currentId}, ${position}/${total})`)
  } catch (err) {
    console.error(`truss render: failed to write block — ${err.message}`)
    process.exit(2)
  }
}

// ── set ───────────────────────────────────────────────────────────────────────
async function runSet(keyArg, valueArg) {
  if (!keyArg || !valueArg) {
    console.error('Usage: truss set <key> <value>')
    console.error(`Known keys: ${PREFS_CATALOG.map(e => e.key).join(', ')}`)
    process.exit(1)
  }

  // Validate key
  if (!CATALOG_KEYS.has(keyArg)) {
    console.error(`truss set: unknown key '${keyArg}'`)
    console.error(`Known keys: ${PREFS_CATALOG.map(e => e.key).join(', ')}`)
    process.exit(1)
  }

  // Validate value
  const isFree = FREE_VALUE_KEYS.has(keyArg)
  if (isFree) {
    if (!isValidFreeValue(valueArg)) {
      console.error(`truss set: invalid value '${valueArg}' for key '${keyArg}' (expected 'off' or a short word)`)
      process.exit(1)
    }
  } else {
    const validValues = CATALOG_KEYS.get(keyArg)
    if (!validValues.has(valueArg)) {
      console.error(`truss set: invalid value '${valueArg}' for key '${keyArg}'`)
      console.error(`Valid values: ${[...validValues].join(', ')}`)
      process.exit(1)
    }
  }

  // Omit-values (e.g. work-style=off) write no directive at all — skip the
  // behavior lookup entirely; the row is dropped below.
  const omit = isOmitValue(keyArg, valueArg)

  // Behavior text. Free-value keys with a custom value generate it dynamically;
  // everything else (incl. control-word 'off') reads the shared template loader.
  let behaviorText
  if (!omit) {
    if (keyArg === 'control-word' && valueArg !== 'off') {
      behaviorText = `begin every response with \`${valueArg} — \` as a session-health marker; if the marker is missing, context may be degrading`
    } else {
      behaviorText = await loadBehaviorText(root, keyArg, valueArg)
    }

    if (!behaviorText) {
      console.error(`truss set: no behavior template found for '${keyArg}/${valueArg}'`)
      console.error(`Expected at: .truss/prefs/${keyArg}/${valueArg}.md`)
      process.exit(2)
    }
  }

  // Load current prefs from the block
  let ctx
  try {
    ctx = await loadWorkspace(root)
  } catch (err) {
    console.error(`truss set: failed to load workspace — ${err.message}`)
    process.exit(2)
  }

  const prefsBlock = ctx.blocks?.get('preferences')
  const currentRows = prefsBlock ? parsePrefsRows(prefsBlock.innerLines ?? []) : []

  // Build row map from current block; update the target key. An omit-value
  // removes the row so nothing renders for this preference.
  const rowMap = new Map(currentRows.map(r => [r.key, r]))
  if (omit) {
    rowMap.delete(keyArg)
  } else {
    rowMap.set(keyArg, { key: keyArg, value: valueArg, behavior: behaviorText })
  }

  // Rebuild in catalog order; append any extra rows not in catalog at the end
  const catalogKeys = PREFS_CATALOG.map(e => e.key)
  const ordered = [
    ...catalogKeys.filter(k => rowMap.has(k)).map(k => rowMap.get(k)),
    ...[...rowMap.values()].filter(r => !catalogKeys.includes(r.key)),
  ]

  const newInnerLines = renderPrefsBlock(ordered)

  try {
    await writeBlock(agentsMdPath, 'preferences', newInnerLines)
    console.log(`truss set: ${keyArg} = ${valueArg}${omit ? ' (no directive written)' : ''}`)
  } catch (err) {
    console.error(`truss set: failed to write block — ${err.message}`)
    process.exit(2)
  }
}

// ── dashboard ───────────────────────────────────────────────────────────────
async function runDashboard(args) {
  try {
    const { startDashboard } = await import('../dashboard/server.mjs')
    let port = 3741
    let pinned = false // user passed an explicit --port: respect it strictly (no auto-scan)
    const portIdx = args.indexOf('--port')
    if (portIdx >= 0 && args.length > portIdx + 1) {
      const parsed = parseInt(args[portIdx + 1], 10)
      if (!isNaN(parsed)) { port = parsed; pinned = true }
    }
    const openBrowser = !args.includes('--no-open')
    const readOnly = args.includes('--read-only')

    const openInBrowser = (u) => {
      if (!openBrowser) return
      import('node:child_process').then(({ exec }) => {
        const startCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
        exec(`${startCmd} ${u}`)
      }).catch(() => {})
    }

    // singleInstance: one dashboard per project. autoPort: when the port isn't
    // pinned, hop to the next free port so OTHER projects can run in parallel.
    const { url, alreadyRunning } = await startDashboard({ root, port, openBrowser, readOnly, autoPort: !pinned, singleInstance: true })

    if (alreadyRunning) {
      console.log(`\x1b[33m[Truss] A dashboard is already running for this project.\x1b[0m`)
      console.log(`\x1b[36m➜  Local:   ${url.replace('127.0.0.1', 'localhost')}\x1b[0m`)
      console.log(`(Stop it with Ctrl+C in its terminal, or open the link above.)`)
      openInBrowser(url)
      return
    }

    console.log(`\x1b[32m[Truss] Dashboard is running!\x1b[0m`)
    console.log(`\x1b[36m➜  Local:   ${url.replace('127.0.0.1', 'localhost')}\x1b[0m`)
    console.log(`(Press Ctrl+C to stop)`)
    // startDashboard does not open the browser, so this is the single opener.
    openInBrowser(url)
  } catch (err) {
    console.error(`truss dashboard: ${err.message}`)
    process.exit(2)
  }
}

// ── Dispatch ──────────────────────────────────────────────────────────────────
// Handlers keyed by command name. This key set is the dispatch surface; the same
// names live in COMMAND_META (which drives `help` and the dashboard whitelist), so
// the two stay in lockstep — preventing documented-but-undispatched drift (the bug
// class that left `tag` half-wired).
const HANDLERS = {
  doctor:    (args) => runDoctor(args),
  render:    ()     => runRender(),
  set:       (args) => runSet(args[0], args[1]),
  prompt:    (args) => runPrompt(root, args),
  phase:     (args) => runPhase(root, args),
  status:    (args) => runStatus(root, args),
  map:       (args) => runMap(root, args),
  init:      (args) => runInit(root, args),
  dashboard: (args) => runDashboard(args),
}

// init/phase surface user-facing fatals as a throw → exit code 2 (dashboard
// handles its own errors internally).
const THROWS_TO_EXIT_2 = new Set(['init', 'phase'])

if (!command || ['help', '--help', '-h'].includes(command)) {
  showHelp(); process.exit(0)
}

if (['--version', '-v', 'version'].includes(command)) {
  console.log(`truss ${getVersion()}`); process.exit(0)
}

const handler = HANDLERS[command]
if (!handler) {
  console.error(`truss: unknown command '${command}'. Run 'node .truss/bin/truss.mjs help'.`)
  process.exit(1)
}

if (THROWS_TO_EXIT_2.has(command)) {
  try { await handler(args) }
  catch (err) { console.error(err.message); process.exit(2) }
} else {
  await handler(args)
}
