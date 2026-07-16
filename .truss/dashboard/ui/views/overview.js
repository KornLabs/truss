import { html, Component } from '../../vendor/preact-htm.mjs';
import { Card, CardHead, Badge, Button, Icons, StackedBar, Modal, copyText } from '../components.js';
import { FileModal, Markdown } from '../file-modal.js';
import { api } from '../api.js';
import { SEG_COLORS, budgetStatus } from '../context-config.js';
import { handoff as handoffStore } from '../store.js';

export class OverviewView extends Component {
  state = { budget: null, git: null, branches: null, modal: null, phaseChange: '', odSel: {}, odNote: {}, handoff: handoffStore.all() };

  componentDidMount() {
    api.contextBudget().then(b => this.setState({ budget: b })).catch(() => {});
    api.gitStatus().then(g => this.setState({ git: g })).catch(() => {});
    // Code-root branch awareness (branch-guard feature). Degrades silently to
    // present:false when no code-root checkout exists — the card then hides.
    api.gitBranches().then(b => this.setState({ branches: b })).catch(() => {});
  }

  openModal = (m) => this.setState({ modal: m });
  closeModal = () => this.setState({ modal: null });

  phasePrompt = () => {
    const cur = this.props.state?.phase?.current || '(current)';
    const change = this.state.phaseChange.trim() || '{{DESCRIBE THE CHANGE}}';
    return `I want to adjust the phase definitions in state/phases.md.\n`
      + `Current phase: ${cur}.\nChange: ${change}\n\n`
      + `Please edit state/phases.md accordingly (use the phase-replan prompt for non-trivial restructurings). `
      + `Do NOT change the \`current:\` pointer — phase changes are human-only and I will do that via the exit `
      + `procedure. Keep the grammar valid (label / purpose / behavior / allowed / forbidden / forbidden-globs / `
      + `read / exit / prompts), record the restructuring as a D-NNN, then run \`node .truss/bin/truss.mjs render\` `
      + `to update AGENTS.md and \`doctor\` to verify.`;
  };

  // Combine the chosen option and the free-text note into one decision statement.
  decisionText = (od) => {
    const chosen = (od.options && od.options[this.state.odSel[od.id]]) || null;
    const note = (this.state.odNote[od.id] || '').trim();
    if (chosen) return `${chosen.label}${chosen.desc ? ` — ${chosen.desc}` : ''}${note ? ` (${note})` : ''}`;
    return note || '';
  };

  makeHandoff = (od) => {
    const decision = this.decisionText(od);
    if (!decision) { window.toast && window.toast('Pick an option or type your decision', 'warn'); return; }
    const next = handoffStore.add({ odId: od.id, title: od.title, decision });
    // Keep the modal open so several decisions can be queued in one pass; the
    // combined prompt covers all of them.
    this.setState({ handoff: next });
    window.toast && window.toast(`${od.id} → added to handoff`, 'ok');
  };

  removeHandoff = (odId) => this.setState({ handoff: handoffStore.remove(odId) });
  clearHandoff = () => this.setState({ handoff: handoffStore.clear() });

