export function parseInbox(lines) {
  let inInbox = false;
  let unprocessedCount = 0;
  for (const line of lines) {
    if (line.match(/^##\s+Inbox/i)) {
      inInbox = true;
      continue;
    }
    if (line.match(/^##\s+/)) {
      if (inInbox) break; // left inbox section
    }
    if (inInbox && line.trim().startsWith('-')) {
      unprocessedCount++;
    }
  }
  return { unprocessedCount };
}
