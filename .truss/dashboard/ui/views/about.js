import { html, Component } from '../../vendor/preact-htm.mjs';
import { Icons } from '../components.js';

import { AboutOverviewView } from './about-overview.js';
import { AboutConceptsView } from './about-concepts.js';
import { AboutStartView } from './about-start.js';
import { AboutFaqView } from './about-faq.js';
import { AboutReferenceView } from './about-reference.js';

const TABS = [
  { id: 'overview', label: 'Overview', icon: Icons.Help, view: AboutOverviewView },
  { id: 'concepts', label: 'Concepts', icon: Icons.File, view: AboutConceptsView },
  { id: 'start', label: 'Getting Started', icon: Icons.Play, view: AboutStartView },
  { id: 'faq', label: 'FAQ', icon: Icons.Flag, view: AboutFaqView },
  { id: 'reference', label: 'Reference', icon: Icons.Doc, view: AboutReferenceView },
];

export class AboutView extends Component {
  render({ state, go, focus }) {
    const activeId = TABS.find(t => t.id === focus)?.id || 'overview';
    const active = TABS.find(t => t.id === activeId);
    const ViewComp = active.view;

    return html`
      <div class="sub-tabs">
        ${TABS.map(t => html`
          <button key=${t.id} class="sub-tab ${t.id === activeId ? 'active' : ''}"
            onClick=${() => { location.hash = t.id === 'overview' ? 'about' : `about:${t.id}`; }}>
            ${t.icon()} ${t.label}
          </button>`)}
      </div>
      <div class="fade-in" key=${activeId}>
        <${ViewComp} state=${state} go=${go} />
      </div>
    `;
  }
}
