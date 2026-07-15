import { html, render, Component } from './vendor/preact-htm.mjs';
import { Icons, ToastHost, Dot, Badge } from './ui/components.js';
import { api } from './ui/api.js';
import { theme, ACCENTS } from './ui/store.js';

import { OverviewView } from './ui/views/overview.js';
import { ControlView } from './ui/views/control.js';
import { ContextView } from './ui/views/context.js';
import { MapView } from './ui/views/map.js';
import { PromptsView } from './ui/views/prompts.js';
import { PreferencesView } from './ui/views/preferences.js';
import { GitView } from './ui/views/git.js';
import { AboutView } from './ui/views/about.js';

const NAV = [
  { id: 'overview', label: 'Overview', icon: Icons.Overview, sub: 'Status at a glance', view: OverviewView },
  { id: 'control', label: 'Control center', icon: Icons.Terminal, sub: 'Run checks and scripts', view: ControlView },
  { id: 'context', label: 'Boot metadata', icon: Icons.Gauge, sub: 'Mandatory Truss footprint', view: ContextView },
  { id: 'map', label: 'Project map', icon: Icons.Map, sub: 'Architecture overview', view: MapView },
  { id: 'prompts', label: 'Prompt library', icon: Icons.Star, sub: 'Base and custom prompts', view: PromptsView },
  { id: 'preferences', label: 'Preferences', icon: Icons.Sliders, sub: 'Agent directives (AGENTS.md)', view: PreferencesView },
  { id: 'git', label: 'Git', icon: Icons.Git, sub: 'History and working tree', view: GitView },
  { id: 'about', label: 'About', icon: Icons.Help, sub: 'Info, tips and links', view: AboutView },
];

// Views that work without an initialized workspace.
const UNINIT_VIEWS = new Set(['overview', 'control', 'about']);

// Single source of truth for "#route:focus" hash parsing (used at init + on change).
function parseHash() {
  const [route, focus] = (location.hash.replace('#', '') || 'overview').split(':');
  return { route: route || 'overview', focus: focus || null };
}

class App extends Component {
  sseOk = false;
  lastSseAt = 0;
  state = {
    ...parseHash(),
    appState: null,
    doctor: null,
    connected: false,
    collapsed: false,
    themeMode: theme.getMode(),
    accent: theme.getAccent(),
  };

  componentDidMount() {
    theme.init();
    this.load();
    this.setupSSE();
    // SSE is primary (CONTRACTS §4.6); the 30s timer is a watchdog that only
    // reloads when SSE is down OR has gone silent for >45s. During active SSE
    // delivery this skips, avoiding the old poll+SSE double-load — but a
    // half-open connection (no onerror) still recovers via the staleness check.
    this.poll = setInterval(() => {
      if (!this.sseOk || Date.now() - this.lastSseAt > 45000) this.load();
    }, 30000);
    window.addEventListener('hashchange', this.onHash);
  }
  componentWillUnmount() {
    clearInterval(this.poll);
    if (this.es) this.es.close();
    window.removeEventListener('hashchange', this.onHash);
  }

  onHash = () => { this.setState(parseHash()); };

  load = async () => {
    try {
      const [appState, doctor] = await Promise.all([api.state(), api.doctor().catch(() => null)]);
      this.setState({ appState, doctor, connected: true });
    } catch {
      this.setState({ connected: false });
    }
  };

  setupSSE = () => {
    try {
      this.es = new EventSource('/events');
      this.es.onmessage = () => { this.lastSseAt = Date.now(); this.load(); };
      this.es.onopen = () => { this.sseOk = true; this.lastSseAt = Date.now(); this.setState({ connected: true }); };
      this.es.onerror = () => { this.sseOk = false; this.setState({ connected: false }); };
    } catch { this.sseOk = false; }
  };

  go = (id) => {
    const initialized = this.state.appState?.initialized !== false;
    if (!initialized && !UNINIT_VIEWS.has(id)) {
      window.toast && window.toast('Run truss init first', 'warn');
      return;
    }
    location.hash = id;
  };
  setMode = (m) => { theme.applyMode(m); this.setState({ themeMode: m }); };
  setAccent = (h) => { theme.applyAccent(h); this.setState({ accent: h }); };

