// Parse state/open-decisions.md into structured briefings.
// Tolerant of the real authoring format: an "Options:" header may be bold
// (**Options:**) and the choices may be a numbered list (1. 2.) or bullets
// (-/*). Meta lines that are surfaced separately in the UI (Opened:, the
// Options block itself) are stripped from the body so the multi-option
// chooser and the prose don't duplicate each other.

const isOptionsHeader = (s) => /^\*{0,2}\s*options\s*:?\s*\*{0,2}\s*$/i.test(s.trim());
const optionItem = (s) => s.match(/^\s*(?:\d+[.)]|[-*])\s+(.+)$/);

function splitOption(text) {
  const t = text.trim().replace(/\*\*/g, '');
  // Only split on an em/en dash used as a "label — description" separator.
  const dash = t.match(/^(.{1,48}?)\s+[—–]\s+(.+)$/);
  if (dash) return { label: dash[1].trim(), desc: dash[2].trim() };
  return { label: t, desc: '' };
}

export function parseOpenDecisions(lines) {
  const list = [];
  let cur = null;
  let inOptions = false;

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');

    const m = line.match(/^##\s+(OD-\d{3})\s+[—–-]\s+(.*)$/);
    if (m) {
      cur = { id: m[1], title: m[2].trim(), opened: null, leaning: null, staleDays: null, options: [], bodyLines: [] };
      list.push(cur);
      inOptions = false;
      continue;
    }
    if (!cur) continue;

    // Opened: — drives the "Nd open" badge; kept out of the body.
    const o = line.match(/^\*{0,2}\s*Opened\s*\*{0,2}:\s*(.*)$/i);
    if (o) {
      cur.opened = o[1].replace(/\*\*/g, '').trim();
      const t = new Date(cur.opened).getTime();
      if (!isNaN(t)) cur.staleDays = Math.floor((Date.now() - t) / 86400000);
      inOptions = false;
      continue;
    }

    // Leaning: — captured, but also kept in the body as useful prose.
    const l = line.match(/^\*{0,2}\s*Leaning\s*\*{0,2}:\s*(.*)$/i);
    if (l) { cur.leaning = l[1].replace(/\*\*/g, '').trim(); inOptions = false; cur.bodyLines.push(line); continue; }

    // Options header (bold or plain) — opens the options block, not shown in body.
    if (isOptionsHeader(line)) { inOptions = true; continue; }

    if (inOptions) {
      const opt = optionItem(line);
      if (opt) { cur.options.push(splitOption(opt[1])); continue; }
      // First non-list, non-blank line closes the block (e.g. **Recommendation:**).
      if (line.trim()) inOptions = false;
      else continue; // swallow blank lines inside the block
    }

    cur.bodyLines.push(line);
  }

  for (const od of list) {
    od.body = od.bodyLines.join('\n').replace(/\*\*/g, '').replace(/\n{3,}/g, '\n\n').trim();
    delete od.bodyLines;
  }
  return list;
}