  render({ state, go }, { budget, git, branches, modal, phaseChange, odSel, odNote, handoff }) {
    // ── Init guard: show welcome banner instead of empty cards ──
    if (state.initialized === false) {
      return html`
        <${Card}>
          <${CardHead} icon=${Icons.Overview} title="Welcome to Truss" />
          <div style="padding:4px 0 16px;font-size:14px;line-height:1.7">
            <p style="margin:0 0 14px">This workspace has not been initialised yet.</p>
            <p style="margin:0 0 14px">To get started, run one of these commands in your terminal:</p>
            <div style="background:var(--surface-2);border-radius:var(--r-sm);padding:14px 18px;margin-bottom:14px;font-size:13px">
              <div style="margin-bottom:8px"><span class="dim" style="margin-right:8px">New project:</span><code class="mono">node .truss/bin/truss.mjs init --name "My Project" --lang English</code></div>
              <div><span class="dim" style="margin-right:8px">Existing code:</span><code class="mono">node .truss/bin/truss.mjs init --overlay --name "My Project" --lang English</code></div>
            </div>
            <p class="muted" style="margin:0;font-size:12.5px">After init, reload this dashboard to see your project overview.</p>
          </div>
        <//>
        <div class="grid cols-auto-lg">
          <${Card} onClick=${() => go('git')}>
            <${CardHead} icon=${Icons.Git} title="Working tree" />
            ${git ? (() => {
              const gitLines = (git?.status || '').split('\n').filter(Boolean);
              const isConflict = (l) => l[0] === 'U' || l[1] === 'U' || l[0] + l[1] === 'AA' || l[0] + l[1] === 'DD';
              const staged = gitLines.filter(l => !isConflict(l) && 'MADRC'.includes(l[0])).length;
              const modified = gitLines.filter(l => l[1] === 'M' || l[1] === 'D').length;
              const untracked = gitLines.filter(l => l.startsWith('??')).length;
              return html`
                <div class="row wrap" style="gap:8px;margin-bottom:6px">
                  <${Badge} variant=${staged ? 'ok' : 'neutral'}>${staged} staged<//>
                  <${Badge} variant=${modified ? 'warn' : 'neutral'}>${modified} modified<//>
                  <${Badge} variant="neutral">${untracked} untracked<//>
                </div>
                <p class="muted" style="font-size:12.5px">${gitLines.length === 0 ? 'Clean — nothing to commit.' : `${gitLines.length} change${gitLines.length > 1 ? 's' : ''} in the working tree.`}</p>
              `;
            })() : html`<p class="muted" style="font-size:13px">Reading git status…</p>`}
          <//>
          
          <${Card} onClick=${() => go('about')}>
            <${CardHead} icon=${Icons.Help} title="About Truss">
              <span class="card-link">Open<${Icons.ChevronRight} /></span>
            <//>
            <p class="muted" style="font-size:13px">Tips, links, and system information.</p>
          <//>
        </div>`;
    }

    const phase = state.phase || {};
    const todos = state.humanTodos || { open: [], openCount: 0 };
    const open = state.openDecisions || [];
    const cur = state.current || {};
    const total = phase.total || 4, pos = phase.position || 1;

    const bTokens = budget?.totalTokens || 0;
    const bStat = budgetStatus(bTokens);
    const segs = budget ? Object.entries(budget.stats || {}).filter(([, v]) => v.tokens > 0)
      .map(([f, v], i) => ({ label: f, value: v.tokens, color: SEG_COLORS[i % SEG_COLORS.length] })) : [];

    const gitLines = (git?.status || '').split('\n').filter(Boolean);
    // Porcelain v1: "XY <file>". X = index/staged status, Y = working-tree status.
    // Unmerged (conflict) entries are DD, AU, UD, UA, DU, AA, UU — all have a 'U'
    // on one side EXCEPT AA and DD; none of these are "staged".
    const isConflict = (l) => l[0] === 'U' || l[1] === 'U' || l[0] + l[1] === 'AA' || l[0] + l[1] === 'DD';
    // Staged = explicit index letters, excluding conflicts, ignored (!), untracked (?) and unchanged (space).
    const staged = gitLines.filter(l => !isConflict(l) && 'MADRC'.includes(l[0])).length;
    const modified = gitLines.filter(l => l[1] === 'M' || l[1] === 'D').length;
    const untracked = gitLines.filter(l => l.startsWith('??')).length;

    // ── Code-root branch chip (branch-guard feature) ──────────────────────
    // Only shown when a code-root checkout exists (branches.present). Mirrors the
    // Git-tab card at a glance: checked-out branch + match/mismatch status.
    const br = branches || {};
    const brInfo = br.info || {};
    const brCurrent = brInfo.detached
      ? `detached @ ${brInfo.sha || '?'}`
      : (brInfo.branch || (brInfo.reason ? 'unreadable' : '—'));
    const brBadge = br.mismatch ? { tone: 'err', text: 'Mismatch' }
      : br.match ? { tone: 'ok', text: 'On declared branch' }
      : brInfo.detached ? { tone: 'warn', text: 'Detached HEAD' }
      : { tone: 'neutral', text: br.declared ? 'OK' : 'No branch declared' };
    const brSub = br.mismatch
      ? `Declared ${br.declared || '—'} in current.md — resolve before working.`
      : br.match ? 'Matches state/current.md.'
      : br.declared ? `Declared: ${br.declared}` : 'No branch: declared in current.md.';

    return html`
      <${Card}>
        <${CardHead} icon=${Icons.Overview} title="Focus" />
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px">
          <div><div class="dim" style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px">Now</div><div style="font-size:14px">${cur.focus || '—'}</div></div>
          <div><div class="dim" style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px">Next</div>
            ${(cur.next || []).length ? html`<ul style="margin:0;padding-left:16px;font-size:13px;line-height:1.6">${cur.next.slice(0, 5).map(n => html`<li>${n}</li>`)}</ul>` : html`<span class="muted" style="font-size:13px">—</span>`}</div>
          <div><div class="dim" style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px">Blockers</div>
            <div style="font-size:14px;color:${(cur.blockers && cur.blockers !== 'none') ? 'var(--warn)' : 'var(--text)'}">${cur.blockers || 'none'}</div></div>
        </div>
      <//>

      <div class="grid cols-auto">
        <${Card}>
          <${CardHead} icon=${Icons.Flag} title="Current phase">
            <span class="card-link" onClick=${() => this.openModal('phase')}>Details<${Icons.ChevronRight} /></span>
          <//>
          <div class="row between" style="margin-bottom:12px">
            <div class="stat-val" style="font-size:22px">${phase.label || '—'}</div>
            <${Badge} variant="accent">${pos} / ${total}<//>
          </div>
          <div class="row" style="gap:5px;margin-bottom:10px">
            ${Array.from({ length: total }).map((_, i) => html`<span style=${`flex:1;height:5px;border-radius:3px;background:${i < pos ? 'var(--accent)' : 'var(--surface-2)'}`}></span>`)}
          </div>
          <p class="muted" style="font-size:12.5px;line-height:1.5">${phase.behavior || phase.purpose || ''}</p>
        <//>

        <${Card} style=${todos.openCount > 0 ? 'border-color:var(--warn-soft)' : ''}>
          <${CardHead} icon=${Icons.UserAlert} title="Human to-dos">
            <div class="row" style="gap:8px">
              <${Badge} variant=${todos.openCount > 0 ? 'warn' : 'ok'}>${todos.openCount} open<//>
              <span class="card-link" onClick=${() => this.openModal('todos')}>Open<${Icons.ChevronRight} /></span>
            </div>
          <//>
          ${todos.open.length === 0
            ? html`<p class="muted" style="font-size:13px">Nothing waiting on you.</p>`
            : html`<div class="col" style="gap:9px">${todos.open.slice(0, 4).map(t => html`
                <div class="row" style="gap:9px;align-items:flex-start">
                  <span style="width:15px;height:15px;border:1.5px solid var(--border-strong);border-radius:4px;flex:none;margin-top:1px"></span>
                  <div style="font-size:13px;line-height:1.45"><span class="mono dim" style="margin-right:6px">${t.id}</span>${t.text || ''}</div>
                </div>`)}
                ${todos.open.length > 4 && html`<span class="dim" style="font-size:12px">+${todos.open.length - 4} more</span>`}
              </div>`}
        <//>

        <${Card}>
          <${CardHead} icon=${Icons.Help} title="Open decisions">
            <span class="card-link" onClick=${() => this.openModal('decisions')}>${open.length ? 'Decide' : 'View'}<${Icons.ChevronRight} /></span>
          <//>
          <div class="stat-val">${open.length}</div>
          <p class="muted" style="font-size:12.5px;margin-top:4px">
            ${open.length === 0 ? 'Nothing blocking right now.' : open.slice(0, 2).map(o => o.title || o.id).join(' · ')}</p>
        <//>
      </div>

      ${handoff.length > 0 && html`
        <div class="handoff-bar">
          <div class="row between" style="gap:12px;margin-bottom:10px">
            <div class="row" style="gap:8px"><${Icons.ArrowRight} /><strong style="font-size:13.5px">Decision handoff · ${handoff.length} decision${handoff.length > 1 ? 's' : ''}</strong></div>
            <button class="icon-btn" aria-label="Clear all" onClick=${this.clearHandoff}><${Icons.X} /></button>
          </div>
          <div class="col" style="gap:7px;margin-bottom:12px">
            ${handoff.map(h => html`
              <div key=${h.odId} class="row between" style="gap:10px;padding:8px 11px;border:1px solid var(--border);border-radius:var(--r-sm);background:var(--bg-elev)">
                <div style="min-width:0;font-size:12.5px"><span class="mono dim" style="margin-right:6px">${h.odId}</span><span class="muted">${h.title} →</span> ${h.decision}</div>
                <div class="row" style="gap:4px;flex:none">
                  <button class="icon-btn" style="width:28px;height:28px" title="Copy this one" onClick=${() => copyText(singleHandoffPrompt(h), 'Handoff prompt copied')}><${Icons.Copy} /></button>
                  <button class="icon-btn" style="width:28px;height:28px" title="Remove" onClick=${() => this.removeHandoff(h.odId)}><${Icons.X} /></button>
                </div>
              </div>`)}
          </div>
          <div class="row wrap" style="gap:8px">
            <${Button} variant="primary" className="sm" icon=${Icons.Copy} onClick=${() => copyText(combinedHandoffPrompt(handoff), handoff.length > 1 ? 'Combined handoff copied' : 'Handoff prompt copied')}>
              ${handoff.length > 1 ? 'Copy all as one prompt' : 'Copy handoff prompt'}<//>
            <${Button} className="sm" onClick=${this.clearHandoff}>Clear<//>
          </div>
        </div>`}

      <div class="grid cols-auto-lg">
        ${br.present ? html`
        <${Card} onClick=${() => go('git')} style=${br.mismatch ? 'border-color:var(--err-soft)' : ''}>
          <${CardHead} icon=${Icons.Git} title=${`Code-root branch`}>
            <${Badge} variant=${brBadge.tone}>${brBadge.text}<//>
          <//>
          <div class="row" style="align-items:baseline;gap:8px;margin-bottom:6px">
            <span class="stat-val" style="font-size:18px;font-family:var(--font-mono);color:${br.mismatch ? 'var(--err)' : 'var(--text)'}">${brCurrent}</span>
            <span class="dim" style="font-size:12px">${br.codeRoot || 'repo'}/</span>
          </div>
          <p class="muted" style="font-size:12.5px">${brSub}</p>
        <//>` : ''}

        <${Card} onClick=${() => go('context')}>
          <${CardHead} icon=${Icons.Gauge} title="Boot metadata">
            <${Badge} variant=${bStat.tone}>${bStat.label}<//>
          <//>
          ${budget ? html`
            <div class="row" style="align-items:baseline;gap:7px;margin-bottom:12px">
              <span class="stat-val">${bTokens.toLocaleString()}</span><span class="stat-unit">estimated tokens · mandatory Truss files</span></div>
            <${StackedBar} segments=${segs} />
            <div class="row wrap" style="gap:10px;margin-top:10px">${segs.slice(0, 5).map(s => html`
              <span class="dim" style="font-size:11.5px;display:inline-flex;align-items:center;gap:5px">
                <span style=${`width:8px;height:8px;border-radius:2px;background:${s.color}`}></span>${s.label.replace('state/', '')} ${s.value.toLocaleString()}</span>`)}</div>
          ` : html`<p class="muted" style="font-size:13px">Calculating…</p>`}
        <//>

        <${Card} onClick=${() => go('git')}>
          <${CardHead} icon=${Icons.Git} title="Working tree" />
          ${git ? html`
            <div class="row wrap" style="gap:8px;margin-bottom:6px">
              <${Badge} variant=${staged ? 'ok' : 'neutral'}>${staged} staged<//>
              <${Badge} variant=${modified ? 'warn' : 'neutral'}>${modified} modified<//>
              <${Badge} variant="neutral">${untracked} untracked<//>
            </div>
            <p class="muted" style="font-size:12.5px">${gitLines.length === 0 ? 'Clean — nothing to commit.' : `${gitLines.length} change${gitLines.length > 1 ? 's' : ''} in the working tree.`}</p>
          ` : html`<p class="muted" style="font-size:13px">Reading git status…</p>`}
        <//>
      </div>


      <${FileModal} open=${modal === 'phase'} onClose=${this.closeModal} icon=${Icons.Flag} title="Phases — state/phases.md" fileKey="phases"
        footer=${html`
          <div class="divider" style="margin-bottom:14px"></div>
          <div class="dim" style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px">Adjust phases via the agent</div>
          <p class="muted" style="font-size:12px;line-height:1.5;margin-bottom:10px">Phase definitions are edited by the agent (the <span class="mono">current:</span> pointer stays human-only). Describe the change and copy a ready prompt.</p>
          <textarea class="textarea" style="min-height:70px;margin-bottom:10px" placeholder="e.g. In the build phase, also forbid editing the public API without a D-entry."
            value=${phaseChange} onInput=${e => this.setState({ phaseChange: e.target.value })}></textarea>
          <${Button} variant="primary" icon=${Icons.Copy} onClick=${() => copyText(this.phasePrompt(), 'Phase-edit prompt copied')}>Copy phase-edit prompt<//>
        `} />

      <${FileModal} open=${modal === 'todos'} onClose=${this.closeModal} icon=${Icons.UserAlert} title="Human to-dos — HUMAN-TODOS.md" fileKey="human-todos" />

      <${DecisionsModal} open=${modal === 'decisions'} onClose=${this.closeModal} decisions=${open} handoff=${handoff}
        odSel=${odSel} odNote=${odNote}
        onSel=${(id, i) => this.setState({ odSel: { ...odSel, [id]: odSel[id] === i ? null : i } })}
        onNote=${(id, v) => this.setState({ odNote: { ...odNote, [id]: v } })}
        onHandoff=${this.makeHandoff}
        onCopyAll=${() => copyText(combinedHandoffPrompt(handoff), handoff.length > 1 ? 'Combined handoff copied' : 'Handoff prompt copied')} />`;
  }
}

function singleHandoffPrompt(item) {
  return `Decision on ${item.odId} — "${item.title}": ${item.decision}.\n\n`
    + `Record it in Truss: add a D-NNN entry to state/decisions.md (Date, Decision, Rationale, Consequences), `
    + `remove the ${item.odId} briefing from state/open-decisions.md, update any files it affects, `
    + `then proceed to implement what the decision calls for.`;
}

function combinedHandoffPrompt(items) {
  if (items.length === 1) return singleHandoffPrompt(items[0]);
  const list = items.map(i => `- ${i.odId} "${i.title}": ${i.decision}`).join('\n');
  return `I've made the following decisions:\n\n${list}\n\n`
    + `For each: add a D-NNN entry to state/decisions.md (Date, Decision, Rationale, Consequences), remove its briefing from `
    + `state/open-decisions.md, and update any files it affects. Then proceed to implement what the decisions call for.`;
}

const DecisionsModal = ({ open, onClose, decisions, handoff = [], odSel, odNote, onSel, onNote, onHandoff, onCopyAll }) => html`
  <${Modal} open=${open} onClose=${onClose} icon=${Icons.Help} title="Open decisions" width=${720}>
    ${decisions.length === 0
      ? html`<div class="empty"><${Icons.Help} /><div style="font-weight:600;color:var(--text)">No open decisions</div>
          <div style="font-size:13px">Nothing is waiting on a call right now.</div></div>`
      : html`<div class="col" style="gap:18px">${decisions.map(od => {
          const sel = odSel[od.id];
          const added = handoff.some(h => h.odId === od.id);
          return html`
          <div key=${od.id} style=${`border:1px solid ${added ? 'var(--ok-soft)' : 'var(--border)'};border-radius:var(--r-md);padding:16px`}>
            <div class="row" style="gap:8px;margin-bottom:8px">
              <span class="mono dim" style="font-size:11px">${od.id}</span>
              <strong style="font-size:14px">${od.title}</strong>
              ${added ? html`<span class="badge ok" style="margin-left:auto;display:inline-flex;align-items:center;gap:3px"><${Icons.Check} />queued</span>`
                : od.staleDays != null ? html`<span class="badge ${od.staleDays > 30 ? 'warn' : 'neutral'}" style="margin-left:auto">${od.staleDays}d open</span>` : ''}
            </div>
            ${od.body ? html`<div style="background:var(--surface-2);border-radius:var(--r-sm);padding:12px;margin-bottom:12px"><${Markdown} text=${od.body} /></div>` : ''}
            ${(od.options && od.options.length) ? html`
              <div class="dim" style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px">Choose an option — click again to deselect</div>
              <div class="col" style="gap:6px;margin-bottom:12px">
                ${od.options.map((opt, i) => html`
                  <div key=${i} class="row" role="button" tabindex="0" onClick=${() => onSel(od.id, i)}
                    onKeyDown=${e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSel(od.id, i); } }}
                    style=${`gap:9px;align-items:flex-start;padding:9px 11px;border:1px solid ${sel === i ? 'var(--accent-border)' : 'var(--border)'};border-radius:var(--r-sm);cursor:pointer;background:${sel === i ? 'var(--accent-soft)' : 'transparent'}`}>
                    <span style=${`margin-top:2px;width:15px;height:15px;border-radius:50%;flex:none;border:1.5px solid ${sel === i ? 'var(--accent)' : 'var(--border-strong)'};background:${sel === i ? 'var(--accent)' : 'transparent'};box-shadow:${sel === i ? 'inset 0 0 0 3px var(--bg-elev)' : 'none'}`}></span>
                    <span style="font-size:13px"><strong>${opt.label}</strong>${opt.desc ? html`<span class="muted"> — ${opt.desc}</span>` : ''}</span>
                  </div>`)}
              </div>`
              : html`<p class="dim" style="font-size:12px;margin-bottom:12px">No structured options in this briefing — your choice is captured as free text below.</p>`}
            <textarea class="textarea" style="min-height:54px;margin-bottom:12px" placeholder="Optional: why this choice / extra context"
              value=${odNote[od.id] || ''} onInput=${e => onNote(od.id, e.target.value)}></textarea>
            <div class="row between" style="align-items:center;gap:10px">
              <span class="dim" style="font-size:11.5px">${added ? 'Queued — re-decide to update.' : 'Pick an option (or type a decision), then add it.'}</span>
              <${Button} variant="primary" icon=${Icons.ArrowRight} onClick=${() => onHandoff(od)}>${added ? 'Update decision' : 'Decide & add'}<//>
            </div>
          </div>`;
        })}
      </div>`}
    ${handoff.length > 0 ? html`
      <div class="row between" style="position:sticky;bottom:-26px;margin:24px -26px -26px;padding:16px 26px;align-items:center;gap:10px;border-top:1px solid var(--border);background:var(--bg-elev);border-radius:0 0 var(--r-xl) var(--r-xl);z-index:10">
        <span class="dim" style="font-size:12.5px">${handoff.length} decision${handoff.length > 1 ? 's' : ''} queued${handoff.length > 1 ? ' — one prompt covers all' : ''}</span>
        <${Button} variant="primary" icon=${Icons.Copy} onClick=${onCopyAll}>Copy ${handoff.length > 1 ? 'combined ' : ''}prompt<//>
      </div>` : ''}
  <//>`;
