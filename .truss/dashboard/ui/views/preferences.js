import { html, Component } from '../../vendor/preact-htm.mjs';
import { Card, CardHead, Badge, Button, Icons, Spinner } from '../components.js';
import { api } from '../api.js';

// Mirror of .truss/lib/prefs.mjs catalog (values + defaults) + human framing, grouped.
const GROUPS = [
  { title: 'Autonomy & safety', items: [
    { key: 'orchestration', label: 'Orchestration', values: ['low', 'medium', 'high'], def: 'medium', desc: 'How freely the agent orchestrates multi-step tasks (build, analyze) without checking in.' },
    { key: 'phase-lock', label: 'Phase lock', values: ['off', 'advisory'], def: 'advisory', desc: 'If an action violates the phase forbidden list: ignore, or stop and ask.' },
    { key: 'gate-advocate', label: 'Gate advocate', values: ['off', 'on'], def: 'on', desc: 'At phase exit, spawn a review subagent with the gate prompt first.' },
  ]},
  { title: 'Rigor & verification', items: [
    { key: 'criticality', label: 'Criticality', values: ['low', 'medium', 'high'], def: 'high', desc: 'How aggressively it names weaknesses in inputs and plans before executing.' },
    { key: 'input-trust', label: 'Input trust', values: ['open', 'medium', 'critical'], def: 'medium', desc: 'How much it verifies the claims and figures you hand it.' },
    { key: 'clarify', label: 'Clarify', values: ['ask', 'infer'], def: 'ask', desc: 'When intent is unclear: ask first, or infer and state assumptions.' },
    { key: 'source-citation', label: 'Source citation', values: ['off', 'on'], def: 'off', desc: 'Whether the agent cites the sources and references it used.' },
    { key: 'post-task-check', label: 'Post-task check', values: ['off', 'inline', 'subagent'], def: 'off', desc: 'Run doctor after tasks: never, inline, or via a subagent.' },
  ]},
  { title: 'Subagents & delegation', items: [
    { key: 'research-agent', label: 'Research subagents', values: ['off', 'on'], def: 'on', desc: 'Allow spawning research subagents without an explicit instruction.' },
    { key: 'review-agent', label: 'Review subagents', values: ['off', 'on'], def: 'on', desc: 'Allow spawning critical-review subagents on its own.' },
  ]},
  { title: 'Git & workflow', items: [
    { key: 'scope', label: 'Solution scope', values: ['off', 'minimal', 'balanced', 'thorough'], def: 'off', desc: 'How much solution to build: the smallest thing that works, matched to the problem, or full edge-case coverage. Off imposes no bias.' },
    { key: 'auto-commit', label: 'Auto-commit', values: ['off', 'suggest', 'on'], def: 'suggest', desc: 'After a logical unit: do nothing, propose a message, or commit.' },
  ]},
  { title: 'Response & session', items: [
    { key: 'response-style', label: 'Verbosity', values: ['normal', 'compact', 'maxcompact'], def: 'normal', desc: 'How terse responses are: normal prose, compact (no filler), or maxcompact (telegraphic — form compressed, never content). Emojis are always off.' },
    { key: 'control-word', label: 'Control word', free: true, def: 'TRUSS', suggestions: ['TRUSS'],
      desc: 'Have the agent open every response with `<WORD> — …`. If the marker goes missing, the session may be losing context. Pick Off, a preset, or your own word.' },
  ]},
];
const ALL = GROUPS.flatMap(g => g.items);

export class PreferencesView extends Component {
  state = { saving: null, prefs: {}, resetting: false, cwInput: '' };

  setControlWord = (v) => {
    const word = String(v || '').trim();
    if (word && word !== 'off' && !/^[A-Za-z][A-Za-z0-9-]{0,23}$/.test(word)) {
      window.toast && window.toast('Use a short word (letters/digits/-)', 'warn'); return;
    }
    this.change('control-word', word || 'off');
  };

  componentDidMount() { this.sync(); }
  // Preact passes prevProps first; named explicitly to avoid the prev.state / prevState confusion.
  componentDidUpdate(prevProps) { if (prevProps.state?.preferences !== this.props.state?.preferences && !this.state.saving) this.sync(); }

  sync() {
    const map = {};
    (this.props.state?.preferences || []).forEach(p => { map[p.key] = p.value; });
    this.setState({ prefs: map });
  }

  change = async (key, value) => {
    const prev = this.state.prefs[key];
    if (prev === value) return;
    this.setState({ saving: key, prefs: { ...this.state.prefs, [key]: value } });
    const res = await api.setPref(key, value);
    this.setState({ saving: null });
    if (res.ok) { window.toast && window.toast(`${key} → ${value}`, 'ok'); this.props.reload && this.props.reload(); }
    else if (!res.readOnly) { this.setState({ prefs: { ...this.state.prefs, [key]: prev } }); window.toast && window.toast(res.error || 'Save failed', 'error'); }
  };

