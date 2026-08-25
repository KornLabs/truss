// checks/st.mjs — Structure Table checks (ST-01 … ST-05)
//
// ST-01  E  path from structure table doesn't exist on disk
// ST-02  W  disk path not yet listed in structure table (hint)
// ST-03  W  empty directory (table-managed)
// ST-04  W  adapter stub deviates from expected one-liner
// ST-05  I  file has more than 450 lines (growth-rule hint)
// ST-09  I  engine file(s) diverged from .truss/MANIFEST.sha256 (silent if absent)
// ST-10  I/W decision index absent (I) or out of step with decisions.md (W)

import fs from 'node:fs/promises'
import path from 'node:path'
import { ADAPTER_STUBS, STUB_PATTERNS, SUMMARY_DIRS } from '../lib/workspace.mjs'
import { generateMapContent, mapComparisonKey } from '../lib/commands/map.mjs'
import { verifyEngine } from '../lib/engine-manifest.mjs'
import { buildIndex, INDEX_REL, SOURCE_REL } from '../lib/decisions-index.mjs'

// Declarative catalog of the checks this module implements (A2).
// Lets consumers (--json) enumerate ALL checks, not only fired ones.
// Additive metadata only — does not affect run() or the finding shape.
export const meta = [
  { id: 'ST-01', severity: 'E', title: 'Structure-table path missing on disk' },
  { id: 'ST-02', severity: 'W', title: 'New file — not yet in structure table (hint, not error)' },
  { id: 'ST-03', severity: 'W', title: 'Empty table-managed directory' },
  { id: 'ST-04', severity: 'W', title: 'Adapter stub does not point to AGENTS.md' },
  { id: 'ST-05', severity: 'I', title: 'File exceeds growth-rule line limit (450)' },
  { id: 'ST-06', severity: 'E', title: 'AGENTS.md or its §2 structure table could not be parsed', description: 'Guards against silent degradation (A4): an empty table makes ST-01/ST-02 vacuous' },
  { id: 'ST-07', severity: 'W', title: 'Truss map is outdated', description: 'state/map.md does not match the actual workspace markdown files' },
  { id: 'ST-08', severity: 'W', title: 'AGENTS.md is missing a numbered top-level section', description: '§1–§6 are the contract every prompt, doc and check cross-references' },
  { id: 'ST-09', severity: 'I', title: 'Engine file differs from the release manifest', description: 'D-070: fires only when .truss/MANIFEST.sha256 exists — silent on instances or test workspaces without one' },
  { id: 'ST-10', severity: 'W', title: 'Decision index missing or out of step with state/decisions.md', description: 'D-075/D-081: info while the index has never been generated (the workspace simply has not taken the step), warning once it exists and disagrees with the source — a stale index lies to every session boot' },
];

// Paths that exist on disk but are intentionally not in the structure table
// (system files, adapter stubs handled by ST-04, gitignore, etc.)
const DISK_EXCLUDE = new Set([
  'LICENSE',
  '.gitignore',
  '.trussignore',
  '.prettierrc',
  '.env.example',
  ...ADAPTER_STUBS,
  ...ADAPTER_STUBS.map(s => s.includes('/') ? s.split('/')[0] + '/' : null).filter(Boolean),
  // .truss/ is in the table; its contents are excluded from ST-02
]);

/**
 * @param {import('../lib/workspace.mjs').WorkspaceContext} ctx
 * @returns {Array<Finding>}
 */
