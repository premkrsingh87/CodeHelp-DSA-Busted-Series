export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const inOut = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const sine = (t) => { t = clamp(t); return -(Math.cos(Math.PI * t) - 1) / 2; };
export const outBack = (t, s = 1.4) => { t = clamp(t) - 1; return 1 + (s + 1) * t * t * t + s * t * t; };
export const outCubic = (t) => 1 - Math.pow(1 - clamp(t), 3);
// progress of t through [a, b], eased
export const span = (t, a, b, e = inOut) => e(clamp((t - a) / (b - a)));
// deterministic hash noise
export const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
