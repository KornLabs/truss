import { html, Component } from '../../vendor/preact-htm.mjs';
import { Card, CardHead, Badge, Button, Icons, Modal, Chip, SearchInput, Segmented, Empty, copyText, Spinner } from '../components.js';
import { api } from '../api.js';
import { favorites, presets as presetStore, lang as langStore } from '../store.js';

// V3 library: prompts live on two shelves (task, session) plus one generic
// orchestration wrapper. Every base body fills the SAME tokens; orchestration is a
// mode (Single | Orchestrated) that wraps a task body, not a separate prompt.
const TOKENS = {
  INPUT:       { label: 'Task',        multiline: true,  hint: 'Goal + what this is about' },
  MISSION:     { label: 'Mission',     multiline: true,  hint: 'The task to execute' },
  CONSTRAINTS: { label: 'Constraints', multiline: false, hint: 'Optional — must / avoid' },
  POINTERS:    { label: 'Pointers',    multiline: false, hint: 'Optional — files/links to read first' },
  HINT:        { label: 'Hint',        multiline: false, hint: 'Optional — how this work decomposes' },
};
const SHELF_ORDER = ['task', 'session', 'orchestration'];
const SHELF_FALLBACK = {
  task: { en: 'Task prompts', de: 'Task-Prompts' },
  session: { en: 'Session & workflow', de: 'Session & Workflow' },
  orchestration: { en: 'Orchestration', de: 'Orchestrierung' },
};

const tokensIn = (body) => Object.keys(TOKENS).filter(t => (body || '').includes(`{{${t}}}`));
const fillTokens = (body, values) => (body || '').replace(/\{\{([A-Z_]+)\}\}/g, (m, t) => {
  const v = values[t];
  return v && v.trim() ? v.trim() : m; // keep the placeholder if left empty
});

export class PromptsView extends Component {
  state = {
    prompts: [], shelves: {}, loading: true, error: null,
    q: '', activeTag: null, scope: 'all', lang: langStore.get(),
    favs: favorites.all(), presets: presetStore.all(),
    sel: null, editing: false, draft: '', customId: '', busy: false, flyId: null,
    values: {}, mode: 'single', savingPreset: false, presetName: '',
  };

  componentDidMount() { this.fetch(); }

  fetch = async () => {
    try {
      const data = await api.prompts();
      this.setState({ prompts: data.prompts || [], shelves: data.shelves || {}, loading: false, error: null }, () => {
        const f = this.props.focus;
        if (f && !this.state.sel) {
          const p = (data.prompts || []).find(x => x.id === f);
          if (p) this.open(p);
        }
      });
    } catch (e) { this.setState({ error: e.message, loading: false }); }
  };

  setLang = (l) => { langStore.set(l); this.setState({ lang: l }); };
  toggleFav = (id, e) => { e && e.stopPropagation(); this.setState({ favs: favorites.toggle(id) }); };

  titleOf = (p) => p.type === 'custom' ? p.title.en : (p.title[this.state.lang] || p.title.en);
  bodyOf = (p) => p.type === 'custom' ? p.body.en : (p.body[this.state.lang] || p.body.en);
  orchestrator = () => this.state.prompts.find(p => p.wrapper);

  // The text the user actually copies: the body with tokens filled, and — in
  // orchestrated mode — wrapped in the generic orchestrator with the task as MISSION.
  composed = (sel, values, mode) => {
    if (!sel) return '';
    const filled = fillTokens(this.bodyOf(sel), values);
    if (mode === 'orchestrated' && sel.orchestratable) {
      const wrap = this.orchestrator();
      if (wrap) {
        return fillTokens(this.bodyOf(wrap), {
          MISSION: filled,
          HINT: sel.orchestrationHint || '',
          CONSTRAINTS: values.CONSTRAINTS || '',
        });
      }
    }
    return filled;
  };

