/* app.js — 受付画面の動作（入力 → 照合 → 確認 → 受付完了）と演出の進行 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var html = document.documentElement, BG = window.GBG;
  var q = new URLSearchParams(location.search);
  var KEY = q.get('k') || '';
  var API = (window.GAMBIZ_CONFIG && window.GAMBIZ_CONFIG.api) || '';
  var DEMO = q.has('demo') || !API;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var panel = $('panel'), scene = $('scene'), current = 'v-name', busy = false;
  var typedReading = '', candidates = [], chosen = null, rid = null;

  /* ---------- 端末ごとの識別子（頻度制限用。個人情報ではない乱数） ---------- */
  function rand(n) {
    var a = new Uint8Array(n), s = '', c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    (window.crypto || window.msCrypto).getRandomValues(a);
    for (var i = 0; i < n; i++) s += c[a[i] % c.length];
    return s;
  }
  var cid;
  try { cid = localStorage.getItem('gbz_cid') || rand(16); localStorage.setItem('gbz_cid', cid); } catch (e) { cid = rand(16); }

  /* ---------- 通信 ---------- */
  function post(body, tries) {
    body.k = KEY; body.cid = cid;
    if (DEMO) return demo(body);
    var ctl = new AbortController(), timer = setTimeout(function () { ctl.abort(); }, 20000);
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow', signal: ctl.signal, cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .catch(function (e) {
        // 受付・登録は request_id で二重処理を防いでいるので、同じ内容をそのまま送り直せる
        if (tries > 0) return new Promise(function (ok) { setTimeout(ok, 900); }).then(function () { return post(body, tries - 1); });
        return { ok: false, code: 'NETWORK', message: '通信できませんでした。電波の良い場所で、もう一度お試しください。' };
      })
      .finally(function () { clearTimeout(timer); });
  }

  // 接続先が未設定のとき、または ?demo のときだけ使う見本データ（実在の人物ではない）
  var demoDone = {};
  function demo(b) {
    var people = { 'やまだたろう': ['山田 太郎'], 'さとうはなこ': ['佐藤 花子'], 'たなかけん': ['田中 健', '田中 賢'], 'すずきいちろう': ['鈴木 一郎', '鈴木 一郎'] };
    return new Promise(function (ok) {
      setTimeout(function () {
        if (b.action === 'hello') return ok({ ok: true, event: 'デモ', mode: 'DEMO' });
        if (b.action === 'lookup') {
          if (b.reading === 'えらー') return ok({ ok: false, code: 'NETWORK', message: '通信できませんでした。電波の良い場所で、もう一度お試しください。' });
          var hit = people[b.reading] || [];
          return ok({ ok: true, found: hit.length > 0, candidates: hit.map(function (n, i) { return { name: n, token: b.reading + i, company: i ? '株式会社ベータ' : '株式会社アルファ' }; }) });
        }
        if (b.action === 'checkin') { var st = demoDone[b.token] ? 'already' : 'ok'; demoDone[b.token] = 1; return ok({ ok: true, status: st }); }
        if (b.action === 'register') return ok({ ok: true, status: 'ok' });
        ok({ ok: false, code: 'ERROR', message: 'エラー' });
      }, 700);
    });
  }

  /* ---------- 文字の正規化（サーバー側でも同じ処理を行う） ---------- */
  function normReading(s) {
    s = String(s || '').normalize('NFKC').replace(/[\s　・.,、。]/g, '');
    return s.replace(/[ァ-ヶ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); });
  }

  /* ---------- 演出の部品 ---------- */
  function anim(el, frames, opt) {
    if (reduce || !el.animate) { var last = frames[frames.length - 1]; for (var k in last) if (k !== 'offset' && k !== 'easing') el.style[k] = last[k]; return Promise.resolve(); }
    opt.fill = opt.fill || 'both';
    var a = el.animate(frames, opt);
    var end = function () { if (a.playState === 'idle') return; try { a.finish(); a.commitStyles(); } catch (e) { /* 表示されていない要素 */ } a.cancel(); };
    // 画面が裏に回るなどして演出が止まっても、受付の進行は止めない（予定時間＋0.4秒で必ず先へ進む）
    return Promise.race([a.finished, new Promise(function (ok) { setTimeout(ok, (opt.duration || 0) + (opt.delay || 0) + 400); })]).then(end, end);
  }
  function stagger(view, base) {
    var list = view.querySelectorAll('.in'), i;
    for (i = 0; i < list.length; i++) {
      list[i].style.opacity = 0;
      anim(list[i], [{ opacity: 0, transform: 'translateY(22px) scale(.97)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
        { duration: 620, delay: (base || 0) + i * 85, easing: 'cubic-bezier(.16,.84,.3,1)' });
    }
    return (base || 0) + list.length * 85 + 400;
  }
  function ripple(btn, ev) {
    var r = btn.getBoundingClientRect(), s = document.createElement('span');
    s.className = 'rip';
    s.style.left = ((ev && ev.clientX ? ev.clientX : r.left + r.width / 2) - r.left) + 'px';
    s.style.top = ((ev && ev.clientY ? ev.clientY : r.top + r.height / 2) - r.top) + 'px';
    btn.appendChild(s);
    setTimeout(function () { s.remove(); }, 800);
    BG.centerOn(btn); BG.pulse('burst', .55, 1100); BG.pulse('flash', .22, 700);
  }
  function lap() { var l = $('lap'); l.classList.remove('go'); void l.offsetWidth; l.classList.add('go'); }
  function setBusy(btn, on) {
    busy = on;
    if (btn) btn.classList.toggle('busy', on);
    BG.set('energy', on ? .8 : .12);
  }
  function show(id) {
    var v = panel.querySelectorAll('.view'), i;
    for (i = 0; i < v.length; i++) v[i].hidden = v[i].id !== id;
    current = id;
  }

  /**
   * パネルを奥へ送る。通信を伴う操作では、送信と同時に呼ぶ（応答を待つあいだに退場を済ませ、待ち時間を縮める）。
   * 退場後、応答がまだなら「照合しています…」などの待機表示を出す。
   */
  var leaving = null;
  function leave(waitText) {
    if (leaving) return leaving;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    BG.centerOn(panel); BG.pulse('burst', .7, 1300); BG.hold(1400);
    $('wait-t').textContent = waitText || '';
    $('wait').classList.toggle('on', !!waitText);
    leaving = anim(panel, [{ transform: 'translateZ(0) rotateX(0)', opacity: 1, filter: 'blur(0)' }, { transform: 'translateZ(-560px) rotateX(16deg) translateY(-30px)', opacity: 0, filter: 'blur(5px)' }],
      { duration: 380, easing: 'cubic-bezier(.5,0,.85,.35)' }).then(function () { panel.style.pointerEvents = 'none'; });
    return leaving;
  }

  /** 次のパネルを手前から出す（まだ退場していなければ先に退場させる） */
  function go(id, prep, after) {
    return leave().then(function () {
      leaving = null;
      $('wait').classList.remove('on');
      panel.style.pointerEvents = '';
      show(id);
      if (prep) prep();
      $('stage').scrollTop = 0;
      lap();
      var d = stagger($(id), 160);
      var p = anim(panel, [{ transform: 'translateZ(320px) rotateX(-12deg) scale(1.06)', opacity: 0, filter: 'blur(8px)' }, { transform: 'none', opacity: 1, filter: 'blur(0)' }],
        { duration: 560, easing: 'cubic-bezier(.14,.9,.26,1)' });
      if (after) after(d);
      html.dataset.view = id; html.dataset.shownAt = String(Math.round(performance.now()));
      return p;
    });
  }

  /* ---------- STEP 1 ---------- */
  var input = $('reading');
  $('v-name').addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;
    var btn = this.querySelector('.btn'), raw = input.value, n = normReading(raw);
    $('e-name').textContent = '';
    if (!n) { $('e-name').textContent = 'お名前を入力してください。'; return; }
    if (!/^[ぁ-ゖー]{2,24}$/.test(n)) { $('e-name').textContent = 'ひらがなで入力してください（例：やまだたろう）'; shake(input.parentNode); return; }
    typedReading = n;
    ripple(btn, e.submitter ? null : null);
    setBusy(btn, true); leave('お名前を照合しています…');
    post({ action: 'lookup', reading: n }, 1).then(function (r) {
      setBusy(btn, false);
      if (!r.ok) return fail(r, 'e-name');
      candidates = r.candidates || [];
      if (!r.found) return go('v-notfound', function () { $('typed').textContent = n; });
      if (candidates.length === 1) return toConfirm(candidates[0]);
      go('v-choose', function () {
        var box = $('list'); box.textContent = '';
        candidates.forEach(function (c) {
          var b = document.createElement('button');
          b.type = 'button'; b.className = 'btn line in';
          b.appendChild(document.createTextNode(c.name + ' さん'));
          if (c.company) { var s = document.createElement('small'); s.textContent = c.company; b.appendChild(s); }
          b.addEventListener('click', function (ev) { if (busy) return; ripple(b, ev); toConfirm(c); });
          box.appendChild(b);
        });
      });
    });
  });
  function shake(el) { anim(el, [{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(0)' }], { duration: 320 }); }
  function fail(r, errId) {
    if (r.code === 'BAD_KEY' || r.code === 'NO_EVENT' || r.code === 'CONFIG') return invalid(r.message);
    // 元の画面へ戻して、エラーの内容を表示する
    go(current, function () { $(errId).textContent = r.message || 'エラーが発生しました。もう一度お試しください。'; });
  }
  function invalid(msg) {
    go('v-invalid', function () { if (msg) $('inv-p').textContent = msg + ' 解決しない場合は受付スタッフにお声がけください。'; });
  }

  /* ---------- STEP 2：「〇〇さんですか？」 ---------- */
  function toConfirm(c) {
    chosen = c; rid = rand(16);
    go('v-confirm', function () {
      var who = $('who'); who.textContent = '';
      var nm = document.createElement('span'); nm.className = 'nm';
      Array.from(c.name).forEach(function (ch) { var s = document.createElement('span'); s.className = 'ch'; s.textContent = ch; nm.appendChild(s); });
      var qs = document.createElement('span'); qs.className = 'q'; qs.textContent = 'さんですか？';
      who.appendChild(nm); who.appendChild(qs);
      $('who-co').textContent = c.company || '';
      $('e-confirm').textContent = '';
      $('who-co').style.opacity = 0;
      $('yes').style.opacity = 0; $('no').style.opacity = 0;
    }, function () {
      // 会社名・屋号 → フルネームの順に出す
      anim($('who-co'), [{ opacity: 0, transform: 'translateY(14px)', letterSpacing: '.4em', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', letterSpacing: '.08em', filter: 'blur(0)' }], { duration: 700, delay: 120, easing: 'cubic-bezier(.2,.8,.2,1)' });
      // 名前を一文字ずつ、立ち上がるように出す
      var chs = $('who').querySelectorAll('.ch'), i, base = 460;
      for (i = 0; i < chs.length; i++) {
        anim(chs[i], [
          { opacity: 0, transform: 'translateY(46px) rotateX(-95deg) scale(1.5)', filter: 'blur(10px)', color: '#ffe3a0' },
          { opacity: 1, transform: 'translateY(-6px) rotateX(12deg) scale(1.08)', filter: 'blur(0)', color: '#fff6dc', offset: .7 },
          { opacity: 1, transform: 'none', filter: 'blur(0)', color: '#ffffff' }
        ], { duration: 760, delay: base + i * 95, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
      var t = base + chs.length * 95 + 260;
      anim($('who').querySelector('.q'), [{ opacity: 0, letterSpacing: '.6em', filter: 'blur(6px)' }, { opacity: 1, letterSpacing: '.1em', filter: 'blur(0)' }], { duration: 700, delay: t, easing: 'ease-out' });
      setTimeout(function () { BG.centerOn($('who')); BG.pulse('flash', .3, 900); }, t);
      anim($('yes'), [{ opacity: 0, transform: 'translateX(-70px) rotateY(55deg) translateZ(-80px)' }, { opacity: 1, transform: 'none' }], { duration: 640, delay: t + 240, easing: 'cubic-bezier(.16,.9,.3,1)' });
      anim($('no'), [{ opacity: 0, transform: 'translateX(70px) rotateY(-55deg) translateZ(-80px)' }, { opacity: 1, transform: 'none' }], { duration: 640, delay: t + 340, easing: 'cubic-bezier(.16,.9,.3,1)' });
    });
  }
  $('yes').addEventListener('click', function (ev) {
    if (busy || !chosen) return;
    var btn = this;
    ripple(btn, ev); setBusy(btn, true); $('no').disabled = true; $('e-confirm').textContent = ''; leave('受付しています…');
    post({ action: 'checkin', token: chosen.token, rid: rid }, 2).then(function (r) {
      setBusy(btn, false); $('no').disabled = false;
      if (!r.ok) {
        if (r.code === 'EXPIRED') { go('v-name', function () { $('e-name').textContent = r.message; }); return; }
        return fail(r, 'e-confirm');
      }
      finish(r.status === 'already');
    });
  });
  $('no').addEventListener('click', function (ev) { if (busy) return; ripple(this, ev); toRegister(); });
  $('none').addEventListener('click', function (ev) { if (busy) return; ripple(this, ev); toRegister(); });
  $('toreg').addEventListener('click', function (ev) { if (busy) return; ripple(this, ev); toRegister(); });
  $('retry').addEventListener('click', function (ev) { if (busy) return; ripple(this, ev); go('v-name', function () { input.value = ''; }); });
  $('back').addEventListener('click', function () { if (busy) return; go('v-name'); });

  /* ---------- STEP 3-B：新規登録 ---------- */
  function toRegister() { rid = rand(16); go('v-register', function () { $('e-register').textContent = ''; }); }
  $('v-register').addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;
    var btn = this.querySelector('.btn.gold');
    var name = $('r-name').value.trim(), company = $('r-company').value.trim(), email = $('r-email').value.trim().toLowerCase();
    var err = $('e-register'); err.textContent = '';
    if (name.length < 2) { err.textContent = 'お名前を入力してください。'; shake($('r-name').parentNode); return; }
    if (!company) { err.textContent = '会社名を入力してください。'; shake($('r-company').parentNode); return; }
    if (!/^[a-z0-9._%+\-]+@[a-z0-9\-]+(\.[a-z0-9\-]+)+$/.test(email)) { err.textContent = 'メールアドレスの形式をご確認ください。'; shake($('r-email').parentNode); return; }
    ripple(btn); setBusy(btn, true); leave('登録しています…');
    post({ action: 'register', name: name, company: company, email: email, reading: typedReading, rid: rid }, 2).then(function (r) {
      setBusy(btn, false);
      if (!r.ok) return fail(r, 'e-register');
      finish(r.status === 'already');
    });
  });
  // 入力欄で Enter（次へ）を押したら次の欄へ
  ['r-name', 'r-company'].forEach(function (id, i) {
    $(id).addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); $(['r-company', 'r-email'][i]).focus(); } });
  });

  /* ---------- 受付完了 ---------- */
  function finish(already) {
    go('v-done', function () {
      $('done-h').textContent = already ? 'すでに受付が完了しています。' : 'ご来場ありがとうございます';
      if (already) $('done-p').textContent = 'ご来場ありがとうございます。';
      html.classList.add('finished');
    }, function () {
      var logo = $('done-logo'), peak = already ? .5 : 1;
      BG.centerOn(logo); BG.set('energy', already ? .3 : 1);
      // 1) 金の光が中央から広がる  2) 粒子が周囲へ  3) ロゴ  4) 波紋  5) お礼の言葉
      BG.pulse('flash', 1.15 * peak, 1700);
      BG.pulse('burst', 1.5 * peak, 3200);
      BG.tween('rip', 1, 2600, 'out', 0.001);
      setTimeout(function () { BG.v.rip = 0; BG.set('energy', .3); }, 2700);
      if (!already && !reduce) { var rg = $('rings'); rg.style.top = (logo.offsetTop + logo.offsetHeight / 2 + panel.offsetTop) + 'px'; rg.classList.remove('go'); void rg.offsetWidth; rg.classList.add('go'); }
      anim(logo, [
        { opacity: 0, transform: 'scale(2.6) translateZ(200px)', filter: 'blur(18px) brightness(3)' },
        { opacity: 1, transform: 'scale(.96)', filter: 'blur(0) brightness(1.7)', offset: .62 },
        { opacity: 1, transform: 'none', filter: 'blur(0) brightness(1)' }
      ], { duration: 1500, delay: 260, easing: 'cubic-bezier(.12,.82,.2,1)' });
      [['done-h', 1350], ['done-p', 1800], ['done-n', 2250]].forEach(function (x) {
        anim($(x[0]), [{ opacity: 0, transform: 'translateY(18px)', filter: 'blur(6px)', letterSpacing: '.3em' }, { opacity: 1, transform: 'none', filter: 'blur(0)', letterSpacing: x[0] === 'done-h' ? '.04em' : 'normal' }],
          { duration: 900, delay: x[1], easing: 'cubic-bezier(.2,.8,.2,1)' });
      });
      if (!already && navigator.vibrate) { try { navigator.vibrate(30); } catch (e) { /* 対応していない端末 */ } }
    });
  }

  /* ---------- 入力中の演出とキーボード対応 ---------- */
  document.addEventListener('focusin', function (e) {
    if (e.target.tagName !== 'INPUT') return;
    BG.set('focus', 1); BG.centerOn(e.target); BG.pulse('burst', .3, 900); lap();
    html.classList.add('typing');
    setTimeout(fit, 350);
  });
  document.addEventListener('focusout', function (e) {
    if (e.target.tagName !== 'INPUT') return;
    BG.set('focus', 0); html.classList.remove('typing');
    setTimeout(fit, 150);
  });
  var vv = window.visualViewport, fullH = window.innerHeight;
  function fit() {
    var h = vv ? vv.height : window.innerHeight;
    fullH = Math.max(fullH, window.innerHeight, h);
    html.style.setProperty('--vvh', h + 'px');
    $('stage').style.top = (vv ? vv.offsetTop : 0) + 'px';
    var kb = h < fullH * 0.78 && document.activeElement && document.activeElement.tagName === 'INPUT';
    html.classList.toggle('kb', !!kb);
    if (kb) {
      var el = document.activeElement, st = $('stage'), r = el.getBoundingClientRect();
      // 入力欄と、その下のボタンまでが見える位置へ
      if (r.bottom + 90 > h || r.top < 8) st.scrollTop += r.top - Math.max(12, (h - r.height) / 2 - 60);
    }
    window.scrollTo(0, 0);
  }
  if (vv) { vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); }
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', function () { fullH = 0; setTimeout(fit, 300); });

  // パネルのわずかな傾き（入力中は止める：入力欄を動かさない）
  var tiltRaf = 0;
  window.addEventListener('pointermove', function (e) {
    if (reduce || html.classList.contains('typing') || e.pointerType === 'touch') return;
    if (tiltRaf) return;
    tiltRaf = requestAnimationFrame(function () {
      tiltRaf = 0;
      scene.style.setProperty('--ry', ((e.clientX / window.innerWidth - .5) * 7).toFixed(2) + 'deg');
      scene.style.setProperty('--rx', ((.5 - e.clientY / window.innerHeight) * 5).toFixed(2) + 'deg');
    });
  }, { passive: true });

  /* ---------- 初回表示 ---------- */
  function intro(tier) {
    $('veil').classList.add('off');
    html.classList.add('ready');
    var view = $(current);
    if (tier !== 'gl' || reduce) {
      panel.style.opacity = 1;
      stagger(view, 100);
      return;
    }
    BG.centerOn(scene);
    BG.tween('intro', 0, 2600, 'out', 1);              // 背景が大きくズームしながら現れる
    setTimeout(function () {                            // 金の光が中央へ集まり、輪郭を描く
      BG.centerOn(scene);
      BG.tween('gather', 1, 800, 'inOut', 0);
      var tr = $('trace');
      anim(tr, [{ opacity: 0 }, { opacity: 1, offset: .15 }, { opacity: 1, offset: .8 }, { opacity: 0 }], { duration: 1500 });
      anim(tr.querySelector('rect'), [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 1050, easing: 'cubic-bezier(.5,0,.2,1)' });
    }, 450);
    setTimeout(function () {                            // 黒いパネルが立体的に現れる
      BG.hold(1500); // パネルの登場中は DOM 側の負荷が混ざるので、描画負荷の判定を休む
      BG.tween('gather', 0, 900, 'out'); BG.pulse('flash', .5, 900); BG.pulse('burst', .5, 1400);
      anim(panel, [{ opacity: 0, transform: 'translateZ(-420px) rotateX(38deg) scale(.86)', filter: 'blur(10px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
        { duration: 900, easing: 'cubic-bezier(.14,.9,.24,1)' });
      // ロゴ → 文章 → 入力欄 → ボタンの順に
      var letters = view.querySelectorAll('.logo span'), i;
      var lg = view.querySelector('.logo'); if (lg) { lg.classList.remove('in'); lg.style.opacity = 1; }
      for (i = 0; i < letters.length; i++) {
        anim(letters[i], [{ opacity: 0, transform: 'translateY(30px) rotateY(80deg) scale(1.4)', filter: 'blur(8px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
          { duration: 700, delay: 380 + i * 70, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
      stagger(view, 880);
      BG.set('energy', .12);
    }, 1350);
  }

  function boot() {
    fit();
    var bgReady = BG.start({ canvas: $('bg'), image: 'assets/pub.jpg', imageLite: 'assets/pub-lite.jpg', depth: 'assets/depth.jpg',
      onTier: function (t, why) { html.dataset.bg = t + ':' + why; } });
    var hello = (KEY || DEMO) ? post({ action: 'hello' }, 1) : Promise.resolve({ ok: false, code: 'BAD_KEY' });
    hello.then(function (r) {
      if (r.ok) { if (r.mode !== 'PROD') { $('mode').textContent = r.mode === 'DEMO' ? 'DEMO' : 'TEST MODE'; $('mode').hidden = false; } return; }
      if (r.code === 'NETWORK') return; // 入力時にもう一度通信するので、ここでは止めない
      show('v-invalid');
      if (r.message && r.code !== 'BAD_KEY') $('inv-p').textContent = r.message;
      if (html.classList.contains('ready')) { panel.style.opacity = 1; stagger($('v-invalid'), 0); }
    });
    // 背景の準備を待つのは最大1.2秒。受付の入力を待たせない
    Promise.race([bgReady, new Promise(function (ok) { setTimeout(function () { ok('wait'); }, 1200); })]).then(function (t) {
      if (t === 'wait') { bgReady.then(function (t2) { if (t2 === 'gl') { BG.tween('intro', 0, 2000, 'out', .6); } }); intro('lite'); }
      else intro(t);
    });
  }
  boot();
})();
