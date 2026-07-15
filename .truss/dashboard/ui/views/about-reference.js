import { html, Component } from '../../vendor/preact-htm.mjs';
import { Card, CardHead, Badge, Button, Icons, copyText } from '../components.js';
import { CHECK_CATALOG, PREFERENCE_GROUPS } from '../catalog-data.js';

const GITHUB_URL = 'https://github.com/KornLabs/truss';

const code = (t) => html`<code class="mono" style="font-size:12px;padding:2px 6px;background:var(--surface-2);border-radius:5px">${t}</code>`;

const sev = (s) => {
  const v = s === 'E' ? 'err' : s === 'W' ? 'warn' : 'accent';
  return html`<${Badge} variant=${v}>${s}<//>`;
};

const COMMANDS = [
  { cmd: 'init', flags: '--name, --lang, --overlay, --repo, --code-root', desc: 'Scaffold a fresh workspace' },
  { cmd: 'status', flags: '—', desc: 'Compact workspace status summary' },
  { cmd: 'doctor', flags: '--gate, --json, --html, --fix-prompt', desc: 'Check workspace health (read-only)' },
  { cmd: 'render', flags: '—', desc: 'Sync phase block in AGENTS.md from phases.md' },
  { cmd: 'phase', flags: '[id]', desc: 'List phases or set current phase' },
  { cmd: 'set', flags: '<key> <value>', desc: 'Change an agent preference' },
  { cmd: 'map', flags: '—', desc: 'Regenerate state/map.md domain overview' },
  { cmd: 'repo-map', flags: '—', desc: 'Print a bounded read-only code-root map' },
  { cmd: 'dashboard', flags: '--port, --no-open, --read-only', desc: 'Start local web dashboard' },
  { cmd: 'prompt', flags: 'save|reset|delete <id>', desc: 'Manage custom prompts' },
  { cmd: 'help', flags: '—', desc: 'List all commands' },
];

const PREFS = PREFERENCE_GROUPS.flatMap(group => group.items).map(pref => ({
  key: pref.key,
  values: pref.free ? 'off or any short word' : pref.values.join(' · '),
  def: pref.def,
}));

const CHECKS = CHECK_CATALOG;

const STATE_FILES = [
  { file: 'AGENTS.md', purpose: 'Boot file — load order, structure, rules', owner: 'Agent (generated blocks: Script)' },
  { file: 'VISION.md', purpose: 'Problem, idea, principles, constraints', owner: 'Human + Agent' },
  { file: 'README.md', purpose: 'Human onboarding', owner: 'Agent' },
  { file: 'HUMAN-TODOS.md', purpose: 'Human-only actions (HT-NNN)', owner: 'Agent writes, Human resolves' },
  { file: 'state/current.md', purpose: 'Live focus, next actions, blockers', owner: 'Agent' },
  { file: 'state/decisions.md', purpose: 'Decided decisions (D-NNN)', owner: 'Agent' },
  { file: 'state/open-decisions.md', purpose: 'Open questions (OD-NNN)', owner: 'Agent' },
  { file: 'state/phases.md', purpose: 'Phase definitions + current pointer', owner: 'Human (current:) + Agent (defs)' },
  { file: 'state/profile.md', purpose: 'Project metadata', owner: 'Agent' },
  { file: 'state/risks.md', purpose: 'Risks (R-NNN)', owner: 'Agent' },
  { file: 'state/learnings.md', purpose: 'Learnings (L-NNN)', owner: 'Agent' },
  { file: 'state/map.md', purpose: 'Domain file overview', owner: 'Script (truss map)' },
];

const IDS = [
  { prefix: 'D-NNN', meaning: 'Decision', file: 'state/decisions.md', rules: 'Sequential, never reused, supersede don\'t delete' },
  { prefix: 'OD-NNN', meaning: 'Open Decision', file: 'state/open-decisions.md', rules: 'Promote to D-NNN when resolved' },
  { prefix: 'HT-NNN', meaning: 'Human Todo', file: 'HUMAN-TODOS.md', rules: 'Only humans can resolve' },
  { prefix: 'L-NNN', meaning: 'Learning', file: 'state/learnings.md', rules: 'Recurring agent weaknesses' },
  { prefix: 'R-NNN', meaning: 'Risk', file: 'state/risks.md', rules: 'Project / launch / safety risks' },
];

