import { html, Component } from '../../vendor/preact-htm.mjs';
import { Card, CardHead, Badge, Button, Icons, copyText } from '../components.js';

const code = (t) => html`<code class="mono" style="font-size:12px;padding:2px 6px;background:var(--surface-2);border-radius:5px">${t}</code>`;

const SETUP_PROMPT =
`I'm starting a project managed with Truss — a file-based workspace for AI agents.
Read AGENTS.md fully first and follow its §1 load order.

Project: <what it is and the problem it solves>
My role & how we work: <your role, decision style, language>
Vision / goal: <what success looks like>
Current phase: <discover · validate · plan · build   (or: ingest, for an existing codebase)>

Please:
1. Fill VISION.md (#Problem first) and state/profile.md from the above — ask me wherever it's thin instead of guessing.
2. Confirm we're in the right phase (run: truss phase) and set state/current.md with the focus and the first concrete next steps.
3. Then start the current phase.`;

const INSTALL_MAC = `git clone --depth 1 https://github.com/KornLabs/truss.git /tmp/truss
cp -R /tmp/truss/.truss ./.truss && rm -rf /tmp/truss`;

const INSTALL_WIN = `git clone --depth 1 https://github.com/KornLabs/truss.git $env:TEMP\\truss
Copy-Item -Recurse $env:TEMP\\truss\\.truss .\\.truss
Remove-Item -Recurse -Force $env:TEMP\\truss`;

const ALIAS_BASH = `alias truss='node .truss/bin/truss.mjs'`;
const ALIAS_PS = `function truss { node .truss/bin/truss.mjs @args }`;
const ALIAS_CMD = `doskey truss=node .truss/bin/truss.mjs $*`;

const codeBlock = (label, content, copyMsg) => html`
  <div style="border:1px solid var(--border);border-radius:var(--r-md);overflow:hidden;margin-bottom:8px">
    <div class="row between" style="padding:9px 12px;background:var(--surface-2);border-bottom:1px solid var(--border)">
      <span class="dim" style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em">${label}</span>
      <${Button} className="sm" icon=${Icons.Copy} onClick=${() => copyText(content, copyMsg || 'Copied')}>Copy<//>
    </div>
    <pre class="mono" style="margin:0;padding:14px 16px;font-size:12px;line-height:1.55;white-space:pre-wrap;word-break:break-word;color:var(--text)">${content}</pre>
  </div>`;

const AGENTS = [
  { name: 'Claude Code / Cowork', tip: 'Allow terminal access. Auto-approve node .truss/bin/truss.mjs commands for a smooth experience.' },
  { name: 'Gemini CLI', tip: 'Terminal enabled by default. Works out of the box with AGENTS.md.' },
  { name: 'Cursor', tip: 'Add truss CLI to allowed commands in settings. Enable workspace terminal access.' },
  { name: 'Copilot', tip: 'Ensure terminal permissions in workspace settings. Point it at AGENTS.md.' },
];

