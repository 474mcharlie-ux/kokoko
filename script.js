/* ==========================================================================
   Verity — Sovereign Labs
   Interaction script (no dependencies, no build step)
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasFinePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  initNavScrollState();
  initMobileMenu();
  initActiveNavLink();
  initHeadlineReveal();
  initMarquee();
  initScrollReveal();
  initCardSpotlight();
  initCursorGlow();
  initHeroParallax();
  initCtaForm();

  /* ------------------------------------------------------------------
     Nav: glass pill appears once the page has scrolled past the top
     ------------------------------------------------------------------ */
  function initNavScrollState() {
    const nav = document.getElementById("nav");
    if (!nav) return;

    const setState = () => {
      nav.classList.toggle("is-scrolled", window.scrollY > 12);
    };
    setState();
    window.addEventListener("scroll", setState, { passive: true });
  }

  /* ------------------------------------------------------------------
     Mobile menu: toggle, close on link click / outside click / Escape
     ------------------------------------------------------------------ */
  function initMobileMenu() {
    const toggle = document.getElementById("navToggle");
    const menu = document.getElementById("mobileMenu");
    if (!toggle || !menu) return;

    const closeMenu = () => {
      toggle.classList.remove("is-open");
      menu.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      document.body.style.overflow = "";
    };

    const openMenu = () => {
      toggle.classList.add("is-open");
      menu.classList.add("is-open");
      toggle.setAttribute("aria-expanded", "true");
      document.body.style.overflow = "hidden";
    };

    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", "mobileMenu");

    toggle.addEventListener("click", () => {
      const isOpen = menu.classList.contains("is-open");
      isOpen ? closeMenu() : openMenu();
    });

    menu.querySelectorAll(".mobile-link").forEach((link) => {
      link.addEventListener("click", closeMenu);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && menu.classList.contains("is-open")) closeMenu();
    });

    document.addEventListener("click", (e) => {
      if (!menu.classList.contains("is-open")) return;
      if (menu.contains(e.target) || toggle.contains(e.target)) return;
      closeMenu();
    });

    // Reset state if the viewport grows back to desktop width
    window.addEventListener("resize", () => {
      if (window.innerWidth > 860) closeMenu();
    });
  }

  /* ------------------------------------------------------------------
     Highlight the nav link matching whichever section is in view
     ------------------------------------------------------------------ */
  function initActiveNavLink() {
    const links = Array.from(document.querySelectorAll('.nav-link[href^="#"]'));
    if (!links.length) return;

    const sections = links
      .map((link) => document.querySelector(link.getAttribute("href")))
      .filter(Boolean);

    if (!sections.length || !("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const link = links.find((l) => l.getAttribute("href") === `#${entry.target.id}`);
          if (!link) return;
          if (entry.isIntersecting) {
            links.forEach((l) => l.classList.remove("is-active"));
            link.classList.add("is-active");
          }
        });
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
    );

    sections.forEach((section) => observer.observe(section));
  }

  /* ------------------------------------------------------------------
     Hero headline: word-by-word blur-in. The words are wrapped in
     spans at runtime, so the HTML itself is untouched and the headline
     stays fully visible if this script doesn't run.
     ------------------------------------------------------------------ */
  function initHeadlineReveal() {
    const headline = document.querySelector(".hero-headline");
    if (!headline || prefersReducedMotion) return;

    let index = 0;

    const wrapWords = (node) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) {
              frag.appendChild(document.createTextNode(" "));
              return;
            }
            const word = document.createElement("span");
            word.className = "w";
            word.textContent = part;
            word.style.setProperty("--wi", String(index++));
            frag.appendChild(word);
          });
          node.replaceChild(frag, child);
        } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName !== "BR") {
          wrapWords(child);
        }
      });
    };

    wrapWords(headline);
    headline.classList.add("is-split");
  }

  /* ------------------------------------------------------------------
     Trust strip: turn the row into a seamless, looping ticker.
     The original items are cloned, never altered; clones are hidden
     from assistive tech. Falls back to the static row without JS or
     when the visitor prefers reduced motion.
     ------------------------------------------------------------------ */
  function initMarquee() {
    const row = document.querySelector(".trust-row");
    if (!row || prefersReducedMotion) return;

    const originals = Array.from(row.children).map((node) => node.cloneNode(true));
    if (!originals.length) return;

    const SPEED = 50; // px per second
    let lastWidth = 0;

    const makeGroup = (hidden) => {
      const group = document.createElement("div");
      group.className = "marquee-group";
      if (hidden) group.setAttribute("aria-hidden", "true");
      originals.forEach((node) => group.appendChild(node.cloneNode(true)));
      return group;
    };

    const build = () => {
      row.textContent = "";
      row.classList.add("is-marquee");

      const track = document.createElement("div");
      track.className = "marquee-track";
      const first = makeGroup(false);
      track.appendChild(first);
      row.appendChild(track);

      const groupWidth = first.getBoundingClientRect().width;
      if (!groupWidth) return;

      // enough copies that the track is always wider than the row + one group
      const total = Math.ceil(row.clientWidth / groupWidth) + 1;
      for (let i = 1; i < total; i++) track.appendChild(makeGroup(true));

      track.style.setProperty("--marquee-shift", `-${groupWidth}px`);
      track.style.animationDuration = `${Math.max(12, groupWidth / SPEED)}s`;
      lastWidth = window.innerWidth;
    };

    const start = () => {
      build();
      let timer;
      window.addEventListener("resize", () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          if (window.innerWidth !== lastWidth) build();
        }, 200);
      });
    };

    // measure after web fonts have loaded so the loop length is exact
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(start);
    } else {
      start();
    }
  }

  /* ------------------------------------------------------------------
     Scroll reveal — classes are added here, never present by default,
     so content stays fully visible if JS doesn't run.
     ------------------------------------------------------------------ */
  function initScrollReveal() {
    if (prefersReducedMotion || !("IntersectionObserver" in window)) return;

    const groups = [
      { selector: ".section-header", stagger: 0 },
      { selector: ".knowledge-grid .k-card", stagger: 70, useIndexVar: true },
      { selector: ".pillar", stagger: 110 },
      { selector: ".stat", stagger: 90 },
      { selector: ".pq", stagger: 70 },
    ];

    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("in-view");
          obs.unobserve(entry.target);
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" }
    );

    groups.forEach(({ selector, stagger, useIndexVar }) => {
      document.querySelectorAll(selector).forEach((el, i) => {
        el.classList.add("reveal");
        if (stagger) {
          const index = useIndexVar
            ? parseInt(getComputedStyle(el).getPropertyValue("--i")) || i
            : i;
          el.style.transitionDelay = `${index * stagger}ms`;
        }

        // Once the entrance has finished, hand the element back to its own
        // hover transitions and drop the stagger delay.
        const onDone = (e) => {
          if (e.target !== el || e.propertyName !== "opacity") return;
          if (!el.classList.contains("in-view")) return;
          el.classList.add("reveal-done");
          el.style.transitionDelay = "";
          el.removeEventListener("transitionend", onDone);
        };
        el.addEventListener("transitionend", onDone);

        observer.observe(el);
      });
    });
  }

  /* ------------------------------------------------------------------
     Card spotlight — feeds the pointer position to the glow that
     follows the cursor across the cards (pure CSS does the painting).
     ------------------------------------------------------------------ */
  function initCardSpotlight() {
    if (!hasFinePointer) return;

    document.addEventListener(
      "pointermove",
      (e) => {
        if (!e.target || !e.target.closest) return;
        const card = e.target.closest(".k-card, .pillar");
        if (!card) return;
        const rect = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${e.clientX - rect.left}px`);
        card.style.setProperty("--my", `${e.clientY - rect.top}px`);
      },
      { passive: true }
    );
  }

  /* ------------------------------------------------------------------
     Soft ambient glow that trails the cursor (desktop pointers only)
     ------------------------------------------------------------------ */
  function initCursorGlow() {
    if (prefersReducedMotion || !hasFinePointer) return;

    const glow = document.createElement("div");
    glow.className = "cursor-glow";
    glow.setAttribute("aria-hidden", "true");
    document.body.appendChild(glow);

    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;
    let x = targetX;
    let y = targetY;
    let frame = null;
    let started = false;

    const render = () => {
      x += (targetX - x) * 0.12;
      y += (targetY - y) * 0.12;
      glow.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
      if (Math.abs(targetX - x) > 0.1 || Math.abs(targetY - y) > 0.1) {
        frame = requestAnimationFrame(render);
      } else {
        frame = null;
      }
    };

    document.addEventListener(
      "pointermove",
      (e) => {
        targetX = e.clientX;
        targetY = e.clientY;
        if (!started) {
          started = true;
          x = targetX;
          y = targetY;
          glow.classList.add("is-on");
        }
        if (!frame) frame = requestAnimationFrame(render);
      },
      { passive: true }
    );

    document.documentElement.addEventListener("mouseleave", () => glow.classList.remove("is-on"));
    document.documentElement.addEventListener("mouseenter", () => {
      if (started) glow.classList.add("is-on");
    });
  }

  /* ------------------------------------------------------------------
     Hero parallax — the aurora and floating cards drift gently
     against the pointer (values are consumed by CSS custom properties)
     ------------------------------------------------------------------ */
  function initHeroParallax() {
    const hero = document.getElementById("hero");
    if (!hero || prefersReducedMotion || !hasFinePointer) return;

    hero.addEventListener(
      "pointermove",
      (e) => {
        const rect = hero.getBoundingClientRect();
        const px = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
        const py = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
        hero.style.setProperty("--px", px.toFixed(3));
        hero.style.setProperty("--py", py.toFixed(3));
      },
      { passive: true }
    );

    hero.addEventListener("pointerleave", () => {
      hero.style.setProperty("--px", "0");
      hero.style.setProperty("--py", "0");
    });
  }

  /* ------------------------------------------------------------------
     CTA form — client-side only (no backend endpoint on this page),
     validates, shows a submitting state, then a confirmation panel.
     ------------------------------------------------------------------ */
  function initCtaForm() {
    const form = document.getElementById("ctaForm");
    const submitBtn = document.getElementById("cta-submit");
    if (!form || !submitBtn) return;

    const nameInput = document.getElementById("f-name");
    const emailInput = document.getElementById("f-email");
    const firmInput = document.getElementById("f-firm");
    const ctaBlock = form.closest(".cta-block");
    const disclaimer = ctaBlock ? ctaBlock.querySelector(".cta-disclaimer") : null;
    const submitLabel = submitBtn.innerHTML;

    form.addEventListener("submit", (e) => {
      e.preventDefault();

      if (typeof form.reportValidity === "function" && !form.reportValidity()) {
        return;
      }

      submitBtn.disabled = true;
      submitBtn.style.opacity = "0.7";
      submitBtn.textContent = "Sending\u2026";

      // No backend is wired to this static page — this simulates the
      // round trip so the flow feels complete until one is connected.
      window.setTimeout(() => {
        showSuccess({
          name: nameInput ? nameInput.value.trim() : "",
          firm: firmInput ? firmInput.value.trim() : "",
        });
      }, 550);
    });

    function showSuccess({ firm }) {
      form.style.display = "none";
      if (disclaimer) disclaimer.style.display = "none";

      let success = ctaBlock.querySelector(".cta-success");
      if (!success) {
        success = document.createElement("div");
        success.className = "cta-success";
        success.innerHTML = `
          <div class="cta-success-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M4 9.5l3 3 7-7.5" stroke="#F4EFE6" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="cta-success-title">Request received</div>
          <p class="cta-success-body"></p>
        `;
        ctaBlock.appendChild(success);
      }

      const body = success.querySelector(".cta-success-body");
      body.textContent = firm
        ? `We'll be in touch about ${firm} within 48 hours.`
        : "We'll be in touch within 48 hours.";

      success.classList.add("is-visible");
      submitBtn.innerHTML = submitLabel;
      submitBtn.disabled = false;
      submitBtn.style.opacity = "";
    }
  }
});