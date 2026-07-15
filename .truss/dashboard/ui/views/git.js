import { html, Component } from '../../vendor/preact-htm.mjs';
import { Card, CardHead, Badge, Icons, Empty, Spinner, Button } from '../components.js';
import { api } from '../api.js';

const STATUS = {
  'M': { label: 'modified', tone: 'warn' },
  'A': { label: 'added', tone: 'ok' },
  'D': { label: 'deleted', tone: 'err' },
  'R': { label: 'renamed', tone: 'accent' },
  'C': { label: 'copied', tone: 'accent' },
  'U': { label: 'conflict', tone: 'err' },
  '?': { label: 'untracked', tone: 'neutral' },
};

function parseStatus(porcelain) {
  const staged = [], unstaged = [], untracked = [];
  (porcelain || '').split('\n').filter(Boolean).forEach(line => {
    const x = line[0], y = line[1], file = line.slice(3);
    if (x === '?' && y === '?') { untracked.push({ file, code: '?' }); return; }
    if (x !== ' ' && x !== '?') staged.push({ file, code: x });
    if (y !== ' ' && y !== '?') unstaged.push({ file, code: y });
  });
  return { staged, unstaged, untracked };
}

function parseTree(text) {
  // git log --graph --oneline → split into commit rows + graph art
  return (text || '').split('\n').filter(l => l.trim()).map(line => {
    const m = line.match(/^([*|\/\\ _]+)\s*([0-9a-f]{7,40})\s+(.*)$/i);
    if (m) return { graph: m[1].trimEnd(), hash: m[2].slice(0, 7), msg: m[3], commit: true };
    return { graph: line, commit: false };
  });
}

export class GitView extends Component {
  state = { status: null, tree: null, branches: null, error: null };
  componentDidMount() { this.load(); }
  load = async () => {
    try {
      const [s, t, b] = await Promise.all([api.gitStatus(), api.gitTree(), api.gitBranches()]);
      this.setState({ status: s.status, tree: t.tree, branches: b || null, error: s.error || t.error || null });
    } catch (e) { this.setState({ error: e.message }); }
  };