  resetAll = async () => {
    const changed = ALL.filter(i => this.state.prefs[i.key] && this.state.prefs[i.key] !== i.def);
    if (changed.length === 0) { window.toast && window.toast('Already all default', 'ok'); return; }
    if (!confirm(`Reset ${changed.length} preference(s) to default?`)) return;
    this.setState({ resetting: true });
    for (const item of changed) {
      const res = await api.setPref(item.key, item.def);
      if (res.ok) this.setState({ prefs: { ...this.state.prefs, [item.key]: item.def } });
      if (res.readOnly) break;
    }
    this.setState({ resetting: false });
    window.toast && window.toast('Reset to default', 'ok');
    this.props.reload && this.props.reload();
  };

  render({ state }, { prefs, saving, resetting, cwInput }) {
    const behaviors = {};
    (state?.preferences || []).forEach(p => { behaviors[p.key] = p.behavior; });
    const changedCount = ALL.filter(i => prefs[i.key] && prefs[i.key] !== i.def).length;

    return html`
      <${Card}>
        <${CardHead} icon=${Icons.Sliders} title="Agent preferences">
          <div class="row" style="gap:8px">
            <${Badge} variant=${changedCount ? 'accent' : 'neutral'}>${changedCount ? `${changedCount} off default` : 'All default'}<//>
            <${Button} className="sm" icon=${resetting ? null : Icons.Refresh} disabled=${resetting || changedCount === 0} onClick=${this.resetAll}>
              ${resetting ? html`<${Spinner} /> Resetting…` : 'Reset all to default'}<//>
          </div>
        <//>
        <p class="muted" style="font-size:12.5px;line-height:1.5">
          Rendered into the <span class="mono">preferences</span> block of <span class="mono">AGENTS.md</span>
          by the <span class="mono">truss set</span> writer — the single source every agent reads. The
          dashboard never edits the file directly.</p>
      <//>

      ${GROUPS.map(group => html`
        <div key=${group.title}>
          <div class="pref-group-title" style="margin:6px 2px 10px">${group.title}</div>
          <div class="grid cols-auto-fill-lg">
            ${group.items.map(item => {
              const val = prefs[item.key];
              const isDef = val === item.def;
              return html`
              <${Card} key=${item.key}>
                <div class="row between" style="margin-bottom:4px;gap:8px">
                  <div style="font-size:14px;font-weight:600">${item.label}</div>
                  <div class="row" style="gap:6px">
                    ${saving === item.key ? html`<${Spinner} />` : ''}
                    <button class="btn ghost sm" style=${`padding:3px 9px;font-size:11.5px;${isDef ? 'visibility:hidden' : ''}`}
                      title=${`Reset to ${item.def}`} onClick=${() => this.change(item.key, item.def)}>To default<//>
                  </div>
                </div>
                <p class="muted" style="font-size:12.5px;line-height:1.45;margin-bottom:14px">${item.desc}</p>
                ${item.free ? html`
                  <div class="opt-row" style="margin-bottom:10px">
                    <button class="opt ${(val || item.def) === 'off' ? 'active' : ''}" onClick=${() => this.setControlWord('off')}>off${item.def === 'off' ? html`<span class="opt-def" title="Default">•</span>` : ''}</button>
                    ${(item.suggestions || []).map(s => html`<button key=${s} class="opt ${(val || item.def) === s ? 'active' : ''}" onClick=${() => this.setControlWord(s)}>${s}${item.def === s ? html`<span class="opt-def" title="Default">•</span>` : ''}</button>`)}
                    ${val && val !== 'off' && !(item.suggestions || []).includes(val) ? html`<button class="opt active">${val}</button>` : ''}
                  </div>
                  <div class="row" style="gap:8px">
                    <input class="input" style="flex:1" placeholder="Custom word…" value=${cwInput}
                      onInput=${e => this.setState({ cwInput: e.target.value })}
                      onKeyDown=${e => { if (e.key === 'Enter') { this.setControlWord(cwInput); this.setState({ cwInput: '' }); } }} />
                    <button class="btn sm" onClick=${() => { this.setControlWord(cwInput); this.setState({ cwInput: '' }); }}>Set<//>
                  </div>
                ` : html`
                <div class="opt-row">
                  ${item.values.map(v => html`
                    <button key=${v} class="opt ${v === val ? 'active' : ''}" onClick=${() => this.change(item.key, v)}>
                      ${v}${v === item.def ? html`<span class="opt-def" title="Default">•</span>` : ''}
                    </button>`)}
                </div>`}
                ${behaviors[item.key] ? html`<p class="dim" style="font-size:11.5px;margin-top:12px;line-height:1.5;font-style:italic">${behaviors[item.key]}</p>` : ''}
              <//>`;
            })}
          </div>
        </div>`)}`;
  }
}
