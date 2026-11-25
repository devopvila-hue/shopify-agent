/**
 * Plantillas de diseño.
 *
 * Treinta temas, uno por industria. Cada tema es un conjunto de tokens
 * (paleta, tipografías, radios, densidad) más un par de conmutadores de
 * estructura (tipo de portada, estilo de tarjeta, forma de los botones).
 *
 * El CSS no tiene mil reglas: lee variables CSS y un puñado de atributos
 * `data-*` en `<html>`. Cambiar de tema es cambiar tokens.
 */

export const FONTS = {
  display: [
    { id: 'space-grotesk', label: 'Space Grotesk', stack: '"Space Grotesk", -apple-system, sans-serif' },
    { id: 'playfair', label: 'Playfair Display', stack: '"Playfair Display", Georgia, serif' },
    { id: 'fraunces', label: 'Fraunces', stack: 'Fraunces, Georgia, serif' },
    { id: 'archivo-black', label: 'Archivo Black', stack: '"Archivo Black", Impact, sans-serif' },
    { id: 'outfit', label: 'Outfit', stack: 'Outfit, -apple-system, sans-serif' },
    { id: 'bebas', label: 'Bebas Neue', stack: '"Bebas Neue", Impact, sans-serif' },
  ],
  body: [
    { id: 'inter', label: 'Inter', stack: 'Inter, -apple-system, sans-serif' },
    { id: 'manrope', label: 'Manrope', stack: 'Manrope, -apple-system, sans-serif' },
    { id: 'work-sans', label: 'Work Sans', stack: '"Work Sans", -apple-system, sans-serif' },
    { id: 'karla', label: 'Karla', stack: 'Karla, -apple-system, sans-serif' },
    { id: 'lora', label: 'Lora', stack: 'Lora, Georgia, serif' },
  ],
  mono: [
    { id: 'plex-mono', label: 'IBM Plex Mono', stack: '"IBM Plex Mono", ui-monospace, monospace' },
    { id: 'space-mono', label: 'Space Mono', stack: '"Space Mono", ui-monospace, monospace' },
  ],
};

const D = Object.fromEntries(FONTS.display.map((f) => [f.id, f.stack]));
const B = Object.fromEntries(FONTS.body.map((f) => [f.id, f.stack]));
const M = Object.fromEntries(FONTS.mono.map((f) => [f.id, f.stack]));

/**
 * @typedef {object} Theme
 * @property {string} id
 * @property {string} name
 * @property {string} industry
 * @property {object} palette
 * @property {object} fonts
 * @property {object} layout
 */

