/* admin.js — 受付管理画面 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var API = (window.GAMBIZ_CONFIG && window.GAMBIZ_CONFIG.api) || '';
  var session = null, state = null, shown = {}, timer = 0, known = null, polling = false, tab = 'list';
  try { session = sessionStorage.getItem('gbz_adm'); } catch (e) { /* 保存できない環境 */ }

  function call(body) {
    if (session) body.t = session;
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow', cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .catch(function () { return { ok: false, code: 'NETWORK', message: '通信できませんでした。' }; })
      .then(function (r) {
        if (!r.ok && r.code === 'AUTH' && body.action !== 'login' && !body.password && !body.oldPassword) { logout(r.message); }
        return r;
      });
  }
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 3800);
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function fmt(iso) {
    if (!iso) return '';
    var d = new Date(iso); if (isNaN(d)) return String(iso);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  /* ---------- ログイン ---------- */
  function showLogin(msg) { $('app').hidden = true; $('login').hidden = false; $('login-msg').textContent = msg || (API ? '' : '接続先が未設定です（js/config.js）。'); $('pw').focus(); }
  function logout(msg) {
    session = null; clearTimeout(timer);
    try { sessionStorage.removeItem('gbz_adm'); } catch (e) { /* 何もしない */ }
    showLogin(msg);
  }
  $('login').addEventListener('submit', function (e) {
    e.preventDefault();
    var b = this.querySelector('button'); b.disabled = true; $('login-msg').textContent = '';
    call({ action: 'login', password: $('pw').value }).then(function (r) {
      b.disabled = false; $('pw').value = '';
      if (!r.ok) { $('login-msg').textContent = r.message; return; }
      session = r.session;
      try { sessionStorage.setItem('gbz_adm', session); } catch (e2) { /* 何もしない */ }
      start();
    });
  });
  $('logout').addEventListener('click', function () { logout(''); });

  /* ---------- 状態の取得（5秒ごと） ---------- */
  function start() { $('login').hidden = true; $('app').hidden = false; known = null; poll(true); }
  function poll(first) {
    clearTimeout(timer);
    if (!session || polling) return;
    polling = true;
    call({ action: 'state' }).then(function (r) {
      polling = false;
      if (!session) return;
      if (r.ok) { render(r, first); $('live').classList.remove('off'); $('live-t').textContent = '自動更新中（' + fmt(r.at).split(' ')[1] + '）'; }
      else if (r.code !== 'AUTH') { $('live').classList.add('off'); $('live-t').textContent = r.code === 'NO_EVENT' ? r.message : '更新できません（再試行中）'; if (r.code === 'NO_EVENT') { $('ev-name').textContent = '受付中のイベントがありません'; tabTo('settings'); } }
      timer = setTimeout(poll, document.hidden ? 20000 : 5000);
    });
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && session) poll(); });

  function countUp(span, to) {
    var from = Number(span.dataset.v || 0), dec = Number(span.dataset.dec || 0);
    if (from === to) { span.textContent = to.toFixed(dec); return; }
    span.dataset.v = to;
    var card = span.closest('.card');
    if (to > from) { card.classList.remove('bump'); void card.offsetWidth; card.classList.add('bump'); }
    var t0 = performance.now(), ms = 900;
    (function step(now) {
      var u = Math.min(1, (now - t0) / ms), v = from + (to - from) * (1 - Math.pow(1 - u, 3));
      span.textContent = v.toFixed(dec);
      if (u < 1) requestAnimationFrame(step);
    })(t0);
  }

  function render(r, first) {
    state = r;
    $('ev-name').textContent = r.event.name;
    $('ev-date').textContent = '開催日 ' + r.event.date + '　／　参加者タブ「' + r.event.tab + '」';
    $('mode').textContent = r.mode === 'PROD' ? '本番' : 'TEST MODE';
    $('mode').className = 'badge' + (r.mode === 'PROD' ? ' prod' : '');
    Array.prototype.forEach.call(document.querySelectorAll('[data-n]'), function (s) { countUp(s, r.stats[s.dataset.n]); });
    $('ratebar').style.width = Math.min(100, r.stats.rate) + '%';
    var fresh = {};
    if (known) r.people.forEach(function (p) { if (p.present && !known[p.id]) fresh[p.id] = true; });
    known = {}; r.people.forEach(function (p) { if (p.present) known[p.id] = true; });
    draw(fresh);
    var u = new URL('./', location.href); u.search = '?k=' + encodeURIComponent(r.event.key);
    $('rurl').textContent = u.href;
    if (r.popKey) { var pu = new URL('./', location.href); pu.search = '?k=' + encodeURIComponent(r.popKey); $('purl').textContent = pu.href; }
    $('pissue').hidden = !!r.popKey; $('pcopy').hidden = !r.popKey;
    $('mode-desc').textContent = r.mode === 'PROD' ? '現在：本番モード（本番のスプレッドシートに接続中）'
      : 'TESTモード（ダミーのスプレッドシートに接続中）。本番の接続先は' + (r.prodReady ? '設定済みです。' : '未設定のため、本番モードには切り替えられません。');
    $('mo-btn').textContent = r.mode === 'PROD' ? 'TESTモードへ戻す' : '本番モードへ切り替える';
    $('mo-ph').hidden = r.mode === 'PROD';
    $('mo-btn').disabled = r.mode !== 'PROD' && !r.prodReady;
  }

  function draw(fresh) {
    if (!state) return;
    var q = $('q').value.trim().toLowerCase().replace(/\s/g, ''), f = $('f').value, s = $('s').value;
    var list = state.people.filter(function (p) {
      if (f === 'in' && !p.present) return false;
      if (f === 'out' && (p.present || p.kind !== '事前登録')) return false;
      if (f === 'walk' && p.kind !== '当日追加登録') return false;
      if (f === 'read' && (p.readState === '確認済' || p.readState === '本人入力')) return false;
      if (!q) return true;
      return (p.name + '|' + p.reading + '|' + p.company).toLowerCase().replace(/\s/g, '').indexOf(q) >= 0;
    });
    list.sort(function (a, b) {
      if (s === 'name') return (a.reading || a.name).localeCompare(b.reading || b.name, 'ja');
      if (a.present !== b.present) return a.present ? -1 : 1;
      var c = (a.time || '').localeCompare(b.time || '');
      return s === 'time' ? -c : c;
    });
    $('count').textContent = list.length + ' 名を表示（全 ' + state.people.length + ' 名）';
    var body = $('rows'); body.textContent = '';
    list.forEach(function (p) {
      var tr = el('tr'); if (fresh && fresh[p.id]) tr.className = 'flash';
      var n = el('td', 'name'); n.appendChild(el('b', null, p.name));
      var rd = el('small', null, (p.reading || '（読み未登録）') + '　');
      if (p.readState !== '確認済' && p.readState !== '本人入力') rd.appendChild(el('span', 'pill warn', '読み：' + p.readState));
      n.appendChild(rd);
      if (p.note || p.dup) n.appendChild(el('small', null, '※ ' + (p.note || '申込が複数行あります（1名として集計）')));
      tr.appendChild(n);
      tr.appendChild(el('td', null, p.company));
      tr.appendChild(el('td', 'muted', p.email));
      var st = el('td'); st.appendChild(el('span', 'pill' + (p.present ? ' in' : ''), p.present ? '出席' : '未受付')); tr.appendChild(st);
      var tm = el('td', null, fmt(p.time)); if (p.method && p.method !== '本人受付') tm.appendChild(el('small', 'muted', ' ' + p.method)); tr.appendChild(tm);
      var kd = el('td'); kd.appendChild(el('span', 'pill' + (p.kind === '当日追加登録' ? ' walk' : ''), p.kind)); tr.appendChild(kd);
      var op = el('td');
      var b1 = el('button', 'btn small' + (p.present ? ' danger' : ''), p.present ? '取消' : '出席にする'); b1.type = 'button';
      b1.addEventListener('click', function () { p.present ? cancel(p) : manual(p); });
      var b2 = el('button', 'btn small', '読み'); b2.type = 'button'; b2.style.marginLeft = '6px';
      b2.addEventListener('click', function () { reading(p); });
      op.appendChild(b1); op.appendChild(b2); tr.appendChild(op);
      body.appendChild(tr);
    });
    if (!list.length) { var tr = el('tr'); var td = el('td', 'muted', '該当する参加者はいません。'); td.colSpan = 7; tr.appendChild(td); body.appendChild(tr); }
  }
  ['q', 'f', 's'].forEach(function (id) { $(id).addEventListener('input', function () { draw(); }); });

  /* ---------- 管理者操作 ---------- */
  function done(r, okMsg) { if (r.ok) { toast(okMsg); poll(); } else if (r.code !== 'AUTH') toast(r.message); return r; }
  function manual(p) {
    if (!confirm(p.name + ' さんを「出席」として登録します。よろしいですか？')) return;
    call({ action: 'manualCheckin', pid: p.id }).then(function (r) { done(r, r.status === 'already' ? 'すでに受付済みでした。' : p.name + ' さんを出席にしました。'); });
  }
  function cancel(p) {
    var reason = prompt(p.name + ' さんの受付を取り消します。理由を入力してください（履歴に残ります）。', '誤登録');
    if (reason === null) return;
    call({ action: 'cancel', pid: p.id, reason: reason }).then(function (r) { done(r, p.name + ' さんの受付を取り消しました。'); });
  }
  function reading(p) {
    var v = prompt(p.name + ' さんの読み仮名（ひらがな。複数の読みは | で区切る）', p.reading || '');
    if (v === null || !v.trim()) return;
    call({ action: 'setReading', pid: p.id, reading: v }).then(function (r) { done(r, '読み仮名を「' + (r.reading || '') + '」で確認済みにしました。'); });
  }
  $('resync').addEventListener('click', function () {
    var b = this; b.disabled = true;
    call({ action: 'resync' }).then(function (r) { b.disabled = false; done(r, '再同期しました（読み仮名管理へ追加 ' + r.added + ' 件、O列の補正 ' + r.fixed + ' 件）。'); });
  });
  $('csv').addEventListener('click', function () {
    if (!state) return;
    var esc = function (v) { v = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; };
    var rows = [['お名前', '読み仮名', '会社名', 'メールアドレス', '出席状況', '受付日時', '区分', '受付方法', 'メモ']];
    state.people.forEach(function (p) { rows.push([p.name, p.reading, p.company, p.email, p.present ? '出席' : '未受付', p.time ? new Date(p.time).toLocaleString('ja-JP') : '', p.kind, p.method, p.note]); });
    var csv = '\ufeff' + rows.map(function (r) { return r.map(esc).join(','); }).join('\r\n');
    var a = el('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'gambiz_' + state.event.id + '_' + new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '') + (state.mode === 'PROD' ? '' : '_TEST') + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  });

  /* ---------- タブ ---------- */
  function tabTo(name) {
    tab = name;
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) { b.classList.toggle('on', b.dataset.tab === name); });
    ['list', 'history', 'settings'].forEach(function (n) { $('t-' + n).hidden = n !== name; });
    if (name === 'history') history();
    if (name === 'settings') events();
  }
  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) { b.addEventListener('click', function () { tabTo(b.dataset.tab); }); });
  function fill(id, rows, cols) {
    var body = $(id); body.textContent = '';
    rows.forEach(function (r) { var tr = el('tr'); cols.forEach(function (c) { tr.appendChild(el('td', null, typeof c === 'function' ? c(r) : r[c])); }); body.appendChild(tr); });
    if (!rows.length) { var tr = el('tr'), td = el('td', 'muted', '記録はまだありません。'); td.colSpan = cols.length; tr.appendChild(td); body.appendChild(tr); }
  }
  function history() {
    call({ action: 'log' }).then(function (r) {
      if (!r.ok) return;
      fill('h-rec', r.records, [function (x) { return fmt(x.at); }, 'name', 'company', 'kind', 'method', function (x) { return x.status + (x.cancelledAt ? '（' + fmt(x.cancelledAt) + '）' : ''); }]);
      fill('h-log', r.log, [function (x) { return fmt(x.at); }, 'actor', 'op', 'name', 'detail']);
    });
  }
  $('reload-h').addEventListener('click', history);

  /* ---------- 設定 ---------- */
  function events() {
    call({ action: 'events' }).then(function (r) {
      if (!r.ok) return;
      var body = $('evs'); body.textContent = '';
      r.events.forEach(function (e) {
        var tr = el('tr');
        [e.name, e.date, e.tab].forEach(function (v) { tr.appendChild(el('td', null, v)); });
        var st = el('td'); st.appendChild(el('span', 'pill' + (e.status === '受付中' ? ' in' : ''), e.status)); tr.appendChild(st);
        var op = el('td');
        if (e.status !== '受付中') {
          var b = el('button', 'btn small', 'このイベントの受付を開始'); b.type = 'button';
          b.addEventListener('click', function () {
            var pw = prompt('受付するイベントを「' + e.name + '」に切り替えます。\n確認のため、管理者パスワードを入力してください。');
            if (!pw) return;
            call({ action: 'switchEvent', eventId: e.id, password: pw }).then(function (x) { done(x, '受付イベントを切り替えました。'); if (x.ok) events(); });
          });
          op.appendChild(b);
        }
        tr.appendChild(op); body.appendChild(tr);
      });
    });
  }
  $('newev').addEventListener('submit', function (e) {
    e.preventDefault();
    call({ action: 'createEvent', name: $('ne-name').value, date: $('ne-date').value, tab: $('ne-tab').value }).then(function (r) {
      if (r.ok) { toast('イベントを追加しました（状態：終了）。受付を始めるときに切り替えてください。'); e.target.reset(); events(); } else toast(r.message);
    });
  });
  $('modeform').addEventListener('submit', function (e) {
    e.preventDefault();
    var toProd = state && state.mode !== 'PROD';
    if (toProd && !confirm('本番のスプレッドシートに接続を切り替えます。以後の受付は本番データに書き込まれます。よろしいですか？')) return;
    call({ action: 'setMode', mode: toProd ? 'PROD' : 'TEST', password: $('mo-pw').value, phrase: $('mo-ph').value }).then(function (r) {
      $('mo-pw').value = ''; $('mo-ph').value = '';
      if (r.ok) { toast('モードを ' + (r.mode === 'PROD' ? '本番' : 'TEST') + ' に切り替えました。'); known = null; poll(true); } else toast(r.message);
    });
  });
  $('pwform').addEventListener('submit', function (e) {
    e.preventDefault();
    call({ action: 'changePassword', oldPassword: $('pw-old').value, newPassword: $('pw-new').value }).then(function (r) {
      $('pw-old').value = ''; $('pw-new').value = '';
      if (r.ok) logout('パスワードを変更しました。新しいパスワードでログインしてください。'); else toast(r.message);
    });
  });
  $('pissue').addEventListener('click', function () {
    call({ action: 'popKey' }).then(function (r) { if (r.ok) { toast('常設の受付URLを発行しました。'); poll(); } else toast(r.message); });
  });
  $('pcopy').addEventListener('click', function () {
    var t = $('purl').textContent;
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast('常設の受付URLをコピーしました。'); }, function () { toast('コピーできませんでした。URLを選択してコピーしてください。'); });
  });
  $('copy').addEventListener('click', function () {
    var t = $('rurl').textContent;
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast('受付URLをコピーしました。'); }, function () { toast('コピーできませんでした。URLを選択してコピーしてください。'); });
  });

  if (session) start(); else showLogin();
})();
