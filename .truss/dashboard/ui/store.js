// UI-only persistence (read-only-safe): theme, accent, favorites, pins.
// Does a parsed value have the same basic shape as the fallback? Guards render
// paths against stale/corrupt localStorage (older schema, manual edits): an
// array fallback must stay an array, a scalar must keep its type, etc. Mismatch
// → use the fallback, which self-heals the bad value on the next set().
const sameShape = (v, fallback) => {
  if (Array.isArray(fallback)) return Array.isArray(v);
  if (fallback === null) return true; // caller accepts anything
  return v != null && typeof v === typeof fallback && Array.isArray(v) === false;
};

const LS = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      const v = JSON.parse(raw);
      return sameShape(v, fallback) ? v : fallback;
    } catch { return fallback; }
  },
  set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} },
};

export const ACCENTS = [
  { name: 'Blue', h: 211 },
  { name: 'Purple', h: 262 },
  { name: 'Teal', h: 172 },
  { name: 'Pink', h: 330 },
  { name: 'Orange', h: 28 },
];

export const theme = {
  getMode: () => LS.get('truss-theme', 'system'),
  getAccent: () => LS.get('truss-accent', 211),
  applyMode(mode) {
    LS.set('truss-theme', mode);
    const sys = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', mode === 'system' ? sys : mode);
  },
  applyAccent(h) {
    LS.set('truss-accent', h);
    document.documentElement.style.setProperty('--accent-h', h);
  },
  init() {
    this.applyMode(this.getMode());
    this.applyAccent(this.getAccent());
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (this.getMode() === 'system') this.applyMode('system');
    });
  },
};

export const lang = {
  get: () => LS.get('truss-lang', 'en'),
  set: (v) => LS.set('truss-lang', v),
};

export const handoff = {
  // LS.get enforces the array shape, so consumers (.some/.filter/.map) are safe.
  all: () => LS.get('truss-handoff', []),
  add(item) {
    const cur = handoff.all().filter(x => x.odId !== item.odId);
    const next = [...cur, item];
    LS.set('truss-handoff', next);
    return next;
  },
  remove(odId) {
    const next = handoff.all().filter(x => x.odId !== odId);
    LS.set('truss-handoff', next);
    return next;
  },
  clear() { LS.set('truss-handoff', []); return []; },
};

export const favorites = {
  all: () => LS.get('truss-favs', []),
  has: (id) => favorites.all().includes(id),
  toggle(id) {
    const cur = favorites.all();
    const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
    LS.set('truss-favs', next);
    return next;
  },
};

// Presets = a saved invocation of a base prompt: { id, name, baseId, values, mode }.
// `values` holds the input tokens (INPUT/CONSTRAINTS/POINTERS); `mode` is 'single'
// or 'orchestrated'. Read-only-safe: client-side only, like favorites. This is the
// lightweight alternative to free-form custom prompts — it captures "my usual way of
// asking for X" without re-authoring a whole prompt.
export const presets = {
  all: () => LS.get('truss-presets', []),
  save(p) {
    const id = p.id || `preset-${Date.now().toString(36)}`;
    const cur = presets.all().filter(x => x.id !== id);
    const next = [...cur, { ...p, id }];
    LS.set('truss-presets', next);
    return next;
  },
  remove(id) {
    const next = presets.all().filter(x => x.id !== id);
    LS.set('truss-presets', next);
    return next;
  },
};
