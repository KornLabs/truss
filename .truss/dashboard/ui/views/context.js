import { html, Component } from '../../vendor/preact-htm.mjs';
import { Card, CardHead, Badge, Button, Icons, StackedBar, copyText } from '../components.js';
import { api } from '../api.js';
import { SEG_COLORS, FRAMEWORKS, THRESHOLDS, TRUSS_BASELINE, budgetStatus, CLEANUP_PROMPT } from '../context-config.js';

export class ContextView extends Component {
  state = { budget: null, error: null };
  componentDidMount() {
    api.contextBudget().then(b => this.setState({ budget: b })).catch(e => this.setState({ error: e.message }));
  }

  copyCleanup = () => copyText(CLEANUP_PROMPT, 'Cleanup prompt copied');

  render({ go }, { budget, error }) {
    if (error) return html`<${Card}><p style="color:var(--err)">${error}</p><//>`;
    if (!budget) return html`<${Card}><p class="muted">Calculating token footprint…</p><//>`;

    const total = budget.totalTokens || 0;
    const stat = budgetStatus(total);
    const files = Object.entries(budget.stats || {}).map(([f, v], i) => ({
      file: f, tokens: v.tokens || 0, chars: v.chars || 0, color: SEG_COLORS[i % SEG_COLORS.length],
    })).sort((a, b) => b.tokens - a.tokens);
    const segs = files.filter(f => f.tokens > 0).map(f => ({ label: f.file, value: f.tokens, color: f.color }));

    // health gauge scale: starts at the Truss floor (≈ default footprint), not 0 —
    // a running project can never sit below its framework overhead, so a 0-based
    // scale would waste the left third and misplace where "healthy" begins.
    const gFloor = THRESHOLDS.floor;
    const gMax = Math.max(THRESHOLDS.yellow * 1.4, total * 1.1);
    const gSpan = gMax - gFloor;
    const pct = (t) => `${Math.min(Math.max(t - gFloor, 0) / gSpan * 100, 100).toFixed(1)}%`;

    // Apples-to-apples: compare Truss' FIXED framework overhead (≈ fresh-init §1
    // load order, ~2.5k) against other frameworks' boot context. A project's
    // accumulated state (decision log, filled vision…) is content you'd carry in
    // ANY tool, so it is shown as a separate segment stacked on top — not counted
    // as Truss overhead. This keeps the comparison from punishing Truss as a
    // project matures and its decision log grows.
    const overhead = Math.min(total, TRUSS_BASELINE);
    const projectState = Math.max(0, total - TRUSS_BASELINE);
    const rows = [{ name: 'Truss', tokens: total, self: true, overhead, projectState,
                    note: `${overhead.toLocaleString()} framework overhead + ${projectState.toLocaleString()} your project state` }, ...FRAMEWORKS]
      .sort((a, b) => a.tokens - b.tokens);
    const axisMax = Math.max(...rows.map(r => r.tokens), TRUSS_BASELINE) * 1.05;
    const peers = FRAMEWORKS.map(f => f.tokens).sort((a, b) => a - b);
    const median = peers[Math.floor(peers.length / 2)] || 0;
    // Overhead-vs-boot, not live-vs-boot — a stable figure that doesn't swing as
    // the project accumulates state.
    const lighter = TRUSS_BASELINE > 0 ? median / TRUSS_BASELINE : 0;

    return html`
      <div class="grid cols-auto-lg">
        <${Card}>
          <${CardHead} icon=${Icons.Gauge} title="Mandatory reading per session">
            <${Badge} variant=${stat.tone}>${stat.label}<//>
          <//>
          <div class="row" style="align-items:baseline;gap:8px;margin-bottom:14px">
            <span class="stat-val" style="font-size:34px">${total.toLocaleString()}</span>
            <span class="stat-unit">tokens · ≈ ${((budget.totalChars || 0) / 1000).toFixed(1)}k chars</span>
          </div>
          <${StackedBar} segments=${segs} />
          <div class="row wrap" style="gap:12px;margin-top:12px">
            ${files.filter(f => f.tokens > 0).map(f => html`
              <span style="font-size:12px;display:inline-flex;align-items:center;gap:6px">
                <span style=${`width:9px;height:9px;border-radius:2px;background:${f.color}`}></span>
                <span class="mono">${f.file}</span><span class="dim">${f.tokens.toLocaleString()}</span></span>`)}
          </div>

          <div class="divider" style="margin:18px 0 12px"></div>
          <div class="row between" style="margin-bottom:8px">
            <div class="dim" style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em">System health</div>
            <span class="dim" style="font-size:11.5px">cleanup pays off above ~${(THRESHOLDS.green / 1000)}k tokens</span>
          </div>
          <div style="position:relative;height:14px;border-radius:7px;overflow:hidden;display:flex">
            <span style=${`width:${pct(THRESHOLDS.green)};background:var(--ok${stat.tone === 'ok' ? '' : '-soft'});transition:background .25s`}></span>
            <span style=${`width:${((THRESHOLDS.yellow - THRESHOLDS.green) / gSpan * 100).toFixed(1)}%;background:var(--warn${stat.tone === 'warn' ? '' : '-soft'});transition:background .25s`}></span>
            <span style=${`flex:1;background:var(--err${stat.tone === 'err' ? '' : '-soft'});transition:background .25s`}></span>
            <span style=${`position:absolute;top:-3px;bottom:-3px;left:${pct(total)};width:3px;background:var(--text);border-radius:2px`} title=${`${total} tokens`}></span>
          </div>
          <div class="row between" style="font-size:10.5px;color:var(--text-3);margin-top:4px">
            <span style=${`color:var(--ok);font-weight:${stat.tone === 'ok' ? '700' : '400'};opacity:${stat.tone === 'ok' ? '1' : '0.6'}`}>healthy ${THRESHOLDS.floor / 1000}–${THRESHOLDS.green / 1000}k</span>
            <span style=${`color:var(--warn);font-weight:${stat.tone === 'warn' ? '700' : '400'};opacity:${stat.tone === 'warn' ? '1' : '0.6'}`}>watch ${THRESHOLDS.green / 1000}–${THRESHOLDS.yellow / 1000}k</span>
            <span style=${`color:var(--err);font-weight:${stat.tone === 'err' ? '700' : '400'};opacity:${stat.tone === 'err' ? '1' : '0.6'}`}>clean up ${'>'}${THRESHOLDS.yellow / 1000}k</span>
          </div>
          <div class="row wrap" style="gap:8px;margin-top:14px">
            <${Button} variant=${stat.tone === 'ok' ? '' : 'primary'} className="sm" icon=${Icons.Copy} onClick=${this.copyCleanup}>Copy cleanup prompt<//>
          </div>
          <p class="dim" style="font-size:11px;margin-top:12px;line-height:1.5">
            "Mandatory reading" = the AGENTS.md §1 load order every agent ingests each session
            (estimated at ≈1.5 tokens/word — the same method the doctor's CX-01 check uses, so this
            number matches <code>truss doctor</code>). Use the cleanup prompt above when the footprint grows.</p>
        <//>

        <${Card}>
          <${CardHead} icon=${Icons.Gauge} title="How Truss compares" />
          ${lighter >= 1.3 ? html`
            <div class="row" style="align-items:baseline;gap:8px;margin-bottom:6px">
              <span class="stat-val" style="font-size:30px;color:var(--ok)">${lighter.toFixed(1)}×</span>
              <span class="stat-unit">lighter framework overhead than a typical autonomous agent</span>
            </div>` : ''}
          <p class="muted" style="font-size:12.5px;margin-bottom:10px;line-height:1.5">
            Mandatory / boot context other agent frameworks load per run (approx.). Truss' bar
            splits its fixed framework overhead from your project's own accumulated state.</p>
          <div class="row wrap" style="gap:14px;margin-bottom:16px;font-size:11px">
            <span style="display:inline-flex;align-items:center;gap:6px"><span style="width:9px;height:9px;border-radius:2px;background:var(--accent)"></span>Truss framework overhead</span>
            <span style="display:inline-flex;align-items:center;gap:6px"><span style="width:9px;height:9px;border-radius:2px;background:var(--accent-soft)"></span>your project state</span>
            <span style="display:inline-flex;align-items:center;gap:6px"><span style="width:9px;height:9px;border-radius:2px;background:var(--warn)"></span>other frameworks (boot)</span>
          </div>

          <div class="col" style="gap:10px">
            ${rows.map(r => html`
              <div key=${r.name}>
                <div class="row between" style="gap:8px;margin-bottom:4px">
                  <span style=${`font-size:12.5px;${r.self ? 'font-weight:600' : 'color:var(--text-2)'}`}>${r.name}${r.orchestrator ? html`<span class="dim" style="font-size:10px"> · orchestrator</span>` : ''}</span>
                  <span class="dim" style="font-size:11.5px">${(r.tokens / 1000).toFixed(r.tokens < 10000 ? 1 : 0)}k</span>
                </div>
                <div style="height:9px;background:var(--surface-2);border-radius:5px;overflow:hidden;display:flex">
                  ${r.self ? html`
                    <span title=${`Truss framework overhead: ${r.overhead.toLocaleString()}`} style=${`height:100%;width:${(r.overhead / axisMax * 100).toFixed(1)}%;background:var(--accent)`}></span>
                    <span title=${`Your project state: ${r.projectState.toLocaleString()}`} style=${`height:100%;width:${(r.projectState / axisMax * 100).toFixed(1)}%;background:var(--accent-soft)`}></span>
                  ` : html`
                    <span style=${`height:100%;width:${(r.tokens / axisMax * 100).toFixed(1)}%;background:${r.orchestrator ? 'var(--text-3)' : 'var(--warn)'}`}></span>
                  `}
                </div>
                ${r.note ? html`<div class="dim" style="font-size:11px;margin-top:3px">${r.note}</div>` : ''}
              </div>`)}
          </div>

          <p class="dim" style="font-size:11px;margin-top:16px;line-height:1.5">
            Estimates, not official benchmarks. To compare like-for-like, Truss is shown at its fixed
            framework overhead (~${(TRUSS_BASELINE / 1000).toFixed(1)}k, a fresh init) plus your project's
            own state as a separate segment; competitor figures are their boot context per run and may
            already include some representative memory. Lower isn't always better (can mean less encoded
            context). Why it matters: model quality decays as input grows ("context rot", Chroma 2025) —
            a lean boot context leaves more room for the task.</p>
        <//>
      </div>

      ${total > THRESHOLDS.green && html`
        <${Card} style=${`border-color:var(--${stat.tone}-soft)`}>
          <${CardHead} icon=${Icons.Alert} title="Recommendation" />
          <p style="font-size:13.5px;line-height:1.55;margin-bottom:14px">
            The mandatory reading is ${total > THRESHOLDS.yellow ? 'heavy' : 'growing'} — slimming the boot files
            will free working context. Hand the agent the cleanup prompt above (or from the library).</p>
          <${Button} variant="primary" icon=${Icons.Copy} onClick=${this.copyCleanup}>Copy cleanup prompt<//>
        <//>`}

      <${Card}>
        <${CardHead} icon=${Icons.Doc} title="Per-file breakdown" />
        <table class="table">
          <thead><tr><th>File</th><th style="text-align:right">Characters</th><th style="text-align:right">Tokens</th><th style="text-align:right">Share</th></tr></thead>
          <tbody>${files.map(f => html`<tr>
            <td class="mono">${f.file}</td>
            <td style="text-align:right" class="muted">${f.chars.toLocaleString()}</td>
            <td style="text-align:right;font-weight:500">${f.tokens.toLocaleString()}</td>
            <td style="text-align:right" class="muted">${total ? (f.tokens / total * 100).toFixed(0) : 0}%</td></tr>`)}</tbody>
        </table>
      <//>`;
  }
}