  render(_, { route, focus, appState, doctor, connected, collapsed, themeMode, accent }) {
    const initialized = appState?.initialized !== false;
    // If workspace is not initialized, force route to an allowed view.
    const effectiveRoute = (!initialized && !UNINIT_VIEWS.has(route)) ? 'overview' : route;
    const active = NAV.find(n => n.id === effectiveRoute) || NAV[0];
    const ViewComp = active.view;
    const htCount = appState?.humanTodos?.openCount ?? 0;
    const odCount = appState?.openDecisions?.length ?? 0;
    const errors = doctor?.summary?.errors ?? 0;
    const warnings = doctor?.summary?.warnings ?? 0;
    const doctorOk = doctor && doctor.available !== false && errors === 0;

    return html`
      <div class="shell ${collapsed ? 'collapsed' : ''}">
        <aside class="sidebar">
          <div class="brand">
            <span class="brand-logo"><${Icons.Logo} /></span>
            <span class="brand-name">Truss</span>
          </div>
          ${NAV.map(n => {
            const dis = !initialized && !UNINIT_VIEWS.has(n.id);
            return html`
            <div key=${n.id} class="nav-item ${n.id === effectiveRoute ? 'active' : ''} ${dis ? 'disabled' : ''}" onClick=${() => this.go(n.id)}
              role="button" tabindex="0" title=${dis ? 'Run truss init first' : n.sub}
              onKeyDown=${e => { if (e.key === 'Enter') this.go(n.id); }}>
              ${n.icon()}<span>${n.label}</span>
              ${n.id === 'overview' && htCount > 0 && html`<span class="nav-badge">${htCount}</span>`}
            </div>`;
          })}

          <div class="sidebar-footer">
            <div class="divider"></div>
            <div class="theme-switch" role="group" aria-label="Theme">
              <button class=${themeMode === 'light' ? 'active' : ''} aria-label="Light" onClick=${() => this.setMode('light')}><${Icons.Sun} /></button>
              <button class=${themeMode === 'dark' ? 'active' : ''} aria-label="Dark" onClick=${() => this.setMode('dark')}><${Icons.Moon} /></button>
              <button class=${themeMode === 'system' ? 'active' : ''} aria-label="System" onClick=${() => this.setMode('system')}><${Icons.Laptop} /></button>
            </div>
            <div class="accent-dots">
              ${ACCENTS.map(a => html`<span key=${a.h} class="accent-dot ${accent === a.h ? 'active' : ''}"
                style=${`background:hsl(${a.h} 90% 50%)`} title=${a.name} role="button" tabindex="0"
                onClick=${() => this.setAccent(a.h)} onKeyDown=${e => { if (e.key === 'Enter') this.setAccent(a.h); }}></span>`)}
            </div>
          </div>
        </aside>

        <div class="main">
          <header class="topbar">
            <button class="icon-btn" aria-label="Toggle sidebar" onClick=${() => this.setState({ collapsed: !collapsed })}><${Icons.Panel} /></button>
            <div>
              <div class="view-title">${active.label}</div>
              <div class="view-sub">${active.sub}</div>
            </div>
            <div class="topbar-right">
              ${odCount > 0 && html`<button class="badge warn pill-btn" title="Open decisions — open overview" onClick=${() => this.go('overview')}>
                ${Icons.Help()} ${odCount} decision${odCount > 1 ? 's' : ''}</button>`}
              ${htCount > 0 && html`<button class="badge warn pill-btn" title="Human to-dos — open overview" onClick=${() => this.go('overview')}>
                ${Icons.UserAlert()} ${htCount} to-do${htCount > 1 ? 's' : ''}</button>`}
              ${!initialized
                ? html`<button class="badge neutral pill-btn" title="Workspace not initialised — open control center" onClick=${() => this.go('control')}>
                    ${Icons.Alert()} Not initialised</button>`
                : doctor && html`<button class="badge ${doctorOk ? 'ok' : errors ? 'err' : 'warn'} pill-btn" title="Doctor — open control center" onClick=${() => this.go('control')}>
                ${doctorOk ? Icons.CheckCircle() : Icons.Alert()}
                ${doctor.available === false ? 'Run doctor' : errors ? `${errors} error${errors > 1 ? 's' : ''}` : warnings ? `${warnings} warning${warnings > 1 ? 's' : ''}` : 'Healthy'}</button>`}
              <button class="badge ${connected ? 'ok' : 'neutral'} pill-btn" title=${connected ? 'Connected — click to refresh' : 'Disconnected — click to retry'} onClick=${this.load}>
                ${connected ? Icons.Wifi() : Icons.WifiOff()}${connected ? 'Live' : 'Offline'}</button>
            </div>
          </header>

          <div class="content fade-in" key=${route}>
            ${appState
              ? html`<${ViewComp} state=${appState} doctor=${doctor} go=${this.go} reload=${this.load} focus=${focus} />`
              : html`<div class="empty"><${Icons.Spinner} class="spin" />Loading workspace…</div>`}
          </div>
        </div>
      </div>
      <${ToastHost} />`;
  }
}

render(html`<${App} />`, document.getElementById('app'));
