// checks/st.mjs — Structure Table checks (ST-01 … ST-05)
//
// ST-01  E  path from structure table doesn't exist on disk
// ST-02  W  disk path not yet listed in structure table (hint)
// ST-03  W  empty directory (table-managed)
// ST-04  W  adapter stub deviates from expected one-liner
// ST-05  I  file has more than 450 lines (growth-rule hint)

import fs from 'node:fs/promises'
import path from 'node:path'
import { ADAPTER_STUBS, STUB_PATTERNS, SUMMARY_DIRS } from '../lib/workspace.mjs'
import { generateMapContent } from '../lib/commands/map.mjs'

// Declarative catalog of the checks this module implements (A2).
// Lets consumers (--json, dashboard) enumerate ALL checks, not only fired ones.
// Additive metadata only — does not affect run() or the finding shape.
export const meta = [
  { id: 'ST-01', severity: 'E', title: 'Structure-table path missing on disk' },
  { id: 'ST-02', severity: 'W', title: 'New file — not yet in structure table (hint, not error)' },
  { id: 'ST-03', severity: 'W', title: 'Empty table-managed directory' },
  { id: 'ST-04', severity: 'W', title: 'Adapter stub does not point to AGENTS.md' },
  { id: 'ST-05', severity: 'I', title: 'File exceeds growth-rule line limit (450)' },
  { id: 'ST-06', severity: 'E', title: 'AGENTS.md or its §2 structure table could not be parsed', description: 'Guards against silent degradation (A4): an empty table makes ST-01/ST-02 vacuous' },
  { id: 'ST-07', severity: 'W', title: 'Truss map is outdated', description: 'state/map.md does not match the actual workspace markdown files' },
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

    const expectedNormalized = expectedMapContent.replace(/\r\n/g, '\n').trim();
    const actualNormalized = actualMapContent ? actualMapContent.replace(/\r\n/g, '\n').trim() : null;

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

  return findings;
}
