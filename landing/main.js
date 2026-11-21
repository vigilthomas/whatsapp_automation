(() => {
  const root = document.documentElement;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.querySelectorAll("[data-year]").forEach((el) => (el.textContent = String(new Date().getFullYear())));

  const nav = document.querySelector("[data-nav]");
  if (nav) {
    const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  const steps = [...document.querySelectorAll("[data-steps] li")];
  const screens = [...document.querySelectorAll("[data-screen]")];
  let current = -1;
  const showStep = (i) => {
    if (i === current || i < 0) return;
    current = i;
    steps.forEach((s, n) => s.classList.toggle("is-active", n === i));
    screens.forEach((s, n) => s.classList.toggle("is-on", n === i));
  };
  if (steps.length) showStep(0);

  // No GSAP (blocked CDN) or reduced motion: everything visible; steps follow scroll.
  if (!window.gsap || !window.ScrollTrigger || reduce) {
    if (steps.length) {
      const io = new IntersectionObserver(
        (entries) => entries.forEach((e) => e.isIntersecting && showStep(steps.indexOf(e.target))),
        { rootMargin: "-45% 0px -45% 0px" },
      );
      steps.forEach((s) => io.observe(s));
    }
    return;
  }

  root.classList.add("js");
  gsap.registerPlugin(ScrollTrigger);
  const mm = gsap.matchMedia();
  const ease = "power3.out";

  // Hero: copy rises in, the phone settles in, and the chat plays once.
  if (document.querySelector(".hero")) {
    const bubbles = gsap.utils.toArray("[data-hero-chat] > *");
    gsap.set(bubbles, { autoAlpha: 0, y: 10 });
    gsap
      .timeline({ defaults: { ease } })
      .to("[data-fade]", { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.08, startAt: { y: 18 } })
      .from("[data-hero-device]", { autoAlpha: 0, y: 50, duration: 1.1, ease: "expo.out" }, 0.15)
      .to(bubbles, { autoAlpha: 1, y: 0, duration: 0.45, stagger: 0.55, ease: "back.out(1.6)" }, 0.9);

    gsap.to("[data-hero-device]", {
      y: -40,
      ease: "none",
      scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true },
    });
  }

  // Generic reveals.
  gsap.utils.toArray("[data-fade-scroll]").forEach((el) =>
    gsap.fromTo(el, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.8, ease, scrollTrigger: { trigger: el, start: "top 85%" } }),
  );
  ScrollTrigger.batch("[data-card]", {
    start: "top 90%",
    onEnter: (els) => gsap.fromTo(els, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.07, ease, overwrite: true }),
  });

  // Desktop window: tilts upright as it scrolls into view; the notification slides in.
  const win = document.querySelector("[data-window] .window");
  if (win) {
    gsap.fromTo(
      win,
      { rotateX: 16, y: 60, scale: 0.94 },
      { rotateX: 0, y: 0, scale: 1, ease: "none", scrollTrigger: { trigger: "[data-window]", start: "top 95%", end: "top 30%", scrub: 0.6 } },
    );
    gsap.from("[data-toast]", {
      x: 60,
      autoAlpha: 0,
      duration: 0.7,
      ease: "back.out(1.4)",
      scrollTrigger: { trigger: "[data-window]", start: "top 45%" },
    });
    gsap.from(".app-thread .bubble", {
      autoAlpha: 0,
      y: 10,
      stagger: 0.25,
      duration: 0.4,
      ease,
      scrollTrigger: { trigger: "[data-window]", start: "top 60%" },
    });
  }

  // How it works: pinned on desktop, scroll moves through the four steps.
  if (steps.length) {
    mm.add("(min-width: 1000px)", () => {
      ScrollTrigger.create({
        trigger: "[data-story]",
        start: "top top",
        end: "+=" + steps.length * 75 + "%",
        pin: true,
        scrub: true,
        snap: { snapTo: 1 / (steps.length - 1), duration: 0.35, ease: "power2.inOut", delay: 0.05 },
        onUpdate: (self) => showStep(Math.round(self.progress * (steps.length - 1))),
      });
    });
    mm.add("(max-width: 999px)", () => {
      steps.forEach((s, i) =>
        ScrollTrigger.create({ trigger: s, start: "top 65%", end: "bottom 65%", onToggle: (self) => self.isActive && showStep(i) }),
      );
    });
  }

  document.fonts?.ready.then(() => ScrollTrigger.refresh());
})();
