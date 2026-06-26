import { html, Component } from '../vendor/preact-htm.mjs';
import { Modal } from './components.js';
import { api } from './api.js';

// Minimal, safe markdown renderer for read-only file modals (headings, lists,
// checkboxes, blockquotes, tables-as-rows). Plain text, no HTML injection.
export const Markdown = ({ text }) => {
  const lines = (text || '').split('\n');
  const out = [];
  lines.forEach((raw, i) => {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { out.push(html`<div key=${i} style="height:8px"></div>`); return; }
    let m;
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
      const sz = [17, 15, 14, 13][m[1].length - 1];
      out.push(html`<div key=${i} style=${`font-weight:600;font-size:${sz}px;margin:10px 0 4px`}>${m[2]}</div>`);
    } else if ((m = line.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/))) {
      const done = m[1].toLowerCase() === 'x';
      out.push(html`<div key=${i} class="row" style="gap:8px;align-items:flex-start;padding:2px 0;font-size:13px">
        <span style=${`width:14px;height:14px;border-radius:4px;flex:none;margin-top:2px;border:1.5px solid ${done ? 'var(--ok)' : 'var(--border-strong)'};background:${done ? 'var(--ok)' : 'transparent'};color:#fff;font-size:10px;display:flex;align-items:center;justify-content:center`}>${done ? '✓' : ''}</span>
        <span style=${done ? 'color:var(--text-2)' : ''}>${m[2]}</span></div>`);
    } else if ((m = line.match(/^[-*]\s+(.*)$/))) {
      out.push(html`<div key=${i} class="row" style="gap:8px;align-items:flex-start;padding:1px 0;font-size:13px"><span class="dim">•</span><span>${m[1]}</span></div>`);
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      out.push(html`<div key=${i} class="dim" style="font-style:italic;border-left:2px solid var(--border);padding-left:10px;font-size:12.5px;margin:2px 0">${m[1]}</div>`);
    } else if (line.startsWith('|')) {
      out.push(html`<div key=${i} class="mono" style="font-size:12px;color:var(--text-2);white-space:pre-wrap">${line}</div>`);
    } else if (/^[a-z-]+:\s/i.test(line)) {
      const idx = line.indexOf(':');
      out.push(html`<div key=${i} style="font-size:13px;padding:1px 0"><span class="dim">${line.slice(0, idx)}:</span>${line.slice(idx + 1)}</div>`);
    } else {
      out.push(html`<div key=${i} style="font-size:13px;line-height:1.5;padding:1px 0">${line}</div>`);
    }
  });
  return html`<div>${out}</div>`;
};

export class FileModal extends Component {
  state = { content: null, error: null };
  componentDidUpdate(prev) { if (this.props.open && !prev.open) this.load(); }
  load = async () => {
    this.setState({ content: null, error: null });
    try { const r = await api.file(this.props.fileKey); this.setState({ content: r.content || '', error: r.error }); }
    catch (e) { this.setState({ error: e.message }); }
  };
  render({ open, onClose, title, icon, footer }, { content, error }) {
    return html`<${Modal} open=${open} onClose=${onClose} icon=${icon} title=${title} width=${740}>
      ${content == null && !error ? html`<p class="muted">Loading…</p>`
        : html`<div style="background:var(--surface-2);border-radius:var(--r-sm);padding:16px 18px;max-height:52vh;overflow:auto"><${Markdown} text=${content} /></div>`}
      ${error ? html`<p class="dim" style="margin-top:8px;font-size:12.5px">${error}</p>` : ''}
      ${footer ? html`<div style="margin-top:16px">${footer}</div>` : ''}
    <//>`;
  }
}
