import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { lockPath, readLock, isPidAlive, checkExistingLock, writeLock, removeLock } from '../lib/lock.mjs';
import { startDashboard } from '../server.mjs';
import { THRESHOLDS, TRUSS_BASELINE, budgetStatus } from '../ui/context-config.js';

const mkRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'truss-dash-'));
const DEAD_PID = 2147483646; // far above any realistic live pid

test('isPidAlive: own pid alive, bogus pid dead', () => {
  assert.equal(isPidAlive(process.pid), true);
  assert.equal(isPidAlive(DEAD_PID), false);
  assert.equal(isPidAlive(-1), false);
  assert.equal(isPidAlive(0), false);
});

test('writeLock/readLock/removeLock roundtrip stamps current pid', () => {
  const root = mkRoot();
  writeLock(root, { port: 3741, url: 'http://127.0.0.1:3741' });
  const lock = readLock(root);
  assert.equal(lock.pid, process.pid);
  assert.equal(lock.port, 3741);
  assert.ok(lock.startedAt);
  removeLock(root);
  assert.equal(readLock(root), null);
});

test('checkExistingLock reclaims a stale (dead-pid) lock', () => {
  const root = mkRoot();
  fs.mkdirSync(path.dirname(lockPath(root)), { recursive: true });
  fs.writeFileSync(lockPath(root), JSON.stringify({ pid: DEAD_PID, port: 9, url: 'http://x' }));
  assert.equal(checkExistingLock(root), null);          // treated as stale
  assert.equal(fs.existsSync(lockPath(root)), false);   // and removed
});

test('checkExistingLock detects a live foreign instance', () => {
  const root = mkRoot();
  const child = spawn(process.execPath, ['-e', 'setInterval(()=>{}, 1e9)'], { stdio: 'ignore' });
  try {
    fs.mkdirSync(path.dirname(lockPath(root)), { recursive: true });
    fs.writeFileSync(lockPath(root), JSON.stringify({ pid: child.pid, port: 1234, url: 'http://127.0.0.1:1234' }));
    const hit = checkExistingLock(root);
    assert.ok(hit, 'should report the running instance');
    assert.equal(hit.port, 1234);
  } finally {
    child.kill();
  }
});

test('autoPort hops to a free port when the target is taken', async () => {
  const root = mkRoot();
  const a = await startDashboard({ root, port: 0 });           // OS-assigned free port
  try {
    const b = await startDashboard({ root, port: a.port, autoPort: true }); // collides → hop
    try {
      assert.notEqual(b.port, a.port, 'second server must land on a different port');
    } finally { b.server.close(); }
  } finally { a.server.close(); }
});

test('singleInstance: second launch for same project returns the running one', async () => {
  const root = mkRoot();
  const a = await startDashboard({ root, port: 0, singleInstance: true });
  try {
    assert.ok(fs.existsSync(lockPath(root)), 'lock written');
    const b = await startDashboard({ root, port: 0, singleInstance: true });
    assert.equal(b.alreadyRunning, true);
    assert.equal(b.url, a.url);
    assert.equal(b.server, undefined, 'no second server is started');
  } finally { a.server.close(); }
});

test('config: bands are floor 2.5k / green 7k / yellow 12k', () => {
  assert.equal(TRUSS_BASELINE, 2500);
  assert.equal(THRESHOLDS.floor, 2500);
  assert.equal(THRESHOLDS.green, 7000);
  assert.equal(THRESHOLDS.yellow, 12000);
  assert.equal(budgetStatus(2500).tone, 'ok');
  assert.equal(budgetStatus(7000).tone, 'ok');
  assert.equal(budgetStatus(7001).tone, 'warn');
  assert.equal(budgetStatus(12000).tone, 'warn');
  assert.equal(budgetStatus(12001).tone, 'err');
});