export async function run(ctx) {
  const findings = [];
  const { root, structureTable, diskPaths } = ctx;

  // ── ST-06: parse-degradation guard (A4) ────────────────────────────────
  // An empty structure table makes ST-01/ST-02 vacuously pass — doctor would go
  // green at near-zero coverage. Flag the cause instead of failing silently.
  if (ctx.agentsMissing) {
    findings.push({
      id: 'ST-06', severity: 'E',
      file: 'AGENTS.md',
      message: 'AGENTS.md not found — structure-table checks cannot run',
      fix: 'Restore AGENTS.md at the workspace root (it holds the §2 structure table and the generated blocks)',
    });
  } else if (structureTable.length === 0) {
    findings.push({
      id: 'ST-06', severity: 'E',
      file: 'AGENTS.md',
      message: 'AGENTS.md §2 structure table is empty or its heading was not found — ST-01/ST-02 cannot validate anything',
      fix: 'Ensure AGENTS.md has a "## 2 ..." heading followed by the structure table (| Path | Owner | ... |)',
    });
  }

  // ── ST-08: the numbered sections are a cross-reference contract ─────────
  // Prompts, docs and check fix-hints all point at "AGENTS.md §N". A section
  // that silently disappears during an edit breaks every one of those pointers
  // without any other check noticing, so the headings are verified directly.
  const agentsFile = ctx.files?.get('AGENTS.md');
  if (agentsFile) {
    const present = new Set(
      agentsFile.lines
        .map(l => l.match(/^##\s+(\d)\s/))
        .filter(Boolean)
        .map(m => m[1]),
    );
    const missing = ['1', '2', '3', '4', '5', '6'].filter(n => !present.has(n));
    if (missing.length) {
      findings.push({
        id: 'ST-08', severity: 'W',
        file: 'AGENTS.md',
        message: `AGENTS.md is missing top-level section${missing.length > 1 ? 's' : ''} ${missing.map(n => `§${n}`).join(', ')} — cross-references to them no longer resolve`,
        fix: `Restore the "## ${missing[0]} …" heading (§1 load order · §2 structure · §3 rules · §4 session protocol · §5 hard limits · §6 on-demand docs)`,
      });
    }
  }

  // Build a set of all managed relative paths from the table
  const tablePaths = new Set();
  for (const row of structureTable) {
    for (const p of row.paths) {
      tablePaths.add(p);
      // Also register the directory portion for dir rows ending in /
    }
  }

  // ── ST-01: table-managed paths must exist ──────────────────────────────
  for (const row of structureTable) {
    if (row.template) continue;  // <domain> rows skipped
    if (row.onDemand) continue;  // on-demand paths may not exist yet

    for (const rel of row.paths) {
      const abs = path.join(root, rel);
      try {
        await fs.access(abs);
      } catch {
        findings.push({
          id: 'ST-01', severity: 'E',
          file: rel,
          message: `path in structure table does not exist`,
          fix: `Create ${rel} (or add it to .gitignore if not yet needed)`,
        });
      }
    }
  }

  // Also check adapter stubs (not in table yet, but expected by template)
  for (const stub of ADAPTER_STUBS) {
    const abs = path.join(root, stub);
    try {
      await fs.access(abs);
    } catch {
      findings.push({
        id: 'ST-01', severity: 'E',
        file: stub,
        message: `adapter stub does not exist`,
        fix: `Create ${stub} with a one-line redirect to AGENTS.md`,
      });
    }
  }

  // ── ST-02: disk paths not in structure table ───────────────────────────
  // Build the "known" set: table paths + stubs + system files
  const knownPaths = new Set([...tablePaths, ...ADAPTER_STUBS]);
  knownPaths.add('.github/');       // parent dir of copilot stub
  knownPaths.add('LICENSE');
  knownPaths.add('.gitignore');
  knownPaths.add('.trussignore');
  knownPaths.add('.prettierrc');
  knownPaths.add('.env.example');

  // Also add implicit parent directories of table-managed files
  // e.g. "docs/conventions.md" implies "docs/" is known
  for (const p of tablePaths) {
    const parts = p.split('/');
    if (parts.length > 1) {
      for (let d = 1; d < parts.length; d++) {
        knownPaths.add(parts.slice(0, d).join('/') + '/')
      }
    }
  }

  // Dynamic summary directories from the structure table — hoisted out of the
  // per-path loop below; it does not change between iterations.
  const dynamicSummaryDirs = new Set();
  for (const row of structureTable) {
    if (row.summary) {
      for (const p of row.paths) dynamicSummaryDirs.add(p.split('/')[0]);
    }
  }

  for (const diskRel of diskPaths) {
    if (DISK_EXCLUDE.has(diskRel)) continue;

    const relNoSlash = diskRel.replace(/\/$/, '');
    const topDir = relNoSlash.split('/')[0];

    // Skip .git
    if (diskRel === '.git/' || diskRel.startsWith('.git/')) continue;

    // Skip .github/ dir and its children (stubs inside are handled by ST-04)
    if (diskRel === '.github/' || diskRel.startsWith('.github/')) continue;

    // Skip .truss internals (dir itself is table-managed)
    if (diskRel.startsWith('.truss/') && diskRel !== '.truss/') continue;

    // Skip contents of summary-row dirs (archive/, code root, etc., plus user-defined)
    if (dynamicSummaryDirs.has(topDir) && relNoSlash.includes('/')) continue;

    // Check against known paths (with and without trailing slash)
    if (knownPaths.has(diskRel) || knownPaths.has(relNoSlash)) continue;
    if (knownPaths.has(relNoSlash + '/')) continue;

    findings.push({
      id: 'ST-02', severity: 'W',
      file: diskRel,
      message: `new file not yet noted in the §2 structure table — the agent will map it during normal work`,
      fix: `No action needed. '${relNoSlash}' will be added to the §2 table next time the agent updates it, or add it yourself if you like.`,
    });
  }

  // ── ST-03: empty directories ───────────────────────────────────────────
  const dirsToCheck = ['state', 'docs'];
  for (const dir of dirsToCheck) {
    const abs = path.join(root, dir);
    try {
      const entries = await fs.readdir(abs);
      if (entries.length === 0) {
        findings.push({
          id: 'ST-03', severity: 'W',
          file: dir + '/',
          message: `directory is empty`,
          fix: `Populate ${dir}/ with its expected files or remove if not needed`,
        });
      }
    } catch { /* dir doesn't exist — ST-01 will catch it */ }
  }

  // ── ST-04: adapter stubs must point to AGENTS.md ──────────────────────
  for (const stub of ADAPTER_STUBS) {
    const abs = path.join(root, stub);
    let content;
    try { content = await fs.readFile(abs, 'utf8'); }
    catch { continue; } // missing handled by ST-01

    const pattern = STUB_PATTERNS[stub];
    if (!pattern.test(content)) {
      findings.push({
        id: 'ST-04', severity: 'W',
        file: stub,
        message: `adapter stub does not reference AGENTS.md`,
        fix: `Update ${stub}: it should be a one-liner telling the agent to read AGENTS.md`,
      });
    }
  }

  // ── ST-05: files > 450 lines (growth-rule hint) ────────────────────────
  const LIMIT = 450;
  for (const [relPath, fileCtx] of ctx.files) {
    if (fileCtx.lines.length > LIMIT) {
      findings.push({
        id: 'ST-05', severity: 'I',
        file: relPath,
        line: fileCtx.lines.length,
        message: `file has ${fileCtx.lines.length} lines (> ${LIMIT}); consider splitting per growth rule`,
        fix: `Apply the growth rule: if this file has 5+ themes or ~450+ lines, convert to a folder`,
      });
    }
  }

  // ── ST-07: map.md is outdated ───────────────────────────────────────────
  try {
    // Reuse the md-file list from loadWorkspace's single walk (ctx.mdFiles) to
    // avoid a second full tree walk; fall back to a standalone walk if absent.
    const expectedMapContent = await generateMapContent(root, ctx.mdFiles);
    const mapAbs = path.join(root, 'state', 'map.md');
    let actualMapContent = null;
    try {
      actualMapContent = await fs.readFile(mapAbs, 'utf8');
    } catch {
      // Doesn't exist
    }

    // mapComparisonKey strips the volatile ~Tokens column from both sides:
    // token-estimate drift alone (any content edit changes word counts) must
    // not flag the map as outdated after every edit — that would be pure
    // doctor noise. Structural drift (files, titles, descriptions) still fires;
    // token values refresh with the next `truss map` run.
    const expectedNormalized = mapComparisonKey(expectedMapContent);
    const actualNormalized = actualMapContent ? mapComparisonKey(actualMapContent) : null;

    if (actualNormalized !== expectedNormalized) {
      findings.push({
        id: 'ST-07', severity: 'W',
        file: 'state/map.md',
        message: actualMapContent === null ? 'map.md is missing' : 'map.md is outdated',
        fix: `Run 'node .truss/bin/truss.mjs map' to regenerate the domain file map`,
      });
    }
  } catch (err) {
    // If map generation fails, report it as an error
    findings.push({
      id: 'ST-07', severity: 'E',
      file: 'state/map.md',
      message: `Failed to evaluate map.md: ${err.message}`,
      fix: `Check the workspace for recursive parsing errors`,
    });
  }

  // ── ST-10: the decision index against its source ───────────────────────
  // Same shape as ST-07 (map.md), and by CONTENT, never by mtime: a `touch` on
  // decisions.md, a checkout that rewrites both files, or a re-run of `render`
  // that produced the identical bytes must all stay quiet — only a real
  // disagreement is a finding.
  //
  // Two severities, on purpose (D-081):
  //   • no index file at all → I. The workspace is not broken, it has simply
  //     never run `render` since the index existed. Every pre-D-075 instance is
  //     in that state, and `doctor` exits 1 on a W — a warning here would mean
  //     "no longer green" for every one of them on upgrade day. Same staffing as
  //     ST-09 (silent without a manifest) and PH (silent without phases.md).
  //   • index present but disagreeing with decisions.md → W. That one is not a
  //     missing step, it is a file that lies: §1 loads it every session, so a
  //     stale index feeds every boot a decision log that no longer exists.
  // No source file → nothing to be stale against; ST-01 owns that case.
  const decisionsSource = ctx.files?.get(SOURCE_REL);
  if (decisionsSource) {
    const expected = buildIndex(decisionsSource.lines);
    let actual = null;
    try { actual = await fs.readFile(path.join(root, INDEX_REL), 'utf8'); }
    catch { /* absent — handled below */ }

    if (actual === null) {
      findings.push({
        id: 'ST-10', severity: 'I',
        file: INDEX_REL,
        message: `no decision index yet — until it exists, ${SOURCE_REL} is the §1 boot context in full`,
        fix: `Run 'node .truss/bin/truss.mjs render' to generate ${INDEX_REL}, then commit it.`,
      });
    } else if (actual !== expected) {
      findings.push({
        id: 'ST-10', severity: 'W',
        file: INDEX_REL,
        message: `decision index no longer matches ${SOURCE_REL} — every session boots on a summary that is out of date`,
        fix: `Run 'node .truss/bin/truss.mjs render' to regenerate ${INDEX_REL}. It is generated, never hand-edited — a local edit here is overwritten, so fix the wording in ${SOURCE_REL}.`,
      });
    }
  }

  // ── ST-09: engine files diverged from the release manifest ────────────
  // No manifest → verifyEngine returns null → emit nothing at all, not even
  // an info note. Test workspaces and any pre-D-070 instance must stay silent.
  const engineDivergence = await verifyEngine(path.join(root, '.truss'));
  if (engineDivergence) {
    const { modified, missing, extra, unreadable } = engineDivergence;
    // unreadable is its own class (Defect 1): those files could not be
    // checked at all, so they are named but never folded into modified/missing.
    const total = modified.length + missing.length + extra.length + unreadable.length;
    if (total > 0) {
      const SAMPLE_LIMIT = 8;
      const labelled = [
        ...modified.map(f => `modified ${f}`),
        ...missing.map(f => `missing ${f}`),
        ...extra.map(f => `extra ${f}`),
        ...unreadable.map(f => `unreadable ${f}`),
      ].sort();
      const sample = labelled.slice(0, SAMPLE_LIMIT);
      const more = labelled.length - sample.length;
      findings.push({
        id: 'ST-09', severity: 'I',
        file: '.truss/MANIFEST.sha256',
        message: `${total} engine file${total === 1 ? '' : 's'} differ${total === 1 ? 's' : ''} from the release manifest `
          + `(${modified.length} modified, ${missing.length} missing, ${extra.length} extra, ${unreadable.length} unreadable): ${sample.join(', ')}`
          + (more > 0 ? ` (+${more} more)` : ''),
        // Each class resolves differently under 'truss upgrade' (Defect 3): a
        // modified file is replaced, a missing one restored, an extra one
        // removed — never claim a diff tool that only works for people who
        // committed .truss/ into their own repository.
        fix: `Expected and fine if the engine was adapted on purpose — 'truss upgrade' replaces modified files with the `
          + `new release's versions, restores missing ones, and removes extra ones entirely; all three survive only in `
          + `the pre-upgrade backup (.truss.bak-<version>/). Unreadable files could not be checked at all — fix `
          + `their permissions and re-run doctor for an accurate report. To see what actually changed: if .truss/ is `
          + `itself a git checkout, diff it against the release tag for the installed version (e.g. 'git diff v<version>' `
          + `from inside .truss/); otherwise there is nothing to diff until the next upgrade, when the backup holds the `
          + `old files.`,
      });
    }
  }

  return findings;
}
