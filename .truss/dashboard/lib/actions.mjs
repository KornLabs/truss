import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DASHBOARD_SAFE_COMMANDS } from '../../lib/command-meta.mjs';

const execFileAsync = promisify(execFile);

// State to track if an action is currently running
let isActionRunning = false;

// Allowed commands per the whitelist — derived from the single command-meta source
// (dashboardSafe flag): read-only checks (doctor/map/render) and the confined
// writers (set → AGENTS.md prefs block; prompt → prompts/custom/ only). Never
// init/add or phase changes — those stay human (GE-15).
const ALLOWED_COMMANDS = DASHBOARD_SAFE_COMMANDS;

export async function handleAction(req, { root, token, readOnly }) {
  // 1. Origin/Host-Check
  const host = req.headers['host'] || '';
  const origin = req.headers['origin'] || '';
  
  // Exact/colon match only — mirrors server.mjs and blocks DNS-rebinding hosts
  // like "localhost.attacker.com" (no colon, not an exact match).
  const isLocalHost = host.startsWith('127.0.0.1:') || host.startsWith('localhost:')
    || host === '127.0.0.1' || host === 'localhost';
  // Origin can be empty in some local programmatic calls, but if present, must be
  // localhost — same exact/colon bounds as the host check (blocks localhost.attacker.com).
  const isLocalOrigin = !origin
    || origin === 'http://127.0.0.1' || origin.startsWith('http://127.0.0.1:')
    || origin === 'http://localhost' || origin.startsWith('http://localhost:');

  if (!isLocalHost || !isLocalOrigin) {
    return { status: 403, body: { ok: false, error: 'Forbidden: Invalid Host or Origin (AD-12)' } };
  }

  // 2. Token-Check
  const clientToken = req.headers['x-truss-token'];
  if (!clientToken || clientToken !== token) {
    return { status: 403, body: { ok: false, error: 'Forbidden: Invalid or missing token (AD-12)' } };
  }

  // 3. readOnly check
  if (readOnly) {
    return { status: 403, body: { ok: false, error: 'Forbidden: Dashboard is in read-only mode' } };
  }

  // 4. Single-Flight-Queue
  if (isActionRunning) {
    return { status: 409, body: { ok: false, error: 'Conflict: Another action is currently running' } };
  }

  // Extract body
  let bodyData = '';
  try {
    for await (const chunk of req) {
      bodyData += chunk;
      if (bodyData.length > 1024 * 1024) { // 1MB limit
        return { status: 413, body: { ok: false, error: 'Payload too large' } };
      }
    }
  } catch (e) {
    return { status: 400, body: { ok: false, error: 'Bad request payload' } };
  }

  let action;
  try {
    action = JSON.parse(bodyData);
  } catch (e) {
    return { status: 400, body: { ok: false, error: 'Invalid JSON body' } };
  }

  const { command, args = [] } = action;

  // 5. Whitelist+Validierung
  if (!command || !ALLOWED_COMMANDS.includes(command)) {
    return { status: 400, body: { ok: false, error: 'Invalid command. Must be one of: ' + ALLOWED_COMMANDS.join(', ') } };
  }

  // Ensure args are strings to prevent arbitrary object injection
  const safeArgs = (Array.isArray(args) ? args : []).map(arg => String(arg));

  isActionRunning = true;
  try {
    const { stdout, stderr } = await execFileAsync(
      'node',
      ['.truss/bin/truss.mjs', command, ...safeArgs],
      {
        cwd: root,
        timeout: 10000,
        maxBuffer: 5 * 1024 * 1024 // 5MB
      }
    );

    // Extract fixPrompt if it exists in stdout
    let fixPrompt;
    let outputData = stdout;
    try {
      const parsed = JSON.parse(stdout);
      if (parsed.fixPrompt) {
        fixPrompt = parsed.fixPrompt;
      }
      if (parsed.output) {
        outputData = parsed.output;
      }
    } catch (e) {
      // stdout is not JSON, leave as string
    }

    return {
      status: 200,
      body: {
        ok: true,
        output: outputData,
        stderr: stderr || undefined,
        fixPrompt
      }
    };
  } catch (error) {
    let fixPrompt;
    let outputData = error.stdout || '';
    
    // Attempt to parse JSON error output to extract fixPrompt
    try {
      if (error.stdout) {
        const parsed = JSON.parse(error.stdout);
        if (parsed.fixPrompt) fixPrompt = parsed.fixPrompt;
        if (parsed.output) outputData = parsed.output;
      }
    } catch (e) {
      // stdout is not JSON
    }

    return {
      status: error.code === 'ETIMEDOUT' ? 504 : 500,
      body: {
        ok: false,
        error: error.message,
        output: outputData,
        stderr: error.stderr,
        fixPrompt
      }
    };
  } finally {
    isActionRunning = false;
  }
}
