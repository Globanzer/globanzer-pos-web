/* Globanzer POS — scroll interactions (GSAP + ScrollTrigger)
   Content is fully visible without JS. Animations only run when
   GSAP loaded AND the user has not asked for reduced motion. */
(function () {
  "use strict";

  if (!window.gsap || !window.ScrollTrigger) return;
  gsap.registerPlugin(ScrollTrigger);

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var header = $(".site-header");
  var headerH = function () { return header ? header.offsetHeight : 0; };

  /* ---------- Hero chat timeline (shared desktop/mobile) ---------- */
  function buildChat(tl) {
    var input = $(".chat-typed");
    var placeholder = input ? input.textContent : "";
    var items = $$(".chat > li");

    function setInput(text, typing) {
      if (!input) return;
      input.textContent = text;
      input.classList.toggle("is-typing", !!typing);
    }

    items.forEach(function (li) {
      if (li.classList.contains("me")) {
        var text = li.getAttribute("data-type") || li.textContent.trim();
        var len = text.length;
        var proxy = { n: 0 };
        // type into the input box, then "send": bubble appears, input resets
        tl.to(proxy, {
          n: len + 1,
          duration: Math.min(0.4 + len * 0.025, 1.6),
          ease: "none",
          onUpdate: function () {
            var v = Math.floor(proxy.n);
            if (v <= 0 || v > len) setInput(placeholder, false);
            else setInput(text.slice(0, v), true);
          }
        });
        tl.fromTo(li, { autoAlpha: 0, y: 14, scale: 0.96 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.35, ease: "back.out(2)" }, "<+=" + (Math.min(0.4 + len * 0.025, 1.6) * 0.97));
      } else {
        var dots = document.createElement("span");
        dots.className = "dots";
        dots.setAttribute("aria-hidden", "true");
        dots.innerHTML = "<i></i><i></i><i></i>";
        li.appendChild(dots);
        var content = li.children[0];
        tl.set(li, { autoAlpha: 1 }, "+=0.15");
        tl.to(dots, { autoAlpha: 1, duration: 0.2 });
        tl.to(dots, { autoAlpha: 0, duration: 0.15 }, "+=0.5");
        tl.fromTo(content, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.35, ease: "power2.out" }, "<");
      }
      tl.to({}, { duration: 0.25 }); // breathing room
    });

    return function cleanup() {
      $$(".dots").forEach(function (d) { d.remove(); });
      setInput(placeholder, false);
    };
  }

  /* ---------- Mouse tilt (desktop, fine pointer) ---------- */
  function addTilt(el, strength) {
    var rx = gsap.quickTo(el, "rotationX", { duration: 0.5, ease: "power3.out" });
    var ry = gsap.quickTo(el, "rotationY", { duration: 0.5, ease: "power3.out" });
    function move(e) {
      var r = el.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width - 0.5;
      var py = (e.clientY - r.top) / r.height - 0.5;
      ry(px * strength);
      rx(-py * strength);
    }
    function leave() { rx(0); ry(0); }
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return function () {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    };
  }

  /* ---------- Photo backgrounds: subtle scroll parallax ---------- */
  function parallax(sel) {
    var box = $(sel);
    if (!box) return;
    var img = $("img", box);
    gsap.fromTo(img, { yPercent: -6 }, { yPercent: 6, ease: "none",
      scrollTrigger: { trigger: box, start: "top bottom", end: "bottom top", scrub: true } });
  }

  var mm = gsap.matchMedia();

  mm.add({
    desktop: "(min-width: 900px)",
    mobile: "(max-width: 899px)",
    motion: "(prefers-reduced-motion: no-preference)",
    finePointer: "(hover: hover) and (pointer: fine)"
  }, function (ctx) {
    var c = ctx.conditions;
    if (!c.motion) return; // reduced motion: leave everything static

    var cleanups = [];
    document.documentElement.classList.add("js-anim");

    /* ===== HERO ===== */
    gsap.from(".hero-copy > *", { y: 24, autoAlpha: 0, duration: 0.6, stagger: 0.06, ease: "power3.out", clearProps: "transform" });

    var chatTl = gsap.timeline({
      scrollTrigger: c.desktop ? {
        trigger: ".hero",
        start: function () { return "top " + headerH() + "px"; },
        end: "+=1300",
        pin: true,
        scrub: 0.6,
        anticipatePin: 1
      } : {
        trigger: ".phone",
        start: "top 70%",
        end: "bottom 80%",
        scrub: 0.6
      }
    });
    // phone settles into place as the chat plays
    chatTl.fromTo(".phone", { rotationY: -22, rotationX: 8, y: 20 }, { rotationY: 0, rotationX: 0, y: 0, duration: 2, ease: "none" }, 0);
    cleanups.push(buildChat(chatTl));
    // hero photo: slow drift + gentle zoom-out while the chat plays
    gsap.fromTo(".hero .photo-bg img", { yPercent: -4, scale: 1.08 }, {
      yPercent: 5, scale: 1, ease: "none",
      scrollTrigger: { start: 0, end: c.desktop ? "+=1600" : "+=600", scrub: true }
    });

    if (c.desktop && c.finePointer) {
      cleanups.push(addTilt($(".phone-frame"), 14));
    }

    /* ===== CÓMO FUNCIONA ===== */
    var steps = $$(".step");
    function setStep(i) {
      steps.forEach(function (s, k) { s.classList.toggle("is-active", k === i); });
    }
    if (c.desktop) {
      var howTl = gsap.timeline({
        scrollTrigger: {
          trigger: ".how",
          start: function () { return "top " + headerH() + "px"; },
          end: "+=1500",
          pin: true,
          scrub: 0.6,
          onUpdate: function (self) {
            setStep(Math.min(steps.length - 1, Math.floor(self.progress * steps.length * 0.999)));
          },
          onLeaveBack: function () { setStep(0); }
        }
      });
      howTl.fromTo(".how .photo-bg img",
        { scale: 1.12, yPercent: -4 },
        { scale: 1, yPercent: 4, ease: "none", duration: 3 }, 0);
      howTl.fromTo(steps, { autoAlpha: 0.35, x: 20 }, { autoAlpha: 1, x: 0, stagger: 1, duration: 0.6 }, 0);
      setStep(0);
    } else {
      parallax(".how .photo-bg");
      steps.forEach(function (s, i) {
        ScrollTrigger.create({
          trigger: s, start: "top 75%", end: "bottom 35%",
          onToggle: function (self) { if (self.isActive) setStep(i); }
        });
        gsap.from(s, { y: 30, autoAlpha: 0, duration: 0.6, ease: "power2.out", clearProps: "transform",
          scrollTrigger: { trigger: s, start: "top 90%" } });
      });
    }

    /* ===== Generic reveals ===== */
    $$(".sec-head, .register-copy, .confirm-copy > p, .confirm-copy > h2, .globi-copy, .extras, .note, .cloud-strip, .start-box").forEach(function (el) {
      gsap.from(el, { y: 40, autoAlpha: 0, duration: 0.8, ease: "power3.out", clearProps: "transform",
        scrollTrigger: { trigger: el, start: "top 88%" } });
    });

    /* ===== Feature cards ===== */
    gsap.set(".cards", { perspective: 900 });
    gsap.set(".card", { autoAlpha: 0 });
    ScrollTrigger.batch(".card", {
      start: "top 90%",
      once: true,
      onEnter: function (batch) {
        gsap.fromTo(batch,
          { y: 50, rotationX: -25, autoAlpha: 0 },
          { y: 0, rotationX: 0, autoAlpha: 1, duration: 0.8, stagger: 0.1, ease: "power3.out", clearProps: "transform" });
      }
    });

    /* ===== La caja: parallax ===== */
    parallax(".register .photo-bg");
    gsap.fromTo(".ticket", { y: 40 }, { y: -30, ease: "none",
      scrollTrigger: { trigger: ".register", start: "top bottom", end: "bottom top", scrub: true } });
    gsap.from(".chips li", { scale: 0.6, autoAlpha: 0, stagger: 0.06, duration: 0.4, ease: "back.out(2)", clearProps: "transform",
      scrollTrigger: { trigger: ".chips", start: "top 90%" } });

    /* ===== Nada se guarda: 3D reveal ===== */
    gsap.fromTo(".drawer-img",
      { rotationX: 60, scale: 0.7, autoAlpha: 0, y: 60 },
      { rotationX: 0, scale: 1, autoAlpha: 1, y: 0, ease: "power2.out",
        scrollTrigger: { trigger: ".confirm-visual", start: "top 90%", end: "center 55%", scrub: 0.6 } });
    gsap.from(".confirm-card", { rotationY: -30, x: -30, autoAlpha: 0, duration: 0.9, ease: "power3.out", clearProps: "transform",
      scrollTrigger: { trigger: ".confirm-card", start: "top 90%" } });

    /* ===== Globi floating ===== */
    gsap.fromTo(".globi-visual", { y: 60, rotation: -6 }, { y: -40, rotation: 4, ease: "none",
      scrollTrigger: { trigger: ".globi", start: "top bottom", end: "bottom top", scrub: true } });

    /* ===== Pricing ===== */
    gsap.from(".price-card", { y: 60, rotationX: -18, autoAlpha: 0, duration: 0.9, stagger: 0.15, ease: "power3.out",
      clearProps: "transform", scrollTrigger: { trigger: ".price-grid", start: "top 85%" } });
    if (c.finePointer) {
      $$("[data-tilt]").forEach(function (el) { cleanups.push(addTilt(el, 12)); });
    }

    return function () {
      cleanups.forEach(function (fn) { fn && fn(); });
      document.documentElement.classList.remove("js-anim");
    };
  });

  // images below the fold are lazy: recompute positions once they load
  window.addEventListener("load", function () { ScrollTrigger.refresh(); });
  $$("img[loading='lazy']").forEach(function (img) {
    if (!img.complete) img.addEventListener("load", function () { ScrollTrigger.refresh(); }, { once: true });
  });
})();
