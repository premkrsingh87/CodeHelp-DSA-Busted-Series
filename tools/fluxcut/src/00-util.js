/* FluxCut Studio — utilities, math, timecode, tiny reactive helpers.
   Everything hangs off one global so the app can be shipped as a single file. */
window.FC = window.FC || {};
(function (FC) {
  'use strict';

  /* ── DOM ───────────────────────────────────────────────────────── */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  function el(tag, attrs, kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null && attrs[k] !== false) n.setAttribute(k, attrs[k]);
    }
    if (kids) (Array.isArray(kids) ? kids : [kids]).forEach(c => c && n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return n;
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ── math ──────────────────────────────────────────────────────── */
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const round2 = v => Math.round(v * 100) / 100;
  const round3 = v => Math.round(v * 1000) / 1000;
  const uid = (p) => (p || 'id') + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

  /** Deterministic RNG (mulberry32) — same seed always yields the same edit. */
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  /** Fisher–Yates using a supplied rng — pure, no global randomness. */
  function shuffled(arr, rand) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  /* ── frame / timecode ──────────────────────────────────────────── */
  /** True playback rate: NTSC rates are timebase * 1000/1001. */
  function realFps(timebase, ntsc) { return ntsc ? timebase * 1000 / 1001 : timebase; }
  const FPS_TABLE = {
    '23.976': { tb: 24, ntsc: true }, '24': { tb: 24, ntsc: false }, '25': { tb: 25, ntsc: false },
    '29.97': { tb: 30, ntsc: true }, '30': { tb: 30, ntsc: false }, '50': { tb: 50, ntsc: false },
    '59.94': { tb: 60, ntsc: true }, '60': { tb: 60, ntsc: false }
  };
  const PPRO_TICKS_PER_SEC = 254016000000;

  const secToFrames = (sec, fps) => Math.round(sec * fps);
  const framesToSec = (f, fps) => f / fps;
  /** Snap seconds onto the frame grid — every edit passes through this. */
  const qf = (sec, fps) => Math.round(sec * fps) / fps;

  /** SMPTE timecode. Drop-frame is used for 29.97/59.94 when df is true. */
  function tc(sec, timebase, ntsc, df) {
    if (!isFinite(sec)) sec = 0;
    const neg = sec < 0; sec = Math.abs(sec);
    const fps = realFps(timebase, ntsc);
    let f = Math.round(sec * fps);
    let hh, mm, ss, ff, sepr = ':';
    if (ntsc && df && (timebase === 30 || timebase === 60)) {
      const dropPer = timebase === 30 ? 2 : 4;
      const framesPer10Min = timebase * 600 - dropPer * 9;
      const framesPerMin = timebase * 60 - dropPer;
      const d = Math.floor(f / framesPer10Min), m = f % framesPer10Min;
      if (m >= dropPer) f += dropPer * 9 * d + dropPer * Math.floor((m - dropPer) / framesPerMin);
      else f += dropPer * 9 * d;
      sepr = ';';
      ff = f % timebase; ss = Math.floor(f / timebase) % 60;
      mm = Math.floor(f / (timebase * 60)) % 60; hh = Math.floor(f / (timebase * 3600)) % 24;
    } else {
      ff = f % timebase; ss = Math.floor(f / timebase) % 60;
      mm = Math.floor(f / (timebase * 60)) % 60; hh = Math.floor(f / (timebase * 3600));
    }
    const p = n => String(n).padStart(2, '0');
    return (neg ? '-' : '') + p(hh) + ':' + p(mm) + ':' + p(ss) + sepr + p(ff);
  }
  /** Parse "hh:mm:ss:ff", "mm:ss", "12.5" or "90s" back into seconds. */
  function parseTc(str, timebase, ntsc) {
    if (str == null) return 0;
    str = String(str).trim();
    if (/^[\d.]+s?$/.test(str)) return parseFloat(str) || 0;
    const parts = str.split(/[:;]/).map(x => parseFloat(x) || 0);
    const fps = realFps(timebase, ntsc);
    if (parts.length === 4) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) + parts[3] / fps;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
  }
  /** Compact human duration: 1:04.5 / 12.30s */
  function dur(sec) {
    if (!isFinite(sec)) return '—';
    if (sec < 60) return sec.toFixed(2) + 's';
    const m = Math.floor(sec / 60), s = sec - m * 60;
    if (m < 60) return m + ':' + s.toFixed(1).padStart(4, '0');
    return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0') + ':' + String(Math.floor(s)).padStart(2, '0');
  }
  function bytes(n) {
    if (!n) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB', 'TB']; const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
    return (n / Math.pow(1024, i)).toFixed(i ? 1 : 0) + ' ' + u[i];
  }

  /* ── scheduling ────────────────────────────────────────────────── */
  function raf(fn) { let q = false, args; return function () { args = arguments; if (q) return; q = true; requestAnimationFrame(() => { q = false; fn.apply(null, args); }); }; }
  function debounce(fn, ms) { let t; return function () { const a = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(null, a), ms); }; }
  function idle(fn, timeout) { (window.requestIdleCallback || (f => setTimeout(f, 1)))(fn, { timeout: timeout || 400 }); }
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* ── event bus ─────────────────────────────────────────────────── */
  const bus = (() => {
    const map = new Map();
    return {
      on(ev, fn) { (map.get(ev) || map.set(ev, new Set()).get(ev)).add(fn); return () => map.get(ev).delete(fn); },
      emit(ev, data) { const s = map.get(ev); if (s) s.forEach(fn => { try { fn(data); } catch (e) { console.error('[bus:' + ev + ']', e); } }); }
    };
  })();

  /* ── toast / busy bar ──────────────────────────────────────────── */
  function toast(msg, kind, ms) {
    const host = $('#toasts'); if (!host) return console.log(msg);
    const ic = { ok: '✓', err: '✕', warn: '!', info: 'i' }[kind || 'ok'];
    const n = el('div', { class: 'toast ' + (kind || 'ok') }, [el('span', { class: 'ic', text: ic }), el('span', { html: msg })]);
    host.appendChild(n);
    setTimeout(() => { n.style.transition = 'opacity .2s,transform .2s'; n.style.opacity = '0'; n.style.transform = 'translateY(4px)'; setTimeout(() => n.remove(), 220); }, ms || 3200);
  }
  let busyN = 0;
  function busy(p) { // p: 0..1, or null to finish
    const b = $('#busy'); if (!b) return;
    if (p == null) { busyN = 0; b.style.width = '100%'; setTimeout(() => { b.style.transition = 'none'; b.style.width = '0'; setTimeout(() => b.style.transition = '', 30); }, 180); }
    else { busyN = p; b.style.width = clamp(p, 0, 1) * 100 + '%'; }
  }

  /* ── colours ───────────────────────────────────────────────────── */
  const CLIP_COLORS = ['#3d9bff', '#a855f7', '#31c48d', '#f5a524', '#f5576c', '#06b6d4', '#ec4899', '#84cc16', '#6366f1', '#f97316'];
  function hashColor(str) { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return CLIP_COLORS[Math.abs(h) % CLIP_COLORS.length]; }
  function withAlpha(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function mix(hex, hex2, t) {
    const A = parseInt(hex.slice(1), 16), B = parseInt(hex2.slice(1), 16);
    const r = Math.round(lerp(A >> 16 & 255, B >> 16 & 255, t)), g = Math.round(lerp(A >> 8 & 255, B >> 8 & 255, t)), b = Math.round(lerp(A & 255, B & 255, t));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  /* ── files ─────────────────────────────────────────────────────── */
  const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv|avi|mxf|mts|m2ts|wmv|flv|prores|braw|r3d)$/i;
  const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|tiff?|heic|avif|svg|dng|cr2|nef|arw)$/i;
  const AUDIO_EXT = /\.(mp3|wav|aac|m4a|flac|ogg|opus|aiff?|wma)$/i;
  function kindOf(file) {
    const n = file.name || '';
    if (file.type.startsWith('video') || VIDEO_EXT.test(n)) return 'video';
    if (file.type.startsWith('image') || IMAGE_EXT.test(n)) return 'image';
    if (file.type.startsWith('audio') || AUDIO_EXT.test(n)) return 'audio';
    return null;
  }
  /** Browsers can't hand us a real absolute path — we rebuild it from a user-set root. */
  function joinPath(root, rel, winStyle) {
    if (!root) return rel;
    const sep = winStyle ? '\\' : '/';
    let r = root.replace(/[\\\/]+$/, '');
    let s = String(rel || '').replace(/^[\\\/]+/, '');
    if (winStyle) s = s.replace(/\//g, '\\'); else s = s.replace(/\\/g, '/');
    return r + sep + s;
  }
  /** file://localhost/C:/x/y.mp4 — the form Premiere writes and reads most reliably. */
  function pathToUrl(p) {
    if (!p) return '';
    let s = String(p).replace(/\\/g, '/');
    if (/^[A-Za-z]:/.test(s)) s = '/' + s;               // C:/x  →  /C:/x
    if (!s.startsWith('/')) return encodeURI(s).replace(/#/g, '%23');   // keep relative paths relative
    return 'file://localhost' + encodeURI(s).replace(/#/g, '%23');
  }
  function download(name, data, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); toast('Copied to clipboard'); }
    catch (e) { const ta = el('textarea', { text: t }); document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('Copied to clipboard'); }
  }
  const sanitize = s => String(s || 'sequence').replace(/[^\w\-. ]+/g, '_').trim().slice(0, 64) || 'sequence';

  FC.util = {
    $, $$, el, esc, clamp, lerp, round2, round3, uid, rng, shuffled,
    realFps, FPS_TABLE, PPRO_TICKS_PER_SEC, secToFrames, framesToSec, qf, tc, parseTc, dur, bytes,
    raf, debounce, idle, sleep, bus, toast, busy, CLIP_COLORS, hashColor, withAlpha, mix,
    kindOf, joinPath, pathToUrl, download, copyText, sanitize, VIDEO_EXT, IMAGE_EXT, AUDIO_EXT
  };
})(window.FC);
