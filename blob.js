/**
 * Interactive dotted sphere ("blob") for the hero section.
 *
 *  - Hover / touch  → dots swell, push away from the cursor and glow hot
 *  - Click / tap    → a shock-wave ripples across the surface
 *  - Drag / swipe   → spins the sphere (with inertia)
 *  - Idle           → slow rotation + a soft "hint" ripple every few seconds
 *
 * three.js is loaded through the import map in index.html.
 */
import * as THREE from 'three';

/* ───────────────────────────── CONFIG ───────────────────────────── */
const CONFIG = {
  side: 'left',        // 'left' | 'right' – which side of the hero the sphere sits on
  palette: 'ember',    // burnt orange → deep orange, with an ivory hot-spot
  sizeScale: 1,        // 1 = automatic size, 1.2 = 20 % bigger, 0.8 = 20 % smaller
  rings: 84,           // dot density: total dots ≈ rings² × 1.27
  idleSpin: 0.16,      // rad / s – resting rotation speed
  maxPixelRatio: 2,    // cap for retina screens (performance)
  autoPulse: true,     // periodic ripple that hints the sphere can be touched
};

const PALETTES = {
  ember: {
    a: '#ff6a2a', b: '#d94b20', hot: '#f4efe6',
    glowA: 'rgba(255, 106, 42, 0.20)', glowB: 'rgba(217, 75, 32, 0.09)',
  },
};

/* ───────────────────────────── SHADERS ───────────────────────────── */
const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uSize;            // dot size in CSS px (at the sphere's centre plane)
  uniform float uPixelRatio;
  uniform float uCamDist;
  uniform float uBreathe;         // 0 when reduced-motion is on
  uniform float uOpacity;
  uniform float uHoverSigma;      // angular radius (rad) of the hover bulge
  uniform float uPointerStrength; // 0..1
  uniform vec3  uPointerDir;      // pointer position on the sphere, local space, unit length
  uniform vec3  uRippleDir[4];
  uniform float uRippleAge[4];    // seconds since the ripple started, < 0 = inactive
  uniform vec3  uColA;
  uniform vec3  uColB;
  uniform vec3  uColHot;

  attribute float aSeed;

  varying vec3  vColor;
  varying float vAlpha;

  void main() {
    vec3 dir = normalize(position);

    // 1. idle shimmer
    float radius = 1.0 + sin(uTime * 0.9 + aSeed * 6.2831853) * 0.012 * uBreathe;

    // 2. pointer: bulge outwards and push dots away from the cursor
    float cosA  = clamp(dot(dir, uPointerDir), -1.0, 1.0);
    float ang   = acos(cosA);
    float hover = exp(-(ang * ang) / (2.0 * uHoverSigma * uHoverSigma)) * uPointerStrength;
    radius += hover * 0.15;

    vec3  away    = dir - uPointerDir * cosA;
    float awayLen = length(away);
    vec3  push    = awayLen > 0.0001 ? away / awayLen : vec3(0.0);
    vec3  p       = dir * radius + push * hover * 0.06 * smoothstep(0.0, 0.3, ang);

    // 3. click / tap ripples
    float wave = 0.0;
    for (int i = 0; i < 4; i++) {
      float age = uRippleAge[i];
      if (age >= 0.0) {
        float a = acos(clamp(dot(dir, uRippleDir[i]), -1.0, 1.0));
        float d = (a - age * 2.3) / 0.22;
        wave += exp(-d * d) * exp(-age * 1.35);
      }
    }
    p += dir * wave * 0.13;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    // view-space normal (the object is only rotated, never scaled)
    vec3  n      = normalize(mat3(modelViewMatrix) * dir);
    float facing = n.z;                       // 1 = looking straight at the camera

    // colour: primary orange (upper-left) → secondary orange (right), lit from the upper-left, rim glow
    float t   = smoothstep(-0.6, 0.9, n.x * 0.8 - n.y * 0.3);
    float lit = smoothstep(-0.4, 0.9, dot(n, normalize(vec3(-0.4, 0.5, 0.75))));
    float rim = pow(1.0 - clamp(facing, 0.0, 1.0), 2.0);
    vec3  col = mix(uColA, uColB, t) * (0.58 + 0.5 * lit + 0.5 * rim);
    col = mix(col, uColHot, clamp(hover * 0.55 + wave * 0.75, 0.0, 1.0));
    vColor = col;

    // the far side of the sphere fades out
    vAlpha = smoothstep(-0.12, 0.3, facing) * uOpacity;

    float size = uSize * uPixelRatio * (uCamDist / -mv.z);
    size *= 0.75 + 0.5 * clamp(facing, 0.0, 1.0);
    size *= 1.0 + hover * 0.6 + wave * 0.6;
    gl_PointSize = size;
  }
