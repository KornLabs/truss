// Contract tests for the open-decisions parser — the option chooser in the
// overview modal is built entirely from what this returns.

import assert from 'node:assert/strict';
import test from 'node:test';

import { parseOpenDecisions } from '../lib/parsers/open-decisions.mjs';

const lines = (s) => s.split('\n');

const ENTRY = `# Open Decisions

## OD-001 — Should we ship the rewrite?

Opened: 2026-06-01
Context: it blocks the release.
Options:
- A: Ship now — cut the two rough edges +hits the date / –support load in week one
- B: Hold two weeks (recommended) — finish the migration path +clean upgrade / –slips the date
Trade-offs: reversibility is the real cost here.
Leaning: B, the support load is not worth two weeks.
Needed from human: pick A or B.
`;

test('splits keyed options into label, description, upside and downside', () => {
  const [od] = parseOpenDecisions(lines(ENTRY));

  assert.equal(od.id, 'OD-001');
  assert.equal(od.title, 'Should we ship the rewrite?');
  assert.equal(od.options.length, 2);

  const [a, b] = od.options;
  assert.equal(a.key, 'A');
  assert.equal(a.label, 'Ship now');
  assert.equal(a.desc, 'cut the two rough edges');
  assert.equal(a.pro, 'hits the date');
  assert.equal(a.con, 'support load in week one');
  assert.equal(a.recommended, false);

  assert.equal(b.key, 'B');
  assert.equal(b.label, 'Hold two weeks');
  assert.equal(b.recommended, true);
  assert.equal(b.pro, 'clean upgrade');
  assert.equal(b.con, 'slips the date');
});

// Two options are the floor, not the format (D-048). A question with a real
// three- or four-way answer must not be squeezed into a binary — the parser and
// the chooser have to carry every option the briefing lists.
test('carries more than two options, and the recommendation can be any of them', () => {
  const MANY = `# Open Decisions

## OD-002 — Which store backs the queue?

Opened: 2026-06-02
Context: the prototype outgrew the in-memory queue.
Options:
- A: Keep in-memory — do nothing for now +zero work / –loses jobs on restart
- B: SQLite — one file, one dependency +survives restarts / –single writer
- C: Redis (recommended) — a real broker +proven under load / –another service to run
- D: SQS — hand it to the cloud +no ops at all / –vendor lock-in
Trade-offs: C and D are the only two that survive a second worker.
Leaning: C, we already run Redis for sessions.
Needed from human: pick one.
`;
  const [od] = parseOpenDecisions(lines(MANY));
  assert.equal(od.options.length, 4);
  assert.deepEqual(od.options.map(o => o.key), ['A', 'B', 'C', 'D']);
  assert.deepEqual(od.options.map(o => o.label), ['Keep in-memory', 'SQLite', 'Redis', 'SQS']);
  // The badge follows the entry, not the position — C is neither first nor last.
  assert.deepEqual(od.options.map(o => o.recommended), [false, false, true, false]);
  assert.equal(od.options[3].pro, 'no ops at all');
  assert.equal(od.options[3].con, 'vendor lock-in');
});

test('the Options block and Opened: stay out of the rendered body', () => {
  const [od] = parseOpenDecisions(lines(ENTRY));
  assert.doesNotMatch(od.body, /Ship now/);
  assert.doesNotMatch(od.body, /Opened:/);
  assert.match(od.body, /Trade-offs/);
  assert.match(od.body, /Leaning/);          // leaning stays as useful prose
  assert.equal(od.leaning, 'B, the support load is not worth two weeks.');
  assert.equal(od.opened, '2026-06-01');
});

// Regression: the old parser capped the label at 48 chars, so a long option
// collapsed into one giant radio label with no description — it degraded exactly
// when the briefing was substantial enough to need a chooser.
test('a keyed option splits however long its label is', () => {
  const long = 'A: ' + 'a fairly wordy option label that runs well past forty-eight characters'
    + ' — what it actually means +upside here / –downside here';
  const [od] = parseOpenDecisions(lines(`## OD-002 — Long\n\nOptions:\n- ${long}\n`));

  assert.equal(od.options[0].key, 'A');
  assert.match(od.options[0].label, /^a fairly wordy option label/);
  assert.equal(od.options[0].desc, 'what it actually means');
  assert.equal(od.options[0].pro, 'upside here');
  assert.equal(od.options[0].con, 'downside here');
});

// An unkeyed line has no anchor, so a prose dash must not be mistaken for the
// label separator — that heuristic stays capped.
test('an unkeyed option keeps the short-label heuristic', () => {
  const [od] = parseOpenDecisions(lines(
    '## OD-003 — Unkeyed\n\nOptions:\n- one long sentence of prose that happens to contain — a dash far past the cap\n'
  ));
  assert.equal(od.options[0].key, null);
  assert.match(od.options[0].label, /one long sentence/);
  assert.equal(od.options[0].desc, '');
});

test('Leaning: naming a key marks that option recommended when no marker is present', () => {
  const [od] = parseOpenDecisions(lines(
    '## OD-004 — Legacy\n\nOptions:\n- A: first — x +p / –c\n- B: second — y +p / –c\nLeaning: A, because of x.\n'
  ));
  assert.equal(od.options[0].recommended, true);
  assert.equal(od.options[1].recommended, false);
});

test('an explicit (recommended) marker wins over the Leaning: fallback', () => {
  const [od] = parseOpenDecisions(lines(
    '## OD-005 — Explicit\n\nOptions:\n- A: first — x +p / –c\n- B: second (recommended) — y +p / –c\nLeaning: A, changed my mind below.\n'
  ));
  assert.equal(od.options[0].recommended, false);
  assert.equal(od.options[1].recommended, true);
});

// SY-03 only requires "## OD-NNN"; a heading without the dash separator must not
// make the entry invisible in the dashboard.
test('a heading without a dash separator still parses', () => {
  const [od] = parseOpenDecisions(lines('## OD-006 No separator here\n\nOpened: 2026-06-01\n'));
  assert.equal(od.id, 'OD-006');
  assert.equal(od.title, 'No separator here');
});

test('bold meta lines and numbered options are tolerated', () => {
  const [od] = parseOpenDecisions(lines(
    '## OD-007 — Bold\n\n**Opened:** 2026-06-01\n**Options:**\n1. **A:** first — x +p / –c\n2. B) second — y +p / –c\n'
  ));
  assert.equal(od.opened, '2026-06-01');
  assert.deepEqual(od.options.map(o => o.key), ['A', 'B']);
});

test('an empty file yields no entries', () => {
  assert.deepEqual(parseOpenDecisions(lines('# Open Decisions\n\n> header only\n')), []);
});
