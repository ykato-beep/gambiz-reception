/*
 * 受付画面の自動ブラウザテスト（Playwright）
 *   node e2e/run.js [chromium] [webkit]      … 引数なしは chromium のみ
 * 通信なしの見本モード（?demo=1）で画面だけを検証する。API やスプレッドシートには接続しない。
 * 結果は e2e/out/results-<engine>.json と画面写真（e2e/out/<engine>/）に出す。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const pw = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.txt': 'text/plain' };
const UA_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const UA_IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const UA_AND = 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
const UA_ANDT = 'Mozilla/5.0 (Linux; Android 15; Pixel Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const DEVICES = [
  { id: 'iphone-se', label: 'iPhone SE 相当（小型）', w: 375, h: 667, dpr: 2, ua: UA_IOS, touch: true },
  { id: 'iphone-std', label: 'iPhone 標準（393×852）', w: 393, h: 852, dpr: 3, ua: UA_IOS, touch: true },
  { id: 'iphone-max', label: 'iPhone 大型（430×932）', w: 430, h: 932, dpr: 3, ua: UA_IOS, touch: true },
  { id: 'android-std', label: 'Android 標準（412×915）', w: 412, h: 915, dpr: 2.625, ua: UA_AND, touch: true },
  { id: 'android-small', label: 'Android 小型（360×640）', w: 360, h: 640, dpr: 3, ua: UA_AND, touch: true },
  { id: 'ipad', label: 'タブレット iPad（810×1080）', w: 810, h: 1080, dpr: 2, ua: UA_IPAD, touch: true },
  { id: 'android-tab', label: 'タブレット Android（800×1280）', w: 800, h: 1280, dpr: 2, ua: UA_ANDT, touch: true },
  { id: 'pc', label: 'PC（1366×768）', w: 1366, h: 768, dpr: 1, ua: null, touch: false },
  { id: 'pc-wide', label: 'PC（1920×1080）', w: 1920, h: 1080, dpr: 1, ua: null, touch: false }
];

function serve() {
  return new Promise(ok => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(ROOT, path.normalize(p));
      if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(buf);
      });
    }).listen(0, '127.0.0.1', () => ok({ srv, base: 'http://127.0.0.1:' + srv.address().port }));
  });
}

/* ---- ページ内で実行する検査 ---- */
// 表示中の画面について、はみ出し・文字切れ・ボタンの大きさ・スクロールで届くか を調べる
function auditInPage() {
  const problems = [];
  const vw = window.innerWidth, vh = window.innerHeight;
  const stage = document.getElementById('stage'), panel = document.getElementById('panel');
  const view = [...document.querySelectorAll('.view')].find(v => !v.hidden);
  stage.scrollTop = 0;
  const pr = panel.getBoundingClientRect();
  // 横に動かせてしまうか（発光の飾りは枠外に出てよいが、画面が横へずれてはいけない）
  stage.scrollLeft = 40; window.scrollTo(40, 0);
  if (stage.scrollLeft > 0 || window.scrollX > 0 || document.documentElement.scrollWidth > vw + 1) problems.push('横方向へ画面がずれる');
  stage.scrollLeft = 0; window.scrollTo(0, 0);
  if (pr.left < -0.5 || pr.right > vw + 0.5) problems.push('パネルが画面の左右からはみ出している');
  if (pr.top < -0.5) problems.push('パネルの上端が画面外（スクロールしても届かない）');
  const scrollable = stage.scrollHeight > stage.clientHeight + 1;
  if (pr.bottom > vh + 0.5 && !scrollable) problems.push('パネルが画面より高いのにスクロールできない');
  const els = [...view.querySelectorAll('h1,h2,p,button,input,.cap,.who .nm,.who .q')].filter(e => e.offsetParent !== null && (e.textContent.trim() || e.tagName === 'INPUT'));
  for (const e of els) {
    const r = e.getBoundingClientRect(), name = (e.id || e.className || e.tagName).toString().slice(0, 24);
    if (r.left < pr.left - 0.5 || r.right > pr.right + 0.5) problems.push('要素がパネルの外へはみ出し: ' + name);
    const label = e.tagName === 'BUTTON' ? (e.querySelector('.t') || e) : e; // ボタンは光の飾りを内側で切り取っているので、文字の部分だけを見る
    if (e.tagName !== 'INPUT' && (e.tagName === 'BUTTON' ? label.getBoundingClientRect().right > r.right + 0.5 || label.getBoundingClientRect().left < r.left - 0.5 : e.scrollWidth > e.clientWidth + 1)) problems.push('文字が切れている: ' + name);
    const op = Number(getComputedStyle(e).opacity);
    if (op < 0.98) problems.push('表示されていない（不透明度 ' + op + '）: ' + name);
    if (e.tagName === 'BUTTON' && !e.classList.contains('back') && (r.height < 44 || r.width < 44)) problems.push('ボタンが小さい（' + Math.round(r.width) + '×' + Math.round(r.height) + '）: ' + name);
    if (e.tagName === 'INPUT' && parseFloat(getComputedStyle(e).fontSize) < 16) problems.push('入力欄の文字が16px未満（iOSで自動拡大が起きる）: ' + name);
  }
  // いちばん下の操作部品まで届くか
  const last = [...view.querySelectorAll('button,input')].filter(e => e.offsetParent !== null).pop();
  if (last) {
    stage.scrollTop = stage.scrollHeight;
    const r = last.getBoundingClientRect();
    if (r.bottom > vh + 0.5 || r.top < -0.5) problems.push('最後の操作部品に届かない: ' + (last.id || last.className));
    stage.scrollTop = 0;
  }
  return { view: view.id, problems, panel: [Math.round(pr.left), Math.round(pr.top), Math.round(pr.width), Math.round(pr.height)], scrollable, vw, vh };
}