  open = (p, preset) => this.setState({
    sel: p, editing: false, draft: this.bodyOf(p), customId: '',
    values: preset ? { ...preset.values } : {},
    mode: preset ? (preset.mode || 'single') : 'single',
    savingPreset: false, presetName: preset ? preset.name : '',
  });
  openPreset = (preset) => {
    const base = this.state.prompts.find(p => p.id === preset.baseId);
    if (base) this.open(base, preset);
    else window.toast && window.toast(`Base prompt "${preset.baseId}" no longer exists`, 'warn');
  };
  openNew = () => this.setState({ sel: { id: '', type: 'new', title: { en: '', de: '' }, body: { en: '', de: '' }, tags: [], shelf: 'custom' }, editing: true, draft: '', customId: '', values: {}, mode: 'single' });
  close = () => this.setState({ sel: null, editing: false, savingPreset: false });

  setValue = (tok, v) => this.setState(s => ({ values: { ...s.values, [tok]: v } }));

  savePreset = () => {
    const { sel, presetName, values, mode } = this.state;
    const name = (presetName || '').trim() || `${this.titleOf(sel)} preset`;
    const next = presetStore.save({ name, baseId: sel.id, values: { ...values }, mode });
    this.setState({ presets: next, savingPreset: false });
    window.toast && window.toast(`Preset saved: ${name}`, 'ok');
  };
  deletePreset = (id, e) => {
    e && e.stopPropagation();
    if (!confirm('Delete this preset?')) return;
    this.setState({ presets: presetStore.remove(id) });
  };

  saveCustom = async () => {
    const { sel, draft, customId } = this.state;
    const id = sel.type === 'custom'
      ? sel.id
      : (customId.trim() || (sel.id ? `${sel.id}-custom` : '')).toLowerCase().replace(/[^a-z0-9-]/g, '-');
    if (!id) { window.toast && window.toast('Please enter a name for the prompt', 'warn'); return; }
    if (!draft.trim()) { window.toast && window.toast('Prompt is empty', 'warn'); return; }
    this.setState({ busy: true });
    const res = await api.savePrompt(id, draft);
    this.setState({ busy: false });
    if (res.ok) {
      window.toast && window.toast(sel.type === 'custom' ? 'Custom prompt saved' : `Saved as custom: ${id}`, 'ok');
      if (sel.id) { this.setState({ flyId: sel.id }); setTimeout(() => this.setState({ flyId: null }), 650); }
      this.close();
      await this.fetch();
    } else if (!res.readOnly) window.toast && window.toast(res.error || 'Save failed', 'error');
  };

  deleteCustom = async () => {
    const { sel } = this.state;
    if (!confirm(`Delete custom prompt "${sel.id}"?`)) return;
    this.setState({ busy: true });
    const res = await api.deletePrompt(sel.id);
    this.setState({ busy: false });
    if (res.ok) { window.toast && window.toast('Deleted', 'ok'); this.close(); await this.fetch(); }
    else if (!res.readOnly) window.toast && window.toast(res.error || 'Delete failed', 'error');
  };

