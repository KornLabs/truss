import { html, Component } from '../../vendor/preact-htm.mjs';
import { Card, CardHead, Icons, Accordion, SearchInput } from '../components.js';

const code = (t) => html`<code class="mono" style="font-size:12px;padding:2px 6px;background:var(--surface-2);border-radius:5px">${t}</code>`;

const FAQ_DATA = [
  { title: 'General', icon: Icons.Help, items: [
    { q: 'What is the difference between Truss and a plain AGENTS.md?',
      a: () => html`<p class="measure" style="font-size:12.5px;line-height:1.6;color:var(--text-2);margin:0">
        A single AGENTS.md is one flat file you write and maintain by hand. Truss adds a <strong>structured state layer</strong>
        (decisions, phases, learnings, risks), a health-check CLI (${code('doctor')}), agent preferences,
        a prompt library, and a dashboard — all built around that single boot file. The agent boots from AGENTS.md,
        but the workspace gives it memory across sessions.</p>` },
    { q: 'Do I need a specific AI tool?',
      a: () => html`<p class="measure" style="font-size:12.5px;line-height:1.6;color:var(--text-2);margin:0">
        No. Truss is <strong>tool-agnostic</strong>, built on the open AGENTS.md convention. Claude Code,
        Gemini CLI, Cursor, Copilot, Cowork — any agent that reads AGENTS.md works. Adapter stubs
        (${code('CLAUDE.md')}, ${code('GEMINI.md')}, ${code('.cursorrules')}) point to the same boot file.</p>` },
    { q: 'Does Truss cost anything?',
      a: () => html`<p class="measure" style="font-size:12.5px;line-height:1.6;color:var(--text-2);margin:0">
        No. Zero dependencies, no API keys, no metered billing. Truss never calls a model itself — your agent does,
        through the subscription you already have. The only requirement is <strong>Node ≥ 20</strong>.</p>` },
    { q: 'Can I use Truss with multiple agents at once?',
      a: () => html`<p class="measure" style="font-size:12.5px;line-height:1.6;color:var(--text-2);margin:0">
        Truss is designed for <strong>one agent per session</strong>. Parallel agents risk conflicting state edits
        (both writing ${code('state/current.md')} at the same time). For parallel work on different branches,
        use separate git worktrees, each with its own workspace state.</p>` },
  ]},

  { title: 'Setup & Init', icon: Icons.Play, items: [
    { q: 'Why do I see "Not initialised" in the dashboard?',
      a: () => html`<p class="measure" style="font-size:12.5px;line-height:1.6;color:var(--text-2);margin:0">
        Run ${code('truss init')} (or ${code('node .truss/bin/truss.mjs init')}) to scaffold the workspace files.
        The dashboard works without init but most views are disabled until the workspace structure exists.</p>` },
    { q: 'What is the difference between drop-in and overlay?',
      a: () => html`<p class="measure" style="font-size:12.5px;line-height:1.6;color:var(--text-2);margin:0">
        <strong>Drop-in</strong> places Truss beside your code in the same folder — best for new projects.
        <strong>Overlay</strong> (${code('--overlay')}) nests your existing code under ${code('repo/')}, keeping
        workspace commits and code commits on separate git histories. Use overlay for existing codebases.</p>` },
    { q: 'Do I need the shell alias?',
      a: () => html`<p class="measure" style="font-size:12.5px;line-height:1.6;color:var(--text-2);margin:0">
        No, it's a convenience. You can always use ${code('node .truss/bin/truss.mjs <command>')} directly.
        The alias just shortens it to ${code('truss <command>')}.</p>` },
    { q: 'How do I bring an existing repo in?',
      a: () => html`<p class="measure" style="font-size:12.5px;line-height:1.6;color:var(--text-2);margin:0">
        Use ${code('truss init --overlay --repo <path|url>')}. A local path is <strong>symlinked</strong> into
        ${code('repo/')}; a URL is <strong>cloned</strong>. Either way, the code keeps its own git history,
        gitignored from the workspace.</p>` },
    { q: 'Does Truss work on Windows?',
      a: () => html`<p class="measure" style="font-size:12.5px;line-height:1.6;color:var(--text-2);margin:0">
        Yes. Use PowerShell. Note that creating symlinks requires <strong>Developer Mode</strong> or an elevated
        shell. If symlinking fails, pass a git URL to ${code('--repo')} instead — the repo is cloned.</p>` },
  ]},

  { title: 'Doctor & Health', icon: Icons.Stethoscope, items: [
    { q: 'Why does doctor show many errors right after init?',
      a: () => html`<p class="measure" style="font-size:12.5px;line-height:1.6;color:var(--text-2);margin:0">
        A fresh init should be <strong>clean</strong>. If you see errors, you may have run init inside the
        Truss source repo instead of copying ${code('.truss/')} to your own project first. Copy the folder,
        then run init in the target.</p>` },
    { q: 'What does "BL-01 block drift" mean?',
      a: () => html`<p class="measure" style="font-size:12.5px;line-height:1.6;color:var(--text-2);margin:0">
        The generated preferences or phase block in AGENTS.md was <strong>hand-edited</strong>. These blocks are
        bounded by ${code('truss:begin/end')} markers and should only be changed via ${code('truss set')} or
        ${code('truss render')}. Run ${code('truss render')} to regenerate from the source files.</p>` },
    { q: 'What does SY-03 mean for current.md?',
      a: () => html`<p class="measure" style="font-size:12.5px;line-height:1.6;color:var(--text-2);margin:0">
        ${code('state/current.md')} is missing required keys (${code('Focus')}, ${code('Next')},
        ${code('Recently-done')}) or a key value is empty. Fill in the current focus and next actions —
        this is the agent's working context every session.</p>` },
    { q: 'Do I need to run render after every change?',
      a: () => html`<p class="measure" style="font-size:12.5px;line-height:1.6;color:var(--text-2);margin:0">
        Only after editing ${code('state/phases.md')} (phase definitions or the ${code('current:')} pointer).
        Preference changes via ${code('truss set')} auto-render. If you use ${code('truss phase <id>')} to
        change phases, it also renders automatically.</p>` },
    { q: 'What does "CX-01 boot metadata budget exceeded" mean?',
      a: () => html`<p class="measure" style="font-size:12.5px;line-height:1.6;color:var(--text-2);margin:0">
        The deterministic Truss boot files (the §1 load order plus phase read targets) exceed the budget. This excludes task-selected domain and source context. Solutions:
        shorten AGENTS.md, move detail into domain files under ${code('context/')}, or reduce the number
        of files in the load order. The Boot Metadata view on the dashboard shows the breakdown.</p>` },
  ]},

  { title: 'Phases & Workflow', icon: Icons.Flag, items: [
    { q: 'Can I skip phases?',
      a: () => html`<p class="measure" style="font-size:12.5px;line-height:1.6;color:var(--text-2);margin:0">
        Yes — phases are <strong>advisory guardrails</strong>, not hard enforcement. Use ${code('truss phase <id>')}
        to jump directly. But each phase's exit criteria are designed to catch gaps, so skipping trades
        thoroughness for speed.</p>` },
    { q: 'When should I change phases?',
      a: () => html`<p class="measure" style="font-size:12.5px;line-height:1.6;color:var(--text-2);margin:0">
        When the current phase's exit criteria look met. The agent runs ${code('doctor --gate')}, writes an
        HT-NNN summary of what was accomplished, and stops. <strong>You</strong> make the call and run
        ${code('truss phase <next-phase>')}.</p>` },
    { q: 'What is a phase profile?',
      a: () => html`<p class="measure" style="font-size:12.5px;line-height:1.6;color:var(--text-2);margin:0">
        An alternative seed lifecycle. The default seed is <strong>discover → validate → plan → build</strong>;
        the ${code('software')} profile adds an ${code('operate')} phase, ${code('founders-thinking')} is for
        conceptual exploration. Whatever the seed, the kickoff tailors it into a project-specific plan, and
        agents restructure it later when requirements change (with a D-NNN and a note to you).</p>` },
    { q: 'What does the gate advocate do?',
      a: () => html`<p class="measure" style="font-size:12.5px;line-height:1.6;color:var(--text-2);margin:0">
        At phase exit the agent spawns an adversarial <strong>review subagent</strong> that challenges whether
        exit criteria are truly met. In ${code('agentic')} mode (the default) the agent then fixes the
        agent-fixable findings itself, re-runs the gate, and writes one exit summary — only genuinely
        human-only items land in your todos. ${code('on')} reports without remediation.</p>` },
  ]},

  { title: 'Decisions & State', icon: Icons.Edit, items: [
    { q: 'When do I create a Decision vs. an Open Decision?',
      a: () => html`<p class="measure" style="font-size:12.5px;line-height:1.6;color:var(--text-2);margin:0">
        ${code('OD-NNN')} is for <strong>undecided questions</strong> with options and trade-offs — the agent
        proposes, you discuss. Once resolved, it becomes a ${code('D-NNN')} in ${code('state/decisions.md')}.
        Never edit past decisions; supersede them with a new D-NNN.</p>` },
    { q: 'What are Human Todos (HT-NNN)?',
      a: () => html`<p class="measure" style="font-size:12.5px;line-height:1.6;color:var(--text-2);margin:0">
        Actions that <strong>only a human can do</strong> — approve a phase change, review a contract,
        make a payment, provide credentials. Listed in ${code('HUMAN-TODOS.md')}, written by the agent,
        resolved by you.</p>` },
    { q: 'How do I delete a decision?',
      a: () => html`<p class="measure" style="font-size:12.5px;line-height:1.6;color:var(--text-2);margin:0">
        <strong>Don't.</strong> Truss decisions are append-only. Mark outdated ones as superseded:
        add ${code('Superseded-by: D-NNN')} pointing to the newer decision. This preserves the reasoning trail
        while making the current state clear.</p>` },
    { q: 'What are Learnings?',
      a: () => html`<p class="measure" style="font-size:12.5px;line-height:1.6;color:var(--text-2);margin:0">
        Recurring agent weaknesses and their structural fixes, recorded as ${code('L-NNN')} in
        ${code('state/learnings.md')}. When the agent makes the same mistake twice, record it as a
        learning — the fix goes into the workspace rules so it doesn't happen again.</p>` },
  ]},

  { title: 'Dashboard', icon: Icons.Panel, items: [
    { q: 'Is the dashboard secure?',
      a: () => html`<p class="measure" style="font-size:12.5px;line-height:1.6;color:var(--text-2);margin:0">
        Yes. It binds to <strong>127.0.0.1 only</strong> (never exposed to the network), requires a per-session
        token for write actions, and uses ${code('execFile')} with strict argument arrays (no shell).
        Read-only mode (${code('--read-only')}) disables all writes. See the Architecture docs for the full
        security model.</p>` },
    { q: 'Can I access the dashboard remotely?',
      a: () => html`<p class="measure" style="font-size:12.5px;line-height:1.6;color:var(--text-2);margin:0">
        <strong>No</strong>, by design. It's a local developer tool, bound to the loopback interface.
        This is a deliberate security constraint, not a limitation.</p>` },
    { q: 'What does the Live/Offline indicator mean?',
      a: () => html`<p class="measure" style="font-size:12.5px;line-height:1.6;color:var(--text-2);margin:0">
        <strong>Live</strong> means the SSE (Server-Sent Events) connection to the dashboard server is active
        and data updates in real time. <strong>Offline</strong> means the connection dropped — click the badge
        to retry, or the dashboard falls back to polling every 30 seconds.</p>` },
  ]},

  { title: 'Without Terminal', icon: Icons.Terminal, items: [
    { q: 'What works without CLI access?',
      a: () => html`<p class="measure" style="font-size:12.5px;line-height:1.6;color:var(--text-2);margin:0">
        Agents can still read ${code('AGENTS.md')}, update state files, and follow phase rules manually.
        What's lost: ${code('doctor')} can't check drift, ${code('render')} can't refresh generated blocks,
        ${code('set')} can't change preferences, and ${code('map')} can't rebuild the domain overview.
        The workspace becomes manually maintained.</p>` },
    { q: 'Why does the agent say "mechanical validation did not run"?',
      a: () => html`<p class="measure" style="font-size:12.5px;line-height:1.6;color:var(--text-2);margin:0">
        The agent is being <strong>transparent</strong> that it couldn't run ${code('truss doctor')} to verify
        its work. This is expected and correct behaviour when terminal access isn't available — the agent
        discloses the gap rather than silently skipping validation.</p>` },
  ]},
];

export class AboutFaqView extends Component {
  state = { search: '' };

  render(_, { search }) {
    const q = search.toLowerCase().trim();
    const filtered = q
      ? FAQ_DATA.map(cat => ({
          ...cat,
          items: cat.items.filter(item => item.q.toLowerCase().includes(q)),
        })).filter(cat => cat.items.length > 0)
      : FAQ_DATA;

    return html`
      <${Card}>
        <${CardHead} icon=${Icons.Search} title="Search FAQ" />
        <${SearchInput} value=${search} onInput=${v => this.setState({ search: v })}
          placeholder="Search questions…" />
      <//>

      ${filtered.length === 0 && html`
        <${Card}>
          <div class="empty">
            <div style="font-weight:600;color:var(--text)">No matching questions</div>
            <div style="font-size:13px">Try a different search term.</div>
          </div>
        <//>
      `}

      ${filtered.map(cat => html`
        <${Card} key=${cat.title}>
          <${CardHead} icon=${cat.icon} title=${cat.title} />
          ${cat.items.map(item => html`
            <${Accordion} key=${item.q} title=${item.q}>
              ${item.a()}
            <//>
          `)}
        <//>
      `)}
    `;
  }
}