async function settle(page, viewId, ms) {
  await page.waitForFunction(id => {
    const v = document.getElementById(id);
    if (!v || v.hidden) return false;
    if (Number(getComputedStyle(document.getElementById('panel')).opacity) < 0.99) return false;
    return [...v.querySelectorAll('.in, .thanks, .msg, .note, .pair .btn, .who .ch, .who .q, .co')].filter(e => e.offsetParent !== null).every(e => Number(getComputedStyle(e).opacity) > 0.98);
  }, viewId, { timeout: ms || 12000 });
  await page.waitForTimeout(250);
}
const audit = page => page.evaluate(auditInPage);
const fpsOver = (page, ms) => page.evaluate(ms => new Promise(res => { let n = 0, worst = 0, last = performance.now(); const t0 = last; const f = t => { n++; worst = Math.max(worst, t - last); last = t; if (t - t0 < ms) requestAnimationFrame(f); else res({ fps: Math.round(n / (ms / 1000)), worstMs: Math.round(worst) }); }; requestAnimationFrame(f); }), ms);
const bgInfo = page => page.evaluate(() => ({ tier: window.GBG.tier, level: window.GBG.level, why: document.documentElement.dataset.bg || '' }));
async function submitName(page, text) { await page.fill('#reading', text); await page.click('#v-name .btn'); }

async function newPage(browser, engine, dev, landscape, init) {
  const o = { viewport: landscape ? { width: dev.h, height: dev.w } : { width: dev.w, height: dev.h }, deviceScaleFactor: dev.dpr, hasTouch: dev.touch, locale: 'ja-JP' };
  if (dev.ua) o.userAgent = dev.ua;
  if (dev.touch) o.isMobile = true;
  const ctx = await browser.newContext(o);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message).slice(0, 160)));
  if (init) await page.addInitScript(init);
  return { ctx, page, errors };
}