/** @type {Theme[]} */
export const THEMES = [
  {
    id: 'aurora', name: 'Aurora', industry: 'Apparel',
    palette: { paper: '#faf8f4', surface: '#ffffff', ink: '#14120e', ink2: '#3d382f', muted: '#7d7668', line: '#e6e1d6', accent: '#1f6b3a', highlight: '#cde94f', artA: '#ece5d6', artB: '#cdd9c4' },
    fonts: { display: D['space-grotesk'], body: B.inter, mono: M['plex-mono'] },
    layout: { hero: 'split', card: 'border', button: 'pill', radius: 14, density: 'normal', caps: true },
  },
  {
    id: 'editorial', name: 'Revista', industry: 'Moda',
    palette: { paper: '#ffffff', surface: '#ffffff', ink: '#111111', ink2: '#3a3a3a', muted: '#767676', line: '#111111', accent: '#b4232f', highlight: '#f0d9c0', artA: '#f0d9c0', artB: '#e4c7ae' },
    fonts: { display: D.playfair, body: B.inter, mono: M['space-mono'] },
    layout: { hero: 'centered', card: 'plain', button: 'square', radius: 0, density: 'airy', caps: true },
  },
  {
    id: 'atelier', name: 'Taller', industry: 'Cerámica',
    palette: { paper: '#f4efe7', surface: '#fffdf9', ink: '#2b241d', ink2: '#544a3f', muted: '#8b8071', line: '#ded2c0', accent: '#a4552b', highlight: '#e2c9a8', artA: '#e7d3bb', artB: '#d3b492' },
    fonts: { display: D.lora, body: B['work-sans'], mono: M['space-mono'] },
    layout: { hero: 'split', card: 'shadow', button: 'soft', radius: 4, density: 'normal', caps: false },
  },
  {
    id: 'botanica', name: 'Botánica', industry: 'Plantas',
    palette: { paper: '#f2f6f1', surface: '#ffffff', ink: '#14231a', ink2: '#33473a', muted: '#71857a', line: '#d7e3d8', accent: '#2f6b45', highlight: '#d8e8c8', artA: '#dbe9d5', artB: '#b6d1b3' },
    fonts: { display: D.fraunces, body: B.karla, mono: M['space-mono'] },
    layout: { hero: 'split', card: 'solid', button: 'pill', radius: 20, density: 'airy', caps: false },
  },
  {
    id: 'carbon', name: 'Carbono', industry: 'Deportes',
    palette: { paper: '#101214', surface: '#191c1f', ink: '#f4f6f8', ink2: '#c7cdd3', muted: '#8b949c', line: '#2a2f34', accent: '#c8f24d', highlight: '#c8f24d', artA: '#2b3136', artB: '#1c2124' },
    fonts: { display: D['archivo-black'], body: B.inter, mono: M['space-mono'] },
    layout: { hero: 'centered', card: 'border', button: 'square', radius: 6, density: 'tight', caps: true },
  },
  {
    id: 'circuit', name: 'Circuito', industry: 'Electrónica',
    palette: { paper: '#0b1020', surface: '#131a2e', ink: '#e8ecff', ink2: '#b9c2e0', muted: '#7b87ab', line: '#222c4a', accent: '#4d7cff', highlight: '#7ef0d0', artA: '#1b2540', artB: '#101830' },
    fonts: { display: D['space-grotesk'], body: B.inter, mono: M['plex-mono'] },
    layout: { hero: 'split', card: 'border', button: 'square', radius: 4, density: 'tight', caps: true },
  },
  {
    id: 'glow', name: 'Radiante', industry: 'Belleza',
    palette: { paper: '#fbf3f5', surface: '#ffffff', ink: '#2a1b21', ink2: '#5a4149', muted: '#967d85', line: '#f0dbe2', accent: '#c2557a', highlight: '#f7d9e2', artA: '#f9dbe5', artB: '#f0bcd0' },
    fonts: { display: D.playfair, body: B.manrope, mono: M['space-mono'] },
    layout: { hero: 'centered', card: 'plain', button: 'pill', radius: 24, density: 'airy', caps: false },
  },
  {
    id: 'aureum', name: 'Latón', industry: 'Joyería',
    palette: { paper: '#f7f4ec', surface: '#fffdf7', ink: '#221f18', ink2: '#4b463a', muted: '#8b8474', line: '#e5ddc9', accent: '#96762f', highlight: '#e8d9ae', artA: '#eee3c6', artB: '#d9c69a' },
    fonts: { display: D.fraunces, body: B.karla, mono: M['space-mono'] },
    layout: { hero: 'split', card: 'plain', button: 'soft', radius: 2, density: 'airy', caps: true },
  },
  {
    id: 'pan', name: 'Horno', industry: 'Panadería',
    palette: { paper: '#fdf6ea', surface: '#fffdf8', ink: '#3a2a1c', ink2: '#634d38', muted: '#9a8269', line: '#eddfc9', accent: '#b5652b', highlight: '#f2d9a8', artA: '#f5e2c6', artB: '#e6c79c' },
    fonts: { display: D.fraunces, body: B.lora, mono: M['space-mono'] },
    layout: { hero: 'split', card: 'shadow', button: 'pill', radius: 12, density: 'normal', caps: false },
  },
  {
    id: 'cafe', name: 'Especialidad', industry: 'Café',
    palette: { paper: '#2a201a', surface: '#352921', ink: '#f0e6d8', ink2: '#cdbda6', muted: '#9b8a76', line: '#4a3a2e', accent: '#d8a05a', highlight: '#6f4a2c', artA: '#4a3728', artB: '#2f231b' },
    fonts: { display: D.playfair, body: B['work-sans'], mono: M['space-mono'] },
    layout: { hero: 'centered', card: 'border', button: 'soft', radius: 6, density: 'normal', caps: true },
  },
  {
    id: 'vinilo', name: 'Viña', industry: 'Vino',
    palette: { paper: '#f6f0ee', surface: '#ffffff', ink: '#2a1c22', ink2: '#573e46', muted: '#93787f', line: '#e7d8dc', accent: '#7a1f3d', highlight: '#d9b6c2', artA: '#e6cdd4', artB: '#d3a9b6' },
    fonts: { display: D.playfair, body: B.lora, mono: M['space-mono'] },
    layout: { hero: 'split', card: 'plain', button: 'soft', radius: 2, density: 'airy', caps: true },
  },
  {
    id: 'brasa', name: 'Brasa', industry: 'Cerveza',
    palette: { paper: '#1e1a16', surface: '#282219', ink: '#f5ead9', ink2: '#c9b69c', muted: '#95836c', line: '#3d3428', accent: '#e8a33d', highlight: '#b8452f', artA: '#3a2f22', artB: '#221c15' },
    fonts: { display: D.bebas, body: B['work-sans'], mono: M['space-mono'] },
    layout: { hero: 'centered', card: 'border', button: 'square', radius: 4, density: 'tight', caps: true },
  },
  {
    id: 'cosecha', name: 'Cosecha', industry: 'Orgánica',
    palette: { paper: '#f4f1e6', surface: '#fffef8', ink: '#26301f', ink2: '#4b5740', muted: '#859070', line: '#dfe3cf', accent: '#5c7d3a', highlight: '#dde8c4', artA: '#e3e8cd', artB: '#c7d6ab' },
    fonts: { display: D.lora, body: B.karla, mono: M['space-mono'] },
    layout: { hero: 'split', card: 'plain', button: 'pill', radius: 16, density: 'airy', caps: false },
  },
  {
    id: 'ferreteria', name: 'Herramienta', industry: 'Bricolaje',
    palette: { paper: '#f5f5f3', surface: '#ffffff', ink: '#1c1c1c', ink2: '#3d3d3d', muted: '#767676', line: '#d5d5d0', accent: '#d1481f', highlight: '#ffd400', artA: '#e6e6e2', artB: '#d0d0ca' },
    fonts: { display: D['archivo-black'], body: B['work-sans'], mono: M['space-mono'] },
    layout: { hero: 'split', card: 'border', button: 'square', radius: 0, density: 'tight', caps: true },
  },
  {
    id: 'trail', name: 'Sendero', industry: 'Outdoor',
    palette: { paper: '#eef1ec', surface: '#ffffff', ink: '#1f2a22', ink2: '#3d4b40', muted: '#77857a', line: '#d7ded5', accent: '#3d6b45', highlight: '#e0a63c', artA: '#d8e2d3', artB: '#b3c4ae' },
    fonts: { display: D.outfit, body: B.inter, mono: M['space-mono'] },
    layout: { hero: 'split', card: 'shadow', button: 'soft', radius: 8, density: 'normal', caps: true },
  },
  {
    id: 'velo', name: 'Qu pedal', industry: 'Ciclismo',
    palette: { paper: '#f4f5f7', surface: '#ffffff', ink: '#14171c', ink2: '#363b44', muted: '#7c828c', line: '#dfe2e7', accent: '#ff4d2e', highlight: '#14171c', artA: '#e3e6ea', artB: '#cfd4da' },
    fonts: { display: D['archivo-black'], body: B.inter, mono: M['plex-mono'] },
    layout: { hero: 'centered', card: 'plain', button: 'square', radius: 6, density: 'tight', caps: true },
  },
  {
    id: 'mascota', name: 'Collar', industry: 'Mascotas',
    palette: { paper: '#fff6ec', surface: '#ffffff', ink: '#33261c', ink2: '#63493a', muted: '#9c8574', line: '#f0dfcd', accent: '#e0703a', highlight: '#ffd9b8', artA: '#ffe3c7', artB: '#f7c8a3' },
    fonts: { display: D.outfit, body: B.manrope, mono: M['space-mono'] },
    layout: { hero: 'split', card: 'solid', button: 'pill', radius: 20, density: 'normal', caps: false },
  },
  {
    id: 'peque', name: 'Patitos', industry: 'Infantil',
    palette: { paper: '#fffaf0', surface: '#ffffff', ink: '#2f3b52', ink2: '#55627a', muted: '#8c97ab', line: '#eee4d0', accent: '#f2a33c', highlight: '#a8d8ef', artA: '#ffeccb', artB: '#cde9f7' },
    fonts: { display: D.outfit, body: B.manrope, mono: M['plex-mono'] },
    layout: { hero: 'centered', card: 'solid', button: 'pill', radius: 18, density: 'airy', caps: false },
  },
  {
    id: 'juguete', name: 'Juguete', industry: 'Juguetes',
    palette: { paper: '#fdf6ff', surface: '#ffffff', ink: '#2b2140', ink2: '#554767', muted: '#8d84a3', line: '#e9def5', accent: '#7b4bd8', highlight: '#ffd44d', artA: '#eadffd', artB: '#d4c2f7' },
    fonts: { display: D.outfit, body: B.karla, mono: M['space-mono'] },
    layout: { hero: 'centered', card: 'border', button: 'pill', radius: 16, density: 'normal', caps: true },
  },
  {
    id: 'papel', name: 'Cuaderno', industry: 'Papelería',
    palette: { paper: '#fbfaf6', surface: '#ffffff', ink: '#1d1d1b', ink2: '#43433f', muted: '#82827c', line: '#e7e4db', accent: '#2f5d50', highlight: '#e5dfcd', artA: '#eee9dc', artB: '#dcd5c2' },
    fonts: { display: D.lora, body: B.karla, mono: M['space-mono'] },
    layout: { hero: 'split', card: 'plain', button: 'square', radius: 4, density: 'normal', caps: false },
  },
  {
    id: 'plata', name: 'Lumen', industry: 'Fotografía',
    palette: { paper: '#101013', surface: '#17171b', ink: '#ededf0', ink2: '#b8b8c0', muted: '#82828c', line: '#2a2a30', accent: '#b0b0b8', highlight: '#5a5a63', artA: '#2a2a30', artB: '#191920' },
    fonts: { display: D['space-grotesk'], body: B.inter, mono: M['space-mono'] },
    layout: { hero: 'centered', card: 'plain', button: 'square', radius: 0, density: 'airy', caps: true },
  },
  {
    id: 'lienzo', name: 'Escenario', industry: 'Música',
    palette: { paper: '#1a1420', surface: '#241b2c', ink: '#f2ecf7', ink2: '#c3b6cd', muted: '#8d7f98', line: '#332742', accent: '#d64d8a', highlight: '#6f4bd8', artA: '#312043', artB: '#1f1730' },
    fonts: { display: D.bebas, body: B['work-sans'], mono: M['space-mono'] },
    layout: { hero: 'centered', card: 'border', button: 'square', radius: 4, density: 'tight', caps: true },
  },
  {
    id: 'garaje', name: 'Garaje', industry: 'Motor',
    palette: { paper: '#e9e9e7', surface: '#ffffff', ink: '#17181a', ink2: '#3a3c3f', muted: '#787b80', line: '#cfd0cd', accent: '#c4122f', highlight: '#17181a', artA: '#dededb', artB: '#c6c7c4' },
    fonts: { display: D['archivo-black'], body: B.inter, mono: M['plex-mono'] },
    layout: { hero: 'split', card: 'border', button: 'square', radius: 0, density: 'tight', caps: true },
  },
  {
    id: 'jardin', name: 'Semilla', industry: 'Jardín',
    palette: { paper: '#f1f5ec', surface: '#ffffff', ink: '#1f2c1c', ink2: '#3f5240', muted: '#75856f', line: '#d8e2d1', accent: '#4a7c3a', highlight: '#d4e3c2', artA: '#dce8d2', artB: '#bcd0ae' },
    fonts: { display: D.fraunces, body: B.lora, mono: M['space-mono'] },
    layout: { hero: 'split', card: 'plain', button: 'pill', radius: 14, density: 'airy', caps: false },
  },
  {
    id: 'oasis', name: 'Horizonte', industry: 'Viajes',
    palette: { paper: '#eaf4f7', surface: '#ffffff', ink: '#14303a', ink2: '#32535f', muted: '#6e8b95', line: '#cfe2e8', accent: '#0e7f96', highlight: '#ffd166', artA: '#cfe6ec', artB: '#a7d0da' },
    fonts: { display: D.playfair, body: B.manrope, mono: M['space-mono'] },
    layout: { hero: 'centered', card: 'shadow', button: 'pill', radius: 22, density: 'airy', caps: false },
  },
  {
    id: 'serum', name: 'Ritual', industry: 'Skincare',
    palette: { paper: '#f8f5f2', surface: '#ffffff', ink: '#2a2724', ink2: '#55504a', muted: '#8e8880', line: '#e9e2da', accent: '#b08568', highlight: '#e8d9cc', artA: '#eee0d5', artB: '#dcc7b6' },
    fonts: { display: D.fraunces, body: B.karla, mono: M['space-mono'] },
    layout: { hero: 'split', card: 'plain', button: 'pill', radius: 20, density: 'airy', caps: false },
  },
  {
    id: 'reloj', name: 'Esfera', industry: 'Relojes',
    palette: { paper: '#f4f4f4', surface: '#ffffff', ink: '#101010', ink2: '#3a3a3a', muted: '#7b7b7b', line: '#dcdcdc', accent: '#1c1c1c', highlight: '#c9a227', artA: '#e6e6e6', artB: '#cfcfcf' },
    fonts: { display: D.playfair, body: B['work-sans'], mono: M['space-mono'] },
    layout: { hero: 'split', card: 'plain', button: 'soft', radius: 2, density: 'airy', caps: true },
  },
  {
    id: 'zapatilla', name: 'Suela', industry: 'Zapatillas',
    palette: { paper: '#fbfbfb', surface: '#ffffff', ink: '#0f0f10', ink2: '#333336', muted: '#7b7b80', line: '#e3e3e3', accent: '#ff3b30', highlight: '#111113', artA: '#ebebec', artB: '#d6d6d8' },
    fonts: { display: D['archivo-black'], body: D.outfit, mono: M['plex-mono'] },
    layout: { hero: 'centered', card: 'border', button: 'square', radius: 10, density: 'tight', caps: true },
  },
  {
    id: 'miel', name: 'Panal', industry: 'Miel',
    palette: { paper: '#fff8e8', surface: '#fffdf6', ink: '#3b2a12', ink2: '#6a5230', muted: '#a08a63', line: '#f0e3c4', accent: '#c98a12', highlight: '#f6d98a', artA: '#f7e5b4', artB: '#e6cf8e' },
    fonts: { display: D.fraunces, body: B.lora, mono: M['space-mono'] },
    layout: { hero: 'split', card: 'solid', button: 'pill', radius: 14, density: 'normal', caps: false },
  },
  {
    id: 'bosque', name: 'Bosque', industry: 'Senderismo',
    palette: { paper: '#e8efe6', surface: '#ffffff', ink: '#16231a', ink2: '#35473a', muted: '#6f8073', line: '#d0dccb', accent: '#2f5d3a', highlight: '#a7c9a0', artA: '#d6e3d0', artB: '#b0c8a8' },
    fonts: { display: D.outfit, body: B.karla, mono: M['space-mono'] },
    layout: { hero: 'split', card: 'shadow', button: 'soft', radius: 10, density: 'normal', caps: true },
  },
];

