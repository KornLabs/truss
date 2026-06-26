import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startDashboard } from '../server.mjs';

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(__filename, '../../../..');

test('Dashboard Security Tests (WP-34)', async (t) => {
  const { server, port, url } = await startDashboard({ root, port: 0 });

  const makePost = (options) => {
    return new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, body });
        });
      });
      req.on('error', reject);
      req.end();
    });
  };

  try {
    await t.test('POST /api/action without token should be 403', async () => {
      const res = await makePost({
        hostname: '127.0.0.1',
        port,
        path: '/api/action',
        method: 'POST',
        headers: {}
      });
      assert.strictEqual(res.statusCode, 403, 'Expected 403 Forbidden without token');
    });

    await t.test('POST /api/action with invalid token should be 403', async () => {
      const res = await makePost({
        hostname: '127.0.0.1',
        port,
        path: '/api/action',
        method: 'POST',
        headers: {
          'x-truss-token': 'invalid-token-123'
        }
      });
      assert.strictEqual(res.statusCode, 403, 'Expected 403 Forbidden with invalid token');
    });

    await t.test('Any request with manipulated Host header should be 403', async () => {
      const res = await makePost({
        hostname: '127.0.0.1',
        port,
        path: '/api/action',
        method: 'POST',
        headers: {
          'Host': 'evil.com'
        }
      });
      assert.strictEqual(res.statusCode, 403, 'Expected 403 Forbidden with manipulated Host header');
    });

  } finally {
    server.close();
  }
});
