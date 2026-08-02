// Parse state/open-decisions.md into structured briefings.
// Tolerant of the real authoring format: an "Options:" header may be bold
// (**Options:**) and the choices may be a numbered list (1. 2.) or bullets
// (-/*). Meta lines that are surfaced separately in the UI (Opened:, the
// Options block itself) are stripped from the body so the multi-option
// chooser and the prose don't duplicate each other.
//
// Option grammar (docs/conventions.md, enforced by SY-03):
//   - A: [short label] — [what it means] +[upside] / –[downside]
//   - B: [short label] (recommended) — …
// The key (A:/B:/1.) anchors the label, so a keyed option splits at its first
// " — " no matter how long the label is. The old length-capped heuristic is kept
// for UNkeyed lines only, where a prose dash would otherwise split by accident —
// with a cap it silently produced one giant label whenever a briefing got long,
// which is exactly when the chooser matters most.

const isOptionsHeader = (s) => /^\*{0,2}\s*options\s*:?\s*\*{0,2}\s*$/i.test(s.trim());
const optionItem = (s) => s.match(/^\s*(?:\d+[.)]|[-*])\s+(.+)$/);
const RECOMMENDED = /\s*\((?:recommended|empfohlen)\)\s*/i;

function splitOption(text) {
  let t = text.trim().replace(/\*\*/g, '');

  const recommended = RECOMMENDED.test(t);
  if (recommended) t = t.replace(RECOMMENDED, ' ').replace(/\s{2,}/g, ' ').trim();

  // Keyed option? The key is dropped from the label — the UI numbers the list itself.
  const keyed = t.match(/^([A-Za-z]|\d{1,2})\s*[:.)]\s+(.*)$/);
  const key = keyed ? keyed[1].toUpperCase() : null;
  const rest = keyed ? keyed[2].trim() : t;

  const dash = keyed
    ? rest.match(/^(.+?)\s+[—–]\s+(.+)$/)      // anchored by the key — no length cap
    : rest.match(/^(.{1,48}?)\s+[—–]\s+(.+)$/); // unkeyed — short labels only

  const label = (dash ? dash[1] : rest).trim();
  let desc = dash ? dash[2].trim() : '';

  // "+upside / –downside" tail → separate fields, removed from the description.
  let pro = '', con = '';
  const pc = desc.match(/\+\s*(.+?)\s*\/\s*[–—-]\s*(.+)$/);
  if (pc) {
    pro = pc[1].trim();
    con = pc[2].trim();
    desc = desc.slice(0, pc.index).trim().replace(/[—–,;:]$/, '').trim();
  }

  return { key, label, desc, pro, con, recommended };
}

export function parseOpenDecisions(lines) {
  const list = [];
  let cur = null;
  let inOptions = false;

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');

    // Title separator is optional: SY-03 only requires "## OD-NNN", so a heading
    // without a dash must not make the entry invisible here.
    const m = line.match(/^##\s+(OD-\d{3})\s*(?:[—–-]\s*)?(.*)$/);
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

    // No explicit "(recommended)" but a Leaning: that names a key → mark it.
    // Entries written before the marker existed still show their recommendation.
    if (od.leaning && !od.options.some(o => o.recommended)) {
      const named = od.leaning.trim().match(/^([A-Za-z]|\d{1,2})\b/);
      const key = named?.[1].toUpperCase();
      const hit = key && od.options.find(o => o.key === key);
      if (hit) hit.recommended = true;
    }
  }
  return list;
}
