// lib/md.mjs — markdown primitive parsers
// Zero external dependencies. All functions are pure (no I/O).

/**
 * Parse YAML-ish frontmatter from an array of lines.
 * Expects lines[0] === '---' to indicate frontmatter is present.
 * Returns { data: Record<string,string>, bodyStart: number }
 * where bodyStart is the index of the first non-frontmatter line.
 */
export function parseFrontmatter(lines) {
  if (lines[0] !== '---') return { data: {}, bodyStart: 0 };
  const data = {};
  let i = 1;
  let currentKey = null;
  for (; i < lines.length; i++) {
    if (lines[i] === '---') { i++; break; }
    const line = lines[i].trimEnd();
    const m = line.match(/^([a-z_-]+):\s*(.*)$/);
    if (m) {
      currentKey = m[1];
      data[currentKey] = m[2];
    } else if (currentKey) {
      data[currentKey] += '\n' + line.trim();
    }

  }
  return { data, bodyStart: i };
}

/**
 * Parse a list-valued phase field. Commas are the documented form; semicolons
 * remain accepted so older profiles and hand-written phase files stay valid.
 */
export function parsePhaseList(value) {
  if (!value) return [];
  return String(value)
    .split(/[;,]/)
    .map(item => item.trim())
    .filter(Boolean);
}

/**
 * Parse all markdown links [text](href) from a single line.
 * Returns Array<{ text: string, href: string }>
 */
export function parseLinks(line) {
  const results = [];
  const re = /\[([^\]]*)\]\(((?:[^)(]+|\([^)(]*\))*)\)/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    results.push({ text: m[1], href: m[2] });
  }
  return results;
}

/**
 * Parse a markdown table row "| col1 | col2 |".
 * Returns trimmed cell strings, or null if not a table row.
 * Separator rows (|---|---| etc.) are returned as null.
 */
export function parseTableRow(line) {
  if (!line.startsWith('|')) return null;
  if (/^\|[-:| ]+\|$/.test(line.trim())) return null; // separator
  const cells = line.split('|');
  // Remove first (empty before first |) and last (empty after last |)
  cells.shift();
  cells.pop();
  return cells.map(c => c.trim());
}

/**
 * Find a truss HTML comment marker in a line.
 * Format: <!-- truss:begin <id> --> or <!-- truss:end <id> -->
 * Returns { type: 'begin'|'end', id: string } or null.
 */
export function parseTrussMarker(line) {
  const m = line.match(/^<!-- truss:(begin|end) ([a-z-]+) -->$/);
  if (!m) return null;
  return { type: m[1], id: m[2] };
}

/** Regex for structured IDs used in truss workspaces. */
const ID_RE = /\b(D|HT|R|OD|L)-(\d{3})\b/g;

/**
 * Find all structured IDs (D-NNN, HT-NNN, R-NNN, OD-NNN, L-NNN) in a string.
 * Returns Array<string> (e.g. ['D-001', 'HT-003']).
 */
export function findIds(text) {
  const found = [];
  let m;
  const re = new RegExp(ID_RE.source, 'g');
  while ((m = re.exec(text)) !== null) {
    found.push(`${m[1]}-${m[2]}`);
  }
  return found;
}

/**
 * Convert a heading text to a GitHub-flavored markdown anchor.
 * Lowercases, replaces spaces with hyphens, strips non-alphanumeric (except hyphens).
 */
