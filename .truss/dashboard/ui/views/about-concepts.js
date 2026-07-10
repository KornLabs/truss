import { html, Component } from '../../vendor/preact-htm.mjs';
import { Card, CardHead, Badge, Icons, Accordion } from '../components.js';

const code = (t) => html`<code class="mono" style="font-size:12px;padding:2px 6px;background:var(--surface-2);border-radius:5px">${t}</code>`;
const bold = (lead, rest) => html`<li style="margin-bottom:7px"><strong>${lead}</strong> ${rest}</li>`;

const PHASES = [
  { id: 'discover', label: 'Discover', desc: 'Divergent — generate options, no code' },
  { id: 'validate', label: 'Validate', desc: 'Seek disconfirming evidence' },
  { id: 'plan', label: 'Plan', desc: 'Convergent — every open Q gets a D-NNN' },
  { id: 'build', label: 'Build', desc: 'Ship' },
];

export class AboutConceptsView extends Component {
  render({ state }) {
    return html`
      <!-- ── Files are the source of truth ─────────────────── -->
      <${Card}>
        <${CardHead} icon=${Icons.File} title="Files are the source of truth" />
        <div class="measure" style="font-size:13px;line-height:1.65;color:var(--text)">
          <p style="margin:0 0 10px">
            Everything a project knows lives in plain Markdown. There is no database and no hidden state.
            Want to know what's decided? Open ${code('state/decisions.md')}. Want to change it? Edit the file.
          </p>
          <ul style="margin:0;padding-left:18px">
            ${bold('One canonical home.', 'Every fact lives in exactly one place. Link to it, never copy it.')}
            ${bold('CLI reads, checks, reports.', 'It never owns the truth — humans and agents make the calls.')}
            ${bold('Portable and diffable.', 'A workspace is just a folder of text. No lock-in, no vendor.')}
          </ul>
        </div>
      <//>

      <!-- ── The boot file: AGENTS.md ──────────────────────── -->
      <${Card}>
        <${CardHead} icon=${Icons.Doc} title="The boot file: AGENTS.md" />
        <div class="measure" style="font-size:13px;line-height:1.65;color:var(--text)">
          <p style="margin:0 0 10px">
            The one file every agent reads in full, every session. It follows the open
            AGENTS.md convention, making it tool-agnostic — adapter stubs
            (${code('CLAUDE.md')}, ${code('GEMINI.md')}, ${code('.cursorrules')}) each
            contain a single line pointing back to it.
          </p>
          <ul style="margin:0;padding-left:18px">
            ${bold('§1 Load order', '— the few files an agent must read before doing anything.')}
            ${bold('§2 Structure & routing', '— a table of every core file, who owns it, and what belongs in it.')}
            ${bold('§3–§5 Rules, session protocol, hard limits', '— how an agent works, start/end rituals, things it may never do.')}
          </ul>
          <p class="muted" style="margin:10px 0 0;font-size:12.5px">
            Two regions are generated (${code('truss:begin/end')} markers): the preferences block and the phase block.
            Never edit these by hand — ${code('truss set')} and ${code('truss render')} are their only writers.
          </p>
        </div>
      <//>

      <!-- ── The state layer ───────────────────────────────── -->
      <${Card}>
        <${CardHead} icon=${Icons.Overview} title="The state layer" />
        <div style="font-size:13px;line-height:1.6;color:var(--text)">
          <p class="measure" style="margin:0 0 12px">
            ${code('state/')} is the project's working memory. Each file has a single job:
          </p>
          <div style="overflow-x:auto">
            <table class="table">
              <thead><tr><th>File</th><th>Holds</th></tr></thead>
              <tbody>
                <tr><td>${code('current.md')}</td><td>Live focus, next actions (≤5), blockers, recently done</td></tr>
                <tr><td>${code('decisions.md')}</td><td>Decided decisions (D-NNN); superseded, never deleted</td></tr>
                <tr><td>${code('open-decisions.md')}</td><td>Undecided questions with options and trade-offs (OD-NNN)</td></tr>
                <tr><td>${code('phases.md')}</td><td>Phase definitions and the ${code('current:')} pointer</td></tr>
                <tr><td>${code('profile.md')}</td><td>Project name, language, tools, PM method, style</td></tr>
                <tr><td>${code('risks.md')}</td><td>Project risks (R-NNN); loaded on demand</td></tr>
                <tr><td>${code('learnings.md')}</td><td>Recurring agent weaknesses and fixes (L-NNN)</td></tr>
                <tr><td>${code('map.md')}</td><td>Script-generated domain file overview</td></tr>
              </tbody>
            </table>
          </div>
          <p class="muted measure" style="margin:10px 0 0;font-size:12.5px">
            Topic-specific content goes into domain files under ${code('context/<domain>.md')}, created on demand
            and mapped automatically by ${code('state/map.md')}.
          </p>
        </div>
      <//>

      <!-- ── Structured IDs ────────────────────────────────── -->
      <${Card}>
        <${CardHead} icon=${Icons.Tag} title="Structured IDs" />
        <div style="font-size:13px;line-height:1.65;color:var(--text)">
          <p class="measure" style="margin:0 0 14px">
            Truss uses sequential, never-reused IDs so every claim can be traced to one place:
          </p>
          <div style="display:flex;flex-wrap:wrap;gap:12px 20px;margin-bottom:10px">
            <div style="display:flex;align-items:center;gap:8px"><${Badge} variant="accent">D-NNN<//> Decision (decided)</div>
            <div style="display:flex;align-items:center;gap:8px"><${Badge} variant="accent">OD-NNN<//> Open Decision</div>
            <div style="display:flex;align-items:center;gap:8px"><${Badge} variant="warn">HT-NNN<//> Human Todo</div>
            <div style="display:flex;align-items:center;gap:8px"><${Badge} variant="neutral">L-NNN<//> Learning</div>
            <div style="display:flex;align-items:center;gap:8px"><${Badge} variant="err">R-NNN<//> Risk</div>
          </div>
          <p class="muted measure" style="margin:0;font-size:12.5px">
            The RF checks verify that every referenced ID is defined exactly once.
          </p>
        </div>
      <//>

      <!-- ── Phases ────────────────────────────────────────── -->
      <${Card}>
        <${CardHead} icon=${Icons.Play} title="Phases" />
        <div style="font-size:13px;line-height:1.65;color:var(--text)">
          <p class="measure" style="margin:0 0 16px">
            A project moves through a fixed lifecycle. Each phase narrows or widens what an agent may do:
          </p>
          <div style="display:flex;gap:6px;align-items:stretch;flex-wrap:wrap;margin-bottom:16px">
            ${PHASES.map((p, i) => html`
              ${i > 0 && html`<div style="color:var(--text-3);font-size:18px;display:flex;align-items:center;padding:0 2px">→</div>`}
              <div style="flex:1;min-width:110px;border:1px solid var(--border);border-radius:var(--r-md);padding:12px;text-align:center">
                <div style="font-weight:600;margin-bottom:3px;font-size:13.5px">${p.label}</div>
                <div class="muted" style="font-size:11.5px;line-height:1.4">${p.desc}</div>
              </div>
            `)}
          </div>
          <ul class="measure" style="margin:0;padding-left:18px">
            ${bold('Phase changes are human-only.', html`The agent runs ${code('doctor --gate')}, writes an HT-NNN summary, and stops. You decide.`)}
            ${bold('Phase profiles:', 'Alternative lifecycles — software (adds operate), founders-thinking (concept/park), overlay (ingest → operate).')}
          </ul>
        </div>
      <//>

      <!-- ── Checks (the Doctor) ───────────────────────────── -->
      <${Card}>
        <${CardHead} icon=${Icons.Stethoscope} title="Checks (the Doctor)" />
        <div style="font-size:13px;line-height:1.6;color:var(--text)">
          <p class="measure" style="margin:0 0 12px">
            ${code('truss doctor')} runs checks grouped into families. Each finding has a severity — Error, Warning, or Info:
          </p>
          <div style="overflow-x:auto">
            <table class="table">
              <thead><tr><th>Family</th><th>Prefix</th><th>Guards</th></tr></thead>
              <tbody>
                <tr><td>Structure</td><td>${code('ST')}</td><td>Structure table matches what's on disk</td></tr>
                <tr><td>Block</td><td>${code('BL')}</td><td>Generated blocks haven't drifted</td></tr>
                <tr><td>Reference</td><td>${code('RF')}</td><td>Every link resolves, every ID is unique</td></tr>
                <tr><td>State</td><td>${code('SY')}</td><td>State files have required keys, aren't stale</td></tr>
                <tr><td>Phase</td><td>${code('PH')}</td><td>Phase grammar valid; ${code('--gate')} checks exit criteria</td></tr>
                <tr><td>Context</td><td>${code('CX')}</td><td>Mandatory reading under token budget</td></tr>
                <tr><td>Hygiene</td><td>${code('HY')}</td><td>Flags domain files untouched >90 days</td></tr>
              </tbody>
            </table>
          </div>
          <p class="muted measure" style="margin:10px 0 0;font-size:12.5px">
            Doctor is read-only — it never edits your files.
            ${code('--fix-prompt')} emits an instruction for an agent, ${code('--json')} is for tooling, ${code('--html')} writes a report.
          </p>
        </div>
      <//>

      <div class="grid cols-auto-lg">
        <!-- ── Preferences ───────────────────────────────────── -->
        <${Card} className="card-fill">
          <${CardHead} icon=${Icons.Sliders} title="Preferences" />
          <div class="measure" style="font-size:13px;line-height:1.65;color:var(--text)">
            <p style="margin:0 0 10px">
              A catalogue of preferences tunes how agents behave — autonomy, criticality, clarify mode,
              commit behaviour, response style, and more. Changed only through ${code('truss set <key> <value>')}.
            </p>
            <p class="muted" style="margin:0;font-size:12.5px">
              Defaults are deliberately cautious (e.g. ${code('clarify: ask')}, ${code('criticality: high')}).
              Categories: Autonomy & safety, Rigor & verification, Subagents, Git & workflow, Response & session.
            </p>
          </div>
        <//>

        <!-- ── Prompts ───────────────────────────────────────── -->
        <${Card} className="card-fill">
          <${CardHead} icon=${Icons.Star} title="Prompts" />
          <div class="measure" style="font-size:13px;line-height:1.65;color:var(--text)">
            <p style="margin:0 0 10px">
              A small prompt library — task prompts (plan, implement, bug-fix, refactor, research, critique),
              session prompts (resume, handover), and one orchestration wrapper.
            </p>
            <p class="muted" style="margin:0;font-size:12.5px">
              Intentionally lightweight: a one-line mandate and the result bar, leaving the method to the agent.
              Customizable via ${code('truss prompt save/reset/delete')}.
            </p>
          </div>
        <//>
      </div>

      <!-- ── The Dashboard ─────────────────────────────────── -->
      <${Card}>
        <${CardHead} icon=${Icons.Panel} title="The Dashboard" />
        <div class="measure" style="font-size:13px;line-height:1.65;color:var(--text)">
          <p style="margin:0 0 10px">
            A local-only web view (${code('127.0.0.1')}) — read view + control center over your workspace files.
            The files stay the source of truth; the dashboard never writes directly.
          </p>
          <p class="muted" style="margin:0;font-size:12.5px">
            Security: loopback binding, origin/host check, session token on writes, no shell execution,
            no path traversal, read-only mode available. Mutations go through a fixed CLI command whitelist.
          </p>
        </div>
      <//>

      <!-- ── Summary ───────────────────────────────────────── -->
      <${Card}>
        <div style="text-align:center;padding:12px 16px;font-size:13.5px;line-height:1.6;color:var(--text)">
          <strong>Files hold the truth, AGENTS.md boots the agent, the state layer is the memory,
          phases gate the work, and the doctor keeps it all consistent.</strong>
        </div>
      <//>
    `;
  }
}
