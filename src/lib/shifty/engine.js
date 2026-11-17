// Shifty, AutoShift's mascot: a small cartoon rig drawn in SVG and animated with one shared
// requestAnimationFrame loop. Ported from the approved design file (shifty.html). Plain JS on purpose:
// it is pure DOM code with its own small tween engine; the typed surface is in engine.d.ts.
// Motion rules: honours prefers-reduced-motion and <html data-shifty="still"> (expression changes only).
/* eslint-disable */
export const Shifty = (() => {

  const G = "#1E4C41", LIME = "#c9f27a", FACE = "#fffdf8", AMBER = "#f2b84b", BLUSH = "#f4a3a3";
  const NS = "http://www.w3.org/2000/svg";
  const SH_R = [128, 100], SH_L = [32, 100];
  const ARMS = {
    down: [140, 114, 137, 132], wave: [150, 90, 146, 62], chin: [146, 104, 134, 86], up: [148, 80, 141, 56],
    point: [148, 100, 160, 90], hip: [148, 112, 134, 121], cover: [132, 80, 100, 91], peek: [140, 96, 116, 106],
    wipe: [146, 72, 108, 72], out: [150, 104, 158, 116], heart: [138, 118, 96, 128],
  };
  const mirror = (a) => [160 - a[0], a[1], 160 - a[2], a[3]];
  const ARMS_L = Object.fromEntries(Object.entries(ARMS).map(([k, v]) => [k, mirror(v)]));
  ARMS_L.head = [14, 84, 42, 56];

  const NEUTRAL = { x: 0, y: 0, rot: 0, sx: 1, sy: 1, rA0: 140, rA1: 114, rA2: 137, rA3: 132, rRot: 0, lA0: 20, lA1: 114, lA2: 23, lA3: 132, lRot: 0,
    open: 1, px: 0, py: 0, happy: 0, esz: 1, mw: 10, mc: 9, mo: 0, bt: 0, bo: 0, blush: .55, wink: 0, fL: 0, fR: 0, fS: 0, bulb: 0, mag: 0 };

  const ease = {
    out: (t) => 1 - Math.pow(1 - t, 3), in: (t) => t * t * t, inOut: (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    back: (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    lin: (t) => t,
  };
  const reduced = () => document.documentElement.dataset.shifty === "still" || matchMedia("(prefers-reduced-motion: reduce)").matches;
  let pointer = null;
  let started = false;
  function start() {
    if (started) return; started = true;
    addEventListener("pointermove", (e) => { pointer = { x: e.clientX, y: e.clientY }; }, { passive: true });
    const tickAll = (t) => { for (const a of instances) a._tick(t); requestAnimationFrame(tickAll); };
    requestAnimationFrame(tickAll);
  }

  function el(tag, attrs, parent) { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; }
  function armTargets(side, name) { const a = side === "r" ? ARMS[name] : ARMS_L[name]; const p = side === "r" ? "rA" : "lA"; return { [p + "0"]: a[0], [p + "1"]: a[1], [p + "2"]: a[2], [p + "3"]: a[3] }; }
  function rotAround(x, y, cx, cy, deg) { const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]; }

  function create(host, opts = {}) {
    host.classList.add("sh-host");
    host.innerHTML = "";
    const level = { v: opts.level || "calm" };
    const T = (k, d) => (opts.text && opts.text[k]) || d;
    // premium rig: soft gradients, an ink outline like hand-inked cartoons, glossy eyes and a glass face
    const INK = "#10211c", uid = "sh" + Math.random().toString(36).slice(2, 8);
    const svg = el("svg", { viewBox: "-24 -34 208 200", "aria-hidden": "true", focusable: "false" }, host);
    const defs = el("defs", {}, svg);
    const grad = (id, stops, attrs = {}) => { const g = el(attrs.r ? "radialGradient" : "linearGradient", { id: uid + id, ...(attrs.r ? { cx: attrs.cx || "50%", cy: attrs.cy || "50%", r: attrs.r } : { x1: 0, y1: 0, x2: attrs.x2 ?? .35, y2: 1 }) }, defs); stops.forEach(([o, c, a]) => el("stop", { offset: o, "stop-color": c, "stop-opacity": a ?? 1 }, g)); return `url(#${uid + id})`; };
    const fBody = grad("b", [[0, "#3a8670"], [.45, "#1E4C41"], [1, "#143a31"]]);
    const fFace = grad("f", [[0, "#ffffff"], [1, "#efe7d8"]], { x2: .2 });
    const fCrest = grad("c", [[0, "#ecffbd"], [.5, "#c9f27a"], [1, "#95c63c"]], { x2: .1 });
    const fCheek = grad("k", [[0, "#ff9fb0"], [1, "#ff9fb0", 0]], { r: "50%" });
    const fShadow = grad("s", [[0, "#000", .3], [1, "#000", 0]], { r: "50%" });
    const fFoot = grad("t", [[0, "#2c6f5d"], [1, "#122f28"]]);
    const shadow = el("ellipse", { cx: 80, cy: 157, rx: 40, ry: 7, fill: fShadow }, svg);
    const body = el("g", {}, svg);
    const footL = el("ellipse", { cx: 61, cy: 146, rx: 14, ry: 8.5, fill: fFoot, stroke: INK, "stroke-width": 3 }, body);
    const footR = el("ellipse", { cx: 99, cy: 146, rx: 14, ry: 8.5, fill: fFoot, stroke: INK, "stroke-width": 3 }, body);
    const crest = el("g", {}, body);
    const CREST_D = "M60 30 l20 -18 20 18 M60 48 l20 -18 20 18";
    el("path", { d: CREST_D, fill: "none", stroke: INK, "stroke-width": 14, "stroke-linecap": "round", "stroke-linejoin": "round" }, crest);
    el("path", { d: CREST_D, fill: "none", stroke: fCrest, "stroke-width": 8.5, "stroke-linecap": "round", "stroke-linejoin": "round" }, crest);
    el("path", { d: "M66 27 l14 -12", fill: "none", stroke: "#fff", "stroke-width": 2.4, "stroke-linecap": "round", opacity: .75 }, crest);
    el("rect", { x: 30, y: 52, width: 100, height: 92, rx: 30, fill: fBody, stroke: INK, "stroke-width": 3.2 }, body);
    el("path", { d: "M42 70 q4 -12 20 -14", fill: "none", stroke: "#fff", "stroke-width": 4.5, "stroke-linecap": "round", opacity: .22 }, body);
    el("path", { d: "M40 130 q40 12 80 0", fill: "none", stroke: "#000", "stroke-width": 5, "stroke-linecap": "round", opacity: .12 }, body);
    el("rect", { x: 44, y: 68, width: 72, height: 50, rx: 20, fill: fFace, stroke: INK, "stroke-width": 2.6 }, body);
    el("path", { d: "M51 77 q6 -5 16 -5", fill: "none", stroke: "#fff", "stroke-width": 3, "stroke-linecap": "round", opacity: .95 }, body);
    const cheekL = el("ellipse", { cx: 55, cy: 105, rx: 7, ry: 5, fill: fCheek }, body);
    const cheekR = el("ellipse", { cx: 105, cy: 105, rx: 7, ry: 5, fill: fCheek }, body);
    const browL = el("path", { fill: "none", stroke: INK, "stroke-width": 3.2, "stroke-linecap": "round" }, body);
    const browR = el("path", { fill: "none", stroke: INK, "stroke-width": 3.2, "stroke-linecap": "round" }, body);
    const eyeL = el("ellipse", { fill: INK }, body), eyeR = el("ellipse", { fill: INK }, body);
    const hlL = el("circle", { r: 2.3, fill: "#fff" }, body), hlR = el("circle", { r: 2.3, fill: "#fff" }, body);
    const hl2L = el("circle", { r: 1.1, fill: "#fff" }, body), hl2R = el("circle", { r: 1.1, fill: "#fff" }, body);
    const happy = el("path", { fill: "none", stroke: INK, "stroke-width": 4, "stroke-linecap": "round" }, body);
    const mouthFill = el("path", { fill: "#3b1a1f", stroke: INK, "stroke-width": 1.5 }, body);
    const tongue = el("ellipse", { rx: 4.2, ry: 2.6, fill: "#ef7b8c" }, body);
    const mouthLine = el("path", { fill: "none", stroke: INK, "stroke-width": 3.8, "stroke-linecap": "round" }, body);
    const armLo = el("path", { fill: "none", stroke: INK, "stroke-width": 13.5, "stroke-linecap": "round" }, body);
    const armL = el("path", { fill: "none", stroke: G, "stroke-width": 8.5, "stroke-linecap": "round" }, body);
    const handL = el("circle", { r: 7.8, fill: fBody, stroke: INK, "stroke-width": 2.8 }, body);
    const hhL = el("circle", { r: 2, fill: "#fff", opacity: .35 }, body);
    const armRo = el("path", { fill: "none", stroke: INK, "stroke-width": 13.5, "stroke-linecap": "round" }, body);
    const armR = el("path", { fill: "none", stroke: G, "stroke-width": 8.5, "stroke-linecap": "round" }, body);
    const handR = el("circle", { r: 7.8, fill: fBody, stroke: INK, "stroke-width": 2.8 }, body);
    const hhR = el("circle", { r: 2, fill: "#fff", opacity: .35 }, body);
    // thought cloud: puffs that breathe, a spinning gear and three typing dots
    const dots = el("g", { opacity: 0 }, svg);
    const puff1 = el("circle", { cx: 126, cy: 40, r: 4, fill: FACE, stroke: INK, "stroke-width": 2 }, dots);
    const puff2 = el("circle", { cx: 136, cy: 27, r: 6, fill: FACE, stroke: INK, "stroke-width": 2 }, dots);
    const cloud = el("g", {}, dots);
    el("path", { d: "M136 6 a10 10 0 0 1 14 -12 a12 12 0 0 1 22 2 a10 10 0 0 1 10 16 a9 9 0 0 1 -12 10 h-28 a9 9 0 0 1 -6 -16 z", fill: FACE, stroke: INK, "stroke-width": 2.4 }, cloud);
    const gear = el("g", {}, cloud);
    el("path", { d: "M0 -7 l2 -1 1 -3 3 1 -1 3 2 2 3 -1 1 3 -3 1 v2 l3 1 -1 3 -3 -1 -2 2 1 3 -3 1 -1 -3 h-2 l-1 3 -3 -1 1 -3 -2 -2 -3 1 -1 -3 3 -1 v-2 l-3 -1 1 -3 3 1 2 -2 -1 -3 3 -1 1 3 z", fill: "#c9f27a", stroke: INK, "stroke-width": 1.4, "stroke-linejoin": "round", transform: "translate(0 0)" }, gear);
    el("circle", { r: 2.6, fill: FACE, stroke: INK, "stroke-width": 1.2 }, gear);
    const dotC = [0, 1, 2].map((i) => el("circle", { cx: 160 + i * 6, cy: 10, r: 2.1, fill: INK }, cloud));
    // lightbulb for the "Aha!" moment
    const bulb = el("g", { opacity: 0 }, svg);
    el("circle", { cx: 80, cy: -12, r: 20, fill: "#fff3b0", opacity: .55 }, bulb);
    el("path", { d: "M80 -24 a10 10 0 0 1 6 18 v4 h-12 v-4 a10 10 0 0 1 6 -18 z", fill: "#ffe066", stroke: INK, "stroke-width": 2.2 }, bulb);
    el("path", { d: "M75 0 h10 M76 3.5 h8", stroke: INK, "stroke-width": 2.2, "stroke-linecap": "round" }, bulb);
    el("path", { d: "M77 -14 q3 -4 6 0", fill: "none", stroke: "#fff", "stroke-width": 2, "stroke-linecap": "round" }, bulb);
    el("path", { d: "M80 -40 v-6 M62 -32 l-4 -4 M98 -32 l4 -4 M56 -14 h-6 M104 -14 h6", stroke: "#f2b84b", "stroke-width": 3, "stroke-linecap": "round" }, bulb);
    // magnifying glass held in the right hand
    const glass = el("g", { opacity: 0 }, body);
    el("path", { d: "M0 0 l10 10", stroke: INK, "stroke-width": 6, "stroke-linecap": "round" }, glass);
    el("circle", { cx: -8, cy: -8, r: 11, fill: "rgba(201,242,122,.35)", stroke: INK, "stroke-width": 3.2 }, glass);
    el("path", { d: "M-14 -12 q3 -5 8 -5", fill: "none", stroke: "#fff", "stroke-width": 2, "stroke-linecap": "round" }, glass);
    const fx = document.createElement("div"); fx.className = "sh-fx"; host.appendChild(fx);
    const bubble = document.createElement("div"); bubble.className = "sh-bubble" + (opts.bubbleSide === "right" ? " right" : ""); bubble.setAttribute("aria-live", "polite"); host.appendChild(bubble);

    const s = { ...NEUTRAL };
    let tweens = [];
    let crestA = 0, crestV = 0, lastY = 0, lastRot = 0, eyeManual = 0, thinking = false, sleeping = false, visible = true, breathT = 0;
    let lookAt = null, actionId = 0;

    function render(t) {
      // follow-through: the crest lags behind the body and wobbles back (a damped spring)
      const vy = s.y - lastY, vr = s.rot - lastRot; lastY = s.y; lastRot = s.rot;
      const target = -vr * 7 + vy * 1.4;
      crestV += (target - crestA) * .18; crestV *= .78; crestA += crestV;
      // breathing (lively only)
      let breathe = 0;
      if (level.v === "lively" && !reduced()) { breathT += 1; breathe = Math.sin(breathT / 38) * .012; }
      if (sleeping && !reduced()) { breathT += 1; breathe = Math.sin(breathT / 30) * .03; }
      const sy = s.sy * (1 + breathe), sx = s.sx * (1 - breathe * .6);
      body.setAttribute("transform", `translate(${s.x} ${s.y}) translate(80 144) rotate(${s.rot}) scale(${sx} ${sy}) translate(-80 -144)`);
      crest.setAttribute("transform", `rotate(${Math.max(-25, Math.min(25, crestA))} 80 50)`);
      const lift = Math.min(1, Math.max(0, -s.y / 60));
      shadow.setAttribute("rx", Math.max(1, 40 * (1 - lift * .45) * Math.abs(s.sx))); shadow.setAttribute("opacity", 1 - lift * .6); shadow.setAttribute("cx", 80 + s.x);
      footL.setAttribute("cy", 146 - s.fL); footR.setAttribute("cy", 146 - s.fR);
      footL.setAttribute("cx", 61 - s.fS); footR.setAttribute("cx", 99 + s.fS);
      // eyes follow the pointer or a target unless an action is steering them
      let px = s.px, py = s.py;
      if (!eyeManual && !sleeping) {
        const tgt = lookAt ? (lookAt.getBoundingClientRect ? (() => { const r = lookAt.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })() : lookAt) : pointer;
        if (tgt) {
          const r = svg.getBoundingClientRect();
          const ex = r.left + r.width * ((80 + 24) / 208), ey = r.top + r.height * ((92 + 34) / 200);
          const dx = tgt.x - ex, dy = tgt.y - ey, d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 140);
          px += (dx / d) * 3.4 * k; py += (dy / d) * 2.6 * k;
        }
      }
      s._px = (s._px ?? 0) + (px - (s._px ?? 0)) * .25; s._py = (s._py ?? 0) + (py - (s._py ?? 0)) * .25;
      const ex = s._px, ey = s._py, rr = Math.max(.5, 6.6 * s.esz), ry = Math.max(.6, rr * s.open);
      eyeL.setAttribute("cx", 66 + ex); eyeL.setAttribute("cy", 92 + ey); eyeL.setAttribute("rx", rr); eyeL.setAttribute("ry", ry);
      eyeR.setAttribute("cx", 94 + ex); eyeR.setAttribute("cy", 92 + ey); eyeR.setAttribute("rx", rr); eyeR.setAttribute("ry", Math.max(.6, ry * (1 - s.wink)));
      const showHl = s.open > .55 ? 1 : 0;
      hlL.setAttribute("cx", 68 + ex); hlL.setAttribute("cy", 89.5 + ey); hlL.setAttribute("opacity", showHl * (1 - s.happy));
      hlR.setAttribute("cx", 96 + ex); hlR.setAttribute("cy", 89.5 + ey); hlR.setAttribute("opacity", showHl * (1 - s.happy) * (1 - s.wink));
      hl2L.setAttribute("cx", 64 + ex); hl2L.setAttribute("cy", 95 + ey); hl2L.setAttribute("opacity", showHl * (1 - s.happy));
      hl2R.setAttribute("cx", 92 + ex); hl2R.setAttribute("cy", 95 + ey); hl2R.setAttribute("opacity", showHl * (1 - s.happy) * (1 - s.wink));
      eyeL.setAttribute("opacity", 1 - s.happy); eyeR.setAttribute("opacity", 1 - s.happy);
      happy.setAttribute("d", `M${60 + ex} ${94 + ey} q6 -8 12 0 M${88 + ex} ${94 + ey} q6 -8 12 0`); happy.setAttribute("opacity", s.happy);
      browL.setAttribute("d", `M${58 + ex} ${80 + s.bt * 2.4} L${73 + ex} ${80 - s.bt * 3.6}`); browL.setAttribute("opacity", s.bo);
      browR.setAttribute("d", `M${87 + ex} ${80 - s.bt * 3.6} L${102 + ex} ${80 + s.bt * 2.4}`); browR.setAttribute("opacity", s.bo);
      const mx1 = 80 - s.mw, mx2 = 80 + s.mw, my = 105;
      mouthLine.setAttribute("d", `M${mx1} ${my} Q80 ${my + s.mc} ${mx2} ${my}`); mouthLine.setAttribute("opacity", s.mo > .06 ? 0 : 1);
      mouthFill.setAttribute("d", `M${mx1} ${my - 1} Q80 ${my - 1 + s.mc * .25} ${mx2} ${my - 1} Q80 ${my + s.mc * .5 + s.mo * 15} ${mx1} ${my - 1} Z`); mouthFill.setAttribute("opacity", s.mo > .06 ? 1 : 0);
      tongue.setAttribute("cx", 80); tongue.setAttribute("cy", my + s.mc * .3 + s.mo * 9); tongue.setAttribute("opacity", s.mo > .3 ? 1 : 0);
      cheekL.setAttribute("opacity", s.blush); cheekR.setAttribute("opacity", s.blush);
      const [r0, r1] = rotAround(s.rA0, s.rA1, SH_R[0], SH_R[1], s.rRot), [r2, r3] = rotAround(s.rA2, s.rA3, SH_R[0], SH_R[1], s.rRot);
      const dR = `M${SH_R[0]} ${SH_R[1]} Q${r0} ${r1} ${r2} ${r3}`; armR.setAttribute("d", dR); armRo.setAttribute("d", dR); handR.setAttribute("cx", r2); handR.setAttribute("cy", r3); hhR.setAttribute("cx", r2 - 2.5); hhR.setAttribute("cy", r3 - 2.5);
      const [l0, l1] = rotAround(s.lA0, s.lA1, SH_L[0], SH_L[1], s.lRot), [l2, l3] = rotAround(s.lA2, s.lA3, SH_L[0], SH_L[1], s.lRot);
      if (s.mag > 0) glass.setAttribute("transform", `translate(${r2} ${r3}) rotate(-35)`);
      const dL = `M${SH_L[0]} ${SH_L[1]} Q${l0} ${l1} ${l2} ${l3}`; armL.setAttribute("d", dL); armLo.setAttribute("d", dL); handL.setAttribute("cx", l2); handL.setAttribute("cy", l3); hhL.setAttribute("cx", l2 - 2.5); hhL.setAttribute("cy", l3 - 2.5);
      dots.setAttribute("opacity", thinking ? 1 : 0);
      if (thinking) {
        const still = reduced();
        dotC.forEach((c, i) => c.setAttribute("opacity", still ? 1 : .3 + .7 * Math.max(0, Math.sin(t / 160 - i * .9))));
        gear.setAttribute("transform", `translate(152 -2) rotate(${still ? 0 : (t / 6) % 360})`);
        cloud.setAttribute("transform", still ? "" : `translate(0 ${Math.sin(t / 420) * 1.6})`);
        puff1.setAttribute("r", 4 + (still ? 0 : Math.sin(t / 300) * .8)); puff2.setAttribute("r", 6 + (still ? 0 : Math.sin(t / 300 + 1) * 1));
        if (!still && eyeManual) {
          // eyes scan up and around while he thinks; the finger taps his chin
          s.px = 2 + Math.sin(t / 520) * 2.2; s.py = -2.6 + Math.sin(t / 380) * .8;
          s.rRot = Math.max(0, Math.sin(t / 110)) * -9;
        }
      }
      bulb.setAttribute("opacity", s.bulb); bulb.setAttribute("transform", `translate(${s.x} ${s.y - (1 - s.bulb) * 10}) scale(${.6 + .4 * s.bulb})`); bulb.style.transformOrigin = "80px -12px";
      glass.setAttribute("opacity", s.mag);
    }

    function step(t) {
      tweens = tweens.filter((tw) => {
        const k = Math.min(1, (t - tw.t0) / tw.d), e = tw.e(k);
        for (const key in tw.to) s[key] = tw.from[key] + (tw.to[key] - tw.from[key]) * e;
        if (k >= 1) { tw.done(); return false; }
        return true;
      });
      render(t);
    }

    /** Tween to a partial pose. Arms may be given by name: {armR:"wave", armL:"up"}. */
    function to(p, d = 250, e = ease.out) {
      const target = { ...p };
      if (p.armR) Object.assign(target, armTargets("r", p.armR)); delete target.armR;
      if (p.armL) Object.assign(target, armTargets("l", p.armL)); delete target.armL;
      // a newer move takes over these parameters; a move left with nothing to do finishes now
      tweens = tweens.filter((tw) => { for (const k in target) delete tw.to[k]; if (Object.keys(tw.to).length) return true; tw.done(); return false; });
      if (reduced() || d <= 0) { Object.assign(s, target); return Promise.resolve(); }
      return new Promise((done) => { const from = {}; for (const k in target) from[k] = s[k]; tweens.push({ from, to: target, t0: performance.now(), d, e, done }); });
    }
    // holds keep their length with Reduce motion too: the expression still shows, it just doesn't move
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    async function seq(id, steps) { for (const [p, d, e] of steps) { if (id !== actionId) return false; if (p === "wait") await wait(d); else await to(p, d, e); } return id === actionId; }
    const begin = () => { thinking = false; sleeping = false; eyeManual = 0; return ++actionId; };
    const home = { x: 0, y: 0, rot: 0, sx: 1, sy: 1, rRot: 0, lRot: 0, open: 1, px: 0, py: 0, happy: 0, esz: 1, mw: 10, mc: 9, mo: 0, bt: 0, bo: 0, blush: .55, wink: 0, fL: 0, fR: 0, fS: 0, bulb: 0, mag: 0, armR: "down", armL: "down" };

    // ------------------------------------------------------------ effects
    function particles(kind, n = 18) {
      if (reduced()) return;
      const r = host.getBoundingClientRect(), W = r.width, H = r.height;
      const colors = [LIME, AMBER, "#7fd1b9", G];
      const list = [];
      for (let i = 0; i < n; i++) {
        const sp = document.createElement("span");
        let p;
        if (kind === "confetti") {
          sp.style.cssText = `width:${6 + Math.random() * 5}px;height:${4 + Math.random() * 4}px;background:${colors[i % colors.length]};border-radius:2px`;
          p = { x: W / 2, y: H * .3, vx: (Math.random() - .5) * 9, vy: -6 - Math.random() * 6, g: .32, r: Math.random() * 360, vr: (Math.random() - .5) * 20, life: 80 };
        } else if (kind === "z") {
          sp.textContent = i % 2 ? "z" : "Z"; sp.style.cssText = `font-weight:800;color:${G};font-size:${14 + i * 4}px`;
          p = { x: W * .68 + i * 8, y: H * .3, vx: .25, vy: -.6, g: 0, r: 0, vr: 0, life: 120, delay: i * 30 };
        } else if (kind === "sweat") {
          sp.style.cssText = `width:9px;height:12px;background:#7cc4f2;border-radius:50% 50% 50% 50%/60% 60% 40% 40%`;
          p = { x: W * .72, y: H * .32, vx: .3, vy: 0, g: .18, r: 0, vr: 0, life: 50 };
        } else if (kind === "heart") {
          sp.textContent = "♥"; sp.style.cssText = `color:#e2647a;font-size:${14 + Math.random() * 10}px;font-weight:800`;
          p = { x: W / 2 + (Math.random() - .5) * 40, y: H * .35, vx: (Math.random() - .5) * 1.5, vy: -1.6 - Math.random(), g: -.01, r: 0, vr: 0, life: 70, delay: i * 6 };
        } else if (kind === "flame") {
          const c = ["#ffd166", "#ff9f43", "#ff6b4a"][i % 3];
          sp.style.cssText = `width:${10 + Math.random() * 10}px;height:${10 + Math.random() * 10}px;border-radius:50%;background:radial-gradient(circle,#fff6c9 0%,${c} 55%,transparent 72%)`;
          p = { x: W / 2 + (Math.random() - .5) * 26, y: H * .86, vx: (Math.random() - .5) * 1.6, vy: 2.5 + Math.random() * 3, g: .05, r: 0, vr: 0, life: 22, delay: Math.floor(i / 2) };
        } else if (kind === "smoke") {
          sp.style.cssText = `width:${22 + Math.random() * 22}px;height:${22 + Math.random() * 22}px;border-radius:50%;background:radial-gradient(circle,rgba(200,200,200,.75),rgba(200,200,200,0) 70%)`;
          p = { x: W / 2 + (Math.random() - .5) * 60, y: H * .82, vx: (Math.random() - .5) * 2.6, vy: -.2 - Math.random() * .6, g: -.01, r: 0, vr: 0, life: 70, delay: i * 2 };
        } else if (kind === "star") {
          sp.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24"><path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.2l7.1-.6z" fill="${[AMBER, LIME, "#7fd1b9"][i % 3]}" stroke="#10211c" stroke-width="1.2"/></svg>`;
          const a = (i / n) * Math.PI * 2;
          p = { x: W / 2 - 9, y: H * .5, vx: Math.cos(a) * 4.2, vy: Math.sin(a) * 4.2 - 1.5, g: .12, r: 0, vr: (Math.random() - .5) * 14, life: 46 };
        } else if (kind === "spark") {
          sp.textContent = "✦"; sp.style.cssText = `color:${AMBER};font-size:${12 + Math.random() * 8}px`;
          const a = (i / n) * Math.PI * 2;
          p = { x: W / 2, y: H * .45, vx: Math.cos(a) * 3.4, vy: Math.sin(a) * 3.4, g: 0, r: 0, vr: 0, life: 32 };
        }
        p.el = sp; p.age = 0; fx.appendChild(sp); list.push(p);
      }
      const tick = () => {
        let alive = false;
        for (const p of list) {
          if (p.delay && p.delay-- > 0) { p.el.style.opacity = 0; alive = true; continue; }
          p.age++; p.vy += p.g; p.x += p.vx; p.y += p.vy; p.r += p.vr;
          const o = Math.max(0, 1 - p.age / p.life);
          p.el.style.transform = `translate(${p.x}px,${p.y}px) rotate(${p.r}deg)`; p.el.style.opacity = o;
          if (o > 0) alive = true; else p.el.remove();
        }
        if (alive) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }

    let bubbleTimer = 0, talkTimer = 0;
    function say(text, ms = 2600) {
      clearTimeout(bubbleTimer); clearInterval(talkTimer);
      bubble.textContent = ""; bubble.classList.add("show");
      if (reduced()) { bubble.textContent = text; bubbleTimer = setTimeout(() => bubble.classList.remove("show"), ms + text.length * 20); return; }
      let i = 0, flap = 0;
      talkTimer = setInterval(() => {
        i++; bubble.textContent = text.slice(0, i);
        flap++; if (!eyeManual) s.mo = (flap % 2 && /[aeiouAEIOU ]/.test(text[i - 1] || "")) ? .55 : (flap % 3 ? .25 : .05);
        if (i >= text.length) { clearInterval(talkTimer); to({ mo: 0 }, 120); bubbleTimer = setTimeout(() => bubble.classList.remove("show"), ms); }
      }, 34);
    }
    function hush() { clearTimeout(bubbleTimer); clearInterval(talkTimer); bubble.classList.remove("show"); }

    // ------------------------------------------------------------ actions
    const A = {
      async blink() { if (sleeping) return; await to({ open: .05 }, 70, ease.in); await to({ open: 1 }, 110, ease.out); },
      async neutral() { begin(); await to(home, 260, ease.inOut); },
      async wave(text) { opts.onSound?.("hello");
        const id = begin(); if (text) say(text);
        if (!await seq(id, [[{ sy: .94, sx: 1.05, y: 3, armR: "down", happy: 0, mc: 10, blush: .7 }, 110, ease.out], [{ sy: 1.03, sx: .98, y: -4, armR: "wave", mo: .35, mc: 12 }, 200, ease.back], [{ sy: 1, sx: 1, y: 0 }, 160]])) return;
        for (let i = 0; i < 3; i++) { if (!await seq(id, [[{ rRot: -24, rot: -2 }, 170, ease.inOut], [{ rRot: 10, rot: 2 }, 170, ease.inOut]])) return; }
        await seq(id, [[{ rRot: 0, rot: 0, mo: 0 }, 160], ["wait", 450], [{ armR: "down", mc: 9 }, 280, ease.inOut]]);
      },
      async jump(text) { opts.onSound?.("pop");
        const id = begin(); if (text) say(text);
        await seq(id, [[{ sy: .8, sx: 1.14, y: 7, armR: "out", armL: "out", open: .6, fS: 3 }, 150, ease.out],
          [{ sy: 1.14, sx: .9, y: -46, armR: "up", armL: "up", open: 1, happy: 1, mo: .6, fL: 5, fR: 5, fS: -2 }, 260, ease.out],
          [{ sy: 1, sx: 1 }, 90], [{ y: 0, sy: 1.08, sx: .94, fL: 0, fR: 0 }, 230, ease.in],
          [{ sy: .84, sx: 1.12, y: 4, fS: 4 }, 90, ease.out], [{ sy: 1, sx: 1, y: 0, fS: 0, happy: 0, mo: 0, armR: "down", armL: "down" }, 300, ease.back]]);
      },
      async celebrate(text = T("yay", "Yay! 🎉")) { opts.onSound?.("cheer");
        const id = begin(); say(text);
        for (let k = 0; k < 2; k++) {
          if (!await seq(id, [[{ sy: .8, sx: 1.14, y: 7, armR: "out", armL: "out", happy: 1, mo: .5, blush: .9, fS: 3 }, 130, ease.out],
            [{ sy: 1.15, sx: .9, y: -44, armR: "up", armL: "up", mo: .7, rot: k ? -6 : 6, fL: 6, fR: 4, fS: -2 }, 250, ease.out]])) return;
          if (k === 0) particles("confetti", 26);
          if (!await seq(id, [[{ y: 0, sy: 1.08, sx: .94, rot: 0, fL: 0, fR: 0 }, 230, ease.in], [{ sy: .86, sx: 1.1, y: 4, fS: 4 }, 90, ease.out]])) return;
        }
        await seq(id, [[{ sy: 1, sx: 1, y: 0 }, 260, ease.back], ["wait", 700], [{ ...home, happy: .0, mc: 11 }, 380, ease.inOut]]);
      },
      async nod(text) {
        const id = begin(); eyeManual = 1; if (text) say(text);
        await seq(id, [[{ py: 2.5, happy: .6, mc: 11, blush: .7 }, 120], [{ y: 4, sy: .97 }, 140, ease.inOut], [{ y: -1, sy: 1.01 }, 140, ease.inOut], [{ y: 4, sy: .97 }, 140, ease.inOut], [{ y: 0, sy: 1 }, 160, ease.out], ["wait", 500], [{ happy: 0, py: 0, mc: 9 }, 260]]);
        eyeManual = 0;
      },
      async shake(text) {
        const id = begin(); eyeManual = 1; if (text) say(text);
        await seq(id, [[{ bo: 1, bt: 1, mc: -5, mw: 8, armL: "hip", armR: "hip" }, 160],
          [{ rot: -7, px: -3 }, 120, ease.inOut], [{ rot: 7, px: 3 }, 160, ease.inOut], [{ rot: -5, px: -2 }, 150, ease.inOut], [{ rot: 3, px: 1 }, 140, ease.inOut], [{ rot: 0, px: 0 }, 140, ease.out],
          ["wait", 700], [{ bo: 0, bt: 0, mc: 9, mw: 10, armL: "down", armR: "down" }, 300]]);
        eyeManual = 0;
      },
      async surprise(text) {
        const id = begin(); if (text) say(text);
        await seq(id, [[{ y: -14, sy: 1.1, sx: .93, esz: 1.35, bo: 1, bt: -1.2, mw: 4.5, mc: 0, mo: .75, armR: "out", armL: "out" }, 150, ease.out],
          [{ y: 0, sy: 1, sx: 1 }, 260, ease.back], ["wait", 600], [{ esz: 1, bo: 0, bt: 0, mw: 10, mc: 9, mo: 0, armR: "down", armL: "down" }, 300]]);
      },
      async think(text) {
        const id = begin(); eyeManual = 1; if (text) say(text);
        // a little "hmm" settle: lean, hand to chin, lips pursed, then the cloud appears
        await seq(id, [[{ sy: .97, sx: 1.02 }, 120, ease.out], [{ sy: 1, sx: 1, px: 2.5, py: -3, armR: "chin", mc: -1, mw: 5, rot: -4, bo: .9, bt: .5, armL: "hip" }, 320, ease.back]]);
        if (id === actionId) thinking = true;
      },
      async stopThinking() { thinking = false; eyeManual = 0; await to({ px: 0, py: 0, rRot: 0, armR: "down", armL: "down", mc: 9, mw: 10, rot: 0, bo: 0, bt: 0 }, 260); },
      async idea(text = T("aha", "Aha! I've got it!")) { opts.onSound?.("ding");
        thinking = false; const id = begin(); eyeManual = 1;
        await seq(id, [[{ rRot: 0, py: -3, px: 0, esz: 1.3, bo: 1, bt: -1, sy: .92, sx: 1.05, y: 3 }, 120, ease.out],
          [{ bulb: 1, sy: 1.08, sx: .95, y: -10, armR: "up", armL: "out", mw: 6, mc: 2, mo: .7, happy: 0 }, 260, ease.back]]);
        say(text); particles("spark", 10);
        await seq(id, [[{ y: 0, sy: 1, sx: 1 }, 220, ease.back], ["wait", 900], [{ bulb: 0, esz: 1, bo: 0, bt: 0, mo: 0, mw: 10, mc: 10, armR: "down", armL: "down", py: 0 }, 360, ease.inOut]]);
        eyeManual = 0;
      },
      async search(text = T("searching", "Searching…")) {
        const id = begin(); eyeManual = 1; say(text, 2400);
        await seq(id, [[{ mag: 1, armR: "out", rot: 3, py: 1, esz: 1.15, mc: 2, mw: 7 }, 260, ease.back]]);
        for (let i = 0; i < 2; i++) {
          if (!await seq(id, [[{ x: -10, rot: -5, px: -3.2, rRot: -14 }, 420, ease.inOut], [{ x: 10, rot: 5, px: 3.2, rRot: 12 }, 520, ease.inOut]])) return;
        }
        await seq(id, [[{ x: 0, rot: 0, px: 0, rRot: 0 }, 260], [{ mag: 0, armR: "down", esz: 1, mc: 9, mw: 10, py: 0 }, 260]]);
        eyeManual = 0;
      },
      async yawn() {
        const id = begin(); eyeManual = 1; say(T("yawn", "Yaaawn…"), 1600);
        await seq(id, [[{ armR: "up", armL: "up", sy: 1.12, sx: .92, y: -4, open: .1, mw: 6, mc: 0, mo: 1, rot: -3, fS: -1 }, 520, ease.inOut],
          ["wait", 500], [{ rot: 3 }, 300, ease.inOut], [{ armR: "down", armL: "down", sy: .95, sx: 1.04, y: 2, mo: 0, mw: 10, mc: 7, open: .5, rot: 0, fS: 0 }, 420, ease.inOut],
          [{ sy: 1, sx: 1, y: 0, open: 1, mc: 9 }, 280, ease.back]]);
        eyeManual = 0;
      },
      async sleep() {
        const id = begin(); eyeManual = 1; sleeping = true; hush();
        await seq(id, [[{ open: .06, px: 0, py: 2, mw: 4, mc: 0, mo: .35, rot: 4, y: 3, armR: "down", armL: "down", blush: .3 }, 600, ease.inOut]]);
        const zz = () => { if (sleeping && id === actionId) { particles("z", 3); setTimeout(zz, 2600); } }; zz();
      },
      async wake(text = T("hello", "Oh! Hello!")) {
        sleeping = false; await A.surprise(text); await A.wave();
      },
      async cover() {
        const id = begin(); eyeManual = 1;
        await seq(id, [[{ armR: "cover", armL: "cover", mc: 4, mw: 7, blush: .9, rot: 0, y: 2 }, 260, ease.back]]);
      },
      async peek() {
        const id = begin(); eyeManual = 1;
        await seq(id, [[{ armR: "peek", armL: "cover", px: 3, py: 0, mc: 8, wink: 0, open: 1 }, 220, ease.out]]);
      },
      async uncover(text) {
        const id = begin(); if (text) say(text);
        await seq(id, [[{ armR: "down", armL: "down", mc: 9, mw: 10, blush: .55, y: 0 }, 260, ease.inOut]]);
      },
      async dance(text = "♪ ♫") {
        const id = begin(); say(text);
        for (let i = 0; i < 4; i++) {
          const d = i % 2 ? 1 : -1;
          if (!await seq(id, [[{ x: 10 * d, rot: 9 * d, armR: d > 0 ? "up" : "out", armL: d > 0 ? "out" : "up", happy: 1, mo: .4, sy: .96 }, 230, ease.inOut], [{ sy: 1.03, y: -6 }, 120, ease.out], [{ y: 0, sy: 1 }, 110, ease.in]])) return;
        }
        await seq(id, [[home, 300, ease.inOut]]);
      },
      async worry(text) {
        const id = begin(); eyeManual = 1; if (text) say(text, 3200);
        await seq(id, [[{ bo: 1, bt: 1.1, mc: -6, mw: 7, px: -2, py: 1, armL: "chin", rot: -2, blush: .2 }, 280, ease.inOut]]);
        particles("sweat", 1);
      },
      async relief(text = T("phew", "Phew! All fixed.")) {
        const id = begin(); say(text);
        await seq(id, [[{ armR: "wipe", bo: .6, bt: .4, mc: 6, mw: 9 }, 260, ease.out], [{ rRot: -8 }, 160], [{ rRot: 6 }, 160], [{ rRot: 0, armR: "down", bo: 0, bt: 0, mc: 10 }, 260]]);
        await A.nod();
      },
      async point(text, dir = 1) {
        const id = begin(); eyeManual = 1; if (text) say(text, 3000);
        await seq(id, [[{ rot: 3 * dir, px: 3.4, py: 0, armR: "point", mc: 10, happy: 0 }, 260, ease.back]]);
        for (let i = 0; i < 2; i++) if (!await seq(id, [[{ rRot: -6 }, 160, ease.inOut], [{ rRot: 0 }, 160, ease.inOut]])) return;
      },
      async love(text = T("thanks", "Thank you! ♥")) {
        const id = begin(); say(text);
        await seq(id, [[{ armR: "heart", armL: "heart", happy: 1, blush: 1, sy: .97 }, 240, ease.out]]);
        particles("heart", 6);
        await seq(id, [["wait", 1200], [home, 320, ease.inOut]]);
      },
      async wink(text) {
        const id = begin(); if (text) say(text);
        await seq(id, [[{ wink: 1, mc: 11, rot: 4, blush: .8 }, 140], ["wait", 500], [{ wink: 0, rot: 0, mc: 9 }, 200]]);
      },
      async walk(dx, ms = 1600) {
        // the whole host walks across its container: bob + arm swing + lean (cartoon walk cycle)
        const id = begin();
        const start = parseFloat(host.dataset.walkX || "0"), end = start + dx, steps = Math.max(2, Math.round(Math.abs(dx) / 45));
        const face = dx > 0 ? 1 : -1;
        if (reduced()) { host.dataset.walkX = end; host.style.transform = `translateX(${end}px)`; return; }
        eyeManual = 1; s.px = 3 * face;
        const t0 = performance.now();
        await new Promise((done) => {
          const tick = (t) => {
            if (id !== actionId) return done();
            const k = Math.min(1, (t - t0) / ms), ph = k * steps * Math.PI;
            const x = start + (end - start) * ease.inOut(k);
            host.dataset.walkX = x; host.style.transform = `translateX(${x}px)`;
            s.y = -Math.abs(Math.sin(ph)) * 7; s.rot = 3 * face + Math.sin(ph) * 2; s.sy = 1 - Math.abs(Math.cos(ph)) * .04;
            s.rRot = Math.sin(ph) * 20; s.lRot = -Math.sin(ph) * 20; s.fL = Math.max(0, Math.sin(ph)) * 6; s.fR = Math.max(0, -Math.sin(ph)) * 6; s.rA0 = 140; s.rA1 = 114; s.rA2 = 137; s.rA3 = 132; s.lA0 = 20; s.lA1 = 114; s.lA2 = 23; s.lA3 = 132;
            if (k < 1) requestAnimationFrame(tick); else done();
          };
          requestAnimationFrame(tick);
        });
        await to({ y: 0, rot: 0, sy: 1, rRot: 0, lRot: 0, fL: 0, fR: 0 }, 200); eyeManual = 0; s.px = 0;
      },
      async confused(text) {
        const id = begin(); eyeManual = 1; if (text) say(text, 3000);
        await seq(id, [[{ armL: "head", rot: -6, bo: 1, bt: .5, mc: -2, mw: 7, px: -2, py: -2 }, 300, ease.inOut], [{ lRot: 8 }, 150], [{ lRot: -8 }, 150], [{ lRot: 6 }, 150], [{ lRot: 0 }, 150]]);
      },
      async launch(onCountdown) { opts.onSound?.("whoosh");
        // Go live: count down, crouch, blast off out of the frame, then float back down and land
        const id = begin(); eyeManual = 1;
        await seq(id, [[{ bo: 1, bt: -.6, esz: 1.1, py: -2, mc: 6, armR: "out", armL: "out" }, 220, ease.out]]);
        for (const n of ["3", "2", "1"]) { if (id !== actionId) return; onCountdown?.(n); say(n + "…", 500); await seq(id, [[{ sy: .93, sx: 1.05, y: 3 }, 160, ease.out], [{ sy: 1, sx: 1, y: 0 }, 200, ease.back], ["wait", 260]]); }
        if (id !== actionId) return;
        onCountdown?.("go"); say(T("goLive", "Go live! 🚀"), 900);
        await seq(id, [[{ sy: .72, sx: 1.2, y: 10, fS: 5, armR: "down", armL: "down", happy: 1, mo: .55, bt: 0, bo: 0 }, 240, ease.out]]);
        particles("smoke", 12); particles("flame", 30);
        await seq(id, [[{ sy: 1.25, sx: .82, y: -320, armR: "up", armL: "up", fL: 6, fR: 6, fS: -3 }, 620, ease.in]]);
        if (id !== actionId) return;
        onCountdown?.("live");
        await seq(id, [["wait", 500], [{ y: -40, sy: 1.08, sx: .94, rot: -6 }, 700, ease.out], [{ rot: 6 }, 260, ease.inOut], [{ y: 0, rot: 0, fL: 0, fR: 0 }, 260, ease.in], [{ sy: .82, sx: 1.16, y: 5, fS: 4 }, 100, ease.out], [{ sy: 1, sx: 1, y: 0, fS: 0 }, 300, ease.back]]);
        if (id !== actionId) return;
        particles("star", 12); eyeManual = 0;
        await A.celebrate(T("live", "Your flow is live! ✨"));
      },
      look(target) { lookAt = target || null; },
      say, hush, particles,
    };

    // ------------------------------------------------------------ idle life
    let idleTimer = 0;
    function idle() {
      clearTimeout(idleTimer);
      const next = level.v === "lively" ? 2200 + Math.random() * 3000 : 3000 + Math.random() * 4000;
      idleTimer = setTimeout(async () => {
        if (visible && level.v !== "off" && !reduced() && !sleeping && !tweens.length) {
          await A.blink();
          if (level.v === "lively" && Math.random() < .35) {
            const r = Math.random();
            if (r < .4) { eyeManual = 1; await to({ px: (Math.random() - .5) * 6, py: (Math.random() - .5) * 4 }, 220); await new Promise((q) => setTimeout(q, 700)); await to({ px: 0, py: 0 }, 220); eyeManual = 0; }
            else if (r < .7) { await to({ sy: .96, sx: 1.03 }, 120); await to({ sy: 1, sx: 1 }, 200, ease.back); }
            else { await to({ rot: -4 }, 260, ease.inOut); await to({ rot: 0 }, 300, ease.inOut); }
          }
        }
        idle();
      }, next);
    }

    // drag and drop with squash on landing (lively hosts)
    if (opts.draggable) {
      host.classList.add("grab");
      let drag = null;
      host.addEventListener("pointerdown", (e) => {
        drag = { x: e.clientX, y: e.clientY, ox: s.x, oy: s.y, moved: false, lx: e.clientX };
        host.setPointerCapture(e.pointerId);
      });
      host.addEventListener("pointermove", (e) => {
        if (!drag) return;
        const k = 208 / host.getBoundingClientRect().width;
        const dx = (e.clientX - drag.x) * k, dy = (e.clientY - drag.y) * k;
        if (Math.hypot(dx, dy) > 4 && !drag.moved) { drag.moved = true; begin(); eyeManual = 1; to({ open: 1, esz: 1.2, mw: 5, mc: 0, mo: .5, armR: "up", armL: "up", sy: 1.1, sx: .92 }, 120); }
        if (drag.moved) { s.x = drag.ox + dx; s.y = Math.min(0, drag.oy + dy); s.rot = Math.max(-18, Math.min(18, (e.clientX - drag.lx) * .9)); drag.lx = e.clientX; }
      });
      const drop = async () => {
        if (!drag) return; const moved = drag.moved; drag = null;
        if (!moved) { A.jump(T("tap", "Hehe!|That tickles!|Hi there!").split("|")[Math.floor(Math.random() * 3)]); return; }
        eyeManual = 0;
        const id = ++actionId;
        await seq(id, [[{ y: 0, rot: 0, sy: 1.05, sx: .95 }, 260, ease.in], [{ sy: .82, sx: 1.14 }, 90, ease.out], [{ sy: 1, sx: 1, esz: 1, mw: 10, mc: 9, mo: 0, armR: "down", armL: "down" }, 280, ease.back], [{ x: 0 }, 500, ease.inOut]]);
      };
      host.addEventListener("pointerup", drop); host.addEventListener("pointercancel", drop);
    }

    const io = new IntersectionObserver((es) => { visible = es.some((e) => e.isIntersecting); }, { threshold: .05 });
    io.observe(host);
    const api = { ...A, host, state: s, _tick: step, pose: (p, d, e) => to(p, d, e),
      destroy() { clearTimeout(idleTimer); clearTimeout(bubbleTimer); clearInterval(talkTimer); io.disconnect(); actionId++; tweens = []; Shifty.remove(api); host.innerHTML = ""; }, level: (v) => { if (v) level.v = v; return level.v; }, stop() { begin(); hush(); } };
    render(0); idle();
    return api;
  }

  const instances = [];
  return {
    create(host, opts) { start(); const a = create(host, opts); instances.push(a); return a; },
    remove(a) { const i = instances.indexOf(a); if (i >= 0) instances.splice(i, 1); },
    ease,
  };
})();
