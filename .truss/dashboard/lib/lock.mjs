// Per-project single-instance lock for the dashboard server.
//
// The lock is a small JSON file at .truss/out/dashboard.lock holding the pid,
// port and url of the running dashboard for THIS project (root). It lets a
// second `truss dashboard` in the same project detect the already-running
// instance instead of spawning a duplicate — while different projects stay
// independent because each has its own root (and its own lock + port).
//
// Liveness is checked via `process.kill(pid, 0)` (cross-platform, sends no
// signal — just probes whether the pid exists). A crashed process leaves a
// stale lock; we treat a lock whose pid is no longer alive as stale and
// reclaim it. PID reuse is a theoretical edge case; the cost is at worst one
// misdetected "already running", never data loss.

import fs from 'node:fs';
import path from 'node:path';

export function lockPath(root) {
  return path.join(root, '.truss', 'out', 'dashboard.lock');
}

export function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0); // signal 0 = existence check, doesn't actually kill
    return true;
  } catch (e) {
    // EPERM means the process exists but we can't signal it → still alive.
    return e.code === 'EPERM';
  }
}

export function readLock(root) {
  try {
    return JSON.parse(fs.readFileSync(lockPath(root), 'utf-8'));
  } catch {
    return null;
  }
}

// Returns the live lock info ({ pid, port, url, startedAt }) if a dashboard is
// already running for this project, otherwise null. A stale lock (dead pid) is
// removed as a side effect so the caller can proceed to start fresh.
export function checkExistingLock(root) {
  const lock = readLock(root);
  if (!lock) return null;
  if (isPidAlive(lock.pid)) return lock; // a live instance owns this project
  removeLock(root); // dead pid → stale lock from a crash; reclaim it
  return null;
}

export function writeLock(root, info) {
  const p = lockPath(root);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ ...info, pid: process.pid, startedAt: new Date().toISOString() }, null, 2), 'utf-8');
  return p;
}

export function removeLock(root) {
  try { fs.unlinkSync(lockPath(root)); } catch { /* already gone */ }
}