/* ---- 1. 端末別の表示 ---- */
async function layoutRun(browser, engine, dev, landscape, base, shots) {
  const tag = dev.id + (landscape ? '-landscape' : '-portrait');
  const r = { device: dev.label, orientation: landscape ? '横' : '縦', views: [], problems: [] };
  const { ctx, page, errors } = await newPage(browser, engine, dev, landscape);
  const shot = async name => { if (shots) await page.screenshot({ path: path.join(OUT, engine, tag + '-' + name + '.png'), scale: 'css' }); };
  const check = async id => { await settle(page, id); const a = await audit(page); r.views.push(a.view + (a.scrollable ? '（縦スクロール可）' : '')); a.problems.forEach(p => r.problems.push(a.view + ': ' + p)); return a; };
  try {
    await page.goto(base + '/?demo=1');
    const a0 = await check('v-name'); await shot('1-name');
    r.bg = await bgInfo(page); r.idle = await fpsOver(page, 1500);
    await submitName(page, 'やまだ たろう');
    await check('v-confirm'); await shot('2-confirm');
    await page.click('#yes');
    await check('v-done'); await shot('3-done');
    await page.goto(base + '/?demo=1'); await settle(page, 'v-name');
    await submitName(page, 'たなかけん');
    await check('v-choose'); await shot('4-choose');
    await page.click('#none');
    await check('v-register'); await shot('5-register');
    await page.goto(base + '/?demo=1'); await settle(page, 'v-name');
    await submitName(page, 'だれでもない');
    await check('v-notfound');
    await page.click('#retry');
    const a1 = await check('v-name');
    if (Math.abs(a1.panel[1] - a0.panel[1]) > 2 || Math.abs(a1.panel[3] - a0.panel[3]) > 2) r.problems.push('入力画面へ戻ったときの配置が最初と違う');
    await page.goto(base + '/'); // 受付キーなし → 無効表示（通信しない）
    await check('v-invalid');
    // 回転しても崩れないか
    if (dev.touch) {
      const v = page.viewportSize();
      await page.setViewportSize({ width: v.height, height: v.width }); await page.waitForTimeout(500);
      const a = await audit(page); a.problems.forEach(p => r.problems.push('回転後 ' + a.view + ': ' + p));
      await page.setViewportSize(v);
    }
  } catch (e) { r.problems.push('テストが途中で止まった: ' + String(e.message).split('\n')[0].slice(0, 140)); try { await shot('error'); } catch (x) { /* 撮れなくてもよい */ } }
  errors.forEach(e => r.problems.push('スクリプトエラー: ' + e));
  await ctx.close();
  return r;
}

/* ---- 2. キーボード表示 ---- */
// iOS の動き（表示領域だけが縮む）を再現するための差し替え。実機 Safari そのものではない。
const FAKE_VV = () => {
  const hs = { resize: [], scroll: [] };
  let kbPx = 0;
  const vv = { get height() { return window.innerHeight - kbPx; }, get width() { return window.innerWidth; }, offsetTop: 0, offsetLeft: 0, scale: 1, pageTop: 0, pageLeft: 0, addEventListener: (t, f) => { (hs[t] = hs[t] || []).push(f); }, removeEventListener: () => {} };
  Object.defineProperty(window, 'visualViewport', { get: () => vv, configurable: true });
  window.__kb = px => { kbPx = px; hs.resize.forEach(f => f()); };
};
const visibleIn = (page, sel, h) => page.evaluate(([sel, h]) => { const e = document.querySelector(sel); if (!e || e.offsetParent === null) return { ok: false, why: '表示されていない' }; const r = e.getBoundingClientRect(); return { ok: r.top >= -0.5 && r.bottom <= h + 0.5, top: Math.round(r.top), bottom: Math.round(r.bottom), limit: h }; }, [sel, h]);

