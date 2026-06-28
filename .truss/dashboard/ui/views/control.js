import { html, Component } from '../../vendor/preact-htm.mjs';
import { Card, CardHead, Badge, Button, Icons, Dot, Spinner, Modal, copyText } from '../components.js';
import { api } from '../api.js';

const SCRIPTS = [
  { cmd: 'doctor', args: ['--json'], label: 'Run doctor', icon: Icons.Stethoscope, desc: 'Run all health checks (structure, blocks, phases, sync, context) and refresh the report.' },
  { cmd: 'map', args: [], label: 'Rebuild map', icon: Icons.Map, desc: 'Regenerate state/map.md from the domain files on disk.' },
  { cmd: 'render', args: [], label: 'Render AGENTS.md', icon: Icons.Refresh, desc: 'Re-render the phase and preferences blocks into AGENTS.md from state.' },
];

const COMMANDS = [
  { group: 'Checks', items: [
    { cmd: 'doctor', desc: 'Run all workspace health checks; report findings sorted by severity.' },
    { cmd: 'doctor --gate', desc: 'Run phase-exit (gate) checks for the current phase.' },
    { cmd: 'status', desc: 'Print a short workspace status summary.' },
  ]},
  { group: 'Writers', items: [
    { cmd: 'render', desc: 'Re-render the phase + preferences blocks into AGENTS.md.' },
    { cmd: 'set <key> <value>', desc: 'Set an agent preference (writes the AGENTS.md preferences block).' },
    { cmd: 'map', desc: 'Regenerate state/map.md from the domain files.' },
    { cmd: 'prompt save <id>', desc: 'Save a custom prompt into prompts/custom/.' },
    { cmd: 'prompt reset <id>', desc: 'Remove a custom prompt override.' },
  ]},
  { group: 'Lifecycle', items: [
    { cmd: 'init', desc: 'Scaffold a new Truss workspace (core / --overlay).' },
    { cmd: 'dashboard', desc: 'Start this local dashboard (--port, --open, --read-only).' },
  ]},
];

const CMD_COUNT = COMMANDS.reduce((n, g) => n + g.items.length, 0);

export class ControlView extends Component {
  state = { running: null, results: {}, cmdOpen: false };

  run = async (s) => {
    this.setState({ running: s.cmd });
    const res = await api.exec(s.cmd, s.args);
    const out = res.ok ? res.data : { error: res.error, output: res.output, stderr: res.stderr };
    this.setState({ running: null, results: { ...this.state.results, [s.cmd]: { ...out, at: new Date() } } });
    // doctor refreshes doctor.json even on non-zero exit (findings); always reload.
    this.props.reload && this.props.reload();
    if (res.ok) window.toast && window.toast(`${s.cmd} finished`, 'ok');
    else if (s.cmd === 'doctor') window.toast && window.toast('Doctor finished — see findings', 'warn');
    else if (!res.readOnly) window.toast && window.toast(`${s.cmd} failed`, 'error');
  };

