import { html, Component } from '../vendor/preact-htm.mjs';

/* ---------- Icons (Lucide-style, stroke) ---------- */
const svg = (paths, fill = 'none') => (p = {}) => html`<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill=${fill} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const Icons = {
  Logo: svg(html`<path d="M12 2v20"/><path d="M12 8c0-3 2-5 5-5 0 3-2 5-5 5z"/><path d="M12 13c0-3-2-5-5-5 0 3 2 5 5 5z"/><path d="M12 18c0-3 2-4 4-4 0 3-2 4-4 4z"/>`),
  Overview: svg(html`<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>`),
  Terminal: svg(html`<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>`),
  Gauge: svg(html`<path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/><path d="M13.4 12.6 18 8"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>`),
  Map: svg(html`<polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>`),
  Star: ({ filled = false } = {}) => html`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill=${filled ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  Sliders: svg(html`<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>`),
  Git: svg(html`<line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>`),
  Flag: svg(html`<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>`),
  UserAlert: svg(html`<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="12"/><line x1="20" y1="16" x2="20.01" y2="16"/>`),
  Help: svg(html`<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>`),
  Stethoscope: svg(html`<path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/><path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4"/><circle cx="20" cy="10" r="2"/>`),
  Refresh: svg(html`<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>`),
  Check: svg(html`<polyline points="20 6 9 17 4 12"/>`),
  CheckCircle: svg(html`<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>`),
  X: svg(html`<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>`),
  Copy: svg(html`<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>`),
  Edit: svg(html`<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>`),
  Trash: svg(html`<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>`),
  Plus: svg(html`<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>`),
  ChevronRight: svg(html`<polyline points="9 18 15 12 9 6"/>`),
  ArrowRight: svg(html`<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>`),
  Search: svg(html`<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>`),
  Sun: svg(html`<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>`),
  Moon: svg(html`<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`),
  Laptop: svg(html`<rect x="3" y="4" width="18" height="12" rx="2"/><line x1="2" y1="20" x2="22" y2="20"/>`),
  Wifi: svg(html`<path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>`),
  WifiOff: svg(html`<line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.58 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>`),
  Panel: svg(html`<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/>`),
  File: svg(html`<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>`),
  Play: svg(html`<polygon points="5 3 19 12 5 21 5 3"/>`, 'currentColor'),
  Alert: svg(html`<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>`),
  Tag: svg(html`<path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>`),
  Spinner: svg(html`<line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>`),
  Doc: svg(html`<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>`),
};

/* ---------- Primitives ---------- */
export const Card = ({ children, className = '', onClick, ...p }) => html`
  <div class="card ${className} ${onClick ? 'interactive' : ''}" onClick=${onClick} ...${p}>${children}</div>`;

export const CardHead = ({ icon, title, children, iconColor }) => html`
  <div class="card-head" style=${iconColor ? `--icon-color:${iconColor}` : ''}><h3>${icon && icon()} ${title}</h3>${children && html`<div class="right">${children}</div>`}</div>`;

export const Badge = ({ children, variant = 'neutral', icon }) => html`
  <span class="badge ${variant}">${icon && icon()}${children}</span>`;

export const Button = ({ children, variant = '', className = '', icon, ...p }) => html`
  <button class="btn ${variant} ${className}" ...${p}>${icon && icon()}${children}</button>`;

export const Dot = ({ status = '', pulse = false }) => html`<span class="dot ${status} ${pulse ? 'pulse' : ''}"></span>`;

export const Segmented = ({ options, value, onChange }) => html`
  <div class="segmented">${options.map(o => html`<button class=${o.value === value ? 'active' : ''} onClick=${() => onChange(o.value)}>${o.label}</button>`)}</div>`;

export const Toggle = ({ on, onChange, ariaLabel }) => html`
  <div class="toggle ${on ? 'on' : ''}" role="switch" aria-checked=${on} aria-label=${ariaLabel} tabindex="0"
    onClick=${() => onChange(!on)} onKeyDown=${e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(!on); } }}>
    <div class="knob"></div></div>`;

export const Chip = ({ children, active, count, onClick }) => html`
  <span class="chip ${active ? 'active' : ''}" onClick=${onClick} tabindex="0" role="button"
    onKeyDown=${e => { if (e.key === 'Enter') onClick && onClick(); }}>${children}${count != null && html`<span class="count">${count}</span>`}</span>`;

