"""Original soundtrack for "Continue?" — everything synthesized with numpy, nothing to license.

Reads events.json (written by the renderer from film.js) so every sound lands on its frame.
Writes score.wav (48 kHz, stereo, 16-bit).
"""
import json
import wave
import numpy as np

SR = 48000
EV = json.load(open('events.json'))
DUR = EV['duration'] + 1.0
N = int(DUR * SR)
BPM = 120
BEAT = 60 / BPM          # 0.5 s
BAR = BEAT * 4           # 2 s
rng = np.random.default_rng(7)


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def buf():
    return np.zeros((2, N))


def env_adsr(n, a, d, s, r, sus_len):
    """attack/decay/sustain/release envelope, lengths in seconds"""
    A, D, R = int(a * SR), int(d * SR), int(r * SR)
    S = max(0, int(sus_len * SR) - A - D)
    e = np.concatenate([np.linspace(0, 1, max(A, 1)), np.linspace(1, s, max(D, 1)), np.full(S, s), np.linspace(s, 0, max(R, 1))])
    return e[:n] if len(e) >= n else np.pad(e, (0, n - len(e)))


def place(bus, sig, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= N or i + len(sig) <= 0:
        return
    j = min(N, i + len(sig))
    s = sig[: j - i] * gain
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    bus[0, i:j] += s * l
    bus[1, i:j] += s * r


def onepole_lp(x, fc):
    a = np.exp(-2 * np.pi * fc / SR)
    # vectorised IIR via lfilter-free recursion on chunks is slow; use cumulative trick through FFT filter instead
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    H = (1 - a) / np.sqrt(1 + a * a - 2 * a * np.cos(2 * np.pi * f / SR))
    return np.fft.irfft(X * H, len(x))


def bandpass_fft(x, lo, hi):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X[(f < lo) | (f > hi)] *= 0.02
    return np.fft.irfft(X, len(x))


def tone(freq, dur, partials=((1, 1.0),), decay=None, vib=0.0, vib_rate=5.0, phase_seed=0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    f = freq * (1 + vib * np.sin(2 * np.pi * vib_rate * t))
    ph = 2 * np.pi * np.cumsum(f) / SR
    for k, (mult, amp) in enumerate(partials):
        d = 1.0 if decay is None else np.exp(-t * decay * (1 + 0.6 * k))
        out += amp * np.sin(ph * mult + phase_seed * (k + 1)) * d
    return out


# ------------------------------------------------------------------ harmony
PROG = [  # (bass midi, pad voicing)
    (38, [57, 61, 64, 66]),        # Dmaj9
    (35, [54, 57, 61, 62]),        # Bm9
    (31, [54, 59, 62, 66]),        # Gmaj7
    (33, [57, 62, 64, 69]),        # Asus4 (resolves on beat 3)
]
END_T = 82.6


def chord_at(t):
    if t >= END_T:
        return 38, [57, 62, 66, 69, 74]
    return PROG[int(t // (BAR * 2)) % 4]


def in_dialogue(t):
    return any(L['start'] - 0.2 <= t <= L['end'] for L in EV['lines'])


def lead_at(t):
    name = EV['scenes'][0]['lead']
    for s in EV['scenes']:
        if t >= s['t']:
            name = s['lead']
    return name


# ------------------------------------------------------------------ pad
pad = buf()
saw_partials = [(k, 1 / k ** 1.4) for k in range(1, 7)]
t = 0.0
while t < DUR - 1:
    seg = BAR * 2 if t < END_T else DUR - t
    bass, notes = chord_at(t + 0.01)
    for i, m in enumerate(notes):
        for det, pan in ((-0.004, -0.5), (0.004, 0.5)):
            s = tone(hz(m) * (1 + det), seg + 1.6, saw_partials, vib=0.0015, vib_rate=0.3 + i * 0.07, phase_seed=i + det * 100)
            s *= env_adsr(len(s), 1.4, 0.5, 0.8, 1.6, seg)
            place(pad, s, t, 0.022, pan * (0.4 + 0.15 * i))
    # A sus4 -> A on beat 3
    if bass == 33 and t < END_T:
        s = tone(hz(61), BAR + 1.4, saw_partials, vib=0.0015, vib_rate=0.4)
        s *= env_adsr(len(s), 0.8, 0.4, 0.8, 1.4, BAR)
        place(pad, s, t + BAR, 0.026, 0.2)
    t += seg
pad = np.stack([onepole_lp(pad[0], 1800), onepole_lp(pad[1], 1800)])
# swell in from the opening, a little brighter at dawn
pad_gain = np.interp(np.arange(N) / SR, [0, 3, 63, 66, DUR - 2, DUR], [0.0, 1.0, 1.0, 1.25, 1.25, 0.0])
pad *= pad_gain

# ------------------------------------------------------------------ bass (enters with the conversation)
bass_bus = buf()
t = 12.0
while t < DUR - 2:
    b, _ = chord_at(t + 0.01)
    if not (42.6 <= t < 48.6):
        for off, g in ((0, 1.0), (BEAT * 2, 0.55)):
            s = tone(hz(b + 12), 1.9, ((1, 1), (2, 0.25), (3, 0.06)), decay=1.4)
            s *= np.minimum(1, np.arange(len(s)) / (0.02 * SR))
            place(bass_bus, s, t + off, 0.16 * g, 0)
    t += BAR

# ------------------------------------------------------------------ lead instruments
def inst(name, freq, dur):
    if name == 'musicbox':
        return tone(freq, 2.4, ((1, 1), (2.76, 0.35), (5.4, 0.12)), decay=2.2)
    if name == 'epiano':
        n = int(2.6 * SR); tt = np.arange(n) / SR
        mod = np.sin(2 * np.pi * freq * tt) * 1.6 * np.exp(-tt * 4)
        return np.sin(2 * np.pi * freq * tt + mod) * np.exp(-tt * 1.3) + 0.2 * np.sin(4 * np.pi * freq * tt) * np.exp(-tt * 3)
    if name == 'felt':
        s = tone(freq, 3.0, ((1, 1), (2, 0.4), (3, 0.18), (4, 0.08)), decay=1.1)
        return onepole_lp(s, 2200) * np.minimum(1, np.arange(len(s)) / (0.012 * SR))
    if name == 'glass':
        return tone(freq, 3.6, ((1, 1), (2.32, 0.5), (4.25, 0.25), (6.1, 0.1)), decay=0.8)
    if name == 'warm':
        s = tone(freq, dur + 1.2, ((1, 1), (2, 0.35), (3, 0.15), (4, 0.06)), vib=0.004, vib_rate=5.2)
        return s * env_adsr(len(s), 0.35, 0.3, 0.75, 1.0, dur)
    raise ValueError(name)


LEAD_GAIN = {'musicbox': 0.07, 'epiano': 0.075, 'felt': 0.09, 'glass': 0.06, 'warm': 0.05}
SCALE = [62, 64, 66, 69, 71, 74, 76, 78, 81]           # D major pentatonic
lead = buf()
bar = 0
t = 0.6
while t < DUR - 3:
    name = lead_at(t)
    _, notes = chord_at(t + 0.01)
    talking = in_dialogue(t + 0.5)
    pattern = [0, 1.5, 3] if not talking else [0]
    if name == 'warm':
        pattern = [0, 2] if not talking else [0]
    for k, beat in enumerate(pattern):
        tt = t + beat * BEAT
        h = (bar * 7 + k * 3) % 11
        chord_tones = [m + 12 for m in notes if m + 12 >= 69] or [74]
        m = chord_tones[h % len(chord_tones)] if k == 0 else SCALE[3 + (h % 6)]
        dur = BEAT * (2 if name == 'warm' else 1.5)
        s = inst(name, hz(m), dur)
        place(lead, s, tt, LEAD_GAIN[name] * (0.75 if talking else 1.0), 0.25 * np.sin(bar * 1.7 + k))
    t += BAR
    bar += 1

# ------------------------------------------------------------------ light percussion
perc = buf()
def kick():
    n = int(0.35 * SR); tt = np.arange(n) / SR
    f = 45 + 75 * np.exp(-tt * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 9)
def shaker():
    n = int(0.09 * SR)
    s = rng.standard_normal(n) * np.exp(-np.arange(n) / SR * 45)
    return bandpass_fft(s, 5000, 12000)
KICK, SHK = kick(), shaker()
t = 12.6
while t < 80:
    if not (42.6 <= t < 50) and not (57.6 <= t < 64.6):
        place(perc, KICK, t, 0.14, 0)
        if t >= 33.6:
            for e in range(8):
                g = 0.03 if e % 2 else 0.018
                place(perc, SHK, t + e * BEAT / 2 + (0.03 if e % 2 else 0), g, 0.3)
    t += BAR

# ------------------------------------------------------------------ rain + room tone
amb = buf()
noise = rng.standard_normal((2, N))
rain = np.stack([bandpass_fft(noise[0], 400, 7000), bandpass_fft(noise[1], 400, 7000)])
rain += 0.6 * np.stack([onepole_lp(noise[1], 300), onepole_lp(noise[0], 300)])
rk = np.array(EV['rain'])
rain_level = np.interp(np.arange(N) / SR, rk[:, 0], rk[:, 1])
amb += rain * rain_level * 0.03
for i in range(int(DUR * 9)):  # droplets on the glass
    tt = rng.uniform(0, DUR)
    if np.interp(tt, rk[:, 0], rk[:, 1]) < 0.1:
        continue
    d = tone(rng.uniform(1800, 3800), 0.05, decay=60)
    place(amb, d, tt, 0.012 * np.interp(tt, rk[:, 0], rk[:, 1]), rng.uniform(-0.8, 0.8))
# dawn birds, very far away
for i in range(9):
    tt = 67 + i * 1.7 + rng.uniform(0, 0.8)
    n = int(0.16 * SR); x = np.arange(n) / SR
    f = 3200 + 900 * np.sin(x * 60)
    chirp = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * x / x[-1])
    place(amb, chirp, tt, 0.008, rng.uniform(-0.7, 0.7))

# ------------------------------------------------------------------ voices: soft syllable blips
voice = buf()
def kai_syllable(f0, dur, rise):
    n = int(dur * SR); x = np.arange(n) / SR
    f = f0 * (1 + rise * x / dur) * (1 + 0.01 * np.sin(2 * np.pi * 6 * x))
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = sum(a * np.sin(ph * k) for k, a in ((1, 1), (2, 0.5), (3, 0.35), (4, 0.18), (5, 0.08)))
    return bandpass_fft(s, 150, 3200) * np.abs(np.sin(np.pi * x / x[-1])) ** 0.7
def claude_syllable(f0, dur, rise):
    n = int(dur * SR); x = np.arange(n) / SR
    f = f0 * (1 + rise * x / dur)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) + 0.3 * np.sin(2 * ph) + 0.12 * np.sin(2.76 * ph) * np.exp(-x * 12)
    return s * np.abs(np.sin(np.pi * x / x[-1])) ** 0.6
lines = EV['lines']
for b in EV['blips']:
    L = next(l for l in lines if l['who'] == b['who'] and l['start'] - 0.01 <= b['t'] <= l['end'])
    words = [x for x in EV['blips'] if L['start'] - 0.01 <= x['t'] <= L['end'] and x['who'] == b['who']]
    idx = words.index(b)
    last = idx == len(words) - 1
    question = L['text'].strip().endswith('?')
    h = ((int(b['t'] * 100) * 37) % 9) / 9
    dur = 0.09 + b['len'] * 0.045
    if b['who'] == 'kai':
        f0 = 250 * (1 + 0.12 * h) * (1.18 if (last and question) else 1)
        s = kai_syllable(f0, dur, 0.22 if (last and question) else -0.06)
        place(voice, s, b["t"], 0.13, -0.35)
    else:
        f0 = 470 * (1 + 0.1 * h) * (0.94 if last else 1)
        s = claude_syllable(f0, dur, -0.05)
        place(voice, s, b["t"], 0.125, 0.35)

# ------------------------------------------------------------------ sound effects
sfx = buf()
def whoosh(dur, up=True, lo=300, hi=4000):
    n = int(dur * SR); x = np.arange(n) / SR
    s = rng.standard_normal(n)
    s = bandpass_fft(s, lo, hi)
    shape = (x / dur) ** 2 if up else (1 - x / dur) ** 2
    return s * shape
def bell(m, dur=3.0, decay=1.2):
    return tone(hz(m), dur, ((1, 1), (2.76, 0.3), (5.4, 0.1)), decay=decay)
for e in EV['sfx']:
    t0, name = e['t'], e['name']
    if name == 'title':
        for i, m in enumerate([74, 78, 81, 86, 90]):
            place(sfx, bell(m, 2.5, 1.6), t0 + i * 0.09, 0.05, -0.5 + i * 0.25)
    elif name == 'clack':
        n = int(0.12 * SR); x = np.arange(n) / SR
        place(sfx, bandpass_fft(rng.standard_normal(n), 800, 5000) * np.exp(-x * 60) + 0.6 * np.sin(2 * np.pi * 180 * x) * np.exp(-x * 40), t0, 0.09, 0.3)
    elif name in ('hop', 'step'):
        n = int(0.12 * SR); x = np.arange(n) / SR
        f = (520 if name == 'hop' else 380) * (1 + 0.6 * x / x[-1])
        s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x * 30)
        place(sfx, s, t0, 0.07 if name == 'hop' else 0.035, 0.35)
    elif name == 'turn':
        place(sfx, whoosh(0.5, True, 600, 3000), t0 - 0.4, 0.02, 0.3)
    elif name == 'chair':
        for k in range(3):
            n = int(0.16 * SR); x = np.arange(n) / SR
            f = 520 + 160 * np.sin(x * 20 + k)
            s = (np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.4 * np.sin(4 * np.pi * np.cumsum(f) / SR)) * np.sin(np.pi * x / x[-1])
            place(sfx, s, t0 + k * 0.22, 0.012, -0.4)
    elif name == 'reach':
        place(sfx, whoosh(1.4, True, 300, 2500), t0, 0.015, -0.2)
    elif name == 'touch':
        for i, m in enumerate([86, 90, 93, 98]):
            place(sfx, tone(hz(m), 4, ((1, 1), (2.32, 0.4), (4.25, 0.2)), decay=0.7), t0 + i * 0.05, 0.05, -0.3 + i * 0.2)
        place(sfx, whoosh(0.3, False, 4000, 14000), t0, 0.03, 0)
    elif name == 'swell':
        place(sfx, whoosh(0.75, True, 200, 9000), t0, 0.08, 0)
        place(sfx, bell(74, 5, 0.6) + 0.6 * bell(81, 5, 0.6), t0 + 0.7, 0.06, 0)
    elif name == 'pickup':
        place(sfx, whoosh(0.35, True, 1000, 6000), t0, 0.02, 0.2)
    elif name == 'click':
        n = int(0.03 * SR); x = np.arange(n) / SR
        place(sfx, bandpass_fft(rng.standard_normal(n), 2000, 9000) * np.exp(-x * 220), t0, 0.12, 0.2)
    elif name == 'newgame':
        for i, m in enumerate([74, 78, 81, 86]):
            sq = tone(hz(m), 0.5, ((1, 1), (3, 0.3), (5, 0.15)), decay=6)
            place(sfx, sq, t0 + i * 0.11, 0.05, 0.4)
        place(sfx, tone(hz(90), 1.6, ((1, 1), (3, 0.25)), decay=2.5), t0 + 0.46, 0.05, 0.4)
    elif name == 'iris':
        place(sfx, whoosh(1.4, False, 200, 3000), t0, 0.03, 0)
    elif name == 'end':
        for i, m in enumerate([50, 57, 62, 66, 69, 74]):
            s = tone(hz(m), 6, saw_partials[:4], vib=0.002, vib_rate=0.5)
            s *= env_adsr(len(s), 0.6, 0.5, 0.7, 3.0, 2.5)
            place(sfx, s, t0 - 0.3, 0.03, -0.5 + i * 0.2)
        place(sfx, bell(86, 5, 0.6), t0 + 0.2, 0.05, 0)

# ------------------------------------------------------------------ reverb (FFT convolution with a synthetic hall)
def reverb(x, length=2.6, pre=0.02):
    n = int(length * SR)
    t = np.arange(n) / SR
    ir = rng.standard_normal((2, n)) * np.exp(-t * 3.2)
    ir[:, : int(pre * SR)] = 0
    ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True))
    L = 1 << int(np.ceil(np.log2(N + n)))
    out = np.zeros_like(x)
    for c in range(2):
        y = np.fft.irfft(np.fft.rfft(x[c], L) * np.fft.rfft(onepole_lp(ir[c], 5000), L), L)[:N]
        out[c] = y
    return out

