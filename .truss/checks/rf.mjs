// checks/rf.mjs — Reference checks (RF-01 … RF-04)
//
// RF-01  E  relative markdown link doesn't resolve to an existing file/anchor
// RF-02  W  structured ID referenced but not defined anywhere
// RF-03  E  structured ID defined more than once
// RF-04  W  prompts: reference in phases.md has no matching file in prompt library

import fs from 'node:fs/promises'
import path from 'node:path'
import { headingToAnchor, parsePhaseList } from '../lib/md.mjs'

// Declarative catalog of the checks this module implements (A2).
export const meta = [
  { id: 'RF-01', severity: 'E', title: 'Relative markdown link does not resolve' },
  { id: 'RF-02', severity: 'W', title: 'Referenced ID has no definition' },
  { id: 'RF-03', severity: 'E', title: 'ID defined more than once' },
  { id: 'RF-04', severity: 'W', title: 'prompts: reference not found in library' },
];

// ID prefixes that are "structured" and require definitions
const TRACKED_PREFIXES = new Set(['D', 'HT', 'R', 'OD', 'L', 'TF']);

// Files exempt from RF-01 link checking (e.g., external links, anchors-only links)
function isExternalLink(href) {
  return href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:');
}

function isAnchorOnlyLink(href) {
  return href.startsWith('#');
}

/**
 * @param {import('../lib/workspace.mjs').WorkspaceContext} ctx
 * @returns {Array<Finding>}
 */
export async function run(ctx) {
  const findings = [];
  const { root, files, idDefs, idRefs, promptIds, phases } = ctx;

  // ── RF-01: relative links must resolve ────────────────────────────────
  for (const [relPath, fileCtx] of files) {
    const fileDir = path.dirname(relPath);

    for (const { text, href, line } of fileCtx.links) {
      if (isExternalLink(href)) continue;

      // Split href into file path and anchor
      const [filePart, anchor] = href.split('#');

      if (!filePart) {
        // Anchor-only link within the same file
        if (anchor) {
          const headings = fileCtx.headings;
          const normalised = headingToAnchor(anchor);
          const exists = headings.some(h => h.anchor === normalised || h.anchor === anchor.toLowerCase());
          if (!exists) {
            findings.push({
              id: 'RF-01', severity: 'E',
              file: relPath, line,
              message: `broken anchor link [${text}](#${anchor}) — heading not found in this file`,
              fix: `Fix the anchor or add a heading matching '#${anchor}'`,
            });
          }
        }
        continue;
      }

      // Resolve the file path relative to the linking file, handling absolute repo paths and URL encoding
      const decodedFilePart = decodeURIComponent(filePart);
      const resolved = path.normalize(
        decodedFilePart.startsWith('/')
          ? decodedFilePart.slice(1)
          : path.join(fileDir === '.' ? '' : fileDir, decodedFilePart)
      );
      const targetRel = resolved.replace(/\\/g, '/'); // normalise on Windows
      const absTarget = path.join(root, targetRel);

      let targetExists = false;
      let targetFileCtx = null;
      try {
        await fs.access(absTarget);
        targetExists = true;
        targetFileCtx = files.get(targetRel) || null;
      } catch { /* file doesn't exist */ }

      if (!targetExists) {
        findings.push({
          id: 'RF-01', severity: 'E',
          file: relPath, line,
          message: `broken link [${text}](${href}) — target file '${targetRel}' does not exist`,
          fix: `Create '${targetRel}' or fix the link path`,
        });
        continue;
      }

      // Check anchor in target file
      if (anchor && targetFileCtx) {
        const normalised = headingToAnchor(anchor);
        const exists = targetFileCtx.headings.some(
          h => h.anchor === normalised || h.anchor === anchor.toLowerCase()
        );
        if (!exists) {
          findings.push({
            id: 'RF-01', severity: 'E',
            file: relPath, line,
            message: `broken anchor link [${text}](${href}) — heading '#${anchor}' not found in '${targetRel}'`,
            fix: `Fix the anchor or add a matching heading in '${targetRel}'`,
          });
        }
      } else if (anchor && !targetFileCtx) {
        // File exists but we didn't load it (e.g. inside .truss/) — skip anchor check
      }
    }
  }

  // ── RF-02: referenced IDs must be defined ─────────────────────────────
  // Scope: only operational files (state/, AGENTS.md, HUMAN-TODOS.md,
  // domain files). The docs/ filter below is a safety net, not the reason docs/
  // is quiet: while the §2 table carries `docs/` as a directory row, loadWorkspace
  // never loads those files at all — directory rows are skipped, and only context/
  // and archive/ get a second pass. A project that lists docs/<file>.md
  // individually DOES load them, and then this filter is what keeps IDs used as
  // format examples from being read as real references.
  // An OD entry is REMOVED when it is decided (no tombstones, AGENTS.md §3): its
  // permanent trace is the `Closes: OD-NNN` line in the deciding D-entry. That
  // makes the id legitimately undefined — so a decision naming the question it
  // closed must not be flagged, or the no-tombstone rule would forbid writing a
  // readable rationale.
  const closedIds = new Set();
  for (const fileCtx of files.values()) {
    for (const line of fileCtx.lines || []) {
      const m = line.match(/^\s*Closes:\s*(.+)$/);
      if (m) for (const tok of m[1].match(/[A-Z]+-\d+/g) || []) closedIds.add(tok);
    }
  }

  for (const [id, allRefs] of idRefs) {
    const prefix = id.split('-')[0];
    if (!TRACKED_PREFIXES.has(prefix)) continue;
    if (idDefs.has(id)) continue;
    if (closedIds.has(id)) continue;

    // Filter to operational files only
    const operationalRefs = allRefs.filter(
      r => !r.file.startsWith('docs/')
    );
    if (operationalRefs.length === 0) continue;

    const first = operationalRefs[0];
    findings.push({
      id: 'RF-02', severity: 'W',
      file: first.file, line: first.line,
      message: `reference to '${id}' but no definition found in any file`,
      fix: `Define '${id}' in its canonical file (D/OD → state/decisions.md or state/open-decisions.md; HT → HUMAN-TODOS.md; R → state/risks.md; L → state/learnings.md; TF → state/truss-findings.md)`,
    });
  }

  // ── RF-03: IDs must not be defined more than once ─────────────────────
  for (const [id, defs] of idDefs) {
    if (defs.length > 1) {
      const locations = defs.map(d => `${d.file}:${d.line}`).join(', ');
      findings.push({
        id: 'RF-03', severity: 'E',
        file: defs[0].file, line: defs[0].line,
        message: `'${id}' is defined ${defs.length} times (${locations})`,
        fix: `Keep exactly one definition of '${id}'; remove or supersede the duplicates`,
      });
    }
  }

  // ── RF-04: prompts: references in phases.md must exist in library ─────
  if (phases?.defs) {
    for (const [phaseId, def] of phases.defs) {
      if (!def.prompts) continue;

      const promptRefs = parsePhaseList(def.prompts);
      for (const promptId of promptRefs) {
        if (!promptIds.has(promptId)) {
          findings.push({
            id: 'RF-04', severity: 'W',
            file: 'state/phases.md',
            message: `phase '${phaseId}': prompt '${promptId}' not found in prompts/custom/`,
            fix: `Create .truss/prompts/custom/${promptId}.md or remove '${promptId}' from phase '${phaseId}' prompts`,
          });
        }
      }
    }
  }

  return findings;
}
