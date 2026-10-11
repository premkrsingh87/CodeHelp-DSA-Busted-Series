// Art direction: "Rainy Night, Warm Lamp". One palette for the whole film.
export const P = {
  ink:    '#1B1A2E', // Midnight Ink — outlines, night sky, deepest shadow
  plum:   '#3A2F4F', // Dusk Plum — room walls, shadow side of the room
  clay:   '#D97757', // Clay — Claude's body
  ember:  '#F2A65A', // Ember — desk lamp, warm key light
  teal:   '#5EC4C0', // Monitor Teal — screen glow, rim light
  paper:  '#F4EBDD', // Paper — text, highlights, eye glints
  moss:   '#6F8F72', // Moss — Kai's hoodie
  rose:   '#E59AA0', // Dawn Rose — blush, the sunrise at the end
};

// Derived shades (always mixed from the named colours above, never new hues).
export function mix(a, b, t) {
  const pa = hex(a), pb = hex(b);
  const r = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `rgb(${r[0]},${r[1]},${r[2]})`;
}
function hex(h) {
  if (h.startsWith('rgb')) return h.match(/\d+/g).slice(0, 3).map(Number);
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const S = {
  clayShadow: mix(P.clay, P.plum, 0.38),
  clayLight:  mix(P.clay, P.ember, 0.35),
  skin:       '#C68B62',            // Kai's skin (Clay softened toward Ember)
  skinShadow: mix('#C68B62', P.plum, 0.32),
  hair:       mix(P.ink, P.plum, 0.25),
  mossShadow: mix(P.moss, P.plum, 0.4),
  denim:      mix(P.plum, P.teal, 0.28),
  denimShadow: mix(P.plum, P.ink, 0.35),
};