music = pad + bass_bus + lead + perc
wet_src = pad * 0.6 + lead + sfx * 0.7 + voice * 0.35
wet = reverb(wet_src) * 0.35

# gentle duck of the music under the voices
duck = np.ones(N)
for L in EV['lines']:
    a, b = int((L['start'] - 0.3) * SR), int((L['end']) * SR)
    duck[a:b] = 0.7
duck = onepole_lp(duck, 3)
mix = music * duck + amb + voice * 1.25 + sfx + wet

# fades, soft limit, normalise
fade = np.interp(np.arange(N) / SR, [0, 1.2, DUR - 1.5, DUR], [0, 1, 1, 0])
mix *= fade
mix = np.tanh(mix * 1.3) / 1.3
mix *= 10 ** (-1.0 / 20) / np.max(np.abs(mix))

pcm = (mix.T * 32767).astype(np.int16)
with wave.open('score.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(pcm.tobytes())

# loudness check: RMS per 2-second window (dBFS)
mono = mix.mean(axis=0)
win = 2 * SR
rms = [20 * np.log10(np.sqrt(np.mean(mono[i:i + win] ** 2)) + 1e-9) for i in range(0, N - win, win)]
print('RMS dBFS per 2 s:', ' '.join(f'{r:.0f}' for r in rms))
print(f'overall RMS {20 * np.log10(np.sqrt(np.mean(mono ** 2))):.1f} dBFS, peak -1.0 dBFS, {DUR:.1f}s')
