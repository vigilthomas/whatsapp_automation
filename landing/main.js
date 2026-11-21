(() => {
  const root = document.documentElement;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const year = document.querySelector("[data-year]");
  if (year) year.textContent = String(new Date().getFullYear());

  // Nav turns solid once the hero is behind us.
  const nav = document.querySelector("[data-nav]");
  const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > window.innerHeight * 0.75);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  const steps = [...document.querySelectorAll("[data-steps] li")];
  const screens = [...document.querySelectorAll("[data-screen]")];
  const bar = document.querySelector("[data-progress]");
  let current = -1;
  const showStep = (i) => {
    if (i === current) return;
    current = i;
    steps.forEach((s, n) => s.classList.toggle("is-active", n === i));
    screens.forEach((s, n) => s.classList.toggle("is-on", n === i));
  };
  showStep(0);

  // Without GSAP (blocked CDN) or with reduced motion: everything visible, steps follow scroll plainly.
  if (!window.gsap || !window.ScrollTrigger || reduce) {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && showStep(steps.indexOf(e.target))),
      { rootMargin: "-45% 0px -45% 0px" },
    );
    steps.forEach((s) => io.observe(s));
    return;
  }

  root.classList.add("js");
  gsap.registerPlugin(ScrollTrigger);
  const mm = gsap.matchMedia();

  // ---------------------------------------------------------------- hero entrance
  const chat = [...document.querySelectorAll("[data-hero-chat] > *")];
  gsap.set(chat, { autoAlpha: 0, y: 14, scale: 0.96 });
  const intro = gsap.timeline({ defaults: { ease: "power3.out" } });
  intro
    .from("[data-hero-title] .line > span", { yPercent: 110, duration: 1.1, stagger: 0.12 })
    .from("[data-hero]", { autoAlpha: 0, y: 24, duration: 0.9, stagger: 0.1 }, "-=0.7")
    .from("[data-hero-phone] .phone", { autoAlpha: 0, y: 80, rotateY: -24, rotateX: 8, duration: 1.4, ease: "expo.out" }, "-=1.1")
    .from(".float-chip", { autoAlpha: 0, scale: 0.6, duration: 0.6, stagger: 0.15, ease: "back.out(2)" }, "-=0.6");

  // The chat plays itself, then replays — the hero's living proof.
  const chatLoop = gsap.timeline({ repeat: -1, repeatDelay: 2.4, delay: 1.4 });
  chat.forEach((m, i) => {
    chatLoop.to(m, { autoAlpha: 1, y: 0, scale: 1, duration: 0.45, ease: "back.out(1.7)" }, i === 0 ? 0 : "+=0.9");
  });
  chatLoop.to(chat, { autoAlpha: 0, y: -10, duration: 0.4, stagger: 0.05 }, "+=2.6");

  // Gentle float on the phone and chips.
  gsap.to(".chip-a", { y: -10, duration: 2.6, ease: "sine.inOut", yoyo: true, repeat: -1 });
  gsap.to(".chip-b", { y: 10, duration: 3.1, ease: "sine.inOut", yoyo: true, repeat: -1 });

  // Hero parallax: copy drifts up, phone tilts back as you leave.
  gsap.to(".hero-copy", { yPercent: -18, autoAlpha: 0.2, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
  gsap.to("[data-hero-phone]", { yPercent: 12, rotateX: 14, scale: 0.94, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });

  // ---------------------------------------------------------------- languages: skew with scroll speed
  const track = document.querySelector(".marquee-track");
  const skewTo = gsap.quickTo(track, "skewX", { duration: 0.5, ease: "power3" });
  ScrollTrigger.create({
    trigger: ".langs",
    start: "top bottom",
    end: "bottom top",
    onUpdate: (self) => skewTo(gsap.utils.clamp(-12, 12, self.getVelocity() / -180)),
    onLeave: () => skewTo(0),
    onLeaveBack: () => skewTo(0),
  });

  // ---------------------------------------------------------------- story
  mm.add("(min-width: 980px)", () => {
    ScrollTrigger.create({
      trigger: ".story-inner",
      start: "top top",
      end: "+=" + steps.length * 90 + "%",
      pin: true,
      scrub: true,
      snap: { snapTo: 1 / (steps.length - 1), duration: 0.4, ease: "power2.inOut", delay: 0.05 },
      onUpdate: (self) => {
        showStep(Math.min(steps.length - 1, Math.round(self.progress * (steps.length - 1))));
        gsap.set(bar, { scaleX: self.progress });
      },
    });
    gsap.from(".phone-story", { rotateY: 18, y: 60, autoAlpha: 0, duration: 1.2, ease: "expo.out", scrollTrigger: { trigger: ".story", start: "top 70%" } });
  });
  mm.add("(max-width: 979px)", () => {
    steps.forEach((s, i) =>
      ScrollTrigger.create({
        trigger: s,
        start: "top 60%",
        end: "bottom 60%",
        onToggle: (self) => self.isActive && showStep(i),
        onUpdate: () => gsap.set(bar, { scaleX: (i + 1) / steps.length }),
      }),
    );
  });

  gsap.from(".story .section-title", { y: 40, autoAlpha: 0, duration: 1, ease: "power3.out", scrollTrigger: { trigger: ".story", start: "top 75%" } });

  // ---------------------------------------------------------------- feature tiles
  gsap.from(".features .section-head > *", { y: 30, autoAlpha: 0, stagger: 0.1, duration: 0.9, ease: "power3.out", scrollTrigger: { trigger: ".features", start: "top 75%" } });
  ScrollTrigger.batch(".bento [data-reveal]", {
    start: "top 88%",
    onEnter: (els) => gsap.to(els, { autoAlpha: 1, y: 0, duration: 0.9, stagger: 0.09, ease: "power3.out", overwrite: true }),
  });
  gsap.from(".bars i", { scaleY: 0, duration: 1, stagger: 0.07, ease: "elastic.out(1, 0.6)", scrollTrigger: { trigger: ".tile-dash", start: "top 80%" } });

  // ---------------------------------------------------------------- businesses: sideways on desktop
  mm.add("(min-width: 980px)", () => {
    const biz = document.querySelector(".biz");
    const row = document.querySelector("[data-biz-track]");
    biz.classList.add("is-horizontal");
    const distance = () => Math.max(0, row.scrollWidth - window.innerWidth);
    const slide = gsap.to(row, {
      x: () => -distance(),
      ease: "none",
      scrollTrigger: { trigger: ".biz-pin", start: "top top", end: () => "+=" + distance(), pin: true, scrub: 0.6, invalidateOnRefresh: true },
    });
    gsap.utils.toArray(".biz-card").forEach((card) => {
      gsap.from(card.querySelector(".biz-ico"), {
        scale: 0.3,
        rotate: -40,
        ease: "back.out(2)",
        duration: 0.8,
        scrollTrigger: { trigger: card, containerAnimation: slide, start: "left 85%" },
      });
    });
    return () => biz.classList.remove("is-horizontal");
  });
  mm.add("(max-width: 979px)", () => {
    ScrollTrigger.batch(".biz-card", { start: "top 88%", onEnter: (els) => gsap.from(els, { y: 40, autoAlpha: 0, stagger: 0.1, duration: 0.8, ease: "power3.out" }) });
  });

  // ---------------------------------------------------------------- trust + CTA
  ScrollTrigger.batch(".trust [data-reveal]", {
    start: "top 88%",
    onEnter: (els) => gsap.to(els, { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.12, ease: "power3.out", overwrite: true }),
  });
  gsap.from(".trust .section-title", { y: 40, autoAlpha: 0, duration: 1, ease: "power3.out", scrollTrigger: { trigger: ".trust", start: "top 70%" } });

  // CTA headline: words rise one by one as it scrolls in.
  const cta = document.querySelector("[data-cta]");
  cta.innerHTML = cta.innerHTML
    .split(/(<em>.*?<\/em>|\s+)/)
    .map((part) => (!part.trim() ? part : `<span class="w" style="display:inline-block">${part}</span>`))
    .join("");
  gsap.from(".cta .w", { yPercent: 60, autoAlpha: 0, rotate: 4, stagger: 0.08, ease: "power3.out", scrollTrigger: { trigger: ".cta", start: "top 80%", end: "top 35%", scrub: 0.8 } });

  // Fonts change line lengths: measure again once they're in.
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
})();
