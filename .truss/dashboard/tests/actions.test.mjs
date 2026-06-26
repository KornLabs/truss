import test from 'node:test';
import assert from 'node:assert';
import { handleAction } from '../lib/actions.mjs';

function createReq(headers, bodyStr = '') {
  return {
    headers,
    async *[Symbol.asyncIterator]() {
      yield bodyStr;
    }
  };
}

test('handleAction blocks non-localhost origin/host', async () => {
  const req = createReq({ host: 'evil.com', origin: 'http://evil.com' });
  const res = await handleAction(req, { root: '', token: '123' });
  assert.strictEqual(res.status, 403);
  assert.match(res.body.error, /Invalid Host or Origin/);
});

test('handleAction blocks invalid token', async () => {
  const req = createReq({ host: 'localhost', origin: 'http://localhost' });
  const res = await handleAction(req, { root: '', token: 'correct-token' });
  assert.strictEqual(res.status, 403);
  assert.match(res.body.error, /Invalid or missing token/);
});

test('handleAction blocks when readOnly is true', async () => {
  const req = createReq({ host: 'localhost', origin: 'http://localhost', 'x-truss-token': 'correct-token' });
  const res = await handleAction(req, { root: '', token: 'correct-token', readOnly: true });
  assert.strictEqual(res.status, 403);
  assert.match(res.body.error, /read-only mode/);
});

test('handleAction blocks bad payload', async () => {
  const req = createReq({ host: 'localhost', origin: 'http://localhost', 'x-truss-token': 'token' }, 'invalid json');
  const res = await handleAction(req, { root: '', token: 'token' });
  assert.strictEqual(res.status, 400);
  assert.match(res.body.error, /Invalid JSON/);
});

test('handleAction blocks disallowed command', async () => {
  const req = createReq({ host: 'localhost', origin: 'http://localhost', 'x-truss-token': 'token' }, JSON.stringify({ command: 'rm' }));
  const res = await handleAction(req, { root: '', token: 'token' });
  assert.strictEqual(res.status, 400);
  assert.match(res.body.error, /Invalid command/);
});