export const DEFAULT_THEME = 'aurora';

/**
 * @param {string} id
 * @returns {Theme}
 */
export function getTheme(id) {
  return THEMES.find((t) => t.id === id) || THEMES[0];
}

/** The CSS custom properties a theme sets on `<html>`. */
export function themeVars(theme) {
  const p = theme.palette;
  const density = { airy: 1.35, normal: 1, tight: 0.72 }[theme.layout.density] || 1;
  return {
    '--paper': p.paper,
    '--surface': p.surface,
    '--ink': p.ink,
    '--ink-2': p.ink2,
    '--muted': p.muted,
    '--line': p.line,
    '--accent': p.accent,
    '--highlight': p.highlight,
    '--art-a': p.artA,
    '--art-b': p.artB,
    '--display': theme.fonts.display,
    '--body': theme.fonts.body,
    '--mono': theme.fonts.mono,
    '--radius': `${theme.layout.radius}px`,
    '--gap': `${Math.round(24 * density)}px`,
  };
}

/** The Google Fonts URL with every family the themes use. */
export const FONT_HREF =
  'https://fonts.googleapis.com/css2?' +
  [
    'family=Archivo+Black',
    'family=Bebas+Neue',
    'family=Fraunces:opsz,wght@9..144,400;9..144,600',
    'family=IBM+Plex+Mono:wght@400;500',
    'family=Inter:wght@400;500;600',
    'family=Karla:wght@400;500',
    'family=Lora:wght@400;500',
    'family=Manrope:wght@400;500;600',
    'family=Outfit:wght@400;500;600;700',
    'family=Playfair+Display:wght@400;600',
    'family=Space+Grotesk:wght@400;500;600;700',
    'family=Space+Mono:wght@400;700',
    'family=Work+Sans:wght@400;500;600',
  ].join('&') +
  '&display=swap';