async function keyboardRun(browser, engine, dev, base, shots) {
  const r = { device: dev.label, android: {}, ios: {}, problems: [] };
  const kb = Math.round(dev.h * 0.42); // キーボード＋候補欄の高さの想定
  // (A) Android の動き：レイアウトの高さそのものが縮む
  {
    const { ctx, page, errors } = await newPage(browser, engine, dev, false);
    try {
      await page.goto(base + '/?demo=1'); await settle(page, 'v-name');
      const before = await audit(page);
      await page.tap('#reading');
      await page.setViewportSize({ width: dev.w, height: dev.h - kb }); await page.waitForTimeout(700);
      const h = dev.h - kb;
      r.android.input = await visibleIn(page, '#reading', h);
      r.android.button = await visibleIn(page, '#v-name .btn', h);
      r.android.zoom = await page.evaluate(() => (window.visualViewport ? window.visualViewport.scale : 1));
      if (shots) await page.screenshot({ path: path.join(OUT, engine, dev.id + '-kb-android.png'), scale: 'css' });
      if (!r.android.input.ok) r.problems.push('Android型: 入力欄が隠れる ' + JSON.stringify(r.android.input));
      if (!r.android.button.ok) r.problems.push('Android型: 送信ボタンが隠れる ' + JSON.stringify(r.android.button));
      if (Math.abs(r.android.zoom - 1) > 0.01) r.problems.push('Android型: 画面が拡大された（' + r.android.zoom + '倍）');
      await page.keyboard.type('やまだたろう');
      const over = await page.evaluate(() => { const s = document.getElementById('stage'); s.scrollLeft = 40; const o = s.scrollLeft > 0; s.scrollLeft = 0; return o; });
      if (over) r.problems.push('Android型: キーボード表示中に横へはみ出す');
      // キーボードを閉じる → 元の配置へ戻る
      await page.evaluate(() => document.activeElement.blur());
      await page.setViewportSize({ width: dev.w, height: dev.h }); await page.waitForTimeout(700);
      const after = await audit(page);
      r.android.restored = Math.abs(after.panel[1] - before.panel[1]) <= 2 && Math.abs(after.panel[3] - before.panel[3]) <= 2 && !(await page.evaluate(() => document.documentElement.classList.contains('kb')));
      if (!r.android.restored) r.problems.push('Android型: キーボードを閉じても元の配置に戻らない ' + JSON.stringify([before.panel, after.panel]));
      after.problems.forEach(p => r.problems.push('Android型・復帰後: ' + p));
      // キーボードを出したまま送信ボタンを押せる
      await page.tap('#reading'); await page.setViewportSize({ width: dev.w, height: dev.h - kb }); await page.waitForTimeout(500);
      await page.tap('#v-name .btn');
      await page.setViewportSize({ width: dev.w, height: dev.h });
      await settle(page, 'v-confirm');
      r.android.submit = true;
      // 登録フォームのいちばん下の入力欄
      await page.tap('#no'); await settle(page, 'v-register');
      await page.tap('#r-email'); await page.setViewportSize({ width: dev.w, height: dev.h - kb }); await page.waitForTimeout(700);
      r.android.email = await visibleIn(page, '#r-email', h);
      if (!r.android.email.ok) r.problems.push('Android型: 登録フォームのメール欄が隠れる ' + JSON.stringify(r.android.email));
      const reach = await page.evaluate(h => { const s = document.getElementById('stage'); s.scrollTop = s.scrollHeight; const b = document.querySelector('#v-register .btn.gold').getBoundingClientRect(); return b.bottom <= h + 0.5 && b.top >= -0.5; }, h);
      if (!reach) r.problems.push('Android型: 登録フォームの送信ボタンにスクロールしても届かない');
    } catch (e) { r.problems.push('Android型: テストが止まった: ' + String(e.message).split('\n')[0].slice(0, 140)); }
    errors.forEach(e => r.problems.push('スクリプトエラー: ' + e));
    await ctx.close();
  }
  // (B) iOS の動き：レイアウトの高さは変わらず、見えている領域（visualViewport）だけが縮む
  {
    const { ctx, page, errors } = await newPage(browser, engine, dev, false, FAKE_VV);
    try {
      await page.goto(base + '/?demo=1'); await settle(page, 'v-name');
      const before = await audit(page);
      await page.tap('#reading');
      await page.evaluate(px => window.__kb(px), kb); await page.waitForTimeout(700);
      const h = dev.h - kb;
      r.ios.input = await visibleIn(page, '#reading', h);
      r.ios.button = await visibleIn(page, '#v-name .btn', h);
      r.ios.stageHeight = await page.evaluate(() => Math.round(document.getElementById('stage').getBoundingClientRect().height));
      if (shots) await page.screenshot({ path: path.join(OUT, engine, dev.id + '-kb-ios.png'), scale: 'css' });
      if (!r.ios.input.ok) r.problems.push('iOS型: 入力欄が隠れる ' + JSON.stringify(r.ios.input));
      if (!r.ios.button.ok) r.problems.push('iOS型: 送信ボタンが隠れる ' + JSON.stringify(r.ios.button));
      if (Math.abs(r.ios.stageHeight - h) > 1) r.problems.push('iOS型: 表示領域の高さに追従していない（' + r.ios.stageHeight + ' / ' + h + '）');
      await page.evaluate(() => { document.activeElement.blur(); window.__kb(0); }); await page.waitForTimeout(700);
      const after = await audit(page);
      r.ios.restored = Math.abs(after.panel[1] - before.panel[1]) <= 2 && Math.abs(after.panel[3] - before.panel[3]) <= 2;
      if (!r.ios.restored) r.problems.push('iOS型: キーボードを閉じても元の配置に戻らない ' + JSON.stringify([before.panel, after.panel]));
      after.problems.forEach(p => r.problems.push('iOS型・復帰後: ' + p));
    } catch (e) { r.problems.push('iOS型: テストが止まった: ' + String(e.message).split('\n')[0].slice(0, 140)); }
    errors.forEach(e => r.problems.push('スクリプトエラー: ' + e));
    await ctx.close();
  }
  return r;
}

