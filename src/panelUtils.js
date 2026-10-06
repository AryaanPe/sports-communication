import { DEFAULT_ACTIONS } from './defaultActions';

// tailwind classes
export const COLOR_PALETTE = [
  'bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-yellow-500', 'bg-lime-500', 'bg-green-500',
  'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500', 'bg-sky-500', 'bg-blue-500', 'bg-indigo-500',
  'bg-violet-500', 'bg-purple-500', 'bg-fuchsia-500', 'bg-pink-500', 'bg-rose-500', 'bg-gray-600',
];

const SHOT_LABELS = ['Layup', 'Mid-range shot', 'Three Pointer'];

export const isHex = (c) => typeof c === 'string' && c.startsWith('#');

// color is a tailwind class or a hex string
export const colorProps = (color, className = '') =>
  isHex(color)
    ? { className, style: { backgroundColor: color } }
    : { className: `${color || 'bg-gray-500'} ${className}`.trim() };

export const uid = (prefix) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export const formatTime = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export const csvCell = (v) => {
  const s = String(v === undefined || v === null ? '' : v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const downloadFile = (filename, text, mime) => {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const parseList = (text) => {
  const seen = new Set();
  return String(text || '')
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter((s) => {
      if (!s || seen.has(s.toLowerCase())) return false;
      seen.add(s.toLowerCase());
      return true;
    });
};

export const normalizeAction = (a) => ({
  id: a.id || uid('btn'),
  label: String(a.label || '').trim(),
  color: a.color || 'bg-gray-600',
  definition: a.definition || '',
  hotkey: typeof a.hotkey === 'string' && a.hotkey.length === 1 && a.hotkey !== ' ' ? a.hotkey.toLowerCase() : '',
  lead: Math.max(0, Number(a.lead) || 0),
  lag: Math.max(0, Number(a.lag) || 0),
  group: String(a.group || '').trim(),
  descriptors: Array.isArray(a.descriptors) ? a.descriptors.map(String).filter(Boolean) : [],
  kind: a.kind || (SHOT_LABELS.includes(a.label) ? 'shot' : ''),
});

// ids starting with btn- are generated, so the label is used as the type
export const actionType = (a) => (String(a.id).startsWith('btn-') ? a.label : a.id);

export const makePanel = (name, actions) => ({
  id: uid('panel'),
  name,
  actions: actions.map(normalizeAction),
});

const sanitizePanel = (p) => ({
  id: p.id || uid('panel'),
  name: String(p.name || 'Panel'),
  actions: (Array.isArray(p.actions) ? p.actions : [])
    .filter((a) => a && a.label)
    .map(normalizeAction),
});

const PANELS_KEY = 'tc_panels_v1';

export function loadPanels() {
  try {
    const raw = localStorage.getItem(PANELS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.panels) && parsed.panels.length) {
        const panels = parsed.panels.map(sanitizePanel);
        const active = panels.some((p) => p.id === parsed.activePanelId) ? parsed.activePanelId : panels[0].id;
        return { panels, activePanelId: active };
      }
    }
  } catch (e) {
    // use the defaults
  }
  const def = makePanel('Default', DEFAULT_ACTIONS);
  return { panels: [def], activePanelId: def.id };
}

export function savePanels(panels, activePanelId) {
  try {
    localStorage.setItem(PANELS_KEY, JSON.stringify({ panels, activePanelId }));
  } catch (e) {
    // ignore
  }
}

export const defaultActionsCopy = () => DEFAULT_ACTIONS.map(normalizeAction);

export function buildPanelExport(panels) {
  return { format: 'tagging-panels', version: 1, panels };
}

// accepts an export file, one panel or a plain list of buttons
export function parseImportedPanels(text) {
  const data = JSON.parse(text);
  let list;
  if (Array.isArray(data)) list = [{ name: 'Imported panel', actions: data }];
  else if (Array.isArray(data.panels)) list = data.panels;
  else if (Array.isArray(data.actions)) list = [data];
  else throw new Error('Not a tagging panel file');
  const panels = list.map((p) => ({ ...sanitizePanel(p), id: uid('panel') }));
  if (!panels.length || panels.every((p) => p.actions.length === 0)) throw new Error('No buttons found in file');
  return panels;
}

const annKey = (videoKey) => `tc_ann_v1:${videoKey}`;

export function loadAnnotations(videoKey) {
  try {
    const raw = localStorage.getItem(annKey(videoKey));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

export function saveAnnotations(videoKey, annotations) {
  try {
    if (annotations.length) localStorage.setItem(annKey(videoKey), JSON.stringify(annotations));
    else localStorage.removeItem(annKey(videoKey));
  } catch (e) {
    // ignore
  }
}
