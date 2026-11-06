/**
 * Interactive "intelligence layer" – the relationship network inside the hero dashboard.
 *
 * Structure: FIRM in the centre → client hubs → clusters of people, organisations,
 * opportunities, matters and evidence. Curved edges get thicker with relationship strength
 * and the key links carry their weight as a number.
 *
 *  - Hover a node   → its connections light up, everything else dims, info card appears
 *  - Click / tap    → pins that node and updates the Connections / Opportunities / Evidence cards
 *  - Drag / swipe   → rotates the network in 3D (springs back to its home view)
 *  - Sidebar tabs   → switch "lens" (Clients, Matters, Relationships, Opportunities, Evidence)
 *  - Idle           → gentle sway, travelling pulses, and an auto-tour that spotlights nodes
 *
 * three.js is loaded through the import map in index.html.
 */
import * as THREE from 'three';

/* ───────────────────────────── CONFIG ───────────────────────────── */
const CONFIG = {
  autoTour: true,   // spotlight nodes one after another while nobody is interacting
  maxPixelRatio: 2, // cap for retina screens (performance)
  seed: 20261011,   // changes the (deterministic) arrangement of the satellites
};

/* ───────────────────────────── DATA ───────────────────────────── */
const TYPES = {
  firm:        { name: 'Your firm',    color: '#FF6A2A', label: '#f1efff' },
  client:      { name: 'Client',       color: '#D94B20', label: '#e0dbff' },
  org:         { name: 'Organisation', color: '#D94B20', label: '#cfc7ff' },
  person:      { name: 'Person',       color: '#D94B20', label: '#b9d0ec' },
  market:      { name: 'Market',       color: '#D94B20', label: '#b3bccf' },
  matter:      { name: 'Matter',       color: '#a78bfa', label: '#d4c9ff' },
  opportunity: { name: 'Opportunity',  color: '#34d67a', label: '#8cf2b3' },
  evidence:    { name: 'Evidence',     color: '#8b93a6', label: '#98a1b4' },
};

const TOTALS = [247, 12, 1842]; // what the three stat cards show when nothing is selected

// which node types are emphasised for each sidebar tab (key = lower-cased tab text)
const LENSES = {
  clients:       ['firm', 'client', 'org'],
  matters:       ['firm', 'matter'],
  relationships: ['firm', 'client', 'org', 'person', 'market'],
  opportunities: ['firm', 'client', 'opportunity'],
  evidence:      ['firm', 'evidence'],
};

// client hubs: p = position, w = strength of the link to the firm, nSat = satellites around it
const HUBS = [
  { id: 'ashfield',    label: 'Ashfield Capital', p: [-1.8, 0.3, 0.3],  w: 112, nSat: 13, stats: [38, 3, 214], note: 'Client · investor, 6 active matters' },
  { id: 'nexus',       label: 'Nexus Holdings',   p: [1.8, 0.35, -0.25],  w: 133, nSat: 14, stats: [52, 2, 301], note: 'Client · parent group, 4 subsidiaries mapped' },
  { id: 'halden',      label: 'Halden Partners',  p: [-0.85, -0.72, -0.35], w: 73,  nSat: 10, stats: [24, 1, 128], note: 'Client · lender, refinancing in progress' },
  { id: 'brightwater', label: 'Brightwater Group', p: [1.0, -0.7, 0.5], w: 68,  nSat: 11, stats: [31, 2, 176], note: 'Client · industrial group, expanding in the EU' },
  { id: 'corvane',     label: 'Corvane Partners', p: [0.0, 0.78, -0.5],    w: 43,  nSat: 8,  stats: [19, 1, 92],  note: 'Client · advisory partner, introduced 3 deals' },
];

// hub ↔ hub links
const HUB_LINKS = [
  ['ashfield', 'corvane', 9], ['corvane', 'nexus', 8], ['ashfield', 'halden', 12],
  ['halden', 'brightwater', 8], ['brightwater', 'nexus', 11],
];

// people / organisations that sit between two hubs
const BRIDGES = [
  { id: 'jensen',    label: 'A. Jensen',    type: 'person', hubs: ['ashfield', 'halden'],      w: [41, 27], stats: [29, 1, 87] },
  { id: 'okafor',    label: 'R. Okafor',    type: 'person', hubs: ['nexus', 'corvane'],        w: [36, 22], stats: [24, 1, 74] },
  { id: 'atlas',     label: 'Atlas Trust',  type: 'org',    hubs: ['nexus', 'brightwater'],    w: [48, 19], stats: [33, 2, 142] },
  { id: 'lindqvist', label: 'M. Lindqvist', type: 'person', hubs: ['halden', 'brightwater'],   w: [25, 31], stats: [18, 0, 63] },
  { id: 'norden',    label: 'Norden Bank',  type: 'org',    hubs: ['ashfield', 'corvane'],     w: [33, 17], stats: [27, 1, 118] },
];

// nodes attached directly to the firm (p = rough start position)
const DIRECT = [
  { id: 'seriesb',  label: 'Series B',         type: 'opportunity', p: [0.4, 0.55, 0.45],   w: 24, hubs: ['nexus', 'ashfield'], stats: [8, 1, 42],  note: 'Matches your criteria · surfaced today' },
  { id: 'ma',       label: 'Cross-border M&A', type: 'opportunity', p: [-0.55, 0.5, -0.5],  w: 18, hubs: ['corvane'],           stats: [6, 1, 29],  note: 'Early signal · two filings in 30 days' },
  { id: 'market',   label: 'Market',           type: 'market',      p: [0.5, -0.5, 0.5],    w: 31, hubs: ['brightwater'],       stats: [61, 4, 356], note: 'Sector activity · 3 competitors tracked' },
  { id: 'matter',   label: 'Matter 2291',      type: 'matter',      p: [-0.45, -0.4, 0.55], w: 14, hubs: ['halden'],            stats: [11, 0, 64], note: 'Refinancing · opened 14 days ago' },
  { id: 'filings',  label: '3 filings',        type: 'evidence',    p: [0.85, 0.0, -0.6],   w: 9,  hubs: [],                    stats: [3, 0, 3],   note: 'Public registry · latest filed this week' },
  { id: 'press',    label: '2 announcements',  type: 'evidence',    p: [-0.85, -0.05, -0.6], w: 7, hubs: [],                    stats: [2, 0, 2],   note: 'Press releases · both in the last month' },
];