  render(_, { status, tree, branches, error }) {
    if (error) return html`<${Card}><${Empty} icon=${Icons.Git} title="Git unavailable" sub=${error} /><//>`;
    if (status == null) return html`<${Card}><p class="muted"><${Spinner} /> Reading repository…</p><//>`;

    const { staged, unstaged, untracked } = parseStatus(status);
    const commits = parseTree(tree);
    const clean = staged.length + unstaged.length + untracked.length === 0;

    const fileRow = (item) => {
      const s = STATUS[item.code] || STATUS['M'];
      return html`<div class="row" style="gap:10px;padding:7px 0;border-bottom:1px solid var(--border)">
        <span class="badge ${s.tone}" style="width:80px;justify-content:center">${s.label}</span>
        <span class="mono" style="font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.file}</span></div>`;
    };

    // Code-root branch awareness — shown only when the configured checkout exists.
    const branchCard = (branches && branches.present) ? (() => {
      const info = branches.info || {};
      const codeRoot = branches.codeRoot || 'repo';
      const current = info.detached ? `detached @ ${info.sha || '?'}` : (info.branch || (info.reason ? `unreadable (${info.reason})` : '—'));
      const declared = branches.declared || null;
      const badge = branches.mismatch
        ? html`<${Badge} variant="err">Mismatch<//>`
        : (branches.match ? html`<${Badge} variant="ok">On declared branch<//>`
        : info.detached ? html`<${Badge} variant="warn">Detached HEAD<//>`
        : html`<${Badge} variant="neutral">${declared ? 'OK' : 'No branch declared'}<//>`);
      const row = (label, value, tone) => html`<div class="row" style="gap:10px;padding:7px 0;border-bottom:1px solid var(--border)">
        <span class="dim" style="width:130px;font-size:12px">${label}</span>
        <span class="mono" style="font-size:12.5px;color:${tone || 'var(--text)'}">${value}</span></div>`;
      return html`
        <${Card} className="card-fill">
          <${CardHead} icon=${Icons.Git} title=${`Code-root branch (${codeRoot}/)`}>${badge}<//>
          <div class="col" style="gap:0;padding-right:8px">
            ${row('Checked out', current, branches.mismatch ? 'var(--err)' : undefined)}
            ${row('Declared (current.md)', declared || '— not set —', declared ? undefined : 'var(--text-3)')}
          </div>
          ${branches.mismatch ? html`<p class="muted" style="margin-top:8px;font-size:12.5px">${codeRoot}/ is not on the declared branch. Switch with <span class="mono">git -C ${codeRoot} switch ${declared}</span>, or update <span class="mono">branch:</span> in state/current.md.</p>` : ''}
          ${(branches.list && branches.list.length) ? html`<div style="margin-top:10px">
            <div class="dim" style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px">Local branches · ${branches.list.length}</div>
            <div class="row" style="flex-wrap:wrap;gap:6px">
              ${branches.list.map(b => html`<span class="badge ${b === info.branch ? 'accent' : 'neutral'}" style="font-size:12px">${b}${b === info.branch ? ' ●' : ''}</span>`)}
            </div></div>` : ''}
        <//>`;
    })() : '';

    return html`
      <div class="grid cols-auto-lg grid-fill">
        ${branchCard}
        <${Card} className="card-fill">
          <${CardHead} icon=${Icons.Git} title="Working tree">
            <div class="row" style="gap:8px">
              <${Badge} variant=${clean ? 'ok' : 'warn'}>${clean ? 'Clean' : `${staged.length + unstaged.length + untracked.length} changes`}<//>
              <button class="icon-btn" onClick=${this.load} title="Refresh git data" style="color:var(--text-3);width:24px;height:24px"><${Icons.Refresh} /></button>
            </div>
          <//>
          ${clean ? html`<${Empty} icon=${Icons.CheckCircle} title="Nothing to commit" sub="The working tree matches HEAD." />` : html`
            <div class="col" style="padding-right: 8px;">
              ${staged.length ? html`<div style="margin-bottom:14px">
                <div class="dim" style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px">Staged · ${staged.length}</div>
                ${staged.map(fileRow)}</div>` : ''}
              ${unstaged.length ? html`<div style="margin-bottom:14px">
                <div class="dim" style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px">Modified · ${unstaged.length}</div>
                ${unstaged.map(fileRow)}</div>` : ''}
              ${untracked.length ? html`<div>
                <div class="dim" style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px">Untracked · ${untracked.length}</div>
                ${untracked.map(fileRow)}</div>` : ''}
            </div>
          `}
        <//>

        <${Card} className="card-fill">
          <${CardHead} icon=${Icons.Git} title="Recent history">
            <${Badge} variant="neutral">${commits.filter(c => c.commit).length} commits<//>
          <//>
          <div class="col" style="gap:0; padding-right: 8px;">
            ${commits.map((c, i) => c.commit ? html`
              <div key=${i} class="row" style="gap:10px;padding:8px 0;align-items:flex-start">
                <span style="display:flex;flex-direction:column;align-items:center;flex:none;width:14px">
                  <span style="width:9px;height:9px;border-radius:50%;background:var(--accent);margin-top:4px"></span>
                  ${i < commits.length - 1 ? html`<span style="width:2px;flex:1;background:var(--border);min-height:14px;margin-top:2px"></span>` : ''}
                </span>
                <div style="min-width:0">
                  <span class="mono badge neutral" style="font-size:11px">${c.hash}</span>
                  <span style="font-size:13px;margin-left:8px">${c.msg}</span>
                </div>
              </div>` : html`<div key=${i} class="mono dim" style="font-size:12px;padding-left:2px;white-space:pre">${c.graph}</div>`)}
          </div>
        <//>
      </div>`;
  }
}
