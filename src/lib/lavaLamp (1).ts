import { PASSES, PASS_HEAD, SHOW, VERTEX } from './lavaShaders.ts';
import { BASE_COLOURS, LAMP_COLOURS, sprayInk, type LampColour } from './rhythm.ts';
import type { SoundTap } from './soundTap.ts';

// The lava lamp behind the viewer's pictures (spec feat-lava-lamp LL3). Not pure (it drives WebGL2); its numbers
// are the spec's. startLavaLamp returns a stop function, or null when the device cannot draw it (LL-R5: then black).
// Tuned for a backdrop that listens: soft glows and slow drift, but the sprays land where the music kicks — half on
// the edges, half anywhere in the wax — in more kinds than one, and each spray is a pair of hues that melt into the
// sprays around it.

export const DRAW_W = 576; // LL3-1: drawn at this size and scaled up
export const DRAW_H = 324;
const FLOW_W = 160;
const FLOW_H = 90;
const WAX_W = 256; // a coarser wax grid: bigger, softer shapes
const WAX_H = 144;
const PRESSURE_STEPS = 20;
const ASP = FLOW_W / FLOW_H;
const LAVA_RATE = 0.55; // LL3-2: the lava's own slow pace
const MAX_JETS = 8; // LL3-3: room for the different kinds of spray at once
const FADE_MIN = 0.01; // LL3-4: per second, while the lamp is under its budget
const FADE_EXCESS = 0.5; // and this much more per second for each budget's worth over it
const BUDGET = 0.25; // a quarter of the screen's worth of wax
// How much wax a heater or a spray adds per unit of strength and second: the area of its gaussian in the flow's
// units (a spray adds 2.2x per second, see the src pass).
const HEATER_AREA = (Math.PI * 0.005) / ASP;
const JET_AREA = ((Math.PI * 0.0045) / ASP) * 2.2;
const SEED_WAX = (8 * Math.PI * 0.006) / ASP;

type Ink = readonly [number, number, number];
type Tex = { t: WebGLTexture; f: WebGLFramebuffer; w: number; h: number };
type Pair = { rd: Tex; wr: Tex; swap(): void };
type Prog = { p: WebGLProgram; u: (_name: string) => WebGLUniformLocation | null };
interface Jet { pos: [number, number]; dir: [number, number]; col: Ink; col2: Ink; s: number; age: number; life: number; power: number; rad: number; radial: number }

// LL3-3: the kinds of spray. A gust is the old wide soft push; a puff blooms out of a point in every direction; a
// whip is a narrow fast dart; a shimmer is a fleck the treble scatters. Each carries its own push, life and width,
// and every jet rolls its own, so no two sprays are quite the same.
const KINDS = {
  gust: { power: 90, life: 0.7, rad: 0.0045, radial: 0 },
  puff: { power: 115, life: 0.6, rad: 0.0085, radial: 1 },
  whip: { power: 150, life: 0.5, rad: 0.0022, radial: 0 },
  shimmer: { power: 70, life: 0.35, rad: 0.0016, radial: 0 },
} as const;
type Kind = keyof typeof KINDS;