export const SearchInput = ({ value, onInput, placeholder = 'Search…' }) => html`
  <div class="search-wrap"><${Icons.Search} /><input class="input" type="text" value=${value} placeholder=${placeholder} onInput=${e => onInput(e.target.value)} /></div>`;

export const Empty = ({ icon = Icons.File, title, sub }) => html`
  <div class="empty">${icon()}<div style="font-weight:600;color:var(--text)">${title}</div>${sub && html`<div style="font-size:13px;max-width:320px">${sub}</div>`}</div>`;

export const Spinner = () => html`<span class="spin" style="display:inline-flex;width:15px;height:15px"><${Icons.Spinner} /></span>`;

/* ---------- Stacked bar chart ---------- */
export const StackedBar = ({ segments, total }) => {
  const sum = total || segments.reduce((a, s) => a + s.value, 0) || 1;
  return html`<div class="bar-track">${segments.map(s => html`<span style=${`width:${(s.value / sum * 100).toFixed(1)}%;background:${s.color}`} title=${`${s.label}: ${s.value}`}></span>`)}</div>`;
};

/* ---------- Donut ---------- */
export const Donut = ({ size = 72, percent, color = 'var(--accent)', track = 'var(--surface-2)', stroke = 8 }) => {
  const r = size / 2 - stroke; const c = 2 * Math.PI * r;
  const off = c - Math.min(percent, 100) / 100 * c;
  return html`<svg width=${size} height=${size} viewBox=${`0 0 ${size} ${size}`} style="transform:rotate(-90deg)">
    <circle cx=${size/2} cy=${size/2} r=${r} fill="none" stroke=${track} stroke-width=${stroke} />
    <circle cx=${size/2} cy=${size/2} r=${r} fill="none" stroke=${color} stroke-width=${stroke} stroke-linecap="round"
      stroke-dasharray=${c} stroke-dashoffset=${off} style="transition:stroke-dashoffset 0.6s cubic-bezier(0.25,1,0.5,1)" /></svg>`;
};

/* ---------- Modal ---------- */
// Class wrapper so keyboard users can dismiss with Escape (a11y). Markup and
// styling are unchanged; aria-modal/role were already present.
export class Modal extends Component {
  onKey = (e) => { if (e.key === 'Escape' && this.props.open && this.props.onClose) this.props.onClose(); };
  componentDidMount() { document.addEventListener('keydown', this.onKey); }
  componentWillUnmount() { document.removeEventListener('keydown', this.onKey); }
  render({ open, onClose, title, icon, children, width }) {
    return html`
  <div class="modal-backdrop ${open ? 'open' : ''}" onClick=${onClose}>
    <div class="modal" style=${width ? `max-width:${width}px` : ''} role="dialog" aria-modal="true" onClick=${e => e.stopPropagation()}>
      <div class="modal-head"><h2 style="display:flex;align-items:center;gap:9px">${icon && icon()} ${title}</h2>
        <button class="icon-btn" style="margin-left:auto" aria-label="Close" onClick=${onClose}><${Icons.X} /></button></div>
      ${children}</div></div>`;
  }
}

/* ---------- Toast host ---------- */
export class ToastHost extends Component {
  state = { items: [] };
  componentDidMount() {
    window.toast = (message, variant = 'neutral', ms = 2800) => {
      const id = Date.now() + Math.random();
      this.setState(s => ({ items: [...s.items, { id, message, variant }] }));
      setTimeout(() => this.setState(s => ({ items: s.items.filter(t => t.id !== id) })), ms);
    };
  }
  render(_, { items }) {
    return html`<div class="toasts" aria-live="polite">${items.map(t => html`
      <div key=${t.id} class="toast"><span class="dot ${t.variant === 'error' ? 'err' : t.variant === 'ok' ? 'ok' : t.variant === 'warn' ? 'warn' : ''}"></span>${t.message}</div>`)}</div>`;
  }
}

export const copyText = (text, msg = 'Copied to clipboard') =>
  navigator.clipboard.writeText(text).then(() => window.toast && window.toast(msg, 'ok')).catch(() => window.toast && window.toast('Copy failed', 'error'));
