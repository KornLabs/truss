import { html, Component } from '../../vendor/preact-htm.mjs';
import { Card, CardHead, Badge, Button, Icons, copyText } from '../components.js';

const GITHUB_URL = 'https://github.com/KornLabs/truss';
const DOCS_URL = `${GITHUB_URL}/tree/main/.truss/docs`;
const ISSUES_URL = `${GITHUB_URL}/issues`;
const LICENSE_URL = `${GITHUB_URL}/blob/main/LICENSE`;

const code = (t) => html`<code class="mono" style="font-size:12px;padding:2px 6px;background:var(--surface-2);border-radius:5px">${t}</code>`;
const fmtDate = (iso) => {
  if (!iso) return '—';
  try { const d = new Date(iso); return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return iso; }
};
const principle = (lead, rest) => html`<li style="margin-bottom:7px"><strong>${lead}</strong> ${rest}</li>`;

const bugTemplate = (version) =>
`## Bug Report

**Truss version:** ${version || '(unknown)'}
**Node version:** (run \`node -v\`)
**OS:** (e.g. macOS 15.x / Ubuntu 24.04 / Windows 11)

### Steps to reproduce
1. …
2. …
3. …

### Expected behavior
…

### Actual behavior
…

### Additional context
(logs, screenshots, config snippets)
`;

