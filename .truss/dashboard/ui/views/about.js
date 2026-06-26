import { html, Component } from '../../vendor/preact-htm.mjs';
import { Card, CardHead, Badge, Button, Icons, copyText } from '../components.js';

const GITHUB_URL = 'https://github.com/niklasbuechner/truss';

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

const fmtDate = (iso) => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch { return iso; }
};

export class AboutView extends Component {
  render({ state, go }) {
    const version = state?.meta?.version || '—';
    const root = state?.meta?.root || '—';
    const generatedAt = state?.meta?.generatedAt;

    return html`
      <!-- Hero -->
      <${Card}>
        <div style="display:flex;flex-direction:column;align-items:center;text-align:center;padding:28px 12px 18px">
          <div style="font-size:42px;color:var(--accent);margin-bottom:10px;line-height:1">${Icons.Logo()}</div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
            <h2 style="margin:0;font-size:22px;font-weight:700;letter-spacing:-0.02em">Truss</h2>
            <${Badge} variant="accent">${version}<//>
          </div>
          <p class="muted" style="font-size:13.5px;line-height:1.5;max-width:420px;margin:0 0 20px">
            A file-based workspace framework for AI-assisted projects
          </p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
            <${Button} variant="primary" icon=${Icons.Star}
              onClick=${() => window.open(GITHUB_URL, '_blank')}>View on GitHub<//>
            <${Button} icon=${Icons.Doc}
              onClick=${() => go('prompts')}>Documentation<//>
          </div>
        </div>
      <//>

      <!-- Star & Share -->
      <${Card}>
        <${CardHead} icon=${Icons.Star} title="Support Truss" />
        <p class="muted" style="font-size:12.5px;line-height:1.5;margin-bottom:16px">
          If Truss helps your workflow, a star helps others find it.
        </p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <${Button} variant="primary"
            onClick=${() => window.open(GITHUB_URL, '_blank')}>
            <span style="display:inline-flex;align-items:center;gap:6px">
              <span style="font-size:15px;line-height:1">${Icons.Star({ filled: true })}</span> Star on GitHub
            </span>
          <//>
          <${Button} icon=${Icons.Copy}
            onClick=${() => copyText(GITHUB_URL, 'Share link copied')}>Copy share link<//>
        </div>
      <//>

      <!-- Getting Started Tips -->
      <${Card}>
        <${CardHead} icon=${Icons.Help} title="Getting started" />
        <ol style="margin:0;padding-left:20px;font-size:13px;line-height:1.7;display:flex;flex-direction:column;gap:10px;color:var(--text)">
          <li>Start in the <strong>discover</strong> phase — fill <code class="mono" style="font-size:12px;padding:2px 5px;background:var(--surface-2);border-radius:4px">VISION.md</code> before writing code.</li>
          <li>Run <code class="mono" style="font-size:12px;padding:2px 5px;background:var(--surface-2);border-radius:4px">truss doctor</code> after each session to catch drift early.</li>
          <li>The <strong>control word</strong> (default: <code class="mono" style="font-size:12px;padding:2px 5px;background:var(--surface-2);border-radius:4px">TRUSS</code>) is a session-health canary — if it vanishes, context may be degrading.</li>
          <li>Use <code class="mono" style="font-size:12px;padding:2px 5px;background:var(--surface-2);border-radius:4px">truss set</code> or the Preferences tab to tune agent behavior without editing files.</li>
          <li>Keep <code class="mono" style="font-size:12px;padding:2px 5px;background:var(--surface-2);border-radius:4px">state/current.md</code> updated — it's the agent's memory between sessions.</li>
        </ol>
      <//>

      <!-- Feedback & Ideas -->
      <${Card}>
        <${CardHead} icon=${Icons.Flag} title="Feedback & ideas" />
        <p class="muted" style="font-size:12.5px;line-height:1.5;margin-bottom:16px">
          Found a bug or have a feature request?
        </p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <${Button} variant="primary" icon=${Icons.Alert}
            onClick=${() => window.open(`${GITHUB_URL}/issues`, '_blank')}>Open an issue<//>
          <${Button} icon=${Icons.Copy}
            onClick=${() => copyText(bugTemplate(version), 'Bug template copied')}>Copy bug template<//>
        </div>
      <//>

      <!-- System Info -->
      <${Card}>
        <${CardHead} icon=${Icons.Laptop} title="System" />
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:18px">
          <div>
            <div class="dim" style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px">Version</div>
            <div style="font-size:14px;font-weight:600">${version}</div>
          </div>
          <div>
            <div class="dim" style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px">Workspace root</div>
            <div class="mono" style="font-size:12.5px;word-break:break-all">${root}</div>
          </div>
          <div>
            <div class="dim" style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px">Generated at</div>
            <div style="font-size:13px">${fmtDate(generatedAt)}</div>
          </div>
        </div>
      <//>
    `;
  }
}
