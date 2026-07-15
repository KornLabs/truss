import { html, Component } from '../../vendor/preact-htm.mjs';
import { Card, CardHead, Icons, Badge, Empty, Button, Spinner } from '../components.js';
import { api } from '../api.js';

// Show the directory path verbatim so nested groups are unambiguous
// (e.g. `/context`, `/state`). Root is labelled `/root` for clarity.
const catLabel = (name) => {
  const n = name.trim();
  if (n === '/' || n === '') return '/root';
  return n.startsWith('/') ? n : `/${n}`;
};

// Root first, then the remaining directories alphabetically by path.
const sortCats = (cats) => [...cats].sort((a, b) => {
  const an = a.name.trim(), bn = b.name.trim();
  const aRoot = an === '/' || an === '';
  const bRoot = bn === '/' || bn === '';
  if (aRoot !== bRoot) return aRoot ? -1 : 1;
  return an < bn ? -1 : (an > bn ? 1 : 0);
});

export class MapView extends Component {
  state = { running: false };

  rebuild = async () => {
    this.setState({ running: true });
    const res = await api.exec('map');
    this.setState({ running: false });
    if (res.ok) {
      window.toast && window.toast('Map rebuilt', 'ok');
      this.props.reload && this.props.reload();
    } else if (!res.readOnly) {
      window.toast && window.toast(res.error || 'Failed', 'error');
    }
  };

  render({ state }, { running }) {
    const cats = sortCats(state.map?.categories || []);
    const fileCount = cats.reduce((a, c) => a + c.files.length, 0);

    if (cats.length === 0) return html`
      <${Card}>
        <${CardHead} icon=${Icons.Map} title="Project architecture">
          <${Button} variant="primary" className="sm" disabled=${running} onClick=${this.rebuild} icon=${running ? null : Icons.Refresh}>
            ${running ? html`<${Spinner} /> Rebuilding…` : 'Rebuild map'}
          <//>
        <//>
        <${Empty} icon=${Icons.Map} title="No map yet"
          sub="Click Rebuild map to generate state/map.md." />
      <//>`;

    return html`
      <${Card}>
        <${CardHead} icon=${Icons.Map} title="Project architecture">
          <div class="row" style="gap:12px">
            <${Badge} variant="neutral">${cats.length} groups · ${fileCount} files<//>
            <${Button} variant="primary" className="sm" disabled=${running} onClick=${this.rebuild} icon=${running ? null : Icons.Refresh}>
              ${running ? html`<${Spinner} /> Rebuilding…` : 'Rebuild map'}
            <//>
          </div>
        <//>
        <p class="muted" style="font-size:12.5px;margin-bottom:4px">Auto-generated from <span class="mono">state/map.md</span>. One canonical home per topic.</p>
      <//>

    <div class="grid cols-auto-fill-lg" style="align-items:start">
      ${cats.map(cat => html`
        <${Card} key=${cat.name} className="map-card">
          <div class="row" style="gap:8px;margin-bottom:14px">
            <span class="badge accent" style="font-family:var(--font-mono)">${catLabel(cat.name)}</span>
            <span class="dim" style="font-size:12px;margin-left:auto">${cat.files.length} file${cat.files.length !== 1 ? 's' : ''}</span>
          </div>
          <div class="col map-files">
            ${cat.files.map(f => {
              const parts = f.file.split('/');
              const base = parts.pop();
              return html`
              <div key=${f.file} style="padding:11px 13px;border:1px solid var(--border);border-radius:var(--r-sm);background:var(--bg-elev);transition:border-color var(--transition)"
                onMouseEnter=${e => e.currentTarget.style.borderColor = 'var(--accent-border)'}
                onMouseLeave=${e => e.currentTarget.style.borderColor = 'var(--border)'}>
                <div class="row" style="gap:8px;align-items:baseline">
                  <${Icons.File} />
                  <span class="mono" style="font-size:13px;font-weight:600">
                    ${parts.length ? html`<span class="dim">${parts.join('/')}/</span>` : ''}${base}</span>
                </div>
                ${f.title && f.title !== base ? html`<div style="font-size:12.5px;margin-top:5px;font-weight:500">${f.title}</div>` : ''}
                ${f.description ? html`<p class="muted" style="font-size:12px;margin-top:3px;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${f.description}</p>` : ''}
              </div>`;
            })}
          </div>
        <//>`)}
    </div>`;
  }
}