export function headingToAnchor(text) {
  return text
    .toLowerCase()
    .replace(/`[^`]+`/g, s => s.slice(1, -1)) // strip backtick formatting
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Parse all headings from an array of lines.
 * Returns Array<{ level: number, text: string, anchor: string, line: number }>
 * line is 1-based.
 */
export function parseHeadings(lines) {
  const headings = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+(.+)$/);
    if (m) {
      const text = m[2].trim();
      headings.push({
        level: m[1].length,
        text,
        anchor: headingToAnchor(text),
        line: i + 1,
      });
    }
  }
  return headings;
}

/**
 * Find all markdown links across all lines of a file.
 * Returns Array<{ text: string, href: string, line: number }> (line is 1-based).
 */
export function parseAllLinks(lines) {
  const results = [];
  for (let i = 0; i < lines.length; i++) {
    for (const link of parseLinks(lines[i])) {
      results.push({ ...link, line: i + 1 });
    }
  }
  return results;
}

/**
 * Find all structured IDs defined in a file (i.e. appearing as definition headings).
 * A "definition" is a heading like "## D-001 — Title" or a list item "- [ ] HT-001 — ...".
 * Returns Array<{ id: string, line: number }> (line is 1-based).
 */
export function parseIdDefinitions(lines) {
  const defs = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Heading definitions: ## D-001 — ...
    const headingM = line.match(/^#{1,6}\s+((?:D|HT|R|OD|L)-\d{3})\b/);
    if (headingM) {
      defs.push({ id: headingM[1], line: i + 1 });
      continue;
    }
    // List item definitions: - [ ] HT-001 — ... or - HT-001 —
    const listM = line.match(/^[-*]\s+(?:\[[ x]\]\s+)?((?:D|HT|R|OD|L)-\d{3})\b/);
    if (listM) {
      defs.push({ id: listM[1], line: i + 1 });
    }
  }
  return defs;
}

/**
 * Find all structured IDs referenced (used but not necessarily defined) in a file.
 * Skips fenced code blocks, inline code, HTML comments (single- and multi-line),
 * and indented code blocks.
 * Returns Array<{ id: string, line: number }> (line is 1-based).
 */
export function parseIdReferences(lines) {
  const refs = [];
  let inFencedBlock = false;
  let inHtmlComment = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // A resolving decision keeps `Closes: OD-NNN` after the OD definition is
    // removed, so this durable trace is intentionally not a live reference.
    if (/^Closes:\s+OD-\d{3}\s*$/.test(line.trim())) continue;

    // Toggle fenced code block
    if (!inHtmlComment && (line.startsWith('```') || line.startsWith('~~~'))) {
      inFencedBlock = !inFencedBlock;
      continue;
    }
    if (inFencedBlock) continue;

    // Indented code block (4 spaces or tab)
    if (line.startsWith('    ') || line.startsWith('\t')) continue;

    // Handle multi-line HTML comments
    let working = line;
    if (inHtmlComment) {
      const endIdx = working.indexOf('-->');
      if (endIdx === -1) continue; // whole line is inside comment
      inHtmlComment = false;
      working = working.slice(endIdx + 3);
    }

    // Strip single-line HTML comments <!-- ... --> and detect unclosed ones
    working = working.replace(/<!--.*?-->/g, '');
    if (working.includes('<!--')) {
      working = working.slice(0, working.indexOf('<!--'));
      inHtmlComment = true;
    }

    // Strip inline code `...` (single backticks)
    working = working.replace(/`[^`]+`/g, '');

    const ids = findIds(working);
    for (const id of ids) {
      refs.push({ id, line: i + 1 });
    }
  }
  return refs;
}

/**
 * Extract blocks delimited by truss markers from lines.
 * Returns Map<id, { startLine, endLine, innerLines: string[] }>
 * startLine/endLine are 1-based (the marker lines themselves).
 */
export function parseBlocks(lines) {
  const blocks = new Map();
  const opens = new Map(); // id → startLine (1-based)

  for (let i = 0; i < lines.length; i++) {
    const marker = parseTrussMarker(lines[i]);
    if (!marker) continue;

    if (marker.type === 'begin') {
      if (opens.has(marker.id)) {
        // Duplicate begin — record as error marker
        const prev = blocks.get(marker.id) || {};
        blocks.set(marker.id, { ...prev, duplicateBegin: true, line: i + 1 });
      } else {
        opens.set(marker.id, i + 1);
      }
    } else {
      // end
      if (!opens.has(marker.id)) {
        // End without begin
        const prev = blocks.get(marker.id) || {};
        blocks.set(marker.id, { ...prev, orphanEnd: true, endLine: i + 1 });
      } else {
        const startLine = opens.get(marker.id);
        opens.delete(marker.id);
        const innerLines = lines.slice(startLine, i); // between markers (0-based slice)
        blocks.set(marker.id, {
          startLine,
          endLine: i + 1,
          innerLines,
          // Detect previous partial/error entry
          ...(blocks.get(marker.id) || {}),
        });
      }
    }
  }

  // Any remaining opens are begin-without-end
  for (const [id, startLine] of opens) {
    blocks.set(id, { ...(blocks.get(id) || {}), startLine, orphanBegin: true });
  }

  return blocks;
}

/**
 * Parse a phases.md section body (lines after the ## heading until next ##).
 * Returns a phase definition object.
 * Each line is "key: value" format.
 */
export function parsePhaseSection(lines) {
  const def = {};
  const knownKeys = ['label', 'name', 'purpose', 'behavior', 'allowed', 'forbidden',
    'forbidden-globs', 'read', 'exit', 'prompts'];
  let currentKey = null;
  for (let line of lines) {
    line = line.trimEnd();
    const m = line.match(/^([a-z-]+):\s*(.*)$/);
    if (m) {
      if (knownKeys.includes(m[1])) {
        currentKey = m[1];
        def[currentKey] = m[2];
      } else {
        currentKey = null; // Drop unknown keys
      }
    } else if (currentKey) {
      def[currentKey] += '\n' + line.trim();
    }
  }
  return def;
}

/**
 * Parse state/phases.md content.
 * Returns { frontmatter, ordered: string[], defs: Map<id, def> }
 */
export function parsePhases(lines) {
  const { data: frontmatter, bodyStart } = parseFrontmatter(lines);
  const ordered = [];
  const defs = new Map();

  let currentId = null;
  let sectionLines = [];

  const flush = () => {
    if (currentId) {
      defs.set(currentId, parsePhaseSection(sectionLines));
    }
  };

  for (let i = bodyStart; i < lines.length; i++) {
    const m = lines[i].match(/^##\s+([a-z][a-z0-9-]+)\s*$/);
    if (m) {
      flush();
      currentId = m[1];
      ordered.push(currentId);
      sectionLines = [];
    } else if (currentId) {
      sectionLines.push(lines[i]);
    }
  }
  flush();

  return { frontmatter, ordered, defs };
}
