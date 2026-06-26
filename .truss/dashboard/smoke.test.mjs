import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startDashboard } from './server.mjs';

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(__filename, '../../..');

test('Dashboard E2E Smoke Test', async (t) => {
  const { server, port, url } = await startDashboard({ root, port: 0 }); // 0 means dynamic port

  try {
    const data = await new Promise((resolve, reject) => {
      http.get(`${url}/api/state`, (res) => {
        if (res.statusCode !== 200) {
          return reject(new Error(`Status code: ${res.statusCode}`));
        }
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
    });

    assert.ok(data, 'Should return JSON object');
    assert.ok(data.current || data.doctor || data.phase, 'Should contain state keys like current or phase');
    
  } finally {
    server.close();
  }
});