export class AboutReferenceView extends Component {
  render({ state }) {
    return html`
      <!-- ── CLI Commands ──────────────────────────────────── -->
      <${Card}>
        <${CardHead} icon=${Icons.Terminal} title="CLI Commands" />
        <div style="overflow-x:auto">
          <table class="table">
            <thead><tr><th>Command</th><th>Flags</th><th>Description</th></tr></thead>
            <tbody>
              ${COMMANDS.map(c => html`
                <tr><td>${code(c.cmd)}</td><td style="font-size:12px;color:var(--text-2)">${c.flags}</td><td>${c.desc}</td></tr>
              `)}
            </tbody>
          </table>
        </div>
        <p class="muted" style="font-size:12px;margin:12px 0 0">
          Doctor exit codes: ${code('0')} = clean · ${code('1')} = warnings · ${code('2')} = at least one error.
        </p>
      <//>

      <!-- ── Preference Keys ───────────────────────────────── -->
      <${Card}>
        <${CardHead} icon=${Icons.Sliders} title="Preference Keys" />
        <div style="overflow-x:auto">
          <table class="table">
            <thead><tr><th>Key</th><th>Values</th><th>Default</th></tr></thead>
            <tbody>
              ${PREFS.map(p => html`
                <tr>
                  <td>${code(p.key)}</td>
                  <td style="font-size:12px;color:var(--text-2)">${p.values}</td>
                  <td><${Badge} variant="accent">${p.def}<//></td>
                </tr>
              `)}
            </tbody>
          </table>
        </div>
      <//>

      <!-- ── Check Catalogue ───────────────────────────────── -->
      <${Card}>
        <${CardHead} icon=${Icons.Stethoscope} title="Check Catalogue" />
        <div style="overflow-x:auto">
          <table class="table">
            <thead><tr><th>ID</th><th>Sev</th><th>What it checks</th></tr></thead>
            <tbody>
              ${CHECKS.map(c => html`
                <tr><td>${code(c.id)}</td><td>${sev(c.sev)}</td><td>${c.desc}</td></tr>
              `)}
            </tbody>
          </table>
        </div>
      <//>

      <!-- ── State Files ───────────────────────────────────── -->
      <${Card}>
        <${CardHead} icon=${Icons.File} title="State Files" />
        <div style="overflow-x:auto">
          <table class="table">
            <thead><tr><th>File</th><th>Purpose</th><th>Owner</th></tr></thead>
            <tbody>
              ${STATE_FILES.map(f => html`
                <tr><td>${code(f.file)}</td><td>${f.purpose}</td><td style="font-size:12px;color:var(--text-2)">${f.owner}</td></tr>
              `)}
            </tbody>
          </table>
        </div>
      <//>

      <!-- ── Structured IDs ────────────────────────────────── -->
      <${Card}>
        <${CardHead} icon=${Icons.Tag} title="Structured IDs" />
        <div style="overflow-x:auto">
          <table class="table">
            <thead><tr><th>Prefix</th><th>Meaning</th><th>Canonical file</th><th>Rules</th></tr></thead>
            <tbody>
              ${IDS.map(i => html`
                <tr><td>${code(i.prefix)}</td><td style="font-weight:500">${i.meaning}</td><td>${code(i.file)}</td><td style="font-size:12px;color:var(--text-2)">${i.rules}</td></tr>
              `)}
            </tbody>
          </table>
        </div>
      <//>

      <!-- ── Links ─────────────────────────────────────────── -->
      <${Card}>
        <${CardHead} icon=${Icons.Star} title="Links" />
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <${Button} variant="primary" icon=${Icons.Star} onClick=${() => window.open(GITHUB_URL, '_blank')}>GitHub Repository<//>
          <${Button} icon=${Icons.Doc} onClick=${() => window.open(`${GITHUB_URL}/tree/main/.truss/docs`, '_blank')}>Documentation<//>
          <${Button} icon=${Icons.Alert} onClick=${() => window.open(`${GITHUB_URL}/issues`, '_blank')}>Issues<//>
          <${Button} icon=${Icons.File} onClick=${() => window.open(`${GITHUB_URL}/blob/main/LICENSE`, '_blank')}>MIT License<//>
          <${Button} icon=${Icons.Doc} onClick=${() => window.open('https://agents.md', '_blank')}>AGENTS.md convention<//>
        </div>
      <//>
    `;
  }
}
