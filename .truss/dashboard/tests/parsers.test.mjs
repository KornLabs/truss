import test from 'node:test';
import assert from 'node:assert';
import { parseCurrent } from '../lib/parsers/current.mjs';
import { parseDecisions } from '../lib/parsers/decisions.mjs';
import { parseHumanTodos } from '../lib/parsers/human-todos.mjs';
import { parseProfile } from '../lib/parsers/profile.mjs';
import { parseMap, parseTokenCell } from '../lib/parsers/map.mjs';
import { assembleState } from '../lib/state.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

test('parseCurrent is resilient against malformed data', () => {
  const result1 = parseCurrent(['invalid data', 'more invalid']);
  assert.deepStrictEqual(result1, { focus: null, next: [], blockers: 'none', recentlyDone: [], updated: null, staleDays: null });

  const result2 = parseCurrent(['focus:', '  - next:', '- missing list parent']);
  assert.strictEqual(result2.focus, null);
  
  const result3 = parseCurrent(['updated: not-a-date']);
  assert.strictEqual(result3.updated, 'not-a-date');
  assert.strictEqual(result3.staleDays, null);
});

test('parsers tolerate plain hyphen as well as em/en dash', () => {
  // Humans type "-"; agents/editors may produce "—" or "–". All must parse.
  for (const dash of ['—', '–', '-']) {
    const dec = parseDecisions([`## D-001 ${dash} Pick a database`]);
    assert.strictEqual(dec.totalCount, 1, `decisions with "${dash}"`);
    assert.strictEqual(dec.recent[0].title, 'Pick a database');

    const ht = parseHumanTodos([`- [ ] HT-001 ${dash} Review the PR`]);
    assert.strictEqual(ht.openCount, 1, `human-todos with "${dash}"`);
    assert.strictEqual(ht.open[0].text, 'Review the PR');
  }
});

test('parseProfile reads project keys from the Project section', () => {
  const profile = parseProfile([
    '## Project',
    '',
    'name: Truss Forge',
    'language: German',
    'code-root: product',
    'pm-method: none',
  ]);

  assert.strictEqual(profile.name, 'Truss Forge');
  assert.strictEqual(profile.language, 'German');
  assert.strictEqual(profile.pmMethod, 'none');
});

test('assembleState handles empty/missing directories gracefully', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'truss-test-'));
  try {
    const state = await assembleState(tmpDir);
    assert.strictEqual(state.errors.length, 0);
    assert.strictEqual(state.meta.version, '?');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('assembleState.initialized is authoritative (live AGENTS.md), not the doctor.json', async () => {
  // Regression for the dashboard "Workspace not initialised" bug: a stale
  // doctor.json (initialized:false) must NOT override the live AGENTS.md read.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'truss-init-'));
  try {
    // no AGENTS.md yet → not initialised
    assert.strictEqual((await assembleState(tmpDir)).initialized, false);
    // a stale uninit doctor.json on disk must not matter
    fs.mkdirSync(path.join(tmpDir, '.truss', 'out'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.truss', 'out', 'doctor.json'), JSON.stringify({ initialized: false }));
    // once AGENTS.md exists → initialised, regardless of the stale doctor.json
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# AGENTS.md\n\n## 1 Load order\n');
    assert.strictEqual((await assembleState(tmpDir)).initialized, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('assembleState loads date-named session files (regex regression)', async () => {
  // Regression for state.mjs:157 — a literal "\\d" never matched real ISO-dated
  // filenames, so state.sessions was always empty. This test fails on the old regex.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'truss-sess-'));
  try {
    fs.mkdirSync(path.join(tmpDir, 'sessions'));
    fs.writeFileSync(
      path.join(tmpDir, 'sessions', '2026-06-20-example.md'),
      '## Done\n- shipped the fix\n\n## Next\nwrite the test\n'
    );
    const state = await assembleState(tmpDir);
    assert.strictEqual(state.errors.length, 0);
    assert.strictEqual(state.sessions.length, 1);
    assert.strictEqual(state.sessions[0].date, '2026-06-20');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('parseMap reads the ~Tokens column and stays compatible with old maps', () => {
  const withTokens = parseMap([
    '## /context',
    '| File | Title | Description | ~Tokens |',
    '|---|---|---|---|',
    '| `context/domain.md` | Domain | A test domain. | ~1.2k |',
    '| `state/map.md` | Truss Map | Auto-generated. | — |',
  ]);
  assert.strictEqual(withTokens.categories.length, 1);
  const [f1, f2] = withTokens.categories[0].files;
  assert.strictEqual(f1.tokensRaw, '~1.2k');
  assert.strictEqual(f1.tokens, 1200);
  assert.strictEqual(f2.tokensRaw, '—');
  assert.strictEqual(f2.tokens, null);

  // Pre-V-02 map without the column: tokens must be null, nothing throws.
  const oldFormat = parseMap([
    '## /context',
    '| File | Title | Description |',
    '|---|---|---|',
    '| `context/domain.md` | Domain | A test domain. |',
  ]);
  assert.strictEqual(oldFormat.categories[0].files[0].tokens, null);
  assert.strictEqual(oldFormat.categories[0].files[0].tokensRaw, null);
});

test('parseTokenCell handles plain, k-suffixed, and non-numeric cells', () => {
  assert.strictEqual(parseTokenCell('~340'), 340);
  assert.strictEqual(parseTokenCell('~1.2k'), 1200);
  assert.strictEqual(parseTokenCell('~15k'), 15000);
  assert.strictEqual(parseTokenCell('—'), null);
  assert.strictEqual(parseTokenCell(''), null);
  assert.strictEqual(parseTokenCell(undefined), null);
});