`;

const FRAG = /* glsl */ `
  varying vec3  vColor;
  varying float vAlpha;

  void main() {
    float d    = length(gl_PointCoord - 0.5) * 2.0;     // 0 = centre, 1 = edge
    float core = smoothstep(1.0, 0.55, d);
    float halo = smoothstep(1.0, 0.0, d) * 0.18;
    float a    = clamp((core + halo) * vAlpha, 0.0, 1.0);
    if (a < 0.004) discard;
    // premultiplied alpha (see the blending setup in blob.js)
    gl_FragColor = vec4(min(vColor, vec3(1.0)) * a, a);
  }
`;

/* ───────────────────────────── HELPERS ───────────────────────────── */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Plain 0..1 sRGB components – we deliberately bypass THREE.Color so that three's
// colour management does not convert them to linear (the shader writes sRGB directly).
function hexToVec3(hex) {
  const n = parseInt(hex.slice(1), 16);
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Dots laid out in latitude rings, evenly spaced (≈ the look of the reference). */
function buildLattice(rings) {
  const pos = [];
  const seed = [];
  for (let i = 0; i < rings; i++) {
    const phi = ((i + 0.5) / rings) * Math.PI;                 // 0 (north pole) … π (south pole)
    const s = Math.sin(phi);
    const count = Math.max(1, Math.round(2 * rings * s));
    const offset = (i % 2) * 0.5;                              // stagger neighbouring rings
    for (let j = 0; j < count; j++) {
      const theta = ((j + offset) / count) * Math.PI * 2;
      pos.push(s * Math.cos(theta), Math.cos(phi), s * Math.sin(theta));
      seed.push(Math.random());
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
  return geo;
}

/* ─────────────────────────────── INIT ─────────────────────────────── */
function init() {
  const hero = document.getElementById('hero');
  const layer = document.getElementById('blobLayer');
  const canvas = document.getElementById('blobCanvas');
  if (!hero || !layer || !canvas) return;
  const glowEl = layer.querySelector('.blob-glow');

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas, alpha: true, antialias: false, powerPreference: 'high-performance',
    });
  } catch (err) {
    console.warn('[blob] WebGL is not available – skipping the sphere.', err);
    layer.remove();
    return;
  }
  renderer.setClearColor(0x000000, 0);
  canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const palette = PALETTES[CONFIG.palette] || PALETTES.ember;
  layer.style.setProperty('--blob-glow-a', palette.glowA);
  layer.style.setProperty('--blob-glow-b', palette.glowB);

  /* ── scene ── */
  const CAM_DIST = 5.2;
  const PAD = 1.55; // canvas side = sphere diameter × PAD (room for the glow & the bulge)
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    THREE.MathUtils.radToDeg(2 * Math.atan(PAD / CAM_DIST)), 1, 0.1, 50,
  );
  camera.position.set(0, 0, CAM_DIST);
  camera.updateMatrixWorld();

  const ripples = Array.from({ length: 4 }, () => ({ age: -1, dir: new THREE.Vector3(0, 1, 0) }));
  const uniforms = {
    uTime: { value: 0 },
    uSize: { value: 3 },
    uPixelRatio: { value: 1 },
    uCamDist: { value: CAM_DIST },
    uBreathe: { value: reduceMotion ? 0 : 1 },
    uOpacity: { value: 1 },
    uHoverSigma: { value: 0.42 },
    uPointerStrength: { value: 0 },
    uPointerDir: { value: new THREE.Vector3(0, 0, 1) },
    uRippleDir: { value: ripples.map((r) => r.dir) },
    uRippleAge: { value: ripples.map((r) => r.age) },
    uColA: { value: hexToVec3(palette.a) },
    uColB: { value: hexToVec3(palette.b) },
    uColHot: { value: hexToVec3(palette.hot) },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    // premultiplied additive: dots add up (glow where they overlap) and the alpha
    // channel stays valid for the page composite behind the transparent canvas
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
  });

  const blob = new THREE.Points(buildLattice(CONFIG.rings), material);
  blob.frustumCulled = false;
  blob.rotation.set(0.55, 0.6, -0.3); // pole tilted towards the viewer, like the reference
  scene.add(blob);

  /* ── layout: size & place the sphere next to the hero text ── */
  let D = 400;      // sphere diameter in CSS px
  const UNIT = new THREE.Sphere(new THREE.Vector3(), 1);

  function layout() {
    const hr = hero.getBoundingClientRect();
    if (hr.width < 10 || hr.height < 10) return;

    const topEl = hero.querySelector('.hero-badge') || hero.querySelector('.hero-headline');
    const botEl = hero.querySelector('.hero-actions') || hero.querySelector('.hero-sub') || topEl;
    let blockTop = hr.height * 0.12;
    let blockBot = hr.height * 0.6;
    if (topEl && botEl) {
      blockTop = topEl.getBoundingClientRect().top - hr.top;
      blockBot = botEl.getBoundingClientRect().bottom - hr.top;
    }
    const blockH = Math.max(blockBot - blockTop, 220);
    const narrow = hr.width < 760;

    D = clamp(Math.min(blockH * 0.95, hr.width * (narrow ? 0.62 : 0.4)) * CONFIG.sizeScale, 170, 680);
    const edge = Math.max(D / 2 + 6, hr.width * 0.2);
    const cx = CONFIG.side === 'right' ? hr.width - edge : edge;
    const cy = blockTop + blockH * (narrow ? 0.4 : 0.55); // phones: sit behind the headline

    const S = Math.round(D * PAD);
    const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.maxPixelRatio);
    renderer.setPixelRatio(dpr);
    renderer.setSize(S, S, false);
    canvas.style.width = `${S}px`;
    canvas.style.height = `${S}px`;
    canvas.style.left = `${Math.round(cx - S / 2)}px`;
    canvas.style.top = `${Math.round(cy - S / 2)}px`;

    if (glowEl) {
      const G = Math.round(D * 1.9);
      glowEl.style.width = `${G}px`;
      glowEl.style.height = `${G}px`;
      glowEl.style.left = `${Math.round(cx - G / 2)}px`;
      glowEl.style.top = `${Math.round(cy - G / 2)}px`;
    }

    uniforms.uPixelRatio.value = dpr;
    uniforms.uSize.value = clamp(D * 0.0085, 1.8, 5);
    uniforms.uOpacity.value = narrow ? 0.7 : 1; // keep text legible on phones
    renderer.render(scene, camera);
  }

  /* ── interaction state ── */
  const ptr = { active: false, ndc: new THREE.Vector2(), smooth: new THREE.Vector2() };
  const drag = { on: false, id: -1, x: 0, y: 0, t: 0, lastMove: 0 };
  const vel = new THREE.Vector2(); // angular velocity (rad/s): x = about screen X, y = about screen Y
  let hoverStrength = 0;
  let cursorGrab = false;

  const raycaster = new THREE.Raycaster();
  const hit = new THREE.Vector3();
  const dirLocal = new THREE.Vector3();
  const tmpNdc = new THREE.Vector2();
  let probeOver = false;

  /**
   * Casts a ray from the camera through `ndc`.
   * Writes the touched point (local space, unit length) into `out`.
   * Returns 1 when over the sphere, 0…1 when just outside its rim, 0 when far away.
   */
  function probe(ndc, out) {
    raycaster.setFromCamera(ndc, camera);
    const ray = raycaster.ray;
    let strength;
    if (ray.intersectSphere(UNIT, hit)) {
      probeOver = true;
      strength = 1;
    } else {
      probeOver = false;
      ray.closestPointToPoint(UNIT.center, hit);
      const dist = hit.length();
      if (dist >= 1.28 || dist === 0) return 0;
      strength = 1 - (dist - 1) / 0.28;
    }
    blob.updateMatrixWorld();
    out.copy(hit);
    blob.worldToLocal(out);
    if (out.lengthSq() === 0) return 0;
    out.normalize();
    return strength;
  }

  const qTmp = new THREE.Quaternion();
  const AXIS_X = new THREE.Vector3(1, 0, 0);
  const AXIS_Y = new THREE.Vector3(0, 1, 0);
  /** Rotate about the *screen* axes (so dragging always feels natural). */
  function spin(rx, ry) {
    if (ry) blob.quaternion.premultiply(qTmp.setFromAxisAngle(AXIS_Y, ry));
    if (rx) blob.quaternion.premultiply(qTmp.setFromAxisAngle(AXIS_X, rx));
    blob.quaternion.normalize();
  }

  let rippleIdx = 0;
  function addRipple(dir) {
    const r = ripples[rippleIdx];
    rippleIdx = (rippleIdx + 1) % ripples.length;
    r.age = 0;
    r.dir.copy(dir);
  }

  const INTERACTIVE = 'a, button, input, textarea, select, label, summary, [role="button"]';

  function setPointer(e) {
    const r = canvas.getBoundingClientRect();
    ptr.ndc.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -(((e.clientY - r.top) / r.height) * 2 - 1),
    );
    if (!ptr.active) ptr.smooth.copy(ptr.ndc);
    ptr.active = true;
  }

  function setCursor(grab) {
    if (grab === cursorGrab) return;
    cursorGrab = grab;
    if (!drag.on) hero.style.cursor = grab ? 'grab' : '';
  }

  hero.addEventListener('pointermove', (e) => {
    setPointer(e);

    if (drag.on && e.pointerId === drag.id) {
      const now = performance.now();
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      const dtm = Math.max((now - drag.t) / 1000, 0.001);
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.t = now;
      drag.lastMove = now;
      const k = 2 / D; // dragging one sphere radius ≈ 1 rad
      spin(dy * k, dx * k);
      vel.x = clamp(vel.x + ((dy * k) / dtm - vel.x) * 0.5, -9, 9);
      vel.y = clamp(vel.y + ((dx * k) / dtm - vel.y) * 0.5, -9, 9);
      return;
    }

    probe(ptr.ndc, dirLocal);
    setCursor(probeOver && !e.target.closest(INTERACTIVE));
  });

  hero.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest(INTERACTIVE)) return;
    setPointer(e);
    ptr.smooth.copy(ptr.ndc);
    if (!probe(ptr.ndc, dirLocal) || !probeOver) return; // pressed somewhere else → ignore

    drag.on = true;
    drag.id = e.pointerId;
    drag.x = e.clientX;
    drag.y = e.clientY;
    drag.t = drag.lastMove = performance.now();
    vel.set(0, 0);
    hero.classList.add('blob-dragging');
    hero.style.cursor = 'grabbing';
    try { hero.setPointerCapture(e.pointerId); } catch (_) { /* not critical */ }
    if (window.getSelection) window.getSelection().removeAllRanges();
    addRipple(dirLocal);
  });

  function endDrag(e) {
    if (!drag.on || e.pointerId !== drag.id) return;
    drag.on = false;
    if (performance.now() - drag.lastMove > 90) vel.set(0, 0); // held still before release → no fling
    hero.classList.remove('blob-dragging');
    hero.style.cursor = cursorGrab ? 'grab' : '';
    try { hero.releasePointerCapture(e.pointerId); } catch (_) { /* already released */ }
  }

  hero.addEventListener('pointerup', (e) => {
    endDrag(e);
    if (e.pointerType !== 'mouse') ptr.active = false; // touch has no hover state
  });
  hero.addEventListener('pointercancel', (e) => {
    endDrag(e);
    ptr.active = false;
  });
  hero.addEventListener('pointerleave', () => {
    if (drag.on) return;
    ptr.active = false;
    setCursor(false);
  });

  /* ── render loop ── */
  let running = false;
  let inView = true;
  let raf = 0;
  let last = 0;
  let time = 0;
  let pulseTimer = 1.4;
  const idleSpin = reduceMotion ? 0 : CONFIG.idleSpin;

  function tick(now) {
    raf = 0;
    if (!running) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    time += dt;

    // rotation: idle spin about the sphere's own (tilted) axis + inertia from the last drag
    if (!drag.on) {
      if (idleSpin) blob.rotateY(idleSpin * (1 - 0.7 * hoverStrength) * dt);
      if (vel.lengthSq() > 1e-5) {
        spin(vel.x * dt, vel.y * dt);
        vel.multiplyScalar(Math.exp(-dt * 2.2));
      } else {
        vel.set(0, 0);
      }
    }
    blob.updateMatrixWorld();

    // pointer influence
    let target = 0;
    if (ptr.active) {
      ptr.smooth.lerp(ptr.ndc, 1 - Math.exp(-dt * 16));
      target = probe(ptr.smooth, dirLocal);
      if (target > 0) uniforms.uPointerDir.value.copy(dirLocal);
    }
    hoverStrength += (target - hoverStrength) * (1 - Math.exp(-dt * 10));
    uniforms.uPointerStrength.value = hoverStrength;

    // hint ripple while nobody is touching it
    if (CONFIG.autoPulse && !reduceMotion) {
      if (ptr.active || drag.on) {
        pulseTimer = Math.max(pulseTimer, 4);
      } else {
        pulseTimer -= dt;
        if (pulseTimer <= 0) {
          pulseTimer = 6 + Math.random() * 3;
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * 0.4;
          tmpNdc.set(Math.cos(a) * r, Math.sin(a) * r);
          if (probe(tmpNdc, dirLocal) > 0) addRipple(dirLocal);
        }
      }
    }

    for (let i = 0; i < ripples.length; i++) {
      const r = ripples[i];
      if (r.age >= 0) {
        r.age += dt;
        if (r.age > 3.0) r.age = -1;
      }
      uniforms.uRippleAge.value[i] = r.age;
    }

    uniforms.uTime.value = time;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  }

  function sync() {
    const shouldRun = inView && !document.hidden;
    if (shouldRun && !running) {
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    } else if (!shouldRun && running) {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  new IntersectionObserver((entries) => {
    inView = entries[entries.length - 1].isIntersecting;
    sync();
  }).observe(hero);
  document.addEventListener('visibilitychange', sync);

  /* ── keep the layout right when the page changes size or fonts load ── */
  let layoutRaf = 0;
  const scheduleLayout = () => {
    if (layoutRaf) return;
    layoutRaf = requestAnimationFrame(() => { layoutRaf = 0; layout(); });
  };
  if ('ResizeObserver' in window) new ResizeObserver(scheduleLayout).observe(hero);
  window.addEventListener('resize', scheduleLayout);
  window.addEventListener('load', scheduleLayout);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleLayout);
  setTimeout(scheduleLayout, 400);
  setTimeout(scheduleLayout, 1200);

  layout();
  sync();
  requestAnimationFrame(() => layer.classList.add('is-ready'));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}