/* ---- 3. 縮退動作と性能 ---- */
async function flowToDone(page, base, query) {
  await page.goto(base + '/?demo=1' + (query || ''));
  await settle(page, 'v-name');
  const t0 = Date.now();
  await submitName(page, 'やまだたろう');
  await settle(page, 'v-confirm');
  await page.click('#yes');
  await settle(page, 'v-done', 15000);
  return Date.now() - t0;
}
async function robustRun(browser, engine, base) {
  const dev = DEVICES[1], out = [];
  const cases = [
    ['WebGL が使えない端末', () => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t) { return /webgl/.test(t) ? null : g.apply(this, arguments); }; }, null],
    ['アニメーション機能（Web Animations）がない端末', () => { delete Element.prototype.animate; }, null],
    ['「視差効果を減らす」設定（prefers-reduced-motion）', null, 'reduce'],
    ['写真の読み込みに失敗（通信不良）', '__block_images__', null]
  ];
  for (const [name, init, motion] of cases) {
    const r = { case: name, ok: false };
    const { ctx, page, errors } = await newPage(browser, engine, dev, false, typeof init === 'function' ? init : null);
    try {
      if (motion) await page.emulateMedia({ reducedMotion: motion });
      if (init === '__block_images__') await page.route('**/assets/*', route => route.abort());
      r.ms = await flowToDone(page, base);
      r.bg = await bgInfo(page);
      const a = await audit(page);
      r.ok = a.view === 'v-done' && !a.problems.length && !errors.length;
      r.problems = a.problems.concat(errors);
    } catch (e) { r.problems = ['止まった: ' + String(e.message).split('\n')[0].slice(0, 140)]; }
    await ctx.close();
    out.push(r);
  }
  return out;
}
async function perfRun(browser, engine, base) {
  const out = [];
  const rates = engine === 'chromium' ? [1, 4, 6] : [1];
  for (const rate of rates) {
    const dev = DEVICES[3], r = { cpuThrottle: rate + '倍遅い CPU', device: dev.label };
    const { ctx, page } = await newPage(browser, engine, dev, false);
    try {
      if (rate > 1) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate }); }
      await page.goto(base + '/?demo=1'); await settle(page, 'v-name', 20000);
      r.renderer = await page.evaluate(() => { try { const g = document.createElement('canvas').getContext('webgl'); const e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL).slice(0, 70) : 'unknown'; } catch (x) { return 'none'; } });
      r.start = await bgInfo(page);
      await page.waitForTimeout(3500);
      r.idle = await fpsOver(page, 3000);
      // 入力中：1文字ごとの「キー入力 → 画面に反映されるまで」
      await page.tap('#reading');
      r.inputDelayMs = await page.evaluate(() => new Promise(res => { const i = document.getElementById('reading'), d = []; let n = 0; const step = () => { const t = performance.now(); i.value += 'あ'; i.dispatchEvent(new Event('input', { bubbles: true })); requestAnimationFrame(() => { d.push(performance.now() - t); if (++n < 12) setTimeout(step, 80); else res(Math.round(d.sort((a, b) => a - b)[Math.floor(d.length * 0.9)])); }); }; step(); }));
      const typing = fpsOver(page, 2500);
      await page.keyboard.type('やまだたろう', { delay: 120 });
      r.typing = await typing;
      await page.fill('#reading', 'やまだたろう');
      const trans = fpsOver(page, 3000);
      const t0 = Date.now();
      await page.click('#v-name .btn');
      await page.waitForFunction(() => !document.getElementById('v-confirm').hidden, null, { timeout: 15000 });
      r.tapToNextScreenMs = Date.now() - t0;
      r.transition = await trans;
      await settle(page, 'v-confirm', 15000);
      await page.click('#yes'); await settle(page, 'v-done', 20000);
      r.end = await bgInfo(page);
      r.completed = true;
    } catch (e) { r.error = String(e.message).split('\n')[0].slice(0, 140); }
    await ctx.close();
    out.push(r);
  }
  return out;
}