export function startLavaLamp(canvas: HTMLCanvasElement, tap: SoundTap, random: () => number = Math.random): (() => void) | null {
  canvas.width = DRAW_W;
  canvas.height = DRAW_H;
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, powerPreference: 'low-power' });
  if (!gl || gl.isContextLost() || !(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'))) return null;

  let P: Record<keyof typeof PASSES | 'show', Prog>;
  let vel: Pair, prs: Pair, wax: Pair, curlT: Tex, divT: Tex;
  try {
    const shader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      return s;
    };
    const vs = shader(gl.VERTEX_SHADER, VERTEX);
    const prog = (src: string): Prog => {
      const p = gl.createProgram()!;
      gl.attachShader(p, vs);
      gl.attachShader(p, shader(gl.FRAGMENT_SHADER, src));
      gl.bindAttribLocation(p, 0, 'a');
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
      const locs = new Map<string, WebGLUniformLocation | null>();
      return { p, u: n => { if (!locs.has(n)) locs.set(n, gl.getUniformLocation(p, n)); return locs.get(n)!; } };
    };
    const progs = {} as Record<keyof typeof PASSES | 'show', Prog>;
    for (const k of Object.keys(PASSES) as (keyof typeof PASSES)[]) progs[k] = prog(PASS_HEAD + PASSES[k]);
    progs.show = prog(SHOW);
    P = progs;
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const tex = (w: number, h: number): Tex => {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      const f = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('no float framebuffer');
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return { t, f, w, h };
    };
    const pair = (w: number, h: number): Pair => {
      const o: Pair = { rd: tex(w, h), wr: tex(w, h), swap() { const t = o.rd; o.rd = o.wr; o.wr = t; } };
      return o;
    };
    vel = pair(FLOW_W, FLOW_H);
    prs = pair(FLOW_W, FLOW_H);
    curlT = tex(FLOW_W, FLOW_H);
    divT = tex(FLOW_W, FLOW_H);
    wax = pair(WAX_W, WAX_H);
  } catch (err) {
    console.warn('lava lamp: cannot draw here', err);
    return null;
  }

  type Set = (_u: Prog['u'], _bind: (_name: string, _t: Tex) => void) => void;
  const run = (name: keyof typeof P, target: Tex | null, set: Set) => {
    const pr = P[name];
    gl.useProgram(pr.p);
    let unit = 0;
    set(pr.u, (n, t) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t.t);
      gl.uniform1i(pr.u(n), unit);
      unit++;
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.f : null);
    gl.viewport(0, 0, target ? target.w : DRAW_W, target ? target.h : DRAW_H);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const ST = [1 / FLOW_W, 1 / FLOW_H];
  const hp = new Float32Array(12); // heaters: x, y, radius², strength
  const hc = new Float32Array(9);
  const jp = new Float32Array(MAX_JETS * 4); // sprays: x, y, direction
  const jq = new Float32Array(MAX_JETS * 4); // strength, radius², push, radial?
  const jc = new Float32Array(MAX_JETS * 3); // core ink
  const jc2 = new Float32Array(MAX_JETS * 3); // rim ink
  const jets: Jet[] = [];
  const recent: LampColour[] = []; // the last three spray cores, which the heaters then puff (LL3-3)
  let sprays = 0;
  let held = SEED_WAX; // how much wax the lamp holds, as the budget counts it (LL3-4)

  // LL3-3: where a spray comes from. Half the time an edge, gusting inward with a wide random sway; half the time
  // anywhere in the wax, aimed wherever the moment sends it — no two land alike.
  const spot = (): { pos: [number, number]; dir: [number, number] } => {
    if (random() < 0.5) {
      const r = random();
      const side = r < 0.35 ? 0 : r < 0.7 ? 1 : r < 0.85 ? 2 : 3;
      const t = 0.08 + 0.84 * random();
      const pos: [number, number] = side === 0 ? [0.01, t] : side === 1 ? [0.99, t] : side === 2 ? [t, 0.99] : [t, 0.01];
      const n = side === 0 ? [1, 0] : side === 1 ? [-1, 0] : side === 2 ? [0, -1] : [0, 1];
      const a = (random() - 0.5) * 1.9;
      return { pos, dir: [n[0] * Math.cos(a) - n[1] * Math.sin(a), n[0] * Math.sin(a) + n[1] * Math.cos(a)] };
    }
    const pos: [number, number] = [0.08 + 0.84 * random(), 0.1 + 0.8 * random()];
    const a = random() * Math.PI * 2;
    return { pos, dir: [Math.cos(a), Math.sin(a)] };
  };

  const mixInk = (a: Ink, b: Ink, t: number): Ink => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const recentAvg = (): Ink => {
    if (!recent.length) return [0.5, 0.5, 0.5];
    const t = [0, 0, 0];
    for (const k of recent) { const c = LAMP_COLOURS[k]; t[0] += c[0]; t[1] += c[1]; t[2] += c[2]; }
    return [t[0] / recent.length, t[1] / recent.length, t[2] / recent.length];
  };

  // LL3-3 (and LL2-3): a spray of a kind, from a fresh random spot. The sound picks the colour pair; the core is
  // pulled a little toward the average of the recent sprays and the rim is the partner hue, so one hue melts into
  // the next instead of trading places. Life, push and width roll their own spread each time.
  const spawn = (kind: Kind, strength: number, core: LampColour, rim: LampColour) => {
    const k = KINDS[kind];
    const { pos, dir } = spot();
    const c = mixInk(LAMP_COLOURS[core], recentAvg(), 0.25);
    const c2 = mixInk(LAMP_COLOURS[rim], c, 0.45);
    const v = 0.8 + 0.4 * random();
    jets.push({ pos, dir, col: c, col2: c2, s: strength, age: 0, life: k.life * v, power: k.power * v, rad: k.rad * v, radial: k.radial });
    if (jets.length > MAX_JETS) jets.shift();
    recent.push(core);
    if (recent.length > 3) recent.shift();
  };

  run('seed', wax.wr, u => gl.uniform1f(u('asp'), ASP));
  wax.swap();

  const step = (dt: number, lt: number) => {
    const sd = dt * LAVA_RATE;
    let added = 0;
    for (let i = 0; i < 3; i++) {
      // a slow, smooth pulse, breathing a little harder while the bass and mid are up
      const w = 1.5 * Math.max(0, Math.sin(lt * 0.3 + i * 2.1)) ** 2 * (0.7 + 0.55 * bass + 0.2 * mid);
      hp.set([0.12 + 0.76 * (0.5 + 0.5 * Math.sin(lt * (0.04 + 0.015 * i) + i * 2.1)), 0.03, 0.005, w], i * 4);
      const colours = recent.length ? recent : BASE_COLOURS;
      hc.set(LAMP_COLOURS[colours[(Math.floor(lt / 14) + i) % colours.length]], i * 3);
      added += w * sd * HEATER_AREA;
    }
    for (let j = 0; j < MAX_JETS; j++) {
      const J = jets[j];
      jq[j * 4 + 1] = 0.0045; // the resting width, so an empty slot pushes nothing
      if (!J) { jq[j * 4] = 0; jq[j * 4 + 2] = 0; jq[j * 4 + 3] = 0; continue; }
      const s = J.s * Math.max(0, 1 - J.age / J.life);
      jp.set([J.pos[0], J.pos[1], J.dir[0], J.dir[1]], j * 4);
      jq[j * 4] = s; jq[j * 4 + 1] = J.rad; jq[j * 4 + 2] = J.power; jq[j * 4 + 3] = J.radial;
      jc.set(J.col, j * 3); jc2.set(J.col2, j * 3);
      added += s * dt * JET_AREA;
    }
    const fade = FADE_MIN + FADE_EXCESS * Math.max(0, held / BUDGET - 1);
    held = held * Math.exp(-dt * fade) + added;

    run('curl', curlT, (u, bind) => { gl.uniform2fv(u('tx'), ST); bind('v', vel.rd); });
    run('vort', vel.wr, (u, bind) => { gl.uniform2fv(u('tx'), ST); bind('v', vel.rd); bind('c', curlT); gl.uniform1f(u('k'), 3 + 2.5 * Math.min(1, 0.6 * bass + 0.4 * mid)); gl.uniform1f(u('dt'), dt); });
    vel.swap();
    run('force', vel.wr, (u, bind) => {
      bind('v', vel.rd); bind('d', wax.rd);
      gl.uniform1f(u('dt'), dt); gl.uniform1f(u('rate'), LAVA_RATE); gl.uniform1f(u('asp'), ASP);
      gl.uniform1f(u('boost'), 0.75 + 0.55 * bass + 0.3 * mid); // the whole flow breathes with the bass and mid
      gl.uniform4fv(u('hp'), hp); gl.uniform4fv(u('jp'), jp); gl.uniform4fv(u('jq'), jq);
    });
    vel.swap();
    run('src', wax.wr, (u, bind) => {
      bind('d', wax.rd);
      gl.uniform1f(u('dt'), dt); gl.uniform1f(u('rate'), LAVA_RATE); gl.uniform1f(u('fade'), fade); gl.uniform1f(u('asp'), ASP);
      gl.uniform4fv(u('hp'), hp); gl.uniform3fv(u('hc'), hc);
      gl.uniform4fv(u('jp'), jp); gl.uniform4fv(u('jq'), jq); gl.uniform3fv(u('jc'), jc); gl.uniform3fv(u('jc2'), jc2);
    });
    wax.swap();
    run('div', divT, (u, bind) => { gl.uniform2fv(u('tx'), ST); bind('v', vel.rd); });
    run('fade', prs.wr, (u, bind) => { bind('p', prs.rd); gl.uniform1f(u('s'), 0.8); });
    prs.swap();
    for (let i = 0; i < PRESSURE_STEPS; i++) {
      run('jac', prs.wr, (u, bind) => { gl.uniform2fv(u('tx'), ST); bind('p', prs.rd); bind('dv', divT); });
      prs.swap();
    }
    run('grad', vel.wr, (u, bind) => { gl.uniform2fv(u('tx'), ST); bind('p', prs.rd); bind('v', vel.rd); });
    vel.swap();
    run('adv', vel.wr, (u, bind) => { gl.uniform2fv(u('tx'), ST); bind('v', vel.rd); bind('s', vel.rd); gl.uniform1f(u('dt'), dt); gl.uniform1f(u('wall'), 1); });
    vel.swap();
    run('adv', wax.wr, (u, bind) => { gl.uniform2fv(u('tx'), ST); bind('v', vel.rd); bind('s', wax.rd); gl.uniform1f(u('dt'), dt); gl.uniform1f(u('wall'), 0); });
    wax.swap();
  };

  let raf = 0;
  let lost = false;
  let lt = 0;
  let clock = 0;
  let bass = 0;
  let mid = 0;
  let treb = 0;
  let whipCd = 0; // a short gap so the mids dart, not machine-gun
  let shimmerCd = 0; // and the treble scatters its flecks in flurries, not a hiss
  let stirCd = 0; // and a loud low end keeps nudging the wax between the beats
  let last = performance.now();
  const ease = (cur: number, target: number, dt: number, up: number, down: number) =>
    cur + (target - cur) * (1 - Math.exp(-dt * (target > cur ? up : down)));
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (dt <= 0 || lost) return;
    clock += dt;
    lt += dt * LAVA_RATE;
    const b = tap.read(dt);
    bass = ease(bass, b.bass, dt, 30, 6);
    mid = ease(mid, b.mid, dt, 8, 2.5);
    treb = ease(treb, b.treble, dt, 12, 4); // fast up and quick down: the treble flickers
    whipCd -= dt; shimmerCd -= dt; stirCd -= dt;
    if (b.beat > 0.55) {
      // a clear beat still stirs the lamp, but the louder the hit the harder it lands, and a big bass beat blooms
      // out of a point instead of gusting in from the edge
      const loud = Math.min(1, 0.6 * bass + 0.4 * mid);
      const ink = sprayInk(b, sprays++);
      if (b.beat > 0.8 && bass > 0.5) spawn('puff', 0.3 + 0.4 * loud, ink.core, ink.rim);
      else spawn('gust', 0.22 + 0.45 * loud, ink.core, ink.rim);
    }
    // and each band answers in its own voice: the mids dart, the treble scatters flecks, and a loud low end nudges
    // the wax along even between the beats
    if (mid > 0.6 && whipCd <= 0) {
      const ink = sprayInk(b, sprays++, 'mid');
      spawn('whip', 0.18 + 0.3 * mid, ink.core, ink.rim);
      whipCd = 0.3 + 0.3 * random();
    }
    if (treb > 0.45 && shimmerCd <= 0) {
      const n = random() < 0.6 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const ink = sprayInk(b, sprays++, 'treble');
        spawn('shimmer', 0.1 + 0.25 * treb, ink.core, ink.rim);
      }
      shimmerCd = 0.14 + 0.1 * random();
    }
    if (bass > 0.6 && stirCd <= 0) {
      const ink = sprayInk(b, sprays++);
      spawn(random() < 0.5 ? 'gust' : 'puff', 0.15 + 0.2 * bass, ink.core, ink.rim);
      stirCd = 0.4 + 0.4 * random();
    }
    for (const J of jets) J.age += dt;
    for (let i = jets.length - 1; i >= 0; i--) if (jets[i].age > jets[i].life) jets.splice(i, 1);
    step(dt, lt);
    run('show', null, (u, bind) => {
      gl.uniform2f(u('uSize'), DRAW_W, DRAW_H);
      gl.uniform1f(u('uT'), clock % 600);
      gl.uniform1f(u('uGlow'), Math.min(1, 0.45 * bass + 0.25 * mid + 0.3 * treb));
      bind('uDye', wax.rd);
    });
  };
  const onLost = (e: Event) => { e.preventDefault(); lost = true; };
  canvas.addEventListener('webglcontextlost', onLost);
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    canvas.removeEventListener('webglcontextlost', onLost);
    // The context is never killed explicitly: in dev StrictMode simulates an unmount and the re-mount reuses
    // this same canvas and context, and on a real unmount the canvas is garbage-collected, context with it.
  };
}
