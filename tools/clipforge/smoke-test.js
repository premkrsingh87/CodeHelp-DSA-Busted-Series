/*
 * ClipForge Studio — headless smoke test.
 *
 *   node smoke-test.js
 *
 * Needs playwright and a chromium build. Override the defaults if yours live elsewhere:
 *   CF_PLAYWRIGHT=/path/to/playwright  CF_CHROMIUM=/path/to/chrome  node smoke-test.js
 */
const PW = process.env.CF_PLAYWRIGHT || 'playwright';
const { chromium } = require(PW);
const path = require('node:path').join(__dirname, 'ClipForge-Studio.html');

(async () => {
    const browser = await chromium.launch({ executablePath: process.env.CF_CHROMIUM || undefined, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const page = await ctx.newPage();
    const errors = [], warns = [];
    page.on('console', m => {
        if (m.type() === 'error') errors.push(m.text());
        if (m.type() === 'warning') warns.push(m.text());
    });
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

    await page.goto('file://' + path);
    await page.waitForTimeout(900);
    const openAll = () => page.evaluate(() => document.querySelectorAll('details').forEach(d => d.open = true));
    await openAll();

    const step = async (name, fn) => {
        try { const r = await fn(); console.log('  ✓', name, r === undefined ? '' : JSON.stringify(r).slice(0, 160)); }
        catch (e) { console.log('  ✗', name, '->', e.message); }
    };

    console.log('\n== boot ==');
    await step('ClipForge exposed', () => page.evaluate(() => !!window.ClipForge && window.ClipForge.version));
    await step('no boot errors', () => errors.length ? ('ERRORS: ' + errors.join(' | ')) : 'clean');

    console.log('\n== add youtube video (offline-safe) ==');
    await page.fill('#urlInput', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s');
    await page.click('[data-act="addUrl"]');
    await page.waitForTimeout(600);
    await step('video added', () => page.evaluate(() => window.ClipForge.state.videos.length));
    await step('id parsed', () => page.evaluate(() => window.ClipForge.active().ytId));

    // force a duration so all tools work without network
    await page.evaluate(() => { const v = window.ClipForge.active(); v.duration = 600; v.durSource = 'manual'; window.ClipForge.render(); });
    await page.waitForTimeout(200);

    console.log('\n== url parsing table ==');
    await step('parsers', () => page.evaluate(() => {
        const t = ['https://youtu.be/abcdefghijk', 'https://www.youtube.com/shorts/ABCDEFGHIJK',
            'https://m.youtube.com/watch?v=11111111111', 'youtube.com/embed/22222222222',
            'ZZZZZZZZZZZ', 'not a url at all!!'];
        return t.map(x => { const v = window.ClipForge.addYouTube(x, { quiet: true, noFetch: true, noSelect: true }); return v ? v.ytId : null; });
    }));
    await page.evaluate(() => {
        const s = window.ClipForge.state;
        s.videos = s.videos.filter(v => v.ytId === 'dQw4w9WgXcQ');
        s.activeId = s.videos[0].uid;
        window.ClipForge.render();
    });

    console.log('\n== clip creation ==');
    await step('quick clip via action', async () => {
        await page.click('[data-act="quickClip"]');
        return page.evaluate(() => window.ClipForge.active().clips.length);
    });
    await step('paste ranges', async () => {
        await page.click('[data-act="tab"][data-v="text"]');
        await page.fill('#tsInput', '0:10-0:25 intro hook\n1:30 - 2:05  the good bit\n3:00-3:20\n05:00-05:30 outro');
        await page.click('[data-act="parseRanges"]');
        return page.evaluate(() => window.ClipForge.active().clips.map(c => [c.start, c.end, c.name]));
    });
    await step('split points', async () => {
        await page.fill('#tsInput', '60\n120\n240');
        await page.click('[data-act="parsePoints"]');
        return page.evaluate(() => window.ClipForge.active().clips.length);
    });
    await step('interval generator', async () => {
        await page.click('[data-act="tab"][data-v="auto"]');
        await page.fill('#ivLen', '45'); await page.fill('#ivGap', '15');
        await page.click('[data-act="genInterval"]');
        return page.evaluate(() => window.ClipForge.active().clips.length);
    });
    await step('equal parts', async () => {
        await page.fill('#eqCount', '8');
        await page.click('[data-act="genEqual"]');
        return page.evaluate(() => {
            const c = window.ClipForge.active().clips;
            return { n: c.length, first: c[0].end.toFixed(1), last: c[c.length - 1].end };
        });
    });
    await step('shorts builder', async () => {
        await page.click('[data-act="genShorts"]');
        return page.evaluate(() => window.ClipForge.active().clips.length);
    });

    console.log('\n== undo / redo ==');
    await step('undo', async () => { await page.click('[data-act="undo"]'); return page.evaluate(() => window.ClipForge.active().clips.length); });
    await step('redo', async () => { await page.click('[data-act="redo"]'); return page.evaluate(() => window.ClipForge.active().clips.length); });

    console.log('\n== selection + split/merge ==');
    await step('exclude all / include all', async () => {
        await page.click('[data-act="selNone"]');
        const off = await page.evaluate(() => window.ClipForge.active().clips.filter(c => c.on).length);
        await page.click('[data-act="selAll"]');
        const on = await page.evaluate(() => window.ClipForge.active().clips.filter(c => c.on).length);
        return { off, on };
    });
    await step('split at playhead', async () => {
        await page.evaluate(() => window.ClipForge.state && document.querySelector('[data-act="seek"][data-v="30"]').click());
        return page.evaluate(() => {
            const before = window.ClipForge.active().clips.length;
            document.querySelector('[data-act="splitHere"]').click();
            return { before, after: window.ClipForge.active().clips.length };
        });
    });

    console.log('\n== keyboard I / O / Enter ==');
    await step('I,O,Enter makes a clip', async () => {
        const before = await page.evaluate(() => window.ClipForge.active().clips.length);
        await page.evaluate(() => document.querySelector('[data-act="seek"][data-v="30"]').click());
        await page.keyboard.press('i');
        await page.evaluate(() => document.querySelector('[data-act="seek"][data-v="30"]').click());
        await page.keyboard.press('o');
        await page.keyboard.press('Enter');
        const after = await page.evaluate(() => window.ClipForge.active().clips.length);
        return { before, after };
    });

    console.log('\n== script generation (all 5 tabs x 4 strategies) ==');
    for (const strat of ['sections', 'batched', 'full', 'ffmpeg']) {
        await page.selectOption('#expStrategy', strat);
        for (const tab of ['bat', 'sh', 'ps1', 'py', 'txt']) {
            await page.click(`[data-act="stab"][data-v="${tab}"]`);
            await page.waitForTimeout(60);
            const info = await page.evaluate(() => {
                const s = window.ClipForge.script();
                return { len: s.length, bad: /undefined|NaN|\[object/.test(s), head: s.split('\n')[0].slice(0, 40) };
            });
            const flag = info.bad ? '✗ BAD' : '✓';
            console.log(`  ${flag} ${strat}/${tab}  ${info.len}b  "${info.head}"`);
        }
    }

    console.log('\n== formats & options ==');
    await page.selectOption('#expStrategy', 'sections');
    await page.click('[data-act="stab"][data-v="bat"]');
    for (const f of ['mp4', 'mkv', 'webm', 'mp3', 'm4a', 'wav']) {
        await page.selectOption('#expFormat', f);
        await page.waitForTimeout(40);
        const ok = await page.evaluate(() => { const s = window.ClipForge.script(); return s.length > 500 && !/undefined/.test(s); });
        console.log(`  ${ok ? '✓' : '✗'} format ${f}`);
    }
    await page.selectOption('#expFormat', 'mp4');
    for (const id of ['optCookies', 'optSponsor', 'optSubs', 'optThumb', 'optVertical', 'optProxyOn']) {
        await page.check('#' + id);
    }
    await page.fill('#optProxy', 'http://127.0.0.1:8080');
    await page.waitForTimeout(150);
    await step('all options on', () => page.evaluate(() => {
        const s = window.ClipForge.script();
        return {
            len: s.length, cookies: /cookies-from-browser/.test(s), sponsor: /sponsorblock/.test(s),
            vertical: /boxblur/.test(s), proxy: /--proxy/.test(s), undef: /undefined/.test(s)
        };
    }));
    for (const id of ['optCookies', 'optSponsor', 'optSubs', 'optThumb', 'optVertical', 'optProxyOn']) await page.uncheck('#' + id);

    console.log('\n== naming template ==');
    await step('template render', async () => {
        await page.fill('#nameTpl', '{title}_{i}_{start}-{dur}');
        await page.waitForTimeout(200);
        return page.evaluate(() => window.ClipForge.jobs()[0].items.slice(0, 3).map(i => i.name));
    });
    await page.fill('#nameTpl', '{vi}_{i}_{name}');

    console.log('\n== persistence ==');
    await step('save + reload restores', async () => {
        const before = await page.evaluate(() => { window.ClipForge.save(); return window.ClipForge.active().clips.length; });
        await page.reload();
        await page.waitForTimeout(900);
        await openAll();
        const after = await page.evaluate(() => window.ClipForge.active() ? window.ClipForge.active().clips.length : -1);
        return { before, after, match: before === after };
    });

    console.log('\n== timeline pointer interaction ==');
    await page.evaluate(() => document.getElementById('laneClips').scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(250);
    await step('drag a clip block', async () => {
        const box = await page.evaluate(() => {
            const b = document.querySelector('#clipLayer .cblk');
            if (!b) return null;
            const r = b.getBoundingClientRect();
            return { x: r.x + r.width / 2, y: r.y + r.height / 2, id: b.dataset.clip };
        });
        if (!box) return 'no clip block rendered';
        const before = await page.evaluate(id => { const c = window.ClipForge.active().clips.find(x => x.id === id); return c.start; }, box.id);
        await page.mouse.move(box.x, box.y);
        await page.mouse.down();
        await page.mouse.move(box.x + 90, box.y, { steps: 8 });
        await page.mouse.up();
        await page.waitForTimeout(150);
        const after = await page.evaluate(id => { const c = window.ClipForge.active().clips.find(x => x.id === id); return c ? c.start : null; }, box.id);
        return { before, after, moved: after !== before };
    });
    await step('click empty track seeks', async () => {
        await page.evaluate(() => document.getElementById('laneClips').scrollIntoView({ block: 'center' }));
        await page.waitForTimeout(150);
        const r = await page.evaluate(() => { const l = document.getElementById('laneClips').getBoundingClientRect(); return { x: l.x, y: l.y, w: l.width, h: l.height }; });
        await page.mouse.click(r.x + r.w * 0.92, r.y + r.h / 2);
        await page.waitForTimeout(120);
        return page.evaluate(() => document.getElementById('curTime').textContent);
    });
    await step('zoom in / fit', async () => {
        await page.click('[data-act="zoom"][data-v="1"]');
        await page.click('[data-act="zoom"][data-v="1"]');
        const z = await page.evaluate(() => document.getElementById('zoomLbl').textContent);
        await page.click('[data-act="zoom"][data-v="0"]');
        return z + ' -> ' + await page.evaluate(() => document.getElementById('zoomLbl').textContent);
    });

    console.log('\n== modals ==');
    for (const act of ['openHelp', 'openApiKey', 'openProject', 'openBulk', 'openBulkEdit', 'openDesc', 'manualDur']) {
        await page.click(`[data-act="${act}"]`).catch(() => { });
        await page.waitForTimeout(120);
        const open = await page.evaluate(() => document.querySelectorAll('.mback').length);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(80);
        const closed = await page.evaluate(() => document.querySelectorAll('.mback').length);
        console.log(`  ${open === 1 && closed === 0 ? '✓' : '✗'} ${act} (open=${open} closed=${closed})`);
    }

    console.log('\n== validation panel ==');
    await step('overlaps detected + fixed', async () => {
        await page.evaluate(() => {
            const v = window.ClipForge.active();
            v.clips = [{ id: 'a', start: 0, end: 50, name: '', note: '', on: true },
            { id: 'b', start: 20, end: 70, name: '', note: '', on: true },
            { id: 'c', start: 100, end: 100.2, name: '', note: '', on: true }];
            window.ClipForge.render();
        });
        await page.waitForTimeout(150);
        const notes = await page.evaluate(() => document.querySelectorAll('#validBox .note').length);
        await page.click('[data-act="fixOverlap"]');
        await page.click('[data-act="delTiny"]');
        await page.waitForTimeout(150);
        return { notesShown: notes, clipsAfter: await page.evaluate(() => window.ClipForge.active().clips.map(c => [c.start, c.end])) };
    });

    console.log('\n== bulk edit ==');
    await step('shift + pad', async () => {
        await page.click('[data-act="openBulkEdit"]');
        await page.waitForTimeout(120);
        await page.fill('#bkShift', '5');
        await page.fill('#bkPad', '1');
        await page.click('[data-act="bkApply"]');
        await page.waitForTimeout(150);
        return page.evaluate(() => window.ClipForge.active().clips.map(c => [c.start, c.end]));
    });

    console.log('\n== multi-video project ==');
    await step('two videos in one script', async () => {
        await page.evaluate(() => {
            const v = window.ClipForge.addYouTube('ABCDEFGHIJK', { quiet: true, noFetch: true, noSelect: true });
            v.duration = 300; v.title = 'Second Video';
            v.clips = [{ id: 'x1', start: 10, end: 40, name: 'a', note: '', on: true },
            { id: 'x2', start: 100, end: 130, name: 'b', note: '', on: true }];
            window.ClipForge.render();
        });
        await page.waitForTimeout(200);
        return page.evaluate(() => {
            const j = window.ClipForge.jobs();
            return { videos: j.length, clips: j.reduce((a, x) => a + x.items.length, 0), scriptHasBoth: /ABCDEFGHIJK/.test(window.ClipForge.script()) && /dQw4w9WgXcQ/.test(window.ClipForge.script()) };
        });
    });


    console.log('\n== LOCAL FILE: record a real video in-page and load it ==');
    await step('record + load webm', async () => {
        await page.evaluate(async () => {
            const cv = document.createElement('canvas'); cv.width = 320; cv.height = 180;
            const g = cv.getContext('2d');
            const stream = cv.captureStream(25);
            try {
                const AC = window.AudioContext || window.webkitAudioContext;
                const ac = new AC(); await ac.resume();
                const osc = ac.createOscillator(); const gain = ac.createGain();
                osc.frequency.value = 440;
                gain.gain.setValueAtTime(0.3, ac.currentTime);
                gain.gain.setValueAtTime(0.0, ac.currentTime + 2.0);   // silent gap
                gain.gain.setValueAtTime(0.3, ac.currentTime + 3.6);
                const dst = ac.createMediaStreamDestination();
                osc.connect(gain); gain.connect(dst); osc.start();
                dst.stream.getAudioTracks().forEach(t => stream.addTrack(t));
            } catch (e) { }
            const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
            const chunks = [];
            rec.ondataavailable = e => chunks.push(e.data);
            const done = new Promise(r => rec.onstop = r);
            rec.start();
            const t0 = performance.now();
            await new Promise(res => {
                function draw() {
                    const t = (performance.now() - t0) / 1000;
                    const c = t < 1.5 ? '#dc1e1e' : t < 3.0 ? '#1e3cdc' : t < 4.5 ? '#1ec850' : '#f0f0f0';
                    g.fillStyle = c; g.fillRect(0, 0, 320, 180);
                    g.fillStyle = '#000'; g.font = '20px sans-serif'; g.fillText(t.toFixed(2), 10, 30);
                    if (t >= 6) { res(); return; }
                    requestAnimationFrame(draw);
                }
                draw();
            });
            rec.stop(); await done;
            const blob = new Blob(chunks, { type: 'video/webm' });
            window.__testFile = new File([blob], 'studio_test_take01.webm', { type: 'video/webm' });
        });
        return page.evaluate(() => {
            window.ClipForge.addLocalFile(window.__testFile);
            return { size: window.__testFile.size, kind: window.ClipForge.active().kind };
        });
    });
    await page.waitForTimeout(2500);
    await step('duration read from the file', () => page.evaluate(() => window.ClipForge.active().duration));
    await step('local tools unlocked', () => page.evaluate(() => ({
        detect: !document.getElementById('detectCtrls').classList.contains('hide'),
        silence: !document.getElementById('silCtrls').classList.contains('hide'),
        framePrev: !document.getElementById('framePrev').classList.contains('hide')
    })));
    await page.waitForTimeout(3500);
    await step('filmstrip frames built', () => page.evaluate(() => document.querySelectorAll('#fsStrip .fsf').length));

    await step('visual scene detection', async () => {
        await openAll();
        await page.fill('#minGap', '0.5');
        await page.click('[data-act="startDetect"]');
        await page.waitForFunction(() => document.getElementById('detectBtn').disabled === false, { timeout: 120000 });
        return page.evaluate(() => ({
            clips: window.ClipForge.active().clips.length,
            bounds: window.ClipForge.active().clips.map(c => +c.start.toFixed(2)),
            status: document.getElementById('detectStatus').textContent
        }));
    });

    await step('audio silence detection', async () => {
        await page.click('[data-act="analyzeAudio"]');
        await page.waitForFunction(() => document.getElementById('audioBtn').disabled === false, { timeout: 120000 });
        return page.evaluate(() => ({
            clips: window.ClipForge.active().clips.map(c => [+c.start.toFixed(2), +c.end.toFixed(2)]),
            waveShown: !document.getElementById('waveCanvas').classList.contains('hide')
        }));
    });

    await step('local file exports ffmpeg commands', async () => {
        await page.selectOption('#expStrategy', 'ffmpeg');
        await page.click('[data-act="stab"][data-v="sh"]');
        await page.waitForTimeout(150);
        return page.evaluate(() => {
            const s = window.ClipForge.script();
            return { hasFile: s.includes('studio_test_take01.webm'), hasFfmpeg: /ffmpeg -hide_banner/.test(s), undef: /undefined/.test(s) };
        });
    });


    console.log('\n== console errors ==');
    const real = errors.filter(e => !/ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e));
    if (errors.length !== real.length) console.log(`  (${errors.length - real.length} network failures ignored — offline sandbox)`);
    console.log(real.length ? real.slice(0, 25).map(e => '  ✗ ' + e.slice(0, 220)).join('\n') : '  ✓ none');

    await browser.close();
})();