(async () => {
  const engines = process.argv.slice(2).filter(a => /^(chromium|webkit)$/.test(a));
  if (!engines.length) engines.push('chromium');
  const shots = !process.argv.includes('--no-shots');
  const onlyArg = process.argv.find(a => a.startsWith('--only='));
  const only = onlyArg ? onlyArg.slice(7).split(',') : ['layout', 'keyboard', 'robust', 'perf'];
  const suffix = onlyArg ? '-' + only.join('+') : '';
  const { srv, base } = await serve();
  let failed = 0;
  for (const engine of engines) {
    fs.mkdirSync(path.join(OUT, engine), { recursive: true });
    const res = { engine, at: new Date().toISOString(), platform: process.platform, layout: [], keyboard: [], robust: [], perf: [] };
    let browser;
    try { browser = await pw[engine].launch(); } catch (e) { res.launchError = String(e.message).split('\n')[0]; fs.writeFileSync(path.join(OUT, 'results-' + engine + suffix + '.json'), JSON.stringify(res, null, 1)); console.log(engine + ': 起動できません → ' + res.launchError); failed++; continue; }
    res.version = browser.version();
    if (only.includes('layout')) for (const dev of DEVICES) {
      for (const landscape of dev.touch ? [false, true] : [false]) {
        const r = await layoutRun(browser, engine, dev, landscape, base, shots);
        res.layout.push(r);
        console.log(engine + ' 表示 ' + r.device + ' ' + r.orientation + ' : ' + (r.problems.length ? 'NG ' + JSON.stringify(r.problems) : 'OK') + '  [' + (r.bg ? r.bg.tier + ' L' + r.bg.level : '-') + ', ' + (r.idle ? r.idle.fps + 'fps' : '-') + ']');
      }
    }
    if (only.includes('keyboard')) for (const dev of DEVICES.filter(d => d.touch)) {
      const r = await keyboardRun(browser, engine, dev, base, shots);
      res.keyboard.push(r);
      console.log(engine + ' キーボード ' + r.device + ' : ' + (r.problems.length ? 'NG ' + JSON.stringify(r.problems) : 'OK'));
    }
    if (only.includes('robust')) res.robust = await robustRun(browser, engine, base);
    res.robust.forEach(r => console.log(engine + ' 縮退 ' + r.case + ' : ' + (r.ok ? 'OK' : 'NG ' + JSON.stringify(r.problems)) + '  [' + (r.bg ? r.bg.tier + ':' + r.bg.why : '-') + ', 完了まで ' + r.ms + 'ms]'));
    if (only.includes('perf')) res.perf = await perfRun(browser, engine, base);
    res.perf.forEach(r => console.log(engine + ' 性能 ' + JSON.stringify(r)));
    await browser.close();
    const bad = res.layout.concat(res.keyboard).filter(r => r.problems.length).length + res.robust.filter(r => !r.ok).length + res.perf.filter(r => !r.completed).length;
    res.failedGroups = bad; failed += bad;
    fs.writeFileSync(path.join(OUT, 'results-' + engine + suffix + '.json'), JSON.stringify(res, null, 1));
    console.log(engine + ' (' + res.version + '): 問題のあった組 ' + bad);
  }
  srv.close();
  process.exit(failed ? 1 : 0);
})();
