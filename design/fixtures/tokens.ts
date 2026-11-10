import { scopeNavigation } from './render-scope';

export type TokenGroup = { label: string; rows: [name: string, light: string, dark?: string][] };

// Representative declarations from the ARC sample's design/tokens.css.
export const tokenGroups: TokenGroup[] = [
  {
    label: "Colors",
    rows: [
      ["--canvas","#f3eee7","#171412"],
      ["--surface","#fffdfa","#221e1b"],
      ["--surface-raised","#fffdfa","#2a2522"],
      ["--surface-subtle","#f6f0e8","#2e2925"],
      ["--surface-sunken","#ece4d9","#3a332e"],
      ["--border","#e7ded2","#3a332e"],
      ["--border-strong","#d6cabb","#4d4540"],
      ["--text","#2b2420","#f3ebe3"],
      ["--text-secondary","#625952","#bcafa4"],
      ["--text-tertiary","#7a726b","#91857c"],
      ["--accent","#d4663f","#ec8459"],
      ["--accent-text","#b8532f","#f29a74"],
      ["--on-accent","#ffffff","#1c120c"],
      ["--action","#2b2420","#f3ebe3"],
      ["--on-action","#fffaf4","#1c1714"],
      ["--success","#398253","#7fcb98"],
      ["--warning","#a16717","#e6b066"],
      ["--danger","#c2453b","#f08b80"],
      ["--role-source","#d4663f","#ec8459"],
      ["--role-agent","#6a5ad0","#ab9fff"],
      ["--phase-thinking","#7d63c9","#b9a6ff"],
      ["--phase-command","#3e72c4","#8cb4ff"],
      ["--phase-file","#2a816c","#6fd3b9"],
      ["--tooltip","#2b2420","#f3ebe3"],
      ["--on-tooltip","#fffaf4","#1c1714"],
      ["--knob","#ffffff","#ffffff"],
    ],
  },
  {
    label: "Typography",
    rows: [
      ["--font-ui","-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"PingFang SC\", \"Segoe UI\", \"Microsoft YaHei\", Inter, \"WenQuanYi Zen Hei\", sans-serif"],
      ["--font-mono","\"SF Mono\", ui-monospace, Menlo, Consolas, \"JetBrains Mono\", monospace"],
      ["--text-display","28px"],
      ["--text-title","18px"],
      ["--text-body","14px"],
      ["--text-small","13px"],
      ["--text-meta","12px"],
      ["--text-caption","11px"],
    ],
  },
  {
    label: "Spacing & size",
    rows: [
      ["--control-height","34px"],
      ["--field-height","40px"],
    ],
  },
  {
    label: "Radii",
    rows: [
      ["--radius-control","17px"],
      ["--radius-field","12px"],
      ["--radius-tile","10px"],
      ["--radius-card","18px"],
      ["--radius-panel","24px"],
    ],
  },
  {
    label: "Shadows",
    rows: [
      ["--shadow-sm","0 1px 2px rgb(74 52 36 / 8%)","0 1px 2px rgb(0 0 0 / 35%)"],
      ["--shadow-md","0 1px 3px rgb(74 52 36 / 5%), 0 6px 20px rgb(74 52 36 / 8%)","0 1px 3px rgb(0 0 0 / 30%), 0 6px 24px rgb(0 0 0 / 40%)"],
      ["--shadow-lg","0 2px 4px rgb(74 52 36 / 5%), 0 18px 56px rgb(74 52 36 / 13%)","0 2px 4px rgb(0 0 0 / 30%), 0 18px 60px rgb(0 0 0 / 55%)"],
    ],
  },
];

export const geometryGroups: TokenGroup[] = tokenGroups.flatMap(group => {
  if (group.label === 'Radii') return [group];
  if (group.label !== 'Spacing & size') return [];
  return [{ ...group, rows: [['--space-2', '8px'], ['--space-4', '16px'], ...group.rows] }];
});

const groupIcons = ['palette', 'type', 'ruler', 'corner-up-right', 'layers'];
export const tokenSource = 'design/tokens.css';
export const tokenNavigation = {
  directory: scopeNavigation.layer.directory,
  scope: { ...scopeNavigation.layer.scope, label: 'Tokens' },
  height: scopeNavigation.layer.height,
  searchPlaceholder: 'Find tokens…',
  rows: [
    { form: 'root-selected', label: 'All tokens', icon: 'layout-grid',
      meta: String(tokenGroups.reduce((total, { rows }) => total + rows.length, 0)) },
    ...tokenGroups.map(({ label, rows }, i) => ({ form: 'item', label, icon: groupIcons[i], meta: String(rows.length) })),
  ],
};