// name pools for the generated satellites
const POOLS = {
  person: ['R. Lindgren', 'S. Varga', 'T. Brandt', 'K. Moreau', 'L. Haddad', 'J. Weiss', 'P. Novak', 'E. Santos', 'D. Kerr', 'N. Ito', 'C. Alvarez', 'H. Berg', 'M. Garner', 'F. Duval', 'O. Strand', 'I. Petrov', 'B. Adeyemi', 'V. Costa', 'G. Hale', 'Y. Tanaka', 'U. Falk', 'W. Reyes', 'Z. Marek', 'Q. Doyle'],
  org: ['Aethel Partners', 'Xenia Corp', 'Investcorp', 'Meridian Corp', 'Vireo Labs', 'Kestrel Ltd', 'Orion Fund', 'Solace Group', 'Tarn Capital', 'Pallas Ltd', 'Corbel Trust', 'Hartwell & Co', 'Lumen Bio', 'Fenwick AG', 'Quarry Bank', 'Delta Freight', 'Ostra Holdings', 'Bexley Ltd', 'Harrow Fund', 'Wren Capital', 'Sable Group', 'Ivory Labs', 'Mosaic Ltd', 'Brisk Pay'],
  opportunity: ['Refinancing', 'Bolt-on deal', 'Co-investment', 'IPO window', 'Debt raise', 'Asset sale'],
  evidence: ['Court record', 'Registry update', 'Board minutes', 'Press release', 'Annual report', 'Regulator note'],
  matter: ['Matter 1874', 'Matter 3302', 'Matter 2640', 'Matter 1129'],
};
const SAT_TYPES = ['org', 'person', 'org', 'person', 'evidence', 'org', 'person', 'opportunity', 'org', 'person', 'matter', 'person', 'org', 'evidence'];

const TOUR = ['ashfield', 'seriesb', 'nexus', 'jensen', 'halden', 'market', 'brightwater', 'corvane'];

const SEG = 12; // segments per curved edge
const LIM_X = 2.6;  // layout box (world units) the camera is fitted to
const LIM_Y = 1.1;

/* ───────────────────────────── SHADERS ───────────────────────────── */
const POINT_VERT = /* glsl */ `
  uniform float uPixelRatio;
  uniform float uCamDist;
  uniform float uScale;

  attribute vec3  aColor;
  attribute float aSize;
  attribute float aAlpha;
  attribute float aGlow;
  attribute float aKind;   // 0 = ring node, 1 = tiny dot (shell / pulse), 2 = glowing satellite

  varying vec3  vColor;
  varying float vAlpha;
  varying float vGlow;
  varying float vKind;

  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;

    float depth = clamp((mv.z + uCamDist) / 1.4, -1.0, 1.0);   // -1 far … +1 near
    vColor = aColor;
    vGlow  = aGlow;
    vKind  = aKind;
    vAlpha = aAlpha * (0.72 + 0.28 * depth);
    gl_PointSize = aSize * uScale * uPixelRatio * (uCamDist / -mv.z) * (1.0 + aGlow * 0.18);
  }
`;

const POINT_FRAG = /* glsl */ `
  varying vec3  vColor;
  varying float vAlpha;
  varying float vGlow;
  varying float vKind;

  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;     // 0 = centre, 1 = edge

    float sel  = (1.0 - smoothstep(0.02, 0.05, abs(d - 0.88))) * smoothstep(0.7, 1.0, vGlow);

    // kind 0 – ring node: filled core + thin ring + soft halo
    float core  = 1.0 - smoothstep(0.24, 0.30, d);
    float ring  = (1.0 - smoothstep(0.035, 0.075, abs(d - 0.62))) * 0.9;
    float halo  = pow(max(1.0 - d, 0.0), 2.6) * (0.35 + 0.9 * vGlow);
    float ringA = core + ring + halo + sel * 0.9;

    // kind 1 – tiny dot
    float dotA = (1.0 - smoothstep(0.25, 0.5, d)) + pow(max(1.0 - d, 0.0), 2.0) * 0.4;

    // kind 2 – glowing satellite: bright pin-point core + halo
    float glowA = (1.0 - smoothstep(0.2, 0.34, d))
                + pow(max(1.0 - d, 0.0), 2.2) * (0.65 + 0.9 * vGlow)
                + sel * 0.9;

    float a = vKind < 0.5 ? ringA : (vKind < 1.5 ? dotA : glowA);
    a = clamp(a, 0.0, 1.0) * vAlpha;
    if (a < 0.004) discard;

    float white = vKind < 0.5
      ? core * 0.3 + vGlow * 0.25
      : (vKind < 1.5 ? 0.0 : (1.0 - smoothstep(0.0, 0.2, d)) * 0.6 + vGlow * 0.25);
    vec3 col = mix(vColor, vec3(1.0), white);
    gl_FragColor = vec4(min(col, vec3(1.0)) * a, a);   // premultiplied
  }
`;

// curved edges are screen-space ribbons: every vertex is pushed sideways by half the line width
const EDGE_VERT = /* glsl */ `
  uniform float uCamDist;
  uniform float uViewW;     // canvas size in CSS px
  uniform float uViewH;

  attribute vec3  aTan;     // curve tangent (3D)
  attribute float aSide;    // -1 / +1
  attribute float aWidth;   // line width in CSS px
  attribute vec3  aColor;
  attribute float aGlow;
  attribute float aDim;

  varying vec3  vColor;
  varying float vAlpha;
  varying float vSide;

  void main() {
    vec4 mv0 = modelViewMatrix * vec4(position, 1.0);
    vec4 c0  = projectionMatrix * mv0;
    vec4 c1  = projectionMatrix * (modelViewMatrix * vec4(position + aTan * 0.03, 1.0));

    vec2 view = vec2(uViewW, uViewH);
    vec2 d = (c1.xy / c1.w - c0.xy / c0.w) * view * 0.5;     // direction in CSS px
    float len = length(d);
    d = len > 0.00001 ? d / len : vec2(1.0, 0.0);
    vec2 n = vec2(-d.y, d.x);

    float w = aWidth * (1.0 + aGlow * 0.35);
    gl_Position = c0;
    gl_Position.xy += (n * (aSide * w * 0.5) * 2.0 / view) * c0.w;

    float depth = clamp((mv0.z + uCamDist) / 1.4, -1.0, 1.0);
    vColor = aColor;
    vSide  = aSide;
    vAlpha = aDim * (0.58 + 0.42 * aGlow) * (0.72 + 0.28 * depth);
  }
`;

const EDGE_FRAG = /* glsl */ `
  varying vec3  vColor;
  varying float vAlpha;
  varying float vSide;

  void main() {
    float soft = 1.0 - smoothstep(0.35, 1.0, abs(vSide));   // soft edge across the ribbon
    float a = vAlpha * soft;
    gl_FragColor = vec4(vColor * a, a);                     // premultiplied
  }
`;

/* ───────────────────────────── HELPERS ───────────────────────────── */
const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smoothK = (dt, rate) => 1 - Math.exp(-Math.max(dt, 0) * rate);

