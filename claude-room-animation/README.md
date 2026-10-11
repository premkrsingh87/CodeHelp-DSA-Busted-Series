# Continue? — a short low-poly film

A boy, Kai, talks with Claude (in its pet form) in his gaming room late on a rainy night, about growing up and the future.
Every frame is rendered in code with Three.js (low-poly, flat-shaded clearcoat materials, bloom on emissives) and every
sound is synthesized with numpy, so there is nothing to license.

## Files
- `src/claude-pet.js` – Claude, pet form (build + pose)
- `src/kai.js` – Kai (build + pose)
- `src/room.js` – the room, rainy window sky, desk, chair
- `src/props.js` – monitor, lamp, controller, headset, mug
- `src/film.js` – timeline, cameras, dialogue, overlays; `render(ctx, t)` and `events()`
- `src/stage.js`, `src/materials.js`, `src/palette.js` – renderer, light rig, bloom, materials, palette
- `src/sheet.js` – character sheet
- `sound.py` – soundtrack, reads `events.json`
- `tools/` – headless Chromium harness, stills/contact sheets, parallel renderer

## Commands
```bash
npm install                                   # playwright, three, fonts (uses the preinstalled Chromium)
node tools/sheet.mjs                          # character sheet -> out/character-sheet.png
node tools/stills.mjs out/board.jpg 0.5 3 3 9 16 24 30 38 46 53 61 67 75 81.6   # storyboard contact sheet
node tools/render-all.mjs out/draft.mp4 30 0.5 3   # motion draft, 960x540 (also writes events.json)
python3 sound.py                              # soundtrack -> score.wav (needs events.json)
node tools/render-all.mjs out/continue.mp4 30 1 3  # final 1080p with sound
```
Set `CHROMIUM=/path/to/chrome` if Chromium is not at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
