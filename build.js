/* ==========================================================================
   Verity — live build intro (build.js)

   Tiny collaborator cursors build the page in real time, top to bottom, while
   the page scrolls itself down to follow them. When the footer is done the
   page glides back to the top.

   - No dependencies, no changes to your other scripts.
   - Any wheel / touch / click / key press (or the Skip pill) ends it instantly
     and leaves the finished page exactly as it normally is.
   - Skipped automatically for visitors who prefer reduced motion, and when the
     URL has a #hash (someone deep-linking to a section).
   - URL switches:  /?build  forces it even with a #hash,  /?nobuild  disables it.
   - Keep this tag a plain <script src="/build.js"></script> at the end of <body>,
     after script.js (no defer / async / type="module"), so it runs after
     script.js has set itself up.
   ========================================================================== */
(() => {
  'use strict';

  /* ------------------------------------------------------------------------
     Settings
     ------------------------------------------------------------------------ */
  const CONFIG = {
    speed: 1.5,         // overall pace: 1 = relaxed, 1.5 = default, 2.5 = very fast
    textCps: 110,       // typing speed, characters per second (before `speed`)
    frontier: 0.28,     // how far down the screen the page is kept scrolled to (0–1)
    returnToTop: true,  // glide back to the top when the build is finished
  };

  /* What gets built, in what style. Order in the page decides build order;
     this list only decides how each thing is built.
       bg       fades in on its own
       block    a cursor drags a frame around it, then it fills in
       shell    same, for a container whose children are built after it
       visual   same, for graphics
       float    same, fade only (these float on their own)
       text     a cursor types it word by word
       headline the hero headline (uses the words script.js already split) */
  const PLAN = [
    ['.hero > .blueprint-grid, .hero > .glow, .hero > .blob-layer', 'bg'],
    ['#nav .nav-inner', 'block', { noShift: true }],
    ['.hero-badge', 'block'],
    ['.hero-headline', 'headline'],
    ['.hero-sub', 'text'],
    ['.hero-actions > *', 'block'],
    ['.dashboard-frame', 'shell'],
    ['.dashboard-chrome', 'block'],
    ['.db-sidebar', 'block'],
    ['.db-graph-area', 'visual'],
    ['.db-mini-card', 'block'],
    ['.float-card', 'float', { noShift: true }],
    ['.demo-note', 'text'],
    ['.trust-label', 'text'],
    ['.trust-row', 'block'],
    ['.section-header .eyebrow', 'text'],
    ['.section-header .section-title', 'text'],
    ['.section-header .section-body', 'text'],
    ['.knowledge-grid .k-card', 'block'],
    ['.pillars .pillar, .onsite-grid .pillar', 'shell'],
    ['.pillar > .pillar-title, .pillar > .pillar-body', 'text'],
    ['.pillar > .pillar-viz', 'visual'],
    ['.pillar > .pillar-header, .pillar > .chain, .pillar > .principle-row, .pillar > .ev-tags-wrap, .pillar > .ev-card, .pillar > .opp-grid, .pillar > .opp-alert, .pillar > .pillar-note', 'block'],
    ['.onsite-list > li', 'block'],
    ['.stats-grid > *', 'block'],
    ['.pq', 'block'],
    ['.control-grid .k-card', 'block'],
    ['.control-note', 'text'],
    ['.cta-block', 'shell'],
    ['.cta-block > .cta-badge', 'block'],
    ['.cta-block > .cta-title, .cta-block > .cta-body, .cta-block > .cta-disclaimer', 'text'],
    ['.cta-form > .form-row, .cta-form > #f-firm, .cta-form > #cta-submit', 'block'],
    ['.footer-brand, .footer-col, .footer-bottom', 'block'],
  ];

  const CURSORS = [
    { name: 'Layout',  role: 'layout',  color: '#FF6A2A', fg: '#090807', fx: 0.16, dy: 70 },
    { name: 'Copy',    role: 'copy',    color: '#F4EFE6', fg: '#090807', fx: 0.40, dy: 150 },
    { name: 'Visuals', role: 'visuals', color: '#D94B20', fg: '#F4EFE6', fx: 0.64, dy: 40 },
    { name: 'Motion',  role: 'motion',  color: '#E8C07A', fg: '#090807', fx: 0.86, dy: 200 },
  ];
  const ROLE = { block: 'layout', shell: 'layout', visual: 'visuals', float: 'motion', text: 'copy', headline: 'copy' };

  /* ------------------------------------------------------------------------
     Should it run?
     ------------------------------------------------------------------------ */
  const html = document.documentElement;
  const query = location.search;
  const forced = /[?&]build\b/.test(query);

  // tiny public handle (handy for demos): verityBuild.replay() / verityBuild.skip()
  window.verityBuild = {
    replay() { location.assign(location.pathname + '?build'); },
    skip() { /* replaced once a build is running */ },
  };

  const wanted =
    window.__vbOn !== undefined
      ? window.__vbOn
      : !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
        !/[?&]nobuild\b/.test(query) &&
        (forced || location.hash.length <= 1);

  if (!wanted) {
    html.classList.remove('vb-init');
    return;
  }

  /* ------------------------------------------------------------------------
     Helpers
     ------------------------------------------------------------------------ */
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const vw = () => html.clientWidth || window.innerWidth;
  const vh = () => window.innerHeight;
  const clampPt = (x, y) => ({ x: clamp(x, 10, vw() - 10), y: clamp(y, 10, vh() - 10) });
  const rgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  };
  const el$ = (tag, cls, markup) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (markup) n.innerHTML = markup;
    return n;
  };
  const byDocOrder = (a, b) => {
    if (a.el === b.el) return 0;
    return a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  };

  /* ========================================================================
     The build
     ======================================================================== */
  function init() {
    if (window.__vbOn === false) return; // the <head> failsafe already revealed the page

    /* ---- 1. collect what to build ---- */
    const found = new Map();
    PLAN.forEach(([selector, kind, opt]) => {
      document.querySelectorAll(selector).forEach((el) => {
        if (found.has(el)) return;
        found.set(el, {
          el,
          kind,
          noShift: kind === 'bg' || kind === 'float' || !!(opt && opt.noShift),
          fixed: !!el.closest('.nav'),
          state: 'queued', // queued -> active -> revealed
          parent: null,
          words: null,
          records: null,
          bgDelay: 0,
        });
      });
    });
    const steps = Array.from(found.values()).sort(byDocOrder);
    if (!steps.length) {
      html.classList.remove('vb-init');
      return;
    }
    steps.forEach((s) => {
      for (let p = s.el.parentElement; p; p = p.parentElement) {
        if (found.has(p)) { s.parent = found.get(p); break; }
      }
    });
    let bgIndex = 0;
    steps.forEach((s) => { if (s.kind === 'bg') s.bgDelay = 120 + bgIndex++ * 200; });

    /* ---- 2. take over from script.js's scroll-reveal ---- */
    // Hand every element back to us: the old reveal would fade things in on its
    // own as the page scrolls, before a cursor has built them.
    document.querySelectorAll('.reveal').forEach((el) => {
      el.classList.remove('reveal');
      el.style.transitionDelay = '';
    });
    // containers that start invisible via their own entrance animation
    document.querySelectorAll('.hero-actions, .hero-visual').forEach((el) => {
      el.style.animation = 'none';
      el.style.opacity = '1';
    });

    /* ---- 3. hide everything that has not been built yet ---- */
    steps.forEach((s) => {
      if (s.kind === 'headline') {
        s.words = Array.from(s.el.querySelectorAll('.w'));
        if (!s.words.length) {
          s.kind = 'text';
        } else {
          s.words.forEach((w) => {
            w.classList.add('vb-hold');
            // start each word's own blur-in the moment it is released
            w.style.animationDelay = w.closest('em') ? '0s, 0s' : '0s';
          });
          return;
        }
      }
      s.el.classList.add('vb-pending');
    });

    // start from the top, take over scrolling
    try { window.scrollTo(0, 0); } catch (e) { /* ignore */ }
    html.classList.add('vb-active');
    html.classList.remove('vb-init');

    /* ---- 4. state ---- */
    const S = {
      stopped: false,
      done: false,
      finale: false,
      tweens: [],
      anims: new Set(),
      raf: 0,
      last: 0,
      t0: 0,
      pos: window.scrollY,
      target: window.scrollY,
      lastScrollY: window.scrollY,
      fi: 0,
      revealed: 0,
      lastStart: 0,
      lastActivity: 0,
      lastSched: 0,
      frontierY: vh() * CONFIG.frontier,
      shownPct: -1,
    };
    const T = (ms) => ms / CONFIG.speed;

    /* ---- 5. tiny tween / timer engine (driven by one rAF loop) ---- */
    function tween(ms, fn, until) {
      return new Promise((resolve) => {
        S.tweens.push({ start: performance.now(), ms: Math.max(1, ms), fn, until, resolve });
      });
    }
    const wait = (ms) => tween(ms);
    function tickTweens(now) {
      S.tweens.slice().forEach((t) => {
        const p = clamp((now - t.start) / t.ms, 0, 1);
        if (t.fn) t.fn(p);
        if (p >= 1 || (t.until && t.until())) {
          const i = S.tweens.indexOf(t);
          if (i > -1) S.tweens.splice(i, 1);
          t.resolve();
        }
      });
    }

    /* ---- 6. overlay: boxes, carets, cursors, skip pill ---- */
    const root = el$('div', 'vb-root');
    root.setAttribute('aria-hidden', 'true');

    const defs = CURSORS.slice(0, vw() < 720 ? 3 : 4);
    const cursors = defs.map((def, i) => makeCursor(def, i));
    cursors.forEach((c) => root.appendChild(c.box.node));
    cursors.forEach((c) => root.appendChild(c.caret));
    cursors.forEach((c) => root.appendChild(c.el));
    document.body.appendChild(root);

    const skip = el$(
      'div',
      'vb-skip',
      '<span class="vb-skip-dot" aria-hidden="true"></span>' +
        '<span class="vb-skip-text">Building the page &middot; 0%</span>' +
        '<button type="button" class="vb-skip-btn" aria-label="Skip the build animation">Skip</button>' +
        '<span class="vb-skip-bar" aria-hidden="true"></span>'
    );
    const skipText = skip.querySelector('.vb-skip-text');
    skip.querySelector('.vb-skip-btn').addEventListener('click', () => finish());
    document.body.appendChild(skip);
    requestAnimationFrame(() => {
      skip.classList.add('is-on');
      cursors.forEach((c) => c.el.classList.add('is-on'));
    });

    function makeBox(def) {
      const node = el$(
        'div',
        'vb-box',
        '<i class="vb-h a"></i><i class="vb-h b"></i><i class="vb-h c"></i><i class="vb-h d"></i><span class="vb-dim"></span>'
      );
      node.style.setProperty('--c', def.color);
      node.style.setProperty('--cw', rgba(def.color, 0.07));
      node.style.setProperty('--fg', def.fg);
      const dim = node.querySelector('.vb-dim');
      const box = {
        node,
        el: null,
        prog: 0,
        label: '',
        start(el) {
          this.el = el;
          this.prog = 0;
          node.classList.add('is-on');
        },
        stop() {
          node.classList.remove('is-on');
          const el = this.el;
          tween(560, null).then(() => {
            if (!node.classList.contains('is-on') && this.el === el) this.el = null;
          });
        },
        update() {
          if (!this.el) return;
          const r = this.el.getBoundingClientRect();
          const w = r.width * this.prog;
          const h = r.height * this.prog;
          node.style.transform = `translate3d(${r.left}px, ${r.top}px, 0)`;
          node.style.width = `${w}px`;
          node.style.height = `${h}px`;
          const label = `${Math.round(w)} \u00d7 ${Math.round(h)}`;
          if (label !== this.label) { this.label = label; dim.textContent = label; }
        },
      };
      return box;
    }

    function makeCursor(def, i) {
      const el = el$(
        'div',
        'vb-cursor',
        '<i class="vb-ring"></i>' +
          '<svg width="16" height="19" viewBox="0 0 16 19" fill="none" aria-hidden="true">' +
          '<path d="M1.2 1.2v13.6l3.7-3.3 2.6 5.6 2.4-1.1-2.6-5.5h5.2z" fill="var(--c)" stroke="rgba(9,8,7,0.85)" stroke-width="1.1" stroke-linejoin="round"/>' +
          '</svg>' +
          '<span class="vb-tag"></span>'
      );
      el.style.setProperty('--c', def.color);
      el.style.setProperty('--fg', def.fg);
      el.querySelector('.vb-tag').textContent = def.name;
      const ring = el.querySelector('.vb-ring');
      const caret = el$('div', 'vb-caret');
      caret.style.setProperty('--c', def.color);

      const c = {
        def,
        role: def.role,
        i,
        el,
        ring,
        caret,
        box: makeBox(def),
        // fly in from just outside the top-right corner
        x: vw() + 30 + i * 22,
        y: -30 - i * 16,
        target: null, // () => {x, y}  (null = idle, drifting near the build frontier)
        k: 10,        // how tightly it follows its target
        busy: false,
        caretSpan: null,
        caretSide: 'right',
        pulse() {
          ring.classList.remove('is-pulse');
          void ring.offsetWidth;
          ring.classList.add('is-pulse');
        },
        update(dt, now) {
          let t;
          let k = this.k;
          if (this.target) {
            t = this.target();
          } else {
            t = {
              x: vw() * def.fx + Math.sin(now / 1100 + i) * 10,
              y: clamp(S.frontierY + def.dy + Math.cos(now / 900 + i * 2) * 8, 56, vh() - 56),
            };
            k = 2.6;
          }
          const a = 1 - Math.exp(-dt * k);
          this.x += (t.x - this.x) * a;
          this.y += (t.y - this.y) * a;
          el.style.transform = `translate3d(${this.x.toFixed(1)}px, ${this.y.toFixed(1)}px, 0)`;
          this.box.update();
          if (this.caretSpan) {
            const r = this.caretSpan.getBoundingClientRect();
            const cx = this.caretSide === 'left' ? r.left : r.right + 1;
            caret.style.height = `${Math.max(10, r.height * 0.82)}px`;
            caret.style.transform = `translate3d(${cx.toFixed(1)}px, ${(r.top + r.height * 0.09).toFixed(1)}px, 0)`;
          }
        },
      };
      return c;
    }

    /* ---- 7. revealing things ---- */
    function show(s, dur) {
      if (S.stopped) return;
      if (s.kind === 'headline') return; // its words are released one by one
      s.el.classList.remove('vb-pending');
      if (!dur || !s.el.animate) return;
      try {
        // single keyframe: the animation ends on the element's own natural style
        const from = s.noShift ? { offset: 0, opacity: 0 } : { offset: 0, opacity: 0, translate: '0 14px' };
        const a = s.el.animate([from], { duration: dur / CONFIG.speed, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
        S.anims.add(a);
        const clear = () => S.anims.delete(a);
        a.onfinish = clear;
        a.oncancel = clear;
      } catch (e) { /* no animation: it simply appears */ }
    }
    function done(s) {
      if (s.state === 'revealed') return;
      s.state = 'revealed';
      S.revealed++;
      S.lastActivity = performance.now();
    }

    // wrap text in per-word spans (restored afterwards)
    function wrapWords(s) {
      const spans = [];
      s.records = [];
      const walk = (node) => {
        const whole = /flex|grid/.test(getComputedStyle(node).display); // gap-based layouts: keep one unit
        Array.from(node.childNodes).forEach((child) => {
          if (child.nodeType === Node.TEXT_NODE) {
            if (!child.nodeValue.trim()) return;
            const frag = document.createDocumentFragment();
            const made = [];
            const parts = whole ? [child.nodeValue] : child.nodeValue.split(/(\s+)/);
            parts.forEach((part) => {
              if (!part) return;
              if (!whole && /^\s+$/.test(part)) {
                const t = document.createTextNode(part);
                frag.appendChild(t);
                made.push(t);
                return;
              }
              const w = document.createElement('span');
              w.className = 'vb-w';
              w.textContent = part;
              frag.appendChild(w);
              made.push(w);
              spans.push(w);
            });
            s.records.push({ orig: child, made });
            node.replaceChild(frag, child);
          } else if (child.nodeType === Node.ELEMENT_NODE && !/^(BR|SVG|SCRIPT|STYLE|CANVAS|IMG|INPUT|BUTTON|TEXTAREA)$/i.test(child.tagName)) {
            walk(child);
          }
        });
      };
      walk(s.el);
      return spans;
    }
    function unwrap(s) {
      if (!s.records) return;
      s.records.forEach((rec) => {
        const first = rec.made[0];
        if (first && first.parentNode) first.parentNode.insertBefore(rec.orig, first);
        rec.made.forEach((n) => { if (n.parentNode) n.parentNode.removeChild(n); });
      });
      s.records = null;
    }

    /* ---- 8. what a cursor does ---- */
    const arrive = (c, maxMs) =>
      tween(T(maxMs), null, () => {
        if (!c.target) return true;
        const t = c.target();
        return Math.hypot(c.x - t.x, c.y - t.y) < 22;
      });

    async function doBlock(c, s) {
      const el = s.el;
      const rect = () => el.getBoundingClientRect();

      // 1. travel to the top-left corner
      c.k = 13;
      c.target = () => { const r = rect(); return clampPt(r.left, r.top); };
      await arrive(c, 700);

      // 2. press and drag out the frame
      const box = c.box;
      box.start(el);
      c.pulse();
      c.k = 22;
      c.target = () => {
        const r = rect();
        return clampPt(r.left + r.width * box.prog, r.top + r.height * box.prog);
      };
      const r0 = rect();
      const size = Math.hypot(r0.width, Math.min(r0.height, vh()));
      await tween(T(clamp(240 + size * 0.3, 340, 760)), (p) => { box.prog = ease(p); });
      box.prog = 1;

      // 3. release: the real thing fills in
      show(s, s.kind === 'shell' ? 520 : 680);
      done(s);
      c.pulse();
      box.stop();
      await wait(T(140));
    }

    async function doText(c, s) {
      const el = s.el;
      const words = s.kind === 'headline' ? s.words : wrapWords(s);
      if (!words.length) { await doBlock(c, s); return; }

      // travel to where the text starts
      c.k = 13;
      c.target = () => { const r = words[0].getBoundingClientRect(); return clampPt(r.left, r.bottom); };
      await arrive(c, 700);

      if (s.kind !== 'headline') {
        el.classList.add('vb-armed'); // words hidden, element itself revealed
        show(s, 280);
      }
      c.pulse();
      c.caretSpan = words[0];
      c.caretSide = 'left';
      c.caret.classList.add('is-on');
      c.k = 16;
      c.target = () => {
        const r = c.caretSpan.getBoundingClientRect();
        return clampPt((c.caretSide === 'left' ? r.left : r.right) + 3, r.bottom - 1);
      };
      await wait(T(170));

      c.caretSide = 'right';
      // typing is driven by the clock, not by frames: on a slow device it still
      // takes the same time (several words land per frame instead of slipping behind)
      const weights = words.map((w) => (w.textContent || '').length + 1);
      const total = weights.reduce((a, b) => a + b, 0);
      const starts = [];
      let acc = 0;
      weights.forEach((w) => { starts.push(acc / total); acc += w; });
      let shown = 0;
      await tween(Math.max(250, (total * 1000) / (CONFIG.textCps * CONFIG.speed)), (p) => {
        while (shown < words.length && p >= starts[shown]) {
          const w = words[shown++];
          if (s.kind === 'headline') w.classList.remove('vb-hold');
          else w.classList.add('vb-on');
          c.caretSpan = w;
        }
      });
      words.forEach((w) => {
        if (s.kind === 'headline') w.classList.remove('vb-hold');
        else w.classList.add('vb-on');
      });
      c.caret.classList.remove('is-on');
      await wait(T(150));
      done(s);
    }

    async function perform(c, s) {
      c.busy = true;
      s.state = 'active';
      try {
        if (s.kind === 'text' || s.kind === 'headline') await doText(c, s);
        else await doBlock(c, s);
      } catch (err) {
        if (window.console) console.error('[build]', err);
      } finally {
        if (!S.stopped) {
          // whatever happened, never leave something hidden
          if (s.state !== 'revealed') {
            if (s.kind === 'headline') s.words.forEach((w) => w.classList.remove('vb-hold'));
            show(s, 0);
            done(s);
          }
          c.target = null;
          c.caretSpan = null;
          c.caret.classList.remove('is-on');
          c.busy = false;
        }
      }
    }

    /* ---- 9. who builds what, and when ---- */
    function scheduler(now) {
      if (S.finale) return;
      if (now - S.lastSched < 45) return;
      S.lastSched = now;
      const h = vh();
      const queue = [];
      let looked = 0;

      steps.forEach((s) => {
        if (s.state !== 'queued') return;
        if (++looked > 28) return; // the page is built roughly in order: only the next stretch matters
        if (s.parent && s.parent.state !== 'revealed') return;
        if (s.kind === 'bg') {
          if (now - S.t0 >= s.bgDelay) { show(s, 1400); done(s); }
          return;
        }
        const r = s.el.getBoundingClientRect();
        if (!s.fixed && r.top >= h * 0.9 && r.bottom > h - 4) return; // not on screen yet
        if (r.width < 8 || r.height < 8) { show(s, 300); done(s); return; } // hairlines / hidden elements
        queue.push(s);
      });

      if (now - S.t0 < T(450)) return;       // let the cursors fly in first
      if (now - S.lastStart < T(90)) return; // stagger starts a little

      // safety net: if nothing has moved for a while and nobody is working, never hang
      if (!cursors.some((c) => c.busy) && now - S.lastActivity > 2500) {
        const stuck = steps.find((s) => s.state === 'queued');
        if (stuck) {
          if (stuck.kind === 'headline') stuck.words.forEach((w) => w.classList.remove('vb-hold'));
          show(stuck, 300);
          done(stuck);
          return;
        }
      }

      for (const c of cursors) {
        if (c.busy || !queue.length) continue;
        let idx = queue.findIndex((s, n) => n < 5 && ROLE[s.kind] === c.role);
        if (idx < 0) idx = 0;
        const s = queue.splice(idx, 1)[0];
        S.lastStart = now;
        S.lastActivity = now;
        perform(c, s);
        break;
      }
    }

    /* ---- 10. scrolling ---- */
    function scrollStep(dt) {
      // someone else moved the page (scrollbar drag, find-in-page, focus jump): hand control back
      if (Math.abs(window.scrollY - S.lastScrollY) > 8) { finish(); return; }
      if (S.finale) return;

      while (S.fi < steps.length && steps[S.fi].state === 'revealed') S.fi++;
      const f = steps[S.fi];
      if (!f) return;

      const r = f.el.getBoundingClientRect();
      S.frontierY = f.fixed ? vh() * CONFIG.frontier : r.top;
      const docTop = f.fixed ? 0 : r.top + window.scrollY;
      const maxY = Math.max(0, html.scrollHeight - vh());
      S.target = clamp(Math.max(S.target, docTop - vh() * CONFIG.frontier), 0, maxY);

      const diff = S.target - S.pos;
      if (diff > 0.3) {
        S.pos += Math.min(diff * (1 - Math.exp(-dt * 1.7)), 1600 * dt);
        window.scrollTo(0, Math.round(S.pos));
        S.lastScrollY = window.scrollY;
      }
    }

    /* ---- 11. progress pill ---- */
    function ui() {
      const pct = Math.min(100, Math.round((S.revealed / steps.length) * 100));
      if (pct === S.shownPct) return;
      S.shownPct = pct;
      skipText.innerHTML = `Building the page &middot; ${pct}%`;
      skip.style.setProperty('--p', `${pct}%`);
    }

    /* ---- 12. main loop ---- */
    function frame(now) {
      if (S.stopped) return;
      const dt = clamp((now - S.last) / 1000, 0.001, 0.05);
      S.last = now;

      tickTweens(now);
      if (S.stopped) return;
      scheduler(now);
      scrollStep(dt);
      if (S.stopped) return;
      cursors.forEach((c) => c.update(dt, now));
      ui();

      if (!S.finale && S.revealed >= steps.length) finale();
      S.raf = requestAnimationFrame(frame);
    }

    /* ---- 13. ending ---- */
    function restorePage() {
      steps.forEach((s) => {
        s.el.classList.remove('vb-pending', 'vb-armed');
        if (s.words) s.words.forEach((w) => w.classList.remove('vb-hold'));
        unwrap(s);
      });
    }

    async function finale() {
      S.finale = true;
      cursors.forEach((c, i) => {
        c.target = () => ({ x: vw() + 60, y: vh() * (0.2 + i * 0.2) });
        c.k = 3;
        c.caretSpan = null;
        c.caret.classList.remove('is-on');
        c.el.classList.remove('is-on');
      });
      skip.classList.remove('is-on');
      await wait(650);
      restorePage(); // the page is complete: put the DOM back exactly as it was

      if (CONFIG.returnToTop && window.scrollY > 40) {
        await wait(500);
        const y0 = window.scrollY;
        const dur = clamp(1500 + y0 * 0.22, 1800, 3600);
        await tween(dur, (p) => {
          window.scrollTo(0, Math.round(y0 * (1 - ease(p))));
          S.lastScrollY = window.scrollY;
        });
      }
      finish();
    }

    function finish() {
      if (S.done) return;
      S.done = true;
      S.stopped = true;
      cancelAnimationFrame(S.raf);
      S.tweens.length = 0;
      S.anims.forEach((a) => { try { a.cancel(); } catch (e) { /* ignore */ } });
      S.anims.clear();
      restorePage();
      stopListening();
      root.remove();
      skip.remove();
      html.classList.remove('vb-init', 'vb-active');
      window.verityBuild.skip = () => {};
    }
    window.verityBuild.skip = finish;

    /* ---- 14. the visitor is in charge ---- */
    const onInput = (e) => {
      if (e.target && e.target.closest && e.target.closest('.vb-skip')) return;
      finish();
    };
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
      finish();
    };
    const opts = { passive: true, capture: true };
    function stopListening() {
      window.removeEventListener('wheel', onInput, opts);
      window.removeEventListener('touchstart', onInput, opts);
      window.removeEventListener('pointerdown', onInput, opts);
      window.removeEventListener('keydown', onKey, opts);
    }
    window.addEventListener('wheel', onInput, opts);
    window.addEventListener('touchstart', onInput, opts);
    window.addEventListener('pointerdown', onInput, opts);
    window.addEventListener('keydown', onKey, opts);

    /* ---- go ---- */
    requestAnimationFrame((now) => {
      S.t0 = now;
      S.last = now;
      S.lastActivity = now;
      S.raf = requestAnimationFrame(frame);
    });
  }

  // start (kept at the bottom so every helper above is defined before init can run)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();