// plain 0..1 sRGB components (the shaders write sRGB directly, so no colour management)
function hex(h) {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// small deterministic random numbers – the arrangement is identical on every load
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cardHTML(n) {
  const t = TYPES[n.type];
  return (
    `<div class="gc-head"><span class="gc-dot" style="background:${t.color}"></span><strong>${n.label}</strong></div>` +
    `<div class="gc-type">${t.name}</div>` +
    `<div class="gc-note">${n.note}</div>` +
    `<div class="gc-stats"><span><b>${n.stats[0]}</b> links</span>` +
    `<span><b>${n.stats[1]}</b> new opps</span>` +
    `<span><b>${n.stats[2].toLocaleString('en-US')}</b> evidence</span></div>`
  );
}

/** Builds nodes + edges (deterministic) and relaxes the layout so satellites do not overlap. */
function buildGraph() {
  const rnd = mulberry32(CONFIG.seed);
  const nodes = [];
  const edges = [];
  const edgeSeen = new Set();
  const idOf = {};

  const addNode = (n) => {
    n.i = nodes.length;
    idOf[n.id] = n.i;
    nodes.push(n);
    return n;
  };
  const link = (a, b, w, key, label) => {
    const k = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (a === b || edgeSeen.has(k)) return;
    edgeSeen.add(k);
    edges.push({ a, b, w, key: !!key, label: !!label });
  };
  const unit = () => {
    const z = rnd() * 2 - 1;
    const t = rnd() * TAU;
    const r = Math.sqrt(1 - z * z);
    return [Math.cos(t) * r, Math.sin(t) * r, z];
  };

  // FIRM in the centre
  addNode({
    id: 'firm', label: 'FIRM', type: 'firm', kind: 0, size: 70, pri: 0, p: [0, 0, 0], fixed: true,
    stats: TOTALS.slice(), note: 'Your firm · all clients, matters and evidence in one place',
  });

  // client hubs
  HUBS.forEach((h) => {
    addNode({
      id: h.id, label: h.label, type: 'client', kind: 0, size: 48, pri: 1, p: h.p.slice(), fixed: true,
      stats: h.stats, note: h.note,
    });
  });
  HUBS.forEach((h) => link(idOf.firm, idOf[h.id], h.w, true, true));
  HUB_LINKS.forEach(([a, b, w]) => link(idOf[a], idOf[b], w, true, true));

  // bridges: sit between two hubs and connect both
  BRIDGES.forEach((br) => {
    const A = nodes[idOf[br.hubs[0]]].p;
    const B = nodes[idOf[br.hubs[1]]].p;
    const mid = [0, 1, 2].map((c) => (A[c] + B[c]) / 2);
    // sit a little outside the hub-to-hub link (away from the firm) so the link's number stays readable
    const out = Math.hypot(mid[0], mid[1], mid[2]) || 1;
    const spot = mid.map((v) => v + (v / out) * 0.36);
    const u = unit();
    addNode({
      id: br.id, label: br.label, type: br.type, kind: 0, size: 28, pri: 2,
      p: spot.map((v, c) => v + u[c] * 0.05), anchor: spot, rmax: 0.25,
      stats: br.stats, note: `Connects ${nodes[idOf[br.hubs[0]]].label} and ${nodes[idOf[br.hubs[1]]].label}`,
    });
    link(idOf[br.id], idOf[br.hubs[0]], br.w[0], true);
    link(idOf[br.id], idOf[br.hubs[1]], br.w[1], true);
  });

  // nodes attached directly to the firm
  DIRECT.forEach((d) => {
    addNode({
      id: d.id, label: d.label, type: d.type, kind: 2, size: 24, pri: 2, p: d.p.slice(), anchor: d.p.slice(), rmax: 0.35,
      stats: d.stats, note: d.note,
    });
    link(idOf.firm, idOf[d.id], d.w, true);
    d.hubs.forEach((hid) => link(idOf[d.id], idOf[hid], 2 + Math.floor(rnd() * 6), false));
  });

  // generated satellites around every hub
  const counters = { person: 0, org: 0, opportunity: 0, evidence: 0, matter: 0 };
  const nextName = (type) => {
    const pool = POOLS[type];
    const k = counters[type]++;
    return k < pool.length ? pool[k] : `${pool[k % pool.length]} ${Math.floor(k / pool.length) + 1}`;
  };
  const sizes = { org: 24, person: 20, opportunity: 24, evidence: 16, matter: 20 };
  const notes = {
    org: (h) => `Counterparty · ${h} network`,
    person: (h) => `Key contact · ${h}`,
    opportunity: (h) => `Surfaced via ${h} · matches your criteria`,
    evidence: (h) => `Public record linked to ${h}`,
    matter: (h) => `Active matter · ${h}`,
  };
  const range = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

  HUBS.forEach((h) => {
    const hubNode = nodes[idOf[h.id]];
    const mine = [];
    for (let s = 0; s < h.nSat; s++) {
      const type = SAT_TYPES[s % SAT_TYPES.length];
      const u = unit();
      const r = 0.3 + rnd() * 0.32;
      const p = [hubNode.p[0] + u[0] * r * 1.15, hubNode.p[1] + u[1] * r * 0.8, hubNode.p[2] + u[2] * r * 0.7];
      const stats = type === 'org' ? [range(8, 40), range(0, 2), range(30, 190)]
        : type === 'person' ? [range(4, 28), range(0, 1), range(12, 110)]
        : type === 'opportunity' ? [range(3, 9), 1, range(12, 48)]
        : type === 'matter' ? [range(5, 14), 0, range(25, 70)]
        : [range(1, 3), 0, range(1, 3)];
      const n = addNode({
        id: `${h.id}-${s}`, label: nextName(type), type, kind: 2, size: sizes[type], pri: 3,
        p, hub: hubNode.i, stats, note: notes[type](h.label),
      });
      link(n.i, hubNode.i, range(2, 9), false);
      mine.push(n.i);
    }
    // a few satellite ↔ satellite links inside the cluster
    for (let k = 0; k < 3; k++) {
      link(mine[Math.floor(rnd() * mine.length)], mine[Math.floor(rnd() * mine.length)], range(1, 5), false);
    }
  });

  // relax: push overlapping nodes apart, keep satellites in orbit around their hub
  for (let it = 0; it < 120; it++) {
    for (let i = 0; i < nodes.length; i++) {
      const A = nodes[i];
      if (A.fixed) continue;
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const B = nodes[j];
        const minD = B.fixed ? (B.id === 'firm' ? 0.42 : 0.34) : 0.2;
        const dx = A.p[0] - B.p[0];
        const dy = A.p[1] - B.p[1];
        const dz = A.p[2] - B.p[2];
        const d = Math.hypot(dx, dy, dz) || 0.0001;
        if (d < minD) {
          const push = (minD - d) * (B.fixed ? 0.5 : 0.25) / d;
          A.p[0] += dx * push;
          A.p[1] += dy * push;
          A.p[2] += dz * push;
        }
      }
      // keep everything inside the box the camera is fitted to
      A.p[0] = clamp(A.p[0], -LIM_X, LIM_X);
      A.p[1] = clamp(A.p[1], -LIM_Y, LIM_Y);
      A.p[2] = clamp(A.p[2], -1, 1);
      // orbit limits
      const anchor = A.anchor || (A.hub !== undefined ? nodes[A.hub].p : null);
      if (anchor) {
        const dx = A.p[0] - anchor[0];
        const dy = A.p[1] - anchor[1];
        const dz = A.p[2] - anchor[2];
        const d = Math.hypot(dx, dy, dz) || 0.0001;
        const lo = A.anchor ? 0 : 0.3;
        const hi = A.anchor ? A.rmax : 0.75;
        const target = clamp(d, lo, hi);
        if (target !== d) {
          A.p[0] = anchor[0] + (dx / d) * target;
          A.p[1] = anchor[1] + (dy / d) * target;
          A.p[2] = anchor[2] + (dz / d) * target;
        }
      }
    }
  }

  return { nodes, edges, idOf };
}