  matches(p) {
    const { q, activeTag, scope, lang } = this.state;
    if (scope !== 'all' && p.type !== scope) return false;
    if (activeTag && !(p.tags || []).includes(activeTag)) return false;
    if (q) {
      const hay = `${p.id} ${p.title.en} ${p.title.de || ''} ${p.body[lang] || ''} ${(p.tags || []).join(' ')}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  }

  shelfTitle = (key) => {
    const s = this.state.shelves[key] || SHELF_FALLBACK[key] || { en: key, de: key };
    return s[this.state.lang] || s.en || key;
  };

  promptCard(p) {
    const { favs, flyId } = this.state;
    const fav = favs.includes(p.id);
    return html`
      <${Card} key=${p.id} className=${flyId === p.id ? 'fly-to-custom' : ''} onClick=${() => this.open(p)}>
        <div class="row between" style="margin-bottom:8px;gap:8px">
          <div class="row" style="gap:8px;min-width:0">
            <span class="badge ${p.type === 'custom' ? 'accent' : 'neutral'}">${p.type}</span>
            ${p.recommended ? html`<span class="badge accent" title="Recommended — curated start-here prompt" style="padding:1px 6px;display:inline-flex;align-items:center;gap:3px"><${Icons.Star} filled=${true} />rec</span>` : ''}
            ${p.orchestratable ? html`<span class="badge neutral" title="Can run orchestrated (multi-agent)" style="padding:1px 6px;display:inline-flex;align-items:center;gap:3px"><${Icons.Git} />multi</span>` : ''}
            <strong style="font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${this.titleOf(p)}</strong>
          </div>
          <button class="icon-btn" style=${`width:28px;height:28px;color:${fav ? 'var(--warn)' : 'var(--text-3)'}`} aria-label="Favorite"
            onClick=${e => this.toggleFav(p.id, e)}><${Icons.Star} filled=${fav} /></button>
        </div>
        <p class="muted" style="font-size:12.5px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${firstLine(this.bodyOf(p))}</p>
        <div class="row wrap" style="gap:5px;margin-top:11px">
          ${(p.tags || []).map(t => html`<span class="dim" style="font-size:11px;display:inline-flex;align-items:center;gap:3px"><${Icons.Tag} />${t}</span>`)}
        </div>
      <//>`;
  }

  render(_, { prompts, loading, error, q, activeTag, scope, lang, favs, presets, sel, editing, draft, customId, busy, values, mode, savingPreset, presetName }) {
    const tagCounts = {};
    prompts.forEach(p => (p.tags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
    const tags = Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a]);

    let list = prompts.filter(p => this.matches(p));
    list = list.sort((a, b) => (favs.includes(b.id) ? 1 : 0) - (favs.includes(a.id) ? 1 : 0));
    const counts = { all: prompts.length, base: prompts.filter(p => p.type === 'base').length, custom: prompts.filter(p => p.type === 'custom').length };

    // Group the filtered list by shelf (base prompts) for the default view.
    const byShelf = {};
    list.forEach(p => { const s = p.shelf || (p.type === 'custom' ? 'custom' : 'task'); (byShelf[s] = byShelf[s] || []).push(p); });
    const orderedShelves = [...SHELF_ORDER.filter(s => byShelf[s]), ...Object.keys(byShelf).filter(s => !SHELF_ORDER.includes(s))];
    const showPresets = presets.length > 0 && !activeTag && scope === 'all';

    const selTokens = sel ? tokensIn(this.bodyOf(sel)) : [];
    const preview = sel ? this.composed(sel, values, mode) : '';

    return html`
      <${Card}>
        <div class="row wrap between" style="gap:12px">
          <div style="flex:1;min-width:200px;max-width:360px"><${SearchInput} value=${q} onInput=${v => this.setState({ q: v })} placeholder="Search prompts…" /></div>
          <div class="row" style="gap:10px">
            <${Segmented} value=${lang} onChange=${this.setLang} options=${[{ value: 'en', label: 'EN' }, { value: 'de', label: 'DE' }]} />
            <div class="segmented">
              ${['all', 'base', 'custom'].map(s => html`<button class=${scope === s ? 'active' : ''} onClick=${() => this.setState({ scope: s })}>${s[0].toUpperCase() + s.slice(1)} <span class="dim">${counts[s]}</span></button>`)}
            </div>
            <${Button} variant="primary" className="sm" icon=${Icons.Plus} onClick=${this.openNew}>New<//>
          </div>
        </div>
        ${tags.length > 0 && html`<div class="row wrap" style="gap:7px;margin-top:14px">
          <${Chip} active=${!activeTag} onClick=${() => this.setState({ activeTag: null })}>All<//>
          ${tags.map(t => html`<${Chip} key=${t} active=${activeTag === t} count=${tagCounts[t]} onClick=${() => this.setState({ activeTag: activeTag === t ? null : t })}>${t}<//>`)}
        </div>`}
      <//>

      ${loading ? html`<${Card}><p class="muted">Loading prompts…</p><//>`
        : error ? html`<${Card}><p style="color:var(--err)">${error}</p><//>`
        : html`
          ${showPresets && html`
            <${Card}>
              <${CardHead} icon=${Icons.Star} title="Presets">
                <span class="dim" style="font-size:12px">Saved invocations — a prompt with your input pre-filled</span>
              <//>
              <div class="grid cols-auto-fill-lg">
                ${presets.map(pr => html`
                  <${Card} key=${pr.id} onClick=${() => this.openPreset(pr)}>
                    <div class="row between" style="gap:8px;margin-bottom:6px">
                      <strong style="font-size:13.5px;min-width:0;overflow:hidden;text-overflow:ellipsis">${pr.name}</strong>
                      <button class="icon-btn" style="width:26px;height:26px;color:var(--text-3)" aria-label="Delete preset" onClick=${e => this.deletePreset(pr.id, e)}><${Icons.Trash} /></button>
                    </div>
                    <div class="row wrap" style="gap:5px">
                      <span class="dim mono" style="font-size:11px">${pr.baseId}</span>
                      ${pr.mode === 'orchestrated' ? html`<span class="badge neutral" style="font-size:10px">orchestrated</span>` : ''}
                    </div>
                  <//>`)}
              </div>
            <//>`}

          ${list.length === 0 ? html`<${Card}><${Empty} icon=${Icons.Star} title="No prompts match" sub="Try a different search, tag, or scope." /><//>`
            : (activeTag || q || scope !== 'all')
              // Filtered / searching: flat grid (grouping would be noise).
              ? html`<div class="grid cols-auto-fill-lg">${list.map(p => this.promptCard(p))}</div>`
              // Default: grouped by shelf.
              : html`${orderedShelves.map(s => html`
                  <div key=${s}>
                    <div class="row" style="gap:8px;margin:18px 2px 10px">
                      <span class="badge accent">${s === 'custom' ? 'Custom' : this.shelfTitle(s)}</span>
                      <span class="dim" style="font-size:11px">${byShelf[s].length}</span>
                    </div>
                    <div class="grid cols-auto-fill-lg">${byShelf[s].map(p => this.promptCard(p))}</div>
                  </div>`)}`}
        `}

      <${Modal} open=${!!sel} onClose=${this.close} icon=${Icons.Star} title=${sel ? (this.titleOf(sel) || 'New prompt') : ''} width=${740}>
        ${sel && html`
          <div class="row wrap" style="gap:7px;margin-bottom:14px;align-items:center">
            ${sel.id ? html`<span class="mono dim" style="font-size:11px">${sel.id}</span>` : ''}
            <span class="badge ${sel.type === 'custom' || sel.type === 'new' ? 'accent' : 'neutral'}">${sel.type === 'new' ? 'new' : sel.type}</span>
            ${(sel.tags || []).map(t => html`<span class="chip">${t}</span>`)}
            ${sel.type === 'base' ? html`<span class="badge neutral">${lang.toUpperCase()}</span>` : ''}
            ${sel.id ? html`<button class="icon-btn" style=${`margin-left:auto;color:${favs.includes(sel.id) ? 'var(--warn)' : 'var(--text-3)'}`} aria-label="Favorite" onClick=${() => this.toggleFav(sel.id)}><${Icons.Star} filled=${favs.includes(sel.id)} /></button>` : ''}
          </div>

          ${editing ? html`
            ${(sel.type === 'base' || sel.type === 'new') ? html`
              <input class="input" style="margin-bottom:10px" placeholder=${sel.type === 'base' ? `Custom name (default ${sel.id}-custom)` : 'Custom prompt name (a-z, 0-9, -)'}
                value=${customId} onInput=${e => this.setState({ customId: e.target.value })} />` : ''}
            <textarea class="textarea mono" style="min-height:320px" value=${draft} onInput=${e => this.setState({ draft: e.target.value })}
              placeholder="Write your prompt. Use {{PLACEHOLDERS}} for the parts to fill in later."></textarea>
            <div class="row wrap" style="gap:8px;margin-top:18px;justify-content:flex-end">
              <${Button} onClick=${() => sel.type === 'new' ? this.close() : this.setState({ editing: false, draft: this.bodyOf(sel) })}>Cancel<//>
              <${Button} icon=${Icons.Copy} onClick=${() => copyText(draft, 'Copied to clipboard')}>Copy to clipboard<//>
              <${Button} variant="primary" icon=${busy ? null : Icons.Check} disabled=${busy} onClick=${this.saveCustom}>
                ${busy ? html`<${Spinner} />` : ''} ${sel.type === 'custom' ? 'Save changes' : 'Save as custom prompt'}<//>
            </div>
          ` : html`
            ${sel.orchestratable ? html`
              <div class="row between wrap" style="gap:10px;margin-bottom:12px;align-items:center">
                <span class="dim" style="font-size:12px">Run mode</span>
                <${Segmented} value=${mode} onChange=${m => this.setState({ mode: m })}
                  options=${[{ value: 'single', label: 'Single agent' }, { value: 'orchestrated', label: 'Orchestrated' }]} />
              </div>` : ''}

            ${selTokens.length > 0 ? html`
              <div class="col" style="gap:10px;margin-bottom:14px">
                <span class="dim" style="font-size:12px">Your input ${'— fill what you can; empty fields keep their {{placeholder}}'}</span>
                ${selTokens.map(tok => {
                  const t = TOKENS[tok];
                  return html`<div key=${tok}>
                    <label class="dim" style="font-size:11px;display:block;margin-bottom:3px">${t.label} <span style="opacity:0.6">— ${t.hint}</span></label>
                    ${t.multiline
                      ? html`<textarea class="textarea" style="min-height:64px" value=${values[tok] || ''} onInput=${e => this.setValue(tok, e.target.value)} placeholder=${t.hint}></textarea>`
                      : html`<input class="input" value=${values[tok] || ''} onInput=${e => this.setValue(tok, e.target.value)} placeholder=${t.hint} />`}
                  </div>`;
                })}
              </div>` : ''}

            <div style="background:var(--surface-2);border-radius:var(--r-sm);padding:16px;max-height:42vh;overflow:auto">
              <pre class="mono" style="margin:0;white-space:pre-wrap;font-size:12.5px;line-height:1.55">${preview}</pre>
            </div>

            ${savingPreset ? html`
              <div class="row wrap" style="gap:8px;margin-top:14px;align-items:center">
                <input class="input" style="flex:1;min-width:160px" placeholder="Preset name" value=${presetName} onInput=${e => this.setState({ presetName: e.target.value })} />
                <${Button} variant="primary" icon=${Icons.Check} onClick=${this.savePreset}>Save preset<//>
                <${Button} onClick=${() => this.setState({ savingPreset: false })}>Cancel<//>
              </div>` : ''}

            <div class="row wrap" style="gap:8px;margin-top:18px;justify-content:flex-end">
              ${sel.type === 'custom' ? html`<${Button} variant="danger" icon=${Icons.Trash} disabled=${busy} onClick=${this.deleteCustom}>Delete<//>` : ''}
              ${sel.type === 'base' && selTokens.length > 0 ? html`<${Button} icon=${Icons.Star} onClick=${() => this.setState({ savingPreset: true })}>Save as preset<//>` : ''}
              ${sel.type !== 'orchestration-generated' ? html`<${Button} icon=${Icons.Edit} onClick=${() => this.setState({ editing: true, draft: this.bodyOf(sel), customId: '' })}>Edit<//>` : ''}
              <${Button} variant="primary" icon=${Icons.Copy} onClick=${() => copyText(preview, mode === 'orchestrated' ? 'Orchestration prompt copied' : 'Prompt copied')}>Copy prompt<//>
            </div>
          `}`}
      <//>`;
  }
}

function firstLine(content) {
  const lines = (content || '').split('\n').filter(l => l.trim());
  return (lines[0] || '').slice(0, 180);
}
