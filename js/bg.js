/*
 * bg.js — シネマティック背景（WebGL）
 * 1枚の写真＋奥行きマップから、視差・照明の明滅・光芒・もや・金の流線・波紋を毎フレーム描く。
 * 金色の粒子は同じ WebGL 上の点群。端末が重いと判断したら解像度と品質を自動で下げ、
 * それでも足りなければ静止画＋CSS の軽量表示へ切り替える。
 */
(function () {
  'use strict';

  var VERT = 'attribute vec2 aP;varying vec2 vUv;void main(){vUv=aP*.5+.5;gl_Position=vec4(aP,0.,1.);}';

  function frag(hp) {
    return [
      'precision ' + (hp ? 'highp' : 'mediump') + ' float;',
      'uniform sampler2D uTex,uDepth;uniform vec2 uRes,uPar,uC;uniform float uAsp,uT,uIntro,uEnergy,uFocus,uFlash,uRip,uOct;varying vec2 vUv;',
      'float hash(vec2 p){p=fract(p*vec2(.1031,.1030));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}',
      'float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}',
      'float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<4;i++){if(float(i)>=uOct)break;s+=a*noise(p);p=p*2.03+vec2(17.,9.);a*=.5;}return s;}',
      'vec2 fl(vec2 u){return vec2(u.x,1.-u.y);}',
      'float lamp(vec2 iu,vec2 L,float size,float seed){vec2 q=(iu-L)*vec2(uAsp,1.);float f=.72+.28*noise(vec2(uT*1.9+seed*13.,seed*5.));f*=.9+.1*sin(uT*.6+seed*4.);return f*size*size/(dot(q,q)+size*size);}',
      'void main(){',
      ' vec2 s=vUv;float sa=uRes.x/uRes.y;vec2 p=s-.5;',
      // カメラ：ゆっくりした寄り引き・回転・移動
      ' float zoom=1.09+.035*sin(uT*.11)+uIntro*.6-uFocus*.035+uEnergy*.05;',
      ' float r=.012*sin(uT*.07)+uIntro*.07;float cr=cos(r),sr=sin(r);',
      ' p=vec2(cr*p.x-sr*p.y*(1./sa),sr*p.x*sa+cr*p.y);p/=zoom;',
      ' p+=vec2(.012*sin(uT*.05),.010*cos(uT*.043));',
      // 受付完了時の波紋
      ' vec2 rc=s-uC;rc.x*=sa;float rd=length(rc);float wave=0.;',
      ' if(uRip>0.001){float fr=uRip*1.5;float w1=sin((rd-fr)*36.)*exp(-abs(rd-fr)*6.);float w2=sin((rd-fr*.62)*36.)*exp(-abs(rd-fr*.62)*8.)*.6;wave=(w1+w2)*(1.-uRip);p+=rc/(rd+.001)*wave*.010;}',
      ' vec2 uv=sa>uAsp?vec2(p.x,p.y*uAsp/sa):vec2(p.x*sa/uAsp,p.y);uv+=.5;',
      // 奥行きマップによる多層視差（手前ほど大きく動く）
      ' float d=texture2D(uDepth,fl(uv)).r;',
      ' vec2 par=uPar+vec2(.5*sin(uT*.23),.3*cos(uT*.19));',
      ' uv+=par*(d-.33)*.030;',
      ' vec2 iu=fl(uv);',
      ' vec3 col=texture2D(uTex,iu).rgb;d=texture2D(uDepth,iu).r;',
      ' vec3 amber=vec3(1.,.62,.24),gold=vec3(1.,.80,.42);',
      // 照明の明滅（写真の中のランプ位置）
      ' float g=lamp(iu,vec2(.302,.196),.060,1.)+lamp(iu,vec2(.440,.302),.042,2.)+lamp(iu,vec2(.505,.350),.030,3.)+lamp(iu,vec2(.538,.380),.024,4.)+lamp(iu,vec2(.830,.385),.034,5.)+.5*lamp(iu,vec2(.10,.44),.16,6.);',
      ' float breath=.90+.12*noise(vec2(uT*.33,3.))+uEnergy*.22+uFocus*.08;',
      ' col*=breath;col+=amber*g*(.20+.25*uEnergy);',
      // ボリューメトリックライト風の光芒（手前のランプから下へ）
      ' vec2 q=(iu-vec2(.302,.196))*vec2(uAsp,1.);float ql=length(q);float ang=atan(q.x,q.y);',
      ' float cone=smoothstep(1.15,.05,abs(ang));float rays=noise(vec2(ang*9.+uT*.10,1.))*noise(vec2(ang*23.-uT*.07,7.));',
      ' col+=amber*rays*cone*exp(-ql*2.4)*(.42+.5*uEnergy);',
      // もや・煙（奥ほど濃い）
      ' float h=fbm(iu*vec2(2.3,3.1)+vec2(uT*.030,-uT*.016));float h2=fbm(iu*vec2(4.1,5.3)+vec2(-uT*.021,uT*.012)+h);',
      ' col+=vec3(.52,.33,.14)*h*h2*(.14+.34*(1.-d))*(1.+uEnergy*1.2);',
      // 空間を横切るアンバーの光の帯
      ' float bx=s.x*.8+s.y*.6-mod(uT*.05,2.6)+.6;col+=amber*exp(-bx*bx*26.)*.085*(.4+h);',
      // 金の流線（数秒おきに1本）
      ' float tt=uT/5.5;float k=floor(tt),f=fract(tt);float sd=hash(vec2(k,1.7));float dir=sd>.5?1.:-1.;',
      ' float y0=mix(.12,.88,hash(vec2(k,9.1)));float sl=(hash(vec2(k,4.3))-.5)*.5;',
      ' float hx=dir>0.?f*2.6-.5:1.5-f*2.6;float ld=abs((s.y-y0)-sl*(s.x-.5));float back=(hx-s.x)*dir;',
      ' float tail=smoothstep(.55,0.,back)*step(0.,back);',
      ' col+=gold*(exp(-ld*ld*70000.)*tail*.9+exp(-(back*back*sa*sa+ld*ld)*2600.)*.8);',
      // 波紋・閃光
      ' col+=gold*max(wave,0.)*1.1;',
      ' col+=gold*uFlash*(exp(-rd*rd*2.6)*1.5+.12);',
      ' col*=1.+uIntro*.9;',
      // 仕上げ：周辺減光・粒状感
      ' vec2 v=(s-.5)*vec2(1.,1.15);col*=1.-.62*dot(v,v);',
      ' col=pow(max(col,0.),vec3(.96))*.92;',
      ' col+=(hash(s*uRes+fract(uT)*91.)-.5)*.022;',
      ' gl_FragColor=vec4(col,1.);',
      '}'
    ].join('\n');
  }

  var PVERT = [
    'attribute vec4 aS;uniform float uT,uEnergy,uBurst,uGather,uDpr;uniform vec2 uC,uPar;varying float vA;',
    'void main(){',
    ' float z=aS.z;float sp=mix(.010,.045,z)*(1.+uEnergy*3.);float t=uT*sp+aS.w*10.;',
    ' vec2 pos=vec2(aS.x+.05*sin(t*4.+aS.y*20.)+uT*.004*(z-.5),aS.y+t);pos=fract(pos);',
    ' vec2 c=pos*2.-1.;c+=uPar*z*.06;',
    ' vec2 cc=uC*2.-1.;vec2 dv=c-cc;float l=length(dv)+.001;',
    ' c+=dv/l*uBurst*(.2+z*.9);',
    ' c=mix(c,cc+dv*.12,uGather);',
    ' gl_Position=vec4(c,0.,1.);',
    ' float tw=.55+.45*sin(uT*(1.+aS.w*3.)+aS.x*40.);',
    ' gl_PointSize=(1.5+z*z*10.)*uDpr*(1.+uBurst*.9+uGather*.6);',
    ' vA=tw*mix(.22,.95,z)*(1.+uBurst*1.6+uGather);',
    '}'
  ].join('\n');
  var PFRAG = 'precision mediump float;varying float vA;void main(){float d=length(gl_PointCoord-.5);float a=smoothstep(.5,0.,d);a*=a;gl_FragColor=vec4(vec3(1.,.78,.40)*a*vA,0.);}';

  var LEVELS = [
    { dpr: 2, oct: 4, n: 260 },
    { dpr: 1.5, oct: 3, n: 190 },
    { dpr: 1, oct: 3, n: 120 },
    { dpr: 0.66, oct: 2, n: 60 }
  ];

  var G = {
    tier: 'pending', level: 0, fps: 0,
    v: { intro: 1, energy: 0, focus: 0, flash: 0, rip: 0, burst: 0, gather: 0 },
    target: { energy: 0, focus: 0 },
    center: [0.5, 0.5], par: [0, 0], parT: [0, 0]
  };
  var canvas, gl, prog, pprog, quad, pbuf, texA, texD, loc = {}, ploc = {}, hp = true;
  var slowRuns = 0, liteRuns = 0, midRuns = 0, frames = 0, lastTick = 0;
  /**
   * 描画負荷の監視。1秒ごとに実際に描けたコマ数を数え、遅ければ品質を下げる（シェーダーは作り直さないので切替で固まらない）。
   *  18fps未満 … すぐ2段階下げる。最軽量でも続けば静止画の軽量表示へ
   *  27fps未満が2回 … 1段階下げる。最軽量で22fps未満なら軽量表示へ
   *  33〜45fpsが3回 … 1段階下げて60fpsを狙う（30fps前後は省電力モードの上限とみなし、下げない）
   */
  function watch() {
    var now = performance.now(), el = now - lastTick, fps = frames * 1000 / el;
    frames = 0; lastTick = now;
    if (!running || document.hidden || now < cool || el < 700 || el > 1600) return; // 裏に回っている間や、タイマー自体が遅れたときは判定しない
    G.fps = Math.round(fps);
    var lastLevel = LEVELS.length - 1;
    if (fps < 18) { slowRuns = 0; midRuns = 0; if (G.level < lastLevel) setLevel(Math.min(lastLevel, G.level + 2), now); else if (++liteRuns >= 2) lite('slow'); }
    else if (fps < 27) { liteRuns = 0; midRuns = 0; if (++slowRuns >= 2) { slowRuns = 0; if (G.level < lastLevel) setLevel(G.level + 1, now); else if (fps < 22) lite('slow'); } }
    else if (fps > 33 && fps < 45) { slowRuns = 0; liteRuns = 0; if (++midRuns >= 3) { midRuns = 0; if (G.level < lastLevel) setLevel(G.level + 1, now); } }
    else { slowRuns = 0; liteRuns = 0; midRuns = 0; }
  }
  function setLevel(n, now) { G.level = n; resize(); cool = now + 500; onTier('gl', 'level ' + G.level); }
  var running = false, raf = 0, last = 0, t0 = 0, acc = [], cool = 0, tweens = [];
  var onTier = function () {};

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
    return s;
  }
  function link(vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
    return p;
  }
  function build() {
    var L = LEVELS[G.level];
    if (prog) gl.deleteProgram(prog);
    prog = link(VERT, frag(hp));
    ['uTex', 'uDepth', 'uRes', 'uPar', 'uC', 'uAsp', 'uT', 'uIntro', 'uEnergy', 'uFocus', 'uFlash', 'uRip', 'uOct'].forEach(function (n) { loc[n] = gl.getUniformLocation(prog, n); });
    loc.aP = gl.getAttribLocation(prog, 'aP');
    resize();
  }
  function tex(img, unit) {
    var t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
    return t;
  }
  function resize() {
    if (!gl) return;
    var L = LEVELS[G.level], dpr = Math.min(window.devicePixelRatio || 1, L.dpr);
    var w = Math.max(2, Math.round(canvas.clientWidth * dpr)), h = Math.max(2, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    G.dpr = dpr;
  }
  function loadImg(src) {
    return new Promise(function (ok, ng) { var i = new Image(); i.onload = function () { ok(i); }; i.onerror = ng; i.src = src; });
  }

  function lite(reason) {
    if (G.tier === 'lite') return;
    G.tier = 'lite'; running = false; cancelAnimationFrame(raf);
    document.documentElement.classList.add('bg-lite');
    if (canvas) canvas.style.display = 'none';
    onTier('lite', reason);
  }

  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    var dt = Math.min(100, now - last); last = now;
    var k = 1 - Math.exp(-dt / 260), v = G.v, i;
    v.energy += (G.target.energy - v.energy) * k;
    v.focus += (G.target.focus - v.focus) * k;
    G.par[0] += (G.parT[0] - G.par[0]) * k * .5; G.par[1] += (G.parT[1] - G.par[1]) * k * .5;
    for (i = tweens.length - 1; i >= 0; i--) {
      var tw = tweens[i], u = Math.min(1, (now - tw.t0) / tw.ms);
      v[tw.key] = tw.from + (tw.to - tw.from) * tw.ease(u);
      if (u >= 1) { tweens.splice(i, 1); if (tw.done) tw.done(); }
    }
    var T = ((now - t0) / 1000) % 3600;
    var L = LEVELS[G.level];
    gl.disable(gl.BLEND);
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(loc.aP); gl.vertexAttribPointer(loc.aP, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1i(loc.uTex, 0); gl.uniform1i(loc.uDepth, 1);
    gl.uniform2f(loc.uRes, canvas.width, canvas.height);
    gl.uniform2f(loc.uPar, G.par[0], G.par[1]);
    gl.uniform2f(loc.uC, G.center[0], G.center[1]);
    gl.uniform1f(loc.uAsp, G.asp); gl.uniform1f(loc.uT, T); gl.uniform1f(loc.uOct, L.oct);
    gl.uniform1f(loc.uIntro, v.intro); gl.uniform1f(loc.uEnergy, v.energy); gl.uniform1f(loc.uFocus, v.focus);
    gl.uniform1f(loc.uFlash, v.flash); gl.uniform1f(loc.uRip, v.rip);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // 粒子
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(pprog);
    gl.bindBuffer(gl.ARRAY_BUFFER, pbuf);
    gl.enableVertexAttribArray(ploc.aS); gl.vertexAttribPointer(ploc.aS, 4, gl.FLOAT, false, 0, 0);
    gl.uniform1f(ploc.uT, T); gl.uniform1f(ploc.uEnergy, v.energy); gl.uniform1f(ploc.uBurst, v.burst);
    gl.uniform1f(ploc.uGather, v.gather); gl.uniform1f(ploc.uDpr, G.dpr * Math.min(1.4, canvas.clientWidth / 390));
    gl.uniform2f(ploc.uC, G.center[0], G.center[1]); gl.uniform2f(ploc.uPar, G.par[0], G.par[1]);
    gl.drawArrays(gl.POINTS, 0, L.n);

    frames++; // 描画負荷の判定は watch()（1秒ごとのタイマー）が行う
  }

  var ease = {
    out: function (u) { return 1 - Math.pow(1 - u, 3); },
    inOut: function (u) { return u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; },
    lin: function (u) { return u; }
  };

  G.tween = function (key, to, ms, e, from) {
    if (G.tier !== 'gl') { G.v[key] = to; return; }
    for (var i = tweens.length - 1; i >= 0; i--) if (tweens[i].key === key) tweens.splice(i, 1);
    tweens.push({ key: key, from: from == null ? G.v[key] : from, to: to, ms: ms, ease: ease[e || 'out'], t0: performance.now() });
  };
  /** 画面遷移など DOM 側が重い間は、描画負荷の判定を休む */
  G.hold = function (ms) { cool = Math.max(cool, performance.now() + ms); };
  G.set = function (key, val) { G.target[key] = val; };
  G.pulse = function (key, peak, ms) { G.tween(key, 0, ms, 'out', peak); };
  /** 画面上の要素の中心を、光・波紋・粒子の中心にする */
  G.centerOn = function (el) {
    if (!el) return;
    var r = el.getBoundingClientRect();
    G.center = [(r.left + r.width / 2) / window.innerWidth, 1 - (r.top + r.height / 2) / window.innerHeight];
  };
  G.pause = function () { running = false; cancelAnimationFrame(raf); };
  G.resume = function () { if (G.tier === 'gl' && !running) { running = true; last = performance.now(); acc = []; cool = last + 250; raf = requestAnimationFrame(frame); } };

  /**
   * opts: {canvas, image, imageLite, depth, onTier}
   * 戻り値の Promise は、背景を表示できる状態になったら解決する（軽量表示でも解決する）。
   */
  G.start = function (opts) {
    canvas = opts.canvas; onTier = opts.onTier || onTier;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var saveData = navigator.connection && navigator.connection.saveData;
    if (reduce || saveData || /[?&]lite=1/.test(location.search)) { lite(reduce ? 'reduced-motion' : 'save-data'); return Promise.resolve('lite'); }
    try {
      gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false })
        || canvas.getContext('experimental-webgl');
    } catch (e) { gl = null; }
    if (!gl) { lite('no-webgl'); return Promise.resolve('lite'); }
    var f = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    hp = !!(f && f.precision > 0);
    var mem = navigator.deviceMemory || 8, cores = navigator.hardwareConcurrency || 8;
    G.level = (!hp || mem <= 2 || cores <= 2) ? 3 : (mem <= 4 || cores <= 4) ? 1 : 0;
    var m = /[?&]level=(\d)/.exec(location.search);
    if (m) G.level = Math.min(3, +m[1]);
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); lite('context-lost'); });

    // 通信が遅いときは受付を待たせない：3.5秒で写真が届かなければ軽量表示のまま進める
    var slow = new Promise(function (ok) { setTimeout(function () { ok(null); }, 3500); });
    return Promise.race([Promise.all([loadImg(opts.imageLite), loadImg(opts.depth)]), slow]).then(function (imgs) {
      if (!imgs) { lite('slow-network'); return 'lite'; }
      try {
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        texA = tex(imgs[0], 0); texD = tex(imgs[1], 1);
        G.asp = imgs[0].naturalWidth / imgs[0].naturalHeight;
        quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        var n = LEVELS[0].n, a = new Float32Array(n * 4), i;
        for (i = 0; i < a.length; i++) a[i] = Math.random();
        for (i = 0; i < n; i++) a[i * 4 + 2] = Math.pow(a[i * 4 + 2], 1.8); // 遠くの粒を多めに
        pbuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, pbuf); gl.bufferData(gl.ARRAY_BUFFER, a, gl.STATIC_DRAW);
        pprog = link(PVERT, PFRAG);
        ['uT', 'uEnergy', 'uBurst', 'uGather', 'uDpr', 'uC', 'uPar'].forEach(function (nm) { ploc[nm] = gl.getUniformLocation(pprog, nm); });
        ploc.aS = gl.getAttribLocation(pprog, 'aS');
        build();
      } catch (e) { lite('init'); return 'lite'; }
      G.tier = 'gl'; t0 = performance.now();
      window.addEventListener('resize', resize);
      document.addEventListener('visibilitychange', function () { document.hidden ? G.pause() : G.resume(); });
      var move = function (x, y) { G.parT = [(x / window.innerWidth - .5) * -2, (y / window.innerHeight - .5) * 2]; };
      window.addEventListener('pointermove', function (e) { move(e.clientX, e.clientY); }, { passive: true });
      window.addEventListener('deviceorientation', function (e) {
        if (e.gamma == null) return;
        G.parT = [Math.max(-1, Math.min(1, e.gamma / 25)), Math.max(-1, Math.min(1, (e.beta - 45) / 25))];
      }, { passive: true });
      G.resume(); onTier('gl', 'level ' + G.level);
      lastTick = performance.now(); setInterval(watch, 1000);
      // 高精細な写真は後から差し替える
      loadImg(opts.image).then(function (img) {
        if (G.tier !== 'gl') return;
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texA);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      }).catch(function () {});
      return 'gl';
    }).catch(function () { lite('load-error'); return 'lite'; });
  };

  window.GBG = G;
})();