/* ─────────────────────────────── INIT ─────────────────────────────── */
function init() {
  const area = document.querySelector('.db-graph-area');
  const canvas = document.getElementById('graphCanvas');
  const labelsEl = document.getElementById('graphLabels');
  const cardEl = document.getElementById('graphCard');
  const hintEl = document.getElementById('graphHint');
  if (!area || !canvas || !labelsEl || !cardEl) return;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas, alpha: true, antialias: false, powerPreference: 'high-performance',
    });
  } catch (err) {
    // no WebGL → the original static SVG graph simply stays visible
    console.warn('[graph] WebGL is not available – keeping the static graph.', err);
    [canvas, labelsEl, cardEl, hintEl].forEach((el) => el && el.remove());
    return;
  }
  renderer.setClearColor(0x000000, 0);
  canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── graph structure ── */
  const { nodes: NODES, edges, idOf } = buildGraph();
  const N = NODES.length;
  const E = edges.length;
  const M = 260;            // dots in the little shell around the firm
  const SHELL_R = 0.3;
  const firmI = idOf.firm;

  const adj = NODES.map(() => new Set());
  edges.forEach(({ a, b }) => { adj[a].add(b); adj[b].add(a); });
  const LENS_SETS = {};
  Object.keys(LENSES).forEach((k) => { LENS_SETS[k] = new Set(LENSES[k]); });

  // bounds of the layout → used to fit the camera
  let boundX = 1;
  let boundY = 1;
  NODES.forEach((n) => {
    boundX = Math.max(boundX, Math.abs(n.p[0]));
    boundY = Math.max(boundY, Math.abs(n.p[1]));
  });

  // per-edge data: width, curvature, bend direction, pulse / weight-label slots
  const eWidth = new Float32Array(E);
  const eCurv = new Float32Array(E);
  const eBend = new Float32Array(E * 3);
  const ePulse = new Int16Array(E).fill(-1);
  const eLabel = new Int16Array(E).fill(-1);
  const pulseEdges = [];
  const weightEdges = [];
  const rndE = mulberry32(CONFIG.seed ^ 0x9e3779b9);
  edges.forEach((ed, e) => {
    eWidth[e] = ed.key ? (1.5 + 3.3 * Math.pow(Math.min(ed.w, 133) / 133, 0.6)) * (ed.label ? 1 : 0.75) : 1.7;
    eCurv[e] = (ed.key ? 0.16 : 0.1 + rndE() * 0.2) * (rndE() < 0.5 ? -1 : 1);
    const z = rndE() * 2 - 1;
    const t = rndE() * TAU;
    const r = Math.sqrt(1 - z * z);
    eBend[e * 3] = Math.cos(t) * r;
    eBend[e * 3 + 1] = Math.sin(t) * r;
    eBend[e * 3 + 2] = z;
    if (ed.key) {
      ePulse[e] = pulseEdges.length;
      pulseEdges.push(e);
    }
    if (ed.label) {
      eLabel[e] = weightEdges.length;
      weightEdges.push(e);
    }
  });
  const K = pulseEdges.length;
  const P = N + M + K;      // points: nodes + shell + one pulse per key edge

  // fibonacci-sphere dots for the firm shell
  const shell = new Float32Array(M * 3);
  for (let k = 0; k < M; k++) {
    const y = 1 - (2 * (k + 0.5)) / M;
    const r = Math.sqrt(1 - y * y);
    const th = k * 2.399963;
    shell[k * 3] = Math.cos(th) * r;
    shell[k * 3 + 1] = y;
    shell[k * 3 + 2] = Math.sin(th) * r;
  }

  /* ── GPU buffers: points ── */
  const pPos = new Float32Array(P * 3);
  const pCol = new Float32Array(P * 3);
  const pSize = new Float32Array(P);
  const pAlpha = new Float32Array(P);
  const pGlow = new Float32Array(P);
  const pKind = new Float32Array(P);

  NODES.forEach((n, i) => {
    pCol.set(hex(TYPES[n.type].color), i * 3);
    pSize[i] = n.size;
    pKind[i] = n.kind;
    pAlpha[i] = 1;
  });
  for (let k = 0; k < M; k++) {
    const i = N + k;
    pCol.set(hex('#b9a5ff'), i * 3);
    pSize[i] = 2.4;
    pKind[i] = 1;
  }

  /* ── GPU buffers: curved edge ribbons ── */
  const V = (SEG + 1) * 2;                  // vertices per edge
  const ePos = new Float32Array(E * V * 3);
  const eTan = new Float32Array(E * V * 3);
  const eSide = new Float32Array(E * V);
  const eWid = new Float32Array(E * V);
  const eCol = new Float32Array(E * V * 3);
  const eGlow = new Float32Array(E * V);
  const eDim = new Float32Array(E * V);
  const IDX = E * SEG * 6;
  const index = (E * V) < 65535 ? new Uint16Array(IDX) : new Uint32Array(IDX);

  edges.forEach(({ a, b }, e) => {
    const ca = hex(TYPES[NODES[a].type].color);
    const cb = hex(TYPES[NODES[b].type].color);
    const mid = [0, 1, 2].map((c) => (ca[c] + cb[c]) / 2);
    for (let j = 0; j <= SEG; j++) {
      for (let s = 0; s < 2; s++) {
        const v = e * V + j * 2 + s;
        eSide[v] = s === 0 ? -1 : 1;
        eWid[v] = eWidth[e];
        eCol.set(mid, v * 3);
      }
    }
    for (let j = 0; j < SEG; j++) {
      const v0 = e * V + j * 2;
      const o = (e * SEG + j) * 6;
      index[o] = v0; index[o + 1] = v0 + 1; index[o + 2] = v0 + 2;
      index[o + 3] = v0 + 1; index[o + 4] = v0 + 3; index[o + 5] = v0 + 2;
    }
  });

  // pulse colours (lighter than their edge)
  pulseEdges.forEach((e, k) => {
    const i = N + M + k;
    const ca = hex(TYPES[NODES[edges[e].a].type].color);
    const cb = hex(TYPES[NODES[edges[e].b].type].color);
    pCol.set([0, 1, 2].map((c) => ((ca[c] + cb[c]) / 2) * 0.65 + 0.35), i * 3);
    pSize[i] = 5;
    pKind[i] = 1;
  });
  const pulseSpeed = new Float32Array(K);
  const pulsePhase = new Float32Array(K);
  for (let k = 0; k < K; k++) {
    pulseSpeed[k] = 0.14 + 0.1 * ((k * 7) % 5) / 5;
    pulsePhase[k] = (k * 0.37) % 1;
  }

  const attr = (arr, size, dynamic) => {
    const a = new THREE.BufferAttribute(arr, size);
    if (dynamic) a.setUsage(THREE.DynamicDrawUsage);
    return a;
  };
  const posAttr = attr(pPos, 3, true);
  const alphaAttr = attr(pAlpha, 1, true);
  const glowAttr = attr(pGlow, 1, true);
  const ePosAttr = attr(ePos, 3, true);
  const eTanAttr = attr(eTan, 3, true);
  const eGlowAttr = attr(eGlow, 1, true);
  const eDimAttr = attr(eDim, 1, true);

  const pointGeo = new THREE.BufferGeometry();
  pointGeo.setAttribute('position', posAttr);
  pointGeo.setAttribute('aColor', attr(pCol, 3, false));
  pointGeo.setAttribute('aSize', attr(pSize, 1, false));
  pointGeo.setAttribute('aAlpha', alphaAttr);
  pointGeo.setAttribute('aGlow', glowAttr);
  pointGeo.setAttribute('aKind', attr(pKind, 1, false));

  const edgeGeo = new THREE.BufferGeometry();
  edgeGeo.setAttribute('position', ePosAttr);
  edgeGeo.setAttribute('aTan', eTanAttr);
  edgeGeo.setAttribute('aSide', attr(eSide, 1, false));
  edgeGeo.setAttribute('aWidth', attr(eWid, 1, false));
  edgeGeo.setAttribute('aColor', attr(eCol, 3, false));
  edgeGeo.setAttribute('aGlow', eGlowAttr);
  edgeGeo.setAttribute('aDim', eDimAttr);
  edgeGeo.setIndex(new THREE.BufferAttribute(index, 1));

  const uniforms = {
    uPixelRatio: { value: 1 },
    uCamDist: { value: 4.5 },
    uScale: { value: 1 },
    uViewW: { value: 1 },
    uViewH: { value: 1 },
  };
  const blendSetup = {
    transparent: true,
    depthTest: false,
    depthWrite: false,
    // premultiplied additive: overlapping glows add up, alpha stays valid for the page composite
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
  };
  const pointMat = new THREE.ShaderMaterial({ uniforms, vertexShader: POINT_VERT, fragmentShader: POINT_FRAG, ...blendSetup });
  // DoubleSide: ribbon triangles flip winding depending on the view, they must never be culled
  const edgeMat = new THREE.ShaderMaterial({
    uniforms, vertexShader: EDGE_VERT, fragmentShader: EDGE_FRAG, side: THREE.DoubleSide, ...blendSetup,
  });

  const scene = new THREE.Scene();
  const FOV = 38;
  const tanHalf = Math.tan((FOV * Math.PI) / 360);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 50);
  camera.position.set(0, 0, 4.5);
  camera.updateMatrixWorld();

  const ribbons = new THREE.Mesh(edgeGeo, edgeMat);
  const points = new THREE.Points(pointGeo, pointMat);
  ribbons.frustumCulled = false;
  points.frustumCulled = false;
  ribbons.renderOrder = 0;
  points.renderOrder = 1;
  scene.add(ribbons);
  scene.add(points);

  /* ── DOM labels ── */
  const labelEls = NODES.map((n) => {
    const el = document.createElement('div');
    el.className = 'gl-label';
    el.textContent = n.label;
    el.style.setProperty('--c', TYPES[n.type].label);
    if (n.type === 'firm') el.classList.add('is-firm');
    labelsEl.appendChild(el);
    return el;
  });
  const labelW = new Float32Array(N);
  const labelOp = new Float32Array(N).fill(-1);

  const weightEls = weightEdges.map((e) => {
    const el = document.createElement('div');
    el.className = 'gl-weight';
    el.textContent = String(edges[e].w);
    labelsEl.appendChild(el);
    return el;
  });

  /* ── dashboard stat cards (Connections / Opportunities / Evidence) ── */
  const mini = Array.from(document.querySelectorAll('.dashboard-frame .db-mini-val'))
    .slice(0, 3)
    .map((el, j) => ({ el, cur: TOTALS[j], target: TOTALS[j], shown: null }));

  function setStats(i) {
    const s = i >= 0 ? NODES[i].stats : TOTALS;
    mini.forEach((m, j) => { m.target = s[j]; });
  }

  /* ── state ── */
  let W = 0;
  let H = 0;
  let aspect = 1;
  let camDist = 4.5;
  let ppu = 100;          // pixels per world unit at the centre plane
  let scale = 1;
  let narrow = false;
  let time = 0;
  let last = 0;
  let running = false;
  let inView = true;
  let raf = 0;
  let yawOff = 0;
  let pitchOff = 0;
  let yawVel = 0;
  let pitchVel = 0;
  let calm = 1;           // 1 = free sway, → 0.2 while a node is in focus
  let hover = -1;
  let selected = -1;
  let tourSel = -1;
  let tourI = -1;
  let tourTimer = 1.2;
  let lens = 'clients';
  let lastInteract = -10;
  let cardNode = -2;
  let cardW = 0;
  let cardH = 0;
  let cursorPointer = false;

  const ptr = { inside: false, x: 0, y: 0 };
  const drag = { on: false, id: -1, x: 0, y: 0, sx: 0, sy: 0, moved: false, t: 0 };

  const bx = new Float32Array(N);
  const by = new Float32Array(N);
  const bz = new Float32Array(N);
  const px = new Float32Array(N);
  const py = new Float32Array(N);
  const wx = new Float32Array(weightEdges.length);
  const wy = new Float32Array(weightEdges.length);
  const nA = new Float32Array(N).fill(1);
  const nG = new Float32Array(N);
  const eG = new Float32Array(E);
  const eD = new Float32Array(E).fill(1);
  const rot = { sy: 0, cy: 1, sx: 0, cx: 1 };
  const ctl = [0, 0, 0];  // scratch: rotated control point

  const nodeR = (n) => n.size * scale * (n.kind === 0 ? 0.4 : 0.55);

  /* ── layout ── */
  function measureLabels() {
    labelEls.forEach((el, i) => { labelW[i] = el.offsetWidth; });
  }

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w < 10 || h < 10) return;
    W = w;
    H = h;
    aspect = w / h;
    const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.maxPixelRatio);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();

    // fit the whole network (incl. a margin for sprites and labels) into the canvas
    const dx = (boundX + 0.2) / (tanHalf * aspect);
    const dy = (boundY + 0.32) / tanHalf;
    camDist = Math.max(dx, dy) + 0.45;
    camera.position.set(0, 0, camDist);
    camera.updateMatrixWorld();
    ppu = H / 2 / (camDist * tanHalf);

    scale = clamp(w / 560, 0.7, 1.3);
    narrow = w < 470;
    uniforms.uCamDist.value = camDist;
    uniforms.uPixelRatio.value = dpr;
    uniforms.uScale.value = scale;
    uniforms.uViewW.value = w;
    uniforms.uViewH.value = h;
    labelsEl.style.fontSize = `${narrow ? 10.5 : 12}px`;
    measureLabels();
    if (!running) frame(0);
  }

  /* ── per-frame work ── */
  function rotateInto(x, y, z, out, o) {
    const x1 = x * rot.cy + z * rot.sy;
    const z1 = -x * rot.sy + z * rot.cy;
    out[o] = x1;
    out[o + 1] = y * rot.cx - z1 * rot.sx;
    out[o + 2] = y * rot.sx + z1 * rot.cx;
  }

  function updatePositions() {
    const yaw = (reduceMotion ? 0.12 : Math.sin(time * 0.22) * 0.3 * calm) + yawOff;
    const pitch = 0.12 + (reduceMotion ? 0 : Math.sin(time * 0.17) * 0.07 * calm) + pitchOff;
    rot.sy = Math.sin(yaw);
    rot.cy = Math.cos(yaw);
    rot.sx = Math.sin(pitch);
    rot.cx = Math.cos(pitch);

    for (let i = 0; i < N; i++) {
      const b = NODES[i].p;
      const fl = reduceMotion || i === firmI ? 0 : NODES[i].kind === 2 ? 0.045 : 0.03;
      bx[i] = b[0] + Math.sin(time * 0.7 + i * 1.7) * fl;
      by[i] = b[1] + Math.sin(time * 0.9 + i * 2.3) * fl;
      bz[i] = b[2] + Math.sin(time * 0.6 + i * 0.9) * fl;
      rotateInto(bx[i], by[i], bz[i], pPos, i * 3);
    }

    // shell around the firm, slowly spinning about its own axis
    const sa = time * 0.5;
    const sc = Math.cos(sa);
    const ss = Math.sin(sa);
    for (let k = 0; k < M; k++) {
      const lx = shell[k * 3];
      const ly = shell[k * 3 + 1];
      const lz = shell[k * 3 + 2];
      rotateInto(
        bx[firmI] + (lx * sc + lz * ss) * SHELL_R,
        by[firmI] + ly * SHELL_R,
        bz[firmI] + (-lx * ss + lz * sc) * SHELL_R,
        pPos, (N + k) * 3,
      );
    }

    // curved edges: quadratic bezier evaluated in rotated space, written as ribbon vertices
    for (let e = 0; e < E; e++) {
      const { a, b } = edges[e];
      const x0 = pPos[a * 3];
      const y0 = pPos[a * 3 + 1];
      const z0 = pPos[a * 3 + 2];
      const x2 = pPos[b * 3];
      const y2 = pPos[b * 3 + 1];
      const z2 = pPos[b * 3 + 2];

      // control point = midpoint pushed sideways (perpendicular to the edge in base space)
      let dx = bx[b] - bx[a];
      let dy = by[b] - by[a];
      let dz = bz[b] - bz[a];
      const len = Math.hypot(dx, dy, dz) || 0.0001;
      dx /= len; dy /= len; dz /= len;
      let nx = eBend[e * 3];
      let ny = eBend[e * 3 + 1];
      let nz = eBend[e * 3 + 2];
      const dot = nx * dx + ny * dy + nz * dz;
      nx -= dot * dx; ny -= dot * dy; nz -= dot * dz;
      const nl = Math.hypot(nx, ny, nz) || 1;
      const k = (eCurv[e] * len) / nl;
      rotateInto(
        (bx[a] + bx[b]) / 2 + nx * k,
        (by[a] + by[b]) / 2 + ny * k,
        (bz[a] + bz[b]) / 2 + nz * k,
        ctl, 0,
      );
      const cx = ctl[0];
      const cy = ctl[1];
      const cz = ctl[2];

      for (let j = 0; j <= SEG; j++) {
        const t = j / SEG;
        const u = 1 - t;
        const x = u * u * x0 + 2 * u * t * cx + t * t * x2;
        const y = u * u * y0 + 2 * u * t * cy + t * t * y2;
        const z = u * u * z0 + 2 * u * t * cz + t * t * z2;
        let tx = 2 * u * (cx - x0) + 2 * t * (x2 - cx);
        let ty = 2 * u * (cy - y0) + 2 * t * (y2 - cy);
        let tz = 2 * u * (cz - z0) + 2 * t * (z2 - cz);
        const tl = Math.hypot(tx, ty, tz) || 1;
        tx /= tl; ty /= tl; tz /= tl;
        const v = (e * V + j * 2) * 3;
        ePos[v] = ePos[v + 3] = x;
        ePos[v + 1] = ePos[v + 4] = y;
        ePos[v + 2] = ePos[v + 5] = z;
        eTan[v] = eTan[v + 3] = tx;
        eTan[v + 1] = eTan[v + 4] = ty;
        eTan[v + 2] = eTan[v + 5] = tz;
      }

      // travelling pulse
      const pk = ePulse[e];
      if (pk >= 0) {
        const t = (time * pulseSpeed[pk] + pulsePhase[pk]) % 1;
        const u = 1 - t;
        const o = (N + M + pk) * 3;
        pPos[o] = u * u * x0 + 2 * u * t * cx + t * t * x2;
        pPos[o + 1] = u * u * y0 + 2 * u * t * cy + t * t * y2;
        pPos[o + 2] = u * u * z0 + 2 * u * t * cz + t * t * z2;
      }

      // weight label sits at the middle of the curve
      const li = eLabel[e];
      if (li >= 0) {
        const mx = 0.25 * x0 + 0.5 * cx + 0.25 * x2;
        const my = 0.25 * y0 + 0.5 * cy + 0.25 * y2;
        const mz = 0.25 * z0 + 0.5 * cz + 0.25 * z2;
        const kk = 1 / ((camDist - mz) * tanHalf);
        wx[li] = ((mx * kk) / aspect * 0.5 + 0.5) * W;
        wy[li] = (0.5 - my * kk * 0.5) * H;
      }
    }
  }

  function project() {
    for (let i = 0; i < N; i++) {
      const k = 1 / ((camDist - pPos[i * 3 + 2]) * tanHalf);
      px[i] = ((pPos[i * 3] * k) / aspect * 0.5 + 0.5) * W;
      py[i] = (0.5 - pPos[i * 3 + 1] * k * 0.5) * H;
    }
  }

  function pick(x, y) {
    let best = -1;
    let bd = 1;
    for (let i = 0; i < N; i++) {
      const r = Math.max(13, nodeR(NODES[i]));
      const d = Math.hypot(x - px[i], y - py[i]) / r;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  function updateStates(dt, f) {
    const k = smoothK(dt, 9);
    const set = LENS_SETS[lens];
    const lensDim = lens === 'clients' ? 0.75 : 0.3;

    for (let i = 0; i < N; i++) {
      let tA;
      let tG;
      if (f >= 0) {
        const rel = i === f || adj[f].has(i);
        tA = rel ? 1 : 0.14;
        tG = i === f ? 1 : rel ? 0.5 : 0;
      } else {
        tA = set.has(NODES[i].type) ? 1 : lensDim;
        tG = 0;
      }
      nA[i] += (tA - nA[i]) * k;
      nG[i] += (tG - nG[i]) * k;
      pAlpha[i] = nA[i];
      pGlow[i] = nG[i];
    }

    for (let e = 0; e < E; e++) {
      const { a, b, key } = edges[e];
      let tG;
      let tD;
      if (f >= 0) {
        const touches = a === f || b === f;
        tG = touches ? 1 : 0;
        tD = touches ? 1 : 0.07;
      } else {
        const both = set.has(NODES[a].type) && set.has(NODES[b].type);
        tG = both ? (key ? 0.35 : 0.2) : 0;
        tD = both ? 1 : (lens === 'clients' ? 0.7 : 0.4);
      }
      eG[e] += (tG - eG[e]) * k;
      eD[e] += (tD - eD[e]) * k;
      const v0 = e * V;
      for (let v = 0; v < V; v++) {
        eGlow[v0 + v] = eG[e];
        eDim[v0 + v] = eD[e];
      }
      const pk = ePulse[e];
      if (pk >= 0) pAlpha[N + M + pk] = eD[e] * (0.3 + 0.7 * eG[e]);
    }

    const shellA = 0.75 * nA[firmI];
    for (let s = 0; s < M; s++) pAlpha[N + s] = shellA;
  }

  // label collision avoidance: the focused / hovered node and higher-priority labels win
  const labelOrder = NODES.map((_, i) => i).sort((p, q) => NODES[p].pri - NODES[q].pri || p - q);
  const labelRects = new Float32Array(N * 4);
  const labelShown = new Uint8Array(N);

  function updateLabels(f) {
    const maxPri = narrow ? 1 : 2;
    const lh = narrow ? 13 : 15;
    let nr = 0;

    const place = (i) => {
      const n = NODES[i];
      const rel = f >= 0 && (i === f || adj[f].has(i));
      let show = n.pri <= maxPri || rel || i === hover;
      let x = 0;
      let y = 0;
      const half = labelW[i] / 2;
      if (show) {
        const offset = i === firmI
          ? Math.max(SHELL_R * ppu, n.size * scale * 0.31) + 7
          : n.size * scale * (n.kind === 0 ? 0.31 : 0.3) + 6;
        x = clamp(px[i], half + 4, Math.max(half + 4, W - half - 4));
        y = clamp(py[i] + offset, 4, Math.max(4, H - 18));
        if (i !== f && i !== hover && n.pri > 0) {
          const pad = labelShown[i] ? -3 : 4;   // hysteresis: visible labels are harder to bump
          for (let r = 0; r < nr; r++) {
            const o = r * 4;
            if (x - half < labelRects[o + 2] + pad && x + half > labelRects[o] - pad
              && y < labelRects[o + 3] + pad && y + lh > labelRects[o + 1] - pad) {
              show = false;
              break;
            }
          }
        }
        if (show) {
          labelRects[nr * 4] = x - half;
          labelRects[nr * 4 + 1] = y;
          labelRects[nr * 4 + 2] = x + half;
          labelRects[nr * 4 + 3] = y + lh;
          nr++;
        }
      }
      labelShown[i] = show ? 1 : 0;
      const op = show ? clamp(nA[i], 0, 1) * (0.72 + 0.28 * clamp(pPos[i * 3 + 2] / 1.4, -1, 1)) : 0;
      if (op === 0 && labelOp[i] === 0) return;   // hidden and already written
      labelOp[i] = op;
      const el = labelEls[i];
      if (show) el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, 0)`;
      el.style.opacity = op.toFixed(3);
    };

    if (f >= 0) place(f);
    if (hover >= 0 && hover !== f) place(hover);
    for (let k = 0; k < N; k++) {
      const i = labelOrder[k];
      if (i !== f && i !== hover) place(i);
    }

    // edge weights: always faint, bright when their edge is highlighted
    for (let li = 0; li < weightEdges.length; li++) {
      const e = weightEdges[li];
      const op = narrow && f < 0 ? 0 : clamp(eD[e] * (0.5 + 0.5 * eG[e]), 0, 1) * (eD[e] < 0.2 ? 0 : 1);
      const el = weightEls[li];
      el.style.transform = `translate(${wx[li].toFixed(1)}px, ${wy[li].toFixed(1)}px) translate(-50%, -50%)`;
      el.style.opacity = op.toFixed(3);
    }
  }

  function updateCard(cn) {
    if (cn !== cardNode) {
      cardNode = cn;
      if (cn >= 0) {
        cardEl.innerHTML = cardHTML(NODES[cn]);
        cardEl.classList.add('is-on');
        cardW = cardEl.offsetWidth;
        cardH = cardEl.offsetHeight;
      } else {
        cardEl.classList.remove('is-on');
      }
    }
    if (cn < 0) return;
    const gap = Math.max(labelW[cn] / 2, NODES[cn].size * scale * 0.35) + 14;
    let cx = px[cn] < W / 2 ? px[cn] + gap : px[cn] - gap - cardW;
    cx = clamp(cx, 6, Math.max(6, W - cardW - 6));
    let cy = clamp(py[cn] - cardH / 2, 6, Math.max(6, H - cardH - 6));
    if (narrow) {
      // small panels: dock the card in the corner opposite the node so it never covers it
      cx = px[cn] < W / 2 ? Math.max(6, W - cardW - 6) : 6;
      cy = py[cn] < H / 2 ? Math.max(6, H - cardH - 6) : 6;
    }
    cardEl.style.transform = `translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px)`;
  }

  function updateMini(dt) {
    const k = smoothK(dt, 8);
    mini.forEach((m, j) => {
      m.cur += (m.target - m.cur) * k;
      const v = Math.abs(m.target - m.cur) < 1.5 ? m.target : Math.round(m.cur);
      if (v !== m.shown) {
        m.shown = v;
        m.el.textContent = j === 1 ? `${v} new` : v.toLocaleString('en-US');
      }
    });
  }

  function frame(dt) {
    if (W < 10) return;
    time += dt;

    // camera sway calms down while a node is in focus
    const focusPrev = hover >= 0 || selected >= 0 || tourSel >= 0;
    calm += ((focusPrev ? 0.2 : 1) - calm) * smoothK(dt, 4);

    // user rotation: inertia, then spring back to the home view
    if (!drag.on) {
      yawOff += yawVel * dt;
      pitchOff = clamp(pitchOff + pitchVel * dt, -0.9, 0.9);
      const damp = Math.exp(-dt * 3);
      yawVel *= damp;
      pitchVel *= damp;
      if (time - lastInteract > 1.2) {
        const back = Math.exp(-dt * 0.8);
        yawOff *= back;
        pitchOff *= back;
      }
    }

    updatePositions();
    project();

    hover = ptr.inside && !(drag.on && drag.moved) ? pick(ptr.x, ptr.y) : -1;

    // auto-tour while nobody is interacting
    if (CONFIG.autoTour && !reduceMotion && selected < 0 && time - lastInteract > 5) {
      tourTimer -= dt;
      if (tourTimer <= 0) {
        tourTimer = 3.6;
        tourI = (tourI + 1) % TOUR.length;
        tourSel = idOf[TOUR[tourI]];
        setStats(tourSel);
      }
    } else if (tourSel >= 0) {
      tourSel = -1;
      tourTimer = 1.2;
      setStats(selected);
    }

    const focus = hover >= 0 ? hover : selected >= 0 ? selected : tourSel;
    updateStates(dt, focus);
    updateLabels(focus);
    updateCard(hover >= 0 ? hover : selected);
    updateMini(dt);

    const wantPointer = hover >= 0;
    if (wantPointer !== cursorPointer) {
      cursorPointer = wantPointer;
      canvas.classList.toggle('is-pointer', wantPointer);
    }

    posAttr.needsUpdate = true;
    alphaAttr.needsUpdate = true;
    glowAttr.needsUpdate = true;
    ePosAttr.needsUpdate = true;
    eTanAttr.needsUpdate = true;
    eGlowAttr.needsUpdate = true;
    eDimAttr.needsUpdate = true;
    renderer.render(scene, camera);
  }

  function tick(now) {
    raf = 0;
    if (!running) return;
    const dt = clamp((now - last) / 1000, 0, 0.05); // never negative: rAF timestamps can precede performance.now()
    last = now;
    frame(dt);
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

  /* ── interaction ── */
  function touched() {
    lastInteract = time;
    if (hintEl) hintEl.classList.add('is-hidden');
  }

  canvas.addEventListener('pointermove', (e) => {
    ptr.x = e.offsetX;
    ptr.y = e.offsetY;
    if (e.pointerType !== 'touch') {
      ptr.inside = true;
      touched();
    }
    if (drag.on && e.pointerId === drag.id) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 5) {
        drag.moved = true;
        canvas.classList.add('is-grabbing');
      }
      if (drag.moved) {
        const now = performance.now();
        const dtm = Math.max((now - drag.t) / 1000, 0.001);
        drag.t = now;
        const k = 0.008;
        yawOff += dx * k;
        pitchOff = clamp(pitchOff + dy * k, -0.9, 0.9);
        yawVel = clamp(yawVel + ((dx * k) / dtm - yawVel) * 0.5, -6, 6);
        pitchVel = clamp(pitchVel + ((dy * k) / dtm - pitchVel) * 0.5, -6, 6);
      }
      drag.x = e.clientX;
      drag.y = e.clientY;
      touched();
    }
  });

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    ptr.x = e.offsetX;
    ptr.y = e.offsetY;
    drag.on = true;
    drag.id = e.pointerId;
    drag.x = drag.sx = e.clientX;
    drag.y = drag.sy = e.clientY;
    drag.moved = false;
    drag.t = performance.now();
    yawVel = 0;
    pitchVel = 0;
    touched();
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* not critical */ }
  });

  function endDrag(e, allowClick) {
    if (!drag.on || e.pointerId !== drag.id) return;
    const wasMoved = drag.moved;
    drag.on = false;
    drag.moved = false;
    canvas.classList.remove('is-grabbing');
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* already released */ }
    if (performance.now() - drag.t > 90) { yawVel = 0; pitchVel = 0; }
    yawOff -= TAU * Math.round(yawOff / TAU); // spring back along the shortest way
    if (allowClick && !wasMoved) {
      const hit = pick(e.offsetX, e.offsetY);
      selected = hit >= 0 && hit !== selected ? hit : -1;
      tourSel = -1;
      setStats(selected);
    }
    touched();
  }

  canvas.addEventListener('pointerup', (e) => {
    endDrag(e, true);
    if (e.pointerType === 'touch') ptr.inside = false;
  });
  canvas.addEventListener('pointercancel', (e) => {
    endDrag(e, false);
    ptr.inside = false;
  });
  canvas.addEventListener('pointerleave', () => {
    if (!drag.on) ptr.inside = false;
  });

  // sidebar tabs act as lenses
  const tabs = Array.from(document.querySelectorAll('.dashboard-frame .db-sidebar-item'));
  tabs.forEach((el) => {
    el.addEventListener('click', () => {
      const key = el.textContent.trim().toLowerCase();
      if (!LENS_SETS[key]) return;
      lens = key;
      tabs.forEach((t) => t.classList.toggle('db-active', t === el));
      selected = -1;
      tourSel = -1;
      setStats(-1);
      touched();
    });
  });

  /* ── start ── */
  new IntersectionObserver((entries) => {
    inView = entries[entries.length - 1].isIntersecting;
    sync();
  }).observe(area);
  document.addEventListener('visibilitychange', sync);

  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
  window.addEventListener('resize', resize);
  window.addEventListener('load', resize);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize);

  resize();
  sync();
  requestAnimationFrame(() => area.classList.add('graph-live'));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}