export class AboutOverviewView extends Component {
  render({ state }) {
    const version = state?.meta?.version || '—';
    const root = state?.meta?.root || '—';
    const generatedAt = state?.meta?.generatedAt;

    return html`
      <!-- ── Hero ──────────────────────────────────────────────── -->
      <${Card}>
        <div style="display:flex;flex-direction:column;align-items:center;text-align:center;padding:28px 12px 20px">
          <div style="font-size:42px;color:var(--accent);margin-bottom:10px;line-height:1">${Icons.Logo()}</div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
            <h2 style="margin:0;font-size:22px;font-weight:700;letter-spacing:-0.02em">Truss</h2>
            <${Badge} variant="accent">${version}<//>
          </div>
          <p class="muted" style="font-size:13.5px;line-height:1.5;max-width:460px;margin:0 0 20px">
            A light, file-based frame that carries a project's context, decisions, and current focus —
            so an AI agent can boot-strap from it every session instead of starting from zero.
          </p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
            <${Button} variant="primary" icon=${Icons.Star} onClick=${() => window.open(GITHUB_URL, '_blank')}>View on GitHub<//>
            <${Button} icon=${Icons.Doc} onClick=${() => window.open(DOCS_URL, '_blank')}>Documentation<//>
          </div>
        </div>
      <//>

      <!-- ── What is Truss ─────────────────────────────────────── -->
      <${Card}>
        <${CardHead} icon=${Icons.Help} title="What is Truss" />
        <div class="measure" style="font-size:13px;line-height:1.65;color:var(--text)">
          <p style="margin:0 0 12px">
            A truss is a light framework of struts that carries the load and holds a structure's shape —
            without being the building. Truss does the same for a project worked on with AI agents: a thin
            frame of Markdown files your work rests on, plus a tiny zero-dependency CLI that <em>checks</em>
            the structure but never decides for you.
          </p>
          <ul style="margin:0;padding-left:18px">
            ${principle('Files are the source of truth.', 'Everything the agent needs is plain Markdown you can read, edit, and diff.')}
            ${principle('Scripts check and report — never decide.', 'The CLI surfaces drift; humans and agents make the calls.')}
            ${principle('Zero dependencies.', 'Node ≥ 20 is the only requirement. Nothing to install.')}
            ${principle('Tool-agnostic.', 'Built on the open AGENTS.md convention; one boot file for any agent.')}
          </ul>
        </div>
      <//>

      <!-- ── How it compares ───────────────────────────────────── -->
      <${Card}>
        <${CardHead} icon=${Icons.Gauge} title="How it compares" />
        <div style="overflow-x:auto">
          <table class="table" style="min-width:600px">
            <thead>
              <tr>
                <th></th>
                <th style="color:var(--accent);font-weight:600">Truss</th>
                <th>Raw AGENTS.md</th>
                <th>Heavy agent frameworks</th>
              </tr>
            </thead>
            <tbody>
              <tr><td style="font-weight:500">Setup</td><td>Copy ${code('.truss/')}, run ${code('init')}</td><td>Write & maintain by hand</td><td>Install deps, configure, sometimes a service</td></tr>
              <tr><td style="font-weight:500">Dependencies</td><td><strong>None</strong> — Node ≥ 20 only</td><td>None</td><td>Many (npm/PyPI, lockfiles)</td></tr>
              <tr><td style="font-weight:500">Cost to run</td><td><strong>None</strong> — your existing subscription</td><td>None</td><td>Often metered API keys</td></tr>
              <tr><td style="font-weight:500">Memory</td><td>Structured Markdown: context, decisions, phases</td><td>One flat file you curate</td><td>Framework DB or vendor store</td></tr>
              <tr><td style="font-weight:500">Drift detection</td><td>${code('doctor')} checks the files agree</td><td>None</td><td>Varies</td></tr>
              <tr><td style="font-weight:500">Guardrails</td><td>Human-gated phases narrow allowed actions</td><td>None</td><td>Often fully autonomous</td></tr>
              <tr><td style="font-weight:500">Who decides</td><td>Humans & agents; scripts only report</td><td>You</td><td>Framework may act alone</td></tr>
              <tr><td style="font-weight:500">Tool-agnostic</td><td>Yes — AGENTS.md standard</td><td>Yes</td><td>Usually one runtime</td></tr>
              <tr><td style="font-weight:500">Lock-in</td><td><strong>None</strong> — plain, git-diffable files</td><td>None</td><td>Framework + sometimes hosted state</td></tr>
              <tr><td style="font-weight:500">Context load</td><td>~3k tokens</td><td>Whatever you put in</td><td>Can be heavy</td></tr>
            </tbody>
          </table>
        </div>
      <//>

      <div class="grid cols-auto-lg">
        <!-- ── Support & feedback ──────────────────────────────── -->
        <${Card} className="card-fill">
          <${CardHead} icon=${Icons.Flag} title="Support & feedback" />
          <p class="muted" style="font-size:12.5px;line-height:1.5;margin:0 0 14px">
            A star helps others find Truss; an issue helps it improve.
          </p>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <${Button} variant="primary" icon=${Icons.Star} onClick=${() => window.open(GITHUB_URL, '_blank')}>Star on GitHub<//>
            <${Button} icon=${Icons.Alert} onClick=${() => window.open(ISSUES_URL, '_blank')}>Open an issue<//>
            <${Button} icon=${Icons.Copy} onClick=${() => copyText(bugTemplate(version), 'Bug template copied')}>Copy bug template<//>
            <${Button} icon=${Icons.Copy} onClick=${() => copyText(GITHUB_URL, 'Share link copied')}>Copy share link<//>
          </div>
        <//>

        <!-- ── System / diagnostics ────────────────────────────── -->
        <${Card} className="card-fill">
          <${CardHead} icon=${Icons.Laptop} title="System">
            <a href=${LICENSE_URL} target="_blank" rel="noopener" style="font-size:12px;color:var(--text-2);text-decoration:none">MIT License ↗</a>
          <//>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px">
            <div>
              <div class="dim" style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px">Version</div>
              <div style="font-size:14px;font-weight:600">${version}</div>
            </div>
            <div>
              <div class="dim" style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px">Generated at</div>
              <div style="font-size:13px">${fmtDate(generatedAt)}</div>
            </div>
            <div style="grid-column:1 / -1">
              <div class="dim" style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px">Workspace root</div>
              <div class="mono" style="font-size:12.5px;word-break:break-all">${root}</div>
            </div>
          </div>
        <//>
      </div>
    `;
  }
}