  render({ doctor, state }, { running, results, cmdOpen }) {
    // ── Init guard: workspace not yet initialised ─────────────────────────
    // state.initialized (live AGENTS.md read by assembleState) is authoritative.
    // doctor.initialized is consulted ONLY as a fallback when state is absent —
    // a stale doctor.json (e.g. a `doctor --json` run before `init`) carries
    // initialized:false forever and must NOT override the live state.
    const uninitialised = state?.initialized === false
      || (state == null && doctor?.initialized === false);
    if (uninitialised) {
      return html`
        <${Card}>
          <${CardHead} icon=${Icons.Stethoscope} title="Workspace not initialised" />
          <div style="padding:4px 0 8px;font-size:14px;line-height:1.6">
            <p style="margin:0 0 12px">This folder is not a Truss workspace yet.</p>
            <p style="margin:0">Run <code class="mono" style="background:var(--surface-2);padding:2px 8px;border-radius:5px">node .truss/bin/truss.mjs init</code> to get started,
            or <code class="mono" style="background:var(--surface-2);padding:2px 8px;border-radius:5px">node .truss/bin/truss.mjs init --overlay</code> for an existing project.</p>
          </div>
        <//>`;
    }

    const summary = doctor?.summary;
    const findings = (doctor?.findings || []).slice().sort((a, b) => sev(b.severity) - sev(a.severity));
    const hasFindings = findings.length > 0;

    return html`
      <${Card}>
        <${CardHead} icon=${Icons.Terminal} title="Scripts">
          <div class="row" style="gap:8px">
            ${doctor && doctor.available !== false && html`<${Badge} variant=${summary?.errors ? 'err' : summary?.warnings ? 'warn' : 'ok'}>
              ${summary?.errors ? `${summary.errors} errors` : summary?.warnings ? `${summary.warnings} warnings` : 'Doctor clean'}<//>`}
            <${Button} className="sm" icon=${Icons.Terminal} onClick=${() => this.setState({ cmdOpen: true })}>
              Truss commands <span style="background:var(--surface-2);border-radius:9px;padding:1px 7px;font-size:11px;font-weight:600;margin-left:2px">${CMD_COUNT}</span><//>
          </div>
        <//>
        <p class="muted" style="font-size:12.5px;line-height:1.5;margin-bottom:16px">
          Each button runs a whitelisted CLI command on the workspace via a hardened executor
          (per-session token, fixed argument list, no shell).</p>
        <div class="grid cols-auto">
          ${SCRIPTS.map(s => {
            const r = results[s.cmd]; const isRun = running === s.cmd;
            return html`
            <div key=${s.cmd} style="border:1px solid var(--border);border-radius:var(--r-md);padding:15px;display:flex;flex-direction:column;gap:10px">
              <div class="row" style="gap:9px">
                <span style="color:var(--accent);display:inline-flex">${s.icon()}</span>
                <strong style="font-size:14px">${s.label}</strong>
                ${r && !r.error && html`<span title="Completed" style="color:var(--ok);display:inline-flex;align-items:center;width:15px;height:15px;flex:none"><${Icons.CheckCircle} /></span>`}
                ${r && r.error && s.cmd !== 'doctor' && html`<${Dot} status="err" />`}
              </div>
              <p class="muted" style="font-size:12px;line-height:1.45;flex:1">${s.desc}</p>
              <${Button} variant="primary" className="sm" disabled=${isRun} onClick=${() => this.run(s)}
                icon=${isRun ? null : Icons.Play}>${isRun ? html`<${Spinner} /> Running…` : 'Run'}<//>
            </div>`;
          })}
        </div>
      <//>

      ${hasFindings && html`
        <${Card}>
          <${CardHead} icon=${Icons.Alert} iconColor="var(--warn)" title=${`Doctor findings · ${findings.length}`}>
            <div class="row" style="gap:12px;align-items:center">
              <span class="dim" style="font-size:11.5px">${results['doctor']?.at?.toLocaleTimeString?.() || (doctor.timestamp ? new Date(doctor.timestamp).toLocaleTimeString() : '')}</span>
              <${Button} variant="primary" className="sm" icon=${Icons.Copy}
                onClick=${() => copyText(fixAllPrompt(findings), 'Fix-all prompt copied')}>Copy fix-all prompt<//>
            </div>
          <//>
          <div class="col" style="gap:2px">
            ${findings.map((f, i) => html`
              <div key=${i} class="row" style="gap:10px;padding:9px 0;border-bottom:1px solid var(--border);align-items:flex-start">
                <span class="badge ${f.severity === 'E' ? 'err' : f.severity === 'W' ? 'warn' : 'neutral'}" style="width:26px;justify-content:center;flex:none">${f.severity}</span>
                <div style="min-width:0;flex:1">
                  <div class="row" style="gap:8px"><span class="mono" style="font-size:12px">${f.id}</span>
                    ${f.file ? html`<span class="mono dim" style="font-size:11.5px">${f.file}</span>` : ''}</div>
                  <div style="font-size:13px;margin-top:2px">${f.message || f.title}</div>
                  ${f.fix ? html`<div class="dim" style="font-size:12px;margin-top:3px"><span style="color:var(--ok)">Fix:</span> ${f.fix}</div>` : ''}
                </div>
              </div>`)}
          </div>
        <//>`}

      ${doctor && doctor.available !== false && !hasFindings && summary && html`
        <${Card}><div class="row" style="gap:10px;color:var(--ok)"><${Icons.CheckCircle} /><span style="font-size:14px;color:var(--text)">Doctor is clean — no findings.</span><span class="dim" style="margin-left:auto;font-size:11.5px">${results['doctor']?.at?.toLocaleTimeString?.() || (doctor.timestamp ? new Date(doctor.timestamp).toLocaleTimeString() : '')}</span></div><//>`}

      ${Object.entries(results).filter(([cmd]) => cmd !== 'doctor').map(([cmd, r]) => html`
        <${Card} key=${cmd}>
          <${CardHead} icon=${r.error ? Icons.Alert : Icons.CheckCircle} iconColor=${r.error ? 'var(--err)' : 'var(--ok)'} title=${`Output · ${cmd}`}>
            <span class="dim" style="font-size:11.5px">${r.at?.toLocaleTimeString?.() || ''}</span>
          <//>
          <pre class="mono" style="margin:0;white-space:pre-wrap;font-size:12px;line-height:1.5;max-height:260px;overflow:auto;color:${r.error ? 'var(--err)' : 'var(--text-2)'}">${(r.output || r.error || '').trim() || '(no output)'}${r.stderr ? '\n' + r.stderr : ''}</pre>
        <//>`)}

      <${Modal} open=${cmdOpen} onClose=${() => this.setState({ cmdOpen: false })} icon=${Icons.Terminal} title="Truss commands" width=${680}>
        <p class="muted" style="font-size:12.5px;margin-bottom:18px">Run from the workspace root — prefix every command with <span class="mono" style="background:var(--surface-2);padding:1px 6px;border-radius:5px">node .truss/bin/truss.mjs</span>. Hover a row and use the copy button to grab the full command.</p>
        <div class="col" style="gap:20px">
          ${COMMANDS.map(g => html`
            <div key=${g.group}>
              <div class="row between" style="margin-bottom:9px;align-items:baseline">
                <div class="pref-group-title">${g.group}</div>
                <span class="dim" style="font-size:11px">${g.items.length} command${g.items.length > 1 ? 's' : ''}</span>
              </div>
              <div style="border:1px solid var(--border);border-radius:var(--r-md);overflow:hidden">
                ${g.items.map((it, i) => html`
                  <div key=${it.cmd}
                    style=${`display:grid;grid-template-columns:minmax(150px,210px) 1fr auto;gap:14px;align-items:center;padding:10px 12px;${i > 0 ? 'border-top:1px solid var(--border);' : ''}`}>
                    <code class="mono" style="font-size:12.5px;font-weight:600;color:var(--accent);background:var(--accent-soft);padding:4px 9px;border-radius:6px;justify-self:start;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title=${it.cmd}>${it.cmd}</code>
                    <div class="muted" style="font-size:12.5px;line-height:1.45">${it.desc}</div>
                    <button class="icon-btn" style="flex:none" aria-label="Copy command" title="Copy full command"
                      onClick=${() => copyText(`node .truss/bin/truss.mjs ${it.cmd}`, 'Command copied')}><${Icons.Copy} /></button>
                  </div>`)}
              </div>
            </div>`)}
        </div>
      <//>`;
  }
}

function sev(s) { return s === 'E' ? 3 : s === 'W' ? 2 : 1; }

function fixAllPrompt(findings) {
  const items = findings.map((f, i) => {
    const tag = f.severity === 'E' ? 'error' : f.severity === 'W' ? 'warning' : 'info';
    return `${i + 1}. [${tag}] ${f.id}${f.file ? ` (${f.file})` : ''}: ${f.message || f.title}` + (f.fix ? `\n   Fix: ${f.fix}` : '');
  }).join('\n');
  return `Truss doctor reports ${findings.length} finding(s). Resolve each one, consistent with AGENTS.md and STRUKTUR.md. `
    + `Work through them in order, show a diff before writing any file, and re-run \`doctor\` afterwards to confirm everything clears.\n\n${items}`;
}