export class AboutStartView extends Component {
  render({ state }) {
    return html`
      <!-- ── Choose your path ──────────────────────────────── -->
      <${Card}>
        <${CardHead} icon=${Icons.Map} title="Choose your path" />
        <div class="grid cols-auto-lg">
          <div style="border:1px solid var(--border);border-radius:var(--r-md);padding:14px 16px">
            <div style="font-weight:600;margin-bottom:4px">New project</div>
            <div style="margin-bottom:8px">${code('truss init')}</div>
            <p class="muted" style="margin:0;font-size:12.5px;line-height:1.55">
              Scaffolds the seed lifecycle <strong>discover → validate → plan → build</strong> — the
              kickoff then tailors it to your project. Use when starting something fresh
              and you want to think before you build.
            </p>
          </div>
          <div style="border:1px solid var(--border);border-radius:var(--r-md);padding:14px 16px">
            <div style="font-weight:600;margin-bottom:4px">Existing codebase</div>
            <div style="margin-bottom:8px">${code('truss init --overlay --repo <path|url>')}</div>
            <p class="muted" style="margin:0;font-size:12.5px;line-height:1.55">
              Installs the <strong>ingest → operate</strong> flow and nests your code under ${code('repo/')}
              (symlinked or cloned, kept on its own git history).
            </p>
          </div>
        </div>
      <//>

      <!-- ── Step-by-step setup ────────────────────────────── -->
      <${Card}>
        <${CardHead} icon=${Icons.Play} title="Step-by-step setup" />
        <div style="font-size:13px;line-height:1.6;color:var(--text)">
          <ol class="step-list">
            <li class="step-item">
              <div class="step-num"></div>
              <div class="step-body">
                <h4>Drop the engine in</h4>
                <p style="margin-bottom:10px">Copy the ${code('.truss/')} folder into your project directory:</p>
                ${codeBlock('macOS / Linux', INSTALL_MAC, 'Install command copied')}
                ${codeBlock('Windows PowerShell', INSTALL_WIN, 'Install command copied')}
              </div>
            </li>
            <li class="step-item">
              <div class="step-num"></div>
              <div class="step-body">
                <h4>Scaffold the workspace</h4>
                <p style="margin-bottom:10px">Run init to create the workspace files. Add ${code('--overlay')} for an existing codebase.</p>
                ${codeBlock('Terminal', 'node .truss/bin/truss.mjs init', 'Init command copied')}
              </div>
            </li>
            <li class="step-item">
              <div class="step-num"></div>
              <div class="step-body">
                <h4>Hand the boot prompt to your agent</h4>
                <p style="margin-bottom:10px">Fill in the ${'<'}…${'>'} placeholders and paste this into your AI tool. The agent interviews you to build VISION.md:</p>
                ${codeBlock('Setup prompt — fill the <…> and paste to your agent', SETUP_PROMPT, 'Setup prompt copied')}
              </div>
            </li>
            <li class="step-item">
              <div class="step-num"></div>
              <div class="step-body">
                <h4>Check health</h4>
                <p style="margin-bottom:10px">Run the doctor to verify everything is wired correctly:</p>
                ${codeBlock('Terminal', 'node .truss/bin/truss.mjs doctor', 'Doctor command copied')}
              </div>
            </li>
          </ol>
        </div>
      <//>

      <!-- ── Agent setup ───────────────────────────────────── -->
      <${Card}>
        <${CardHead} icon=${Icons.Laptop} title="Agent setup" />
        <div class="measure" style="font-size:13px;line-height:1.6;color:var(--text)">
          <p style="margin:0 0 12px">
            Truss needs the AI tool to have <strong>terminal/command execution</strong> permission
            and <strong>read/write access</strong> to the workspace files.
          </p>
          <div class="grid cols-auto" style="margin-bottom:12px">
            ${AGENTS.map(a => html`
              <div style="border:1px solid var(--border);border-radius:var(--r-md);padding:12px 14px">
                <div style="font-weight:600;font-size:13px;margin-bottom:4px">${a.name}</div>
                <div class="muted" style="font-size:12.5px;line-height:1.5">${a.tip}</div>
              </div>
            `)}
          </div>
          <p class="muted" style="margin:0;font-size:12.5px;line-height:1.5">
            <strong>Tip:</strong> Allow auto-run for ${code('node .truss/bin/truss.mjs')} commands.
            The CLI never writes outside the workspace — safe to auto-approve.
          </p>
        </div>
      <//>

      <!-- ── Shell alias ───────────────────────────────────── -->
      <${Card}>
        <${CardHead} icon=${Icons.Terminal} title="Shell alias (optional)" />
        <div style="font-size:13px;line-height:1.6;color:var(--text)">
          <p class="measure" style="margin:0 0 10px">Add a shortcut so you can type ${code('truss')} instead of the full path:</p>
          ${codeBlock('bash / zsh', ALIAS_BASH, 'Alias copied')}
          ${codeBlock('PowerShell', ALIAS_PS, 'Alias copied')}
          ${codeBlock('cmd.exe', ALIAS_CMD, 'Alias copied')}
        </div>
      <//>

      <!-- ── Without terminal access ───────────────────────── -->
      <${Card}>
        <${CardHead} icon=${Icons.Alert} title="Without terminal access" />
        <div style="font-size:13px;line-height:1.6;color:var(--text)">
          <p class="measure" style="margin:0 0 12px">
            Truss still works as plain Markdown — agents can read ${code('AGENTS.md')}, update state files,
            and follow phase rules by hand. What you lose is mechanical validation:
          </p>
          <div style="overflow-x:auto">
            <table class="table">
              <thead><tr><th>Missing command</th><th>Manual fallback</th></tr></thead>
              <tbody>
                <tr><td>${code('doctor')}</td><td>Inspect touched files and disclose that mechanical validation did not run</td></tr>
                <tr><td>${code('render')}</td><td>Edit ${code('state/phases.md')} only; generated blocks may be stale until CLI returns</td></tr>
                <tr><td>${code('set')}</td><td>Do not hand-edit generated preferences; leave the change as a human todo</td></tr>
                <tr><td>${code('map')}</td><td>Use existing domain files directly; ${code('state/map.md')} may be stale</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      <//>
    `;
  }
}
