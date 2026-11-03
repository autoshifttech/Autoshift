/*!
 * Liquid Glass Notification  (standalone, no dependencies, ~12 KB)
 * A notification that drips out of the top of the screen as a liquid drop,
 * spreads into a clear-glass toast, and retracts. Includes a loading state
 * with a spinning outline that turns into the result in the same toast.
 *
 *   copy this file's script block into your page
 *
 *   Notify.show('Message copied');
 *   Notify.show('Day reset', { title:'Attendance', action:{ label:'Undo', run:function(){ ... } } });
 *
 *   var n = Notify.loading('Updating...');       // spinner outline, stays until you resolve it
 *   n.resolve('Updated. All saved.');            // or n.resolve('Not saved. Try again.')
 *
 *   Notify.promise(fetch('/api/save'), { loading:'Updating...', success:'Saved', error:'Not saved' });
 *
 *   Notify.dismiss();
 *   Notify.config({ title:'My App', accent1:'#7c5cff', accent2:'#4d7cff', accentInk:'#2f3fb8' });
 *
 * While any notification is on screen <html> has the class "lgn-on" (hook for hiding other floating UI).
 * Tap = dismiss (or run the action), swipe up = dismiss, hold = pause, Esc = dismiss.
 */
(function(root){
  'use strict';
  if (root.Notify && root.Notify.__lgn) return;

  var CFG = {
    title: 'Notification',
    nowLabel: 'now',
    accent1: '#ffa22e',            /* avatar / spinner highlight */
    accent2: '#ee6a00',            /* avatar / spinner body */
    accentInk: '#c25200',          /* action-button text on light glass */
    font: "'Inter','Segoe UI',system-ui,-apple-system,Roboto,sans-serif",
    zIndex: 9999,
    holdSeconds: 2.0,
    scale: 0.8                     /* 1 = the original 470px wide stage; smaller values shrink the whole notification */
  };

  var W = 470, H = 228, CX = 235;
  var dpr = Math.min(root.devicePixelRatio || 1, 2);
  var Q = 1, gd = dpr;
  var inited = false, box, glass, hit, cv, ctx, goo, g, rimC, r, liveReg;
  var queue = [], cur = null;
  var reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var TF, MF, AF, NF;
  function fonts(){ TF = '650 19px ' + CFG.font; MF = '500 16px ' + CFG.font; AF = '700 14px ' + CFG.font; NF = '600 15px ' + CFG.font; }
  fonts();

  var CSS =
'.lgn{position:fixed;left:50%;top:env(safe-area-inset-top,0px);transform:translateX(-50%);width:min(470px,100vw);pointer-events:none}' +
'.lgn[hidden]{display:none}' +
'.lgn canvas{display:block;position:relative;width:100%;height:auto;aspect-ratio:470/228}' +
'.lgn-glass{position:absolute;left:0;top:0;width:0;height:0;border-radius:999px;opacity:0;' +
 'background:linear-gradient(150deg,rgba(255,255,255,.04),rgba(255,255,255,0));' +
 '-webkit-backdrop-filter:blur(14px) saturate(1.6);backdrop-filter:blur(14px) saturate(1.6);' +
 'box-shadow:0 14px 30px -10px rgba(40,40,80,.2),0 2px 6px rgba(40,40,80,.06),inset 0 0 18px rgba(255,255,255,.1)}' +
'.lgn-lens .lgn-glass{-webkit-backdrop-filter:url(#lgn-lens) blur(10px) saturate(1.6);backdrop-filter:url(#lgn-lens) blur(10px) saturate(1.6)}' +
'.lgn-hit{position:absolute;left:0;top:0;width:0;height:0;border-radius:999px;pointer-events:none;touch-action:none;cursor:pointer;-webkit-tap-highlight-color:transparent}' +
'.lgn.lgn-live .lgn-hit{pointer-events:auto}' +
'.lgn-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}';

  var FILTER =
'<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">' +
'<filter id="lgn-lens" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">' +
'<feImage href="data:image/svg+xml,%3Csvg%20xmlns=\'http://www.w3.org/2000/svg\'%20width=\'100\'%20height=\'100\'%3E%3Cdefs%3E%3ClinearGradient%20id=\'x\'%20x1=\'0\'%20x2=\'1\'%20y1=\'0\'%20y2=\'0\'%3E%3Cstop%20offset=\'0\'%20stop-color=\'%23ff0000\'/%3E%3Cstop%20offset=\'.1\'%20stop-color=\'%23800000\'/%3E%3Cstop%20offset=\'.9\'%20stop-color=\'%23800000\'/%3E%3Cstop%20offset=\'1\'%20stop-color=\'%23000000\'/%3E%3C/linearGradient%3E%3ClinearGradient%20id=\'y\'%20x1=\'0\'%20x2=\'0\'%20y1=\'0\'%20y2=\'1\'%3E%3Cstop%20offset=\'0\'%20stop-color=\'%2300ff00\'/%3E%3Cstop%20offset=\'.3\'%20stop-color=\'%23008000\'/%3E%3Cstop%20offset=\'.7\'%20stop-color=\'%23008000\'/%3E%3Cstop%20offset=\'1\'%20stop-color=\'%23000000\'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect%20width=\'100\'%20height=\'100\'%20fill=\'%23000\'/%3E%3Crect%20width=\'100\'%20height=\'100\'%20fill=\'url%28%23x%29\'/%3E%3Crect%20width=\'100\'%20height=\'100\'%20fill=\'url%28%23y%29\'%20style=\'mix-blend-mode:screen\'/%3E%3C/svg%3E" x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map"/>' +
'<feDisplacementMap in="SourceGraphic" in2="map" scale="34" xChannelSelector="R" yChannelSelector="G" result="dr"/>' +
'<feColorMatrix in="dr" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r"/>' +
'<feDisplacementMap in="SourceGraphic" in2="map" scale="40" xChannelSelector="R" yChannelSelector="G" result="dg"/>' +
'<feColorMatrix in="dg" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g"/>' +
'<feDisplacementMap in="SourceGraphic" in2="map" scale="46" xChannelSelector="R" yChannelSelector="G" result="db"/>' +
'<feColorMatrix in="db" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b"/>' +
'<feBlend in="r" in2="g" mode="screen" result="rg"/><feBlend in="rg" in2="b" mode="screen"/>' +
'</filter></svg>';

  var LUT = new Uint8ClampedArray(256);
  for (var i = 0; i < 256; i++) LUT[i] = Math.round(Math.max(0, Math.min(1, i / 255 * 26 - 11)) * 255);

  function clamp(v, lo, hi){ return v < lo ? lo : v > hi ? hi : v; }
  function seg(a, a0, a1){ return clamp((a - a0) / (a1 - a0), 0, 1); }
  function spring(w0, z, t){
    if (t <= 0) return 0;
    var wd = w0 * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + (z * w0 / wd) * Math.sin(wd * t));
  }
  function rr(c, x, y, w, h, rad){
    rad = Math.min(rad, w / 2, h / 2);
    c.beginPath(); c.moveTo(x + rad, y);
    c.arcTo(x + w, y, x + w, y + h, rad); c.arcTo(x + w, y + h, x, y + h, rad);
    c.arcTo(x, y + h, x, y, rad); c.arcTo(x, y, x + w, y, rad); c.closePath();
  }
  function mw(str, font){ ctx.font = font; return ctx.measureText(str).width; }
  function fit(str, font, maxW){
    if (mw(str, font) <= maxW) return str;
    while (str.length > 1 && mw(str + '…', font) > maxW) str = str.slice(0, -1);
    return str.replace(/\s+$/, '') + '…';
  }
  function vib(ms){ try { if (navigator.vibrate) navigator.vibrate(ms); } catch(e){} }
  function mix(a, b, t){ return Math.round(a + (b - a) * t); }

  /* ---------- setup (lazy, so the script can sit in <head>) ---------- */
  function init(){
    if (inited) return; inited = true;
    var st = document.createElement('style'); st.id = 'lgn-css'; st.textContent = CSS; document.head.appendChild(st);
    var holder = document.createElement('div'); holder.innerHTML = FILTER; document.body.appendChild(holder.firstChild);

    box = document.createElement('div'); box.className = 'lgn'; box.hidden = true; box.setAttribute('aria-hidden', 'true');
    box.style.zIndex = CFG.zIndex;
    var ua = navigator.userAgent, brands = navigator.userAgentData && navigator.userAgentData.brands;
    var chromium = !/iPhone|iPad|iPod/.test(ua) && (brands ? brands.some(function(b){ return /Chromium|Google Chrome|Microsoft Edge/.test(b.brand); }) : /Chrome\//.test(ua));
    if (chromium) box.classList.add('lgn-lens');         /* lens refraction only works in Chromium */
    glass = document.createElement('div'); glass.className = 'lgn-glass';
    cv = document.createElement('canvas'); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    hit = document.createElement('div'); hit.className = 'lgn-hit';
    box.appendChild(glass); box.appendChild(cv); box.appendChild(hit); document.body.appendChild(box);
    liveReg = document.createElement('div'); liveReg.className = 'lgn-sr'; liveReg.setAttribute('role', 'status'); liveReg.setAttribute('aria-live', 'polite');
    document.body.appendChild(liveReg);

    ctx = cv.getContext('2d');
    goo = document.createElement('canvas'); goo.width = cv.width; goo.height = cv.height;
    g = goo.getContext('2d', {willReadFrequently:true});
    rimC = document.createElement('canvas'); rimC.width = cv.width; rimC.height = cv.height;
    r = rimC.getContext('2d');

    if (root.visualViewport){ root.visualViewport.addEventListener('resize', place); root.visualViewport.addEventListener('scroll', place); }
    bindPointer();
    document.addEventListener('keydown', function(e){ if (e.key === 'Escape') dismiss(); });
  }
  function setQuality(q){
    Q = q; gd = dpr * q;
    goo.width = rimC.width = Math.max(1, Math.round(cv.width * q));
    goo.height = rimC.height = Math.max(1, Math.round(cv.height * q));
  }
  function place(){                                       /* notch, Dynamic Island, on-screen keyboard */
    if (!box) return;
    var vv = root.visualViewport, vw = vv ? vv.width : root.innerWidth;
    box.style.width = Math.min(W * CFG.scale, vw) + 'px';
    if (!vv) return;
    box.style.left = (vv.offsetLeft + vv.width / 2) + 'px';
    box.style.top = 'calc(env(safe-area-inset-top,0px) + ' + vv.offsetTop + 'px)';
  }
  function placeBox(el, x, y, w, h){
    el.style.left = (x / W * 100) + '%'; el.style.top = (y / H * 100) + '%';
    el.style.width = (w / W * 100) + '%'; el.style.height = (h / H * 100) + '%';
  }

  /* ---------- layout ---------- */
  function layout(n){
    var actW = n.action ? mw(n.action.label, AF) + 26 : 0, actX = actW ? actW + 10 : 0;
    var nowW = CFG.nowLabel ? mw(CFG.nowLabel, NF) : 0;
    var titleW = mw(n.title, TF), msgW = mw(n.msg, MF);
    var Wt = clamp(87 + Math.max(titleW + nowW + 28, msgW + actX), 250, 430);
    var textMax = Wt - 87 - actX, lines = [n.msg];
    if (msgW > textMax){
      var words = n.msg.split(' '), l1 = '', i = 0;
      while (i < words.length && mw((l1 ? l1 + ' ' : '') + words[i], MF) <= textMax) { l1 += (l1 ? ' ' : '') + words[i]; i++; }
      if (!l1){ l1 = fit(words[0], MF, textMax); i = 1; }
      lines = [l1]; var rest = words.slice(i).join(' ');
      if (rest) lines.push(fit(rest, MF, textMax));
    }
    return {Wt:Wt, Ht:lines.length > 1 ? 88 : 66, lines:lines, title:fit(n.title, TF, Wt - 87 - nowW - 18), actW:actW};
  }
  function holdFor(n, dur){
    if (dur) return dur;
    return CFG.holdSeconds + Math.min(2.5, Math.max(0, n.msg.length - 28) * 0.04) + (n.action ? 2.5 : 0);
  }

  /* ---------- drawing ---------- */
  var OFF = 4000;
  function drawGoo(a, Wt, Ht, dragY){
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, goo.width, goo.height);
    g.save();
    g.setTransform(gd, 0, 0, gd, -OFF, 0);
    g.fillStyle = '#fff'; g.shadowColor = '#fff';
    g.shadowBlur = 16 * gd; g.shadowOffsetX = OFF; g.shadowOffsetY = 0;     /* == blur(8px), works in Safari too */
    rr(g, 177, -30, 116, 38, 19); g.fill();                                  /* spout */
    var y, o;
    if (a < 3.36){ var k = seg(a, 0, 0.36); y = -20 + 116 * k * k; }
    else { var k2 = seg(a, 3.36, 3.66); y = 96 - 116 * k2 * k2; }
    y += dragY;
    if (a < 3.15) o = spring(13, 0.55, a - 0.33);
    else { var q = seg(a, 3.15, 3.36); o = 1 - q * q * q; }
    var w = 44 + (Wt - 44) * o, h = 44 + (Ht - 44) * clamp(o, 0, 1);
    rr(g, CX - w / 2, y - h / 2, w, h, h / 2); g.fill();                     /* drop / pill */
    if (a < 0.5 || a > 3.3){                                                 /* trailing droplet */
      var y2;
      if (a < 3.36){ var m = seg(a - 0.07, 0, 0.36); y2 = -20 + 116 * m * m; }
      else { var m2 = seg(a + 0.07, 3.36, 3.66); y2 = 96 - 116 * m2 * m2; }
      g.beginPath(); g.arc(CX, y2, 11, 0, Math.PI * 2); g.fill();
    }
    g.restore();
    var id = g.getImageData(0, 0, goo.width, goo.height), d = id.data;
    for (var j = 3; j < d.length; j += 4) d[j] = LUT[d[j]];
    g.putImageData(id, 0, 0);
    return {y:y, w:w, h:h, o:o};
  }
  function rim(dx, dy, col, al){
    if (al <= 0.01) return;
    r.setTransform(1, 0, 0, 1, 0, 0);
    r.globalCompositeOperation = 'source-over'; r.clearRect(0, 0, rimC.width, rimC.height);
    r.drawImage(goo, 0, 0);
    r.globalCompositeOperation = 'destination-out'; r.drawImage(goo, dx * gd, dy * gd);
    r.globalCompositeOperation = 'source-in'; r.fillStyle = col; r.fillRect(0, 0, rimC.width, rimC.height);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = al; ctx.drawImage(rimC, 0, 0, cv.width, cv.height); ctx.restore();
  }
  function drawGlass(s, k){
    if (k <= 0.01){ glass.style.opacity = 0; return; }
    var w = s.w + 3, h = s.h + 3, x = CX - w / 2, y = s.y - h / 2;
    glass.style.opacity = k; placeBox(glass, x, y, w, h);
    ctx.save(); ctx.globalAlpha = k;
    rr(ctx, x, y, w, h, h / 2); ctx.clip();
    var sh = ctx.createLinearGradient(0, y, 0, y + h);
    sh.addColorStop(0, 'rgba(255,255,255,.14)'); sh.addColorStop(.5, 'rgba(255,255,255,.01)'); sh.addColorStop(1, 'rgba(255,255,255,.04)');
    ctx.fillStyle = sh; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,.4)';
    ctx.beginPath(); ctx.ellipse(x + Math.min(h, 66) * .6, y + 7, Math.min(h, 66) * .34, 2.6, -0.1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function pillPoint(x, y, w, h, d){
    var rad = h / 2, L = Math.max(0, w - h), per = 2 * L + 2 * Math.PI * rad;
    d = ((d % per) + per) % per;
    if (d < L) return [x + rad + d, y];
    d -= L; if (d < Math.PI * rad){ var t = -Math.PI / 2 + d / rad; return [x + w - rad + Math.cos(t) * rad, y + rad + Math.sin(t) * rad]; }
    d -= Math.PI * rad; if (d < L) return [x + w - rad - d, y + h];
    d -= L; var t2 = Math.PI / 2 + d / rad; return [x + rad + Math.cos(t2) * rad, y + rad + Math.sin(t2) * rad];
  }
  function drawSpinner(s, al){
    if (al <= 0.01) return;
    var w = s.w + 3, h = s.h + 3, x = CX - w / 2, y = s.y - h / 2;
    var L = Math.max(0, w - h), per = 2 * L + 2 * Math.PI * (h / 2);
    var head = ((performance.now() / (reduce ? 3000 : 1400)) % 1) * per, tail = per * 0.32, N = 64;
    ctx.save(); ctx.lineCap = 'butt';
    for (var pass = 0; pass < 2; pass++){                 /* soft glow underlay, then the crisp line */
      ctx.lineWidth = pass ? 3.2 : 8;
      var prev = pillPoint(x, y, w, h, head - tail);
      for (var i = 1; i <= N; i++){
        var p = pillPoint(x, y, w, h, head - tail + tail * i / N), f = i / N;
        ctx.globalAlpha = al * Math.pow(f, 1.5) * (pass ? 1 : 0.16);
        ctx.strokeStyle = f > 0.85 ? CFG.accent1 : CFG.accent2;
        ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
        prev = p;
      }
    }
    ctx.restore();
  }
  function drawContent(c, s, fade){
    var a = c.a, n = c.n, L = c.L;
    var op = (a < 3.0 ? seg(a, 0.5, 0.7) : 1 - seg(a, 3.0, 3.12)) * fade;
    if (op <= 0.001){ c.actRect = null; return; }
    var y = s.y, x0 = CX - s.w / 2, tx = x0 + 67, right = x0 + s.w - 20, two = L.lines.length > 1;
    ctx.save();
    ctx.globalAlpha = op;
    rr(ctx, x0, y - s.h / 2, s.w, s.h, s.h / 2); ctx.clip();
    var ag = ctx.createLinearGradient(x0 + 13, y - 20, x0 + 53, y + 20);
    ag.addColorStop(0, CFG.accent1); ag.addColorStop(1, CFG.accent2);
    ctx.beginPath(); ctx.arc(x0 + 33, y, 20, 0, Math.PI * 2); ctx.fillStyle = ag; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '700 19px ' + CFG.font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(c.letter, x0 + 33, y + 1);

    ctx.globalAlpha = op * c.txtA;
    var tm = c.tm, ch = mix(28, 255, tm), cb = mix(32, 255, tm);
    var cT = 'rgb(' + ch + ',' + ch + ',' + cb + ')';
    var cM = 'rgba(' + ch + ',' + ch + ',' + cb + ',' + (0.78 + 0.12 * tm).toFixed(2) + ')';
    var cN = 'rgba(' + ch + ',' + ch + ',' + cb + ',' + (0.5 + 0.22 * tm).toFixed(2) + ')';
    ctx.shadowColor = tm < 0.5 ? 'rgba(255,255,255,.75)' : 'rgba(0,0,0,.38)'; ctx.shadowBlur = 3 * dpr; ctx.shadowOffsetY = 0;
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.fillStyle = cT; ctx.font = TF; ctx.fillText(L.title, tx, two ? y - 17 : y - 4);
    ctx.fillStyle = cM; ctx.font = MF;
    ctx.fillText(L.lines[0], tx, two ? y + 6 : y + 18);
    if (two) ctx.fillText(L.lines[1], tx, y + 26);
    if (CFG.nowLabel){ ctx.fillStyle = cN; ctx.font = NF; ctx.textAlign = 'right'; ctx.fillText(CFG.nowLabel, right, two ? y - 21 : y - 8); }

    c.actRect = null;
    if (n.action){
      var aw = L.actW, ax = right - aw, ay = (two ? y + 16 : y + 11) - 13;
      c.actRect = {x:ax, y:ay, w:aw, h:26};
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
      rr(ctx, ax, ay, aw, 26, 13);
      ctx.fillStyle = tm < 0.5 ? 'rgba(255,255,255,.42)' : 'rgba(255,255,255,.22)'; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.stroke();
      ctx.fillStyle = tm < 0.5 ? CFG.accentInk : '#ffffff'; ctx.font = AF; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(n.action.label, ax + aw / 2, ay + 13.5);
    }
    ctx.restore();
  }
  function frame(c){
    var a = c.a;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1; ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = ctx.shadowOffsetY = 0;
    ctx.clearRect(0, 0, W, H);
    var fade = Math.min(seg(a, 0, 0.12), 1 - seg(a, 3.7, 4));
    var s = drawGoo(a, c.Wc, c.Hc, c.dragY);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = fade * 0.03; ctx.drawImage(goo, 0, 0, cv.width, cv.height);
    ctx.restore();
    rim( 1.6,  2.4, '#ffffff', 0.95 * fade);
    if (Q === 1) rim(5.0, 7.0, '#ffffff', 0.20 * fade);
    rim(-1.6, -2.4, '#ffffff', 0.55 * fade);
    drawGlass(s, seg(s.o, 0.2, 0.7) * fade);
    drawSpinner(s, c.spinA * seg(s.o, 0.6, 0.95) * fade);
    drawContent(c, s, fade);
    if (c.phase === 'hold') placeBox(hit, CX - s.w / 2 - 4, s.y - Math.max(s.h, 48) / 2 - 4, s.w + 8, Math.max(s.h, 48) + 8);
  }

  /* ---------- dark or light text, depending on what is behind the glass ---------- */
  function lumOf(str){
    var m = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,\/]+([\d.]+))?/.exec(str);
    if (!m) return null;
    var al = m[4] === undefined ? 1 : +m[4]; if (al < 0.25) return null;
    return (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255;
  }
  function lumAt(x, y){
    var els = document.elementsFromPoint ? document.elementsFromPoint(x, y) : [];
    for (var i = 0; i < els.length; i++){
      var el = els[i]; if (box.contains(el) || el === box) continue;
      var cs = getComputedStyle(el), l = lumOf(cs.backgroundColor);
      if (l === null && cs.backgroundImage && cs.backgroundImage !== 'none'){
        var gm = /rgba?\([^)]*\)/.exec(cs.backgroundImage); if (gm) l = lumOf(gm[0]);
      }
      if (l !== null) return l;
    }
    return 0.9;
  }
  function sampleText(){
    var rc = box.getBoundingClientRect(); if (!rc.width) return 0;
    var sc = rc.width / W, py = rc.top + 96 * sc, tot = 0;
    [-90, 0, 90].forEach(function(dx){ tot += lumAt(rc.left + (CX + dx) * sc, py); });
    return tot / 3 < 0.42 ? 1 : 0;
  }

  /* ---------- player ---------- */
  function finish(){
    box.hidden = true; box.classList.remove('lgn-live');
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
    glass.style.opacity = 0; cur = null;
    if (!queue.length) document.documentElement.classList.remove('lgn-on');
    setTimeout(next, 120);
  }
  function dismiss(){
    if (!cur || cur.loading) return;                      /* a loading toast stays until it is resolved */
    if (cur.phase === 'hold'){ cur.holdLeft = 0; vib(6); }
    else if (cur.phase === 'in') cur.early = true;
  }
  function step(c, dt){
    if (c.phase === 'in'){
      var prev = c.a; c.a += dt;
      if (prev < 0.36 && c.a >= 0.36) vib(10);
      if (c.a >= 1){ c.a = 1; c.phase = 'hold'; c.holdLeft = c.loading ? Infinity : (c.early ? 0 : c.Hd); box.classList.add('lgn-live'); }
    } else if (c.phase === 'hold'){
      if (!c.paused) c.holdLeft -= dt;
      c.lumT -= dt; if (c.lumT <= 0){ c.lumT = 0.4; c.tmT = sampleText(); }
      if (c.loading){ c.loadT += dt; if (c.loadT > 45){ c.loading = false; c.holdLeft = 2; } }
      if (c.holdLeft <= 0){ box.classList.remove('lgn-live'); if (reduce) return false; c.phase = 'out'; c.a = 3.0; }
    } else { c.a += dt; if (c.a >= 4) return false; }
    if (c.swapTo){
      c.swapT += dt;
      if (c.swapT >= 0.15 && !c.swapped){ c.n = c.swapTo.n; c.L = c.swapTo.L; c.swapped = true; }
      c.txtA = c.swapT < 0.15 ? 1 - c.swapT / 0.15 : Math.min(1, (c.swapT - 0.15) / 0.15);
      if (c.swapT >= 0.3){ c.swapTo = null; c.swapped = false; c.txtA = 1; }
    }
    var tg = c.swapTo ? c.swapTo.L : c.L, e = Math.min(1, dt * 9);
    c.Wc += (tg.Wt - c.Wc) * e; c.Hc += (tg.Ht - c.Hc) * e;
    if (!c.loading) c.spinA = Math.max(0, c.spinA - dt * 4);
    c.tm += (c.tmT - c.tm) * Math.min(1, dt * 7);
    if (!c.dragging && c.dragY){ c.dragY *= 0.8; if (Math.abs(c.dragY) < 0.3) c.dragY = 0; }
    return true;
  }
  var perfN = 0, perfSum = 0, perfDone = false;
  function next(){
    if (cur || !queue.length) return;
    var it = queue.shift();
    var n = {title:it.title || CFG.title, msg:it.latest, action:it.action, msg0:it.msg0};
    var L = layout(n);
    var c = cur = {item:it, n:n, L:L, Hd:holdFor(n, it.dur), phase:'in', a:0, holdLeft:0, paused:false, dragY:0, dragging:false, early:false,
                   tm:0, tmT:0, lumT:0.4, actRect:null, Wc:L.Wt, Hc:L.Ht, txtA:1, swapTo:null, swapT:0, swapped:false,
                   loading:!!it.loading, loadT:0, spinA:it.loading ? 1 : 0,
                   letter:(it.letter || n.title.charAt(0) || 'N').toUpperCase()};
    box.style.zIndex = CFG.zIndex;
    place(); box.hidden = false; box.classList.remove('lgn-live');
    c.tm = c.tmT = sampleText();
    if (reduce){ c.a = 1; c.phase = 'hold'; c.holdLeft = c.loading ? Infinity : c.Hd; box.classList.add('lgn-live'); }
    var last = performance.now();
    (function tick(now){
      if (cur !== c) return;
      var raw = (now - last) / 1000; last = now;
      if (!perfDone && raw < 0.5){ perfN++; if (perfN > 3) perfSum += raw; if (perfN >= 27){ perfDone = true; if (perfSum / 24 > 0.028) setQuality(0.5); } }
      if (!step(c, Math.min(0.05, raw))) return finish();
      frame(c); requestAnimationFrame(tick);
    })(last);
  }

  /* ---------- public API ---------- */
  function enqueue(msg, o){
    init();
    o = o || {}; msg = String(msg == null ? '' : msg).replace(/\s+/g, ' ').trim();
    if (!msg) return handle(null);
    fonts();
    if (cur && !cur.loading && !o.loading && cur.n.msg0 === msg && cur.phase === 'hold'){   /* same message again: just keep it up longer */
      cur.holdLeft = Math.max(cur.holdLeft, 1.8); return handle(cur.item);
    }
    document.documentElement.classList.add('lgn-on');
    liveReg.textContent = ''; setTimeout(function(){ liveReg.textContent = msg; }, 30);
    if (queue.length >= 3) queue.shift();
    var it = {msg0:msg, latest:msg, action:o.action || null, title:o.title || null, letter:o.letter || null, loading:!!o.loading, dur:o.duration || 0};
    queue.push(it); next();
    return handle(it);
  }
  function resolveItem(it, msg, o){
    if (!it) return;
    o = o || {}; msg = String(msg == null ? '' : msg).replace(/\s+/g, ' ').trim(); if (!msg) return;
    var qi = queue.indexOf(it);
    if (qi > -1){ it.loading = false; it.latest = it.msg0 = msg; it.action = o.action || null; if (o.duration) it.dur = o.duration; return; }
    var c = cur;
    if (c && c.item === it){
      c.loading = false;
      var n2 = {title:c.n.title, msg:msg, action:o.action || null, msg0:msg};
      c.swapTo = {n:n2, L:layout(n2)}; c.swapT = 0; c.swapped = false;
      c.Hd = holdFor(n2, o.duration);
      if (c.phase === 'hold') c.holdLeft = c.Hd;
      liveReg.textContent = ''; setTimeout(function(){ liveReg.textContent = msg; }, 30);
      vib(8);
    }
  }
  function handle(it){
    return {
      resolve: function(msg, o){ resolveItem(it, msg, o); },
      dismiss: function(){
        if (!it) return;
        var qi = queue.indexOf(it); if (qi > -1){ queue.splice(qi, 1); return; }
        if (cur && cur.item === it){ cur.loading = false; dismiss(); }
      }
    };
  }

  /* ---------- tap / swipe / hold ---------- */
  var pd = null;
  function bindPointer(){
    hit.addEventListener('pointerdown', function(e){
      if (!cur || cur.phase !== 'hold') return;
      pd = {id:e.pointerId, x:e.clientX, y:e.clientY, moved:false};
      cur.paused = true; cur.dragging = true;
      try { hit.setPointerCapture(e.pointerId); } catch(x){}
    });
    hit.addEventListener('pointermove', function(e){
      if (!pd || e.pointerId !== pd.id || !cur) return;
      var dx = e.clientX - pd.x, dy = e.clientY - pd.y, sc = box.getBoundingClientRect().width / W;
      if (Math.hypot(dx, dy) > 6) pd.moved = true;
      cur.dragY = dy < 0 ? clamp(dy / sc * 0.85, -46, 0) : clamp(dy / sc * 0.12, 0, 8);
    });
    function release(e, cancelled){
      if (!pd || e.pointerId !== pd.id) return;
      var c = cur, moved = pd.moved; pd = null;
      if (!c) return;
      c.paused = false; c.dragging = false;
      if (cancelled) return;
      if (!moved){
        var rc = box.getBoundingClientRect(), sx = (e.clientX - rc.left) / rc.width * W, sy = (e.clientY - rc.top) / rc.height * H, ar = c.actRect;
        if (ar && c.n.action && sx >= ar.x - 8 && sx <= ar.x + ar.w + 8 && sy >= ar.y - 8 && sy <= ar.y + ar.h + 8){
          vib(12); try { c.n.action.run(); } catch(x){}
        }
        dismiss();
      } else if (c.dragY < -16) dismiss();
    }
    hit.addEventListener('pointerup', function(e){ release(e, false); });
    hit.addEventListener('pointercancel', function(e){ release(e, true); });
  }

  root.Notify = {
    __lgn: true,
    show: function(msg, opts){ return enqueue(msg, opts); },
    loading: function(msg, opts){ opts = opts || {}; opts.loading = true; return enqueue(msg || 'Working...', opts); },
    promise: function(p, m){
      m = m || {};
      var h = root.Notify.loading(m.loading || 'Working...', {title:m.title, letter:m.letter});
      var pr = typeof p === 'function' ? p() : p;
      return Promise.resolve(pr).then(function(v){
        h.resolve(typeof m.success === 'function' ? m.success(v) : (m.success || 'Done'), {action:m.action});
        return v;
      }, function(e){
        h.resolve(typeof m.error === 'function' ? m.error(e) : (m.error || 'Something went wrong'));
        throw e;
      });
    },
    dismiss: dismiss,
    config: function(o){ for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) CFG[k] = o[k]; fonts(); }
  };
})(typeof window !== 'undefined' ? window : this);
