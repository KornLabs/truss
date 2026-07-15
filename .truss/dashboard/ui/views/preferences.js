import { html, Component } from '../../vendor/preact-htm.mjs';
import { Card, CardHead, Badge, Button, Icons, Spinner } from '../components.js';
import { api } from '../api.js';
import { PREFERENCE_GROUPS } from '../catalog-data.js';

const GROUPS = PREFERENCE_GROUPS;
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
                    <button key=${v} class="opt ${v === (val ?? item.def) ? 'active' : ''}" onClick=${() => this.change(item.key, v)}>
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
