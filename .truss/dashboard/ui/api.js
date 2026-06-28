// Central client API. All mutations go through the hardened /api/action executor
// (per-session token, host/origin check, command whitelist, execFile arg-array, single-flight).
const token = () => window.__TRUSS_TOKEN__ || '';

async function getJSON(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// Returns { ok, data } | { ok:false, error } | { ok:false, readOnly:true }
async function action(command, args = []) {
  const res = await fetch('/api/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Truss-Token': token() },
    body: JSON.stringify({ command, args }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 403 && /read-only/i.test(data.error || '')) {
    window.toast && window.toast('Dashboard is in read-only mode', 'warn');
    return { ok: false, readOnly: true };
  }
  if (!res.ok || data.ok === false) {
    return { ok: false, error: data.error || res.statusText, output: data.output, stderr: data.stderr, fixPrompt: data.fixPrompt };
  }
  return { ok: true, data };
}

export const api = {
  state: () => getJSON('/api/state'),
  doctor: () => getJSON('/api/doctor'),
  contextBudget: () => getJSON('/api/context-budget'),
  gitStatus: () => getJSON('/api/git/status'),
  gitTree: () => getJSON('/api/git/tree'),
  gitBranches: () => getJSON('/api/git/branches'),
  prompts: () => getJSON('/api/prompts'),
  file: (name) => getJSON(`/api/file?name=${encodeURIComponent(name)}`),

  exec: (command, args = []) => action(command, args),
  setPref: (key, value) => action('set', [key, value]),
  savePrompt: (id, content) => action('prompt', ['save', id, content]),
  resetPrompt: (id) => action('prompt', ['reset', id]),
  deletePrompt: (id) => action('prompt', ['delete', id]),
};
