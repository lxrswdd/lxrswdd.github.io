(() => {
  const canvas = document.querySelector("[data-home-meteors]");
  if (!canvas) return;
  const portrait = document.querySelector(".home-profile .avatar");
  const text = document.querySelector(".home-profile [data-particle-text]");
  if (!portrait || !text) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const darkPreference = matchMedia("(prefers-color-scheme: dark)");
  let width = 0;
  let height = 0;
  let meteors = [];
  let frame = null;
  let timer = null;

  function enabled() {
    return !document.hidden && !reducedMotion.matches &&
      (document.body.classList.contains("colorscheme-dark") ||
        (document.body.classList.contains("colorscheme-auto") && darkPreference.matches));
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.ceil(width * dpr);
    canvas.height = Math.ceil(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function animate(now) {
    frame = null;
    ctx.clearRect(0, 0, width, height);
    if (!enabled()) return;
    meteors = meteors.filter(meteor => now - meteor.born < meteor.life);
    for (const meteor of meteors) {
      const elapsed = (now - meteor.born) / 1000;
      const age = (now - meteor.born) / meteor.life;
      const x = meteor.x + meteor.vx * elapsed;
      const y = meteor.y + meteor.vy * elapsed;
      const speed = Math.hypot(meteor.vx, meteor.vy);
      const tailX = x - meteor.vx / speed * meteor.length;
      const tailY = y - meteor.vy / speed * meteor.length;
      const alpha = Math.sin(age * Math.PI) * 0.6;
      const tail = ctx.createLinearGradient(x, y, tailX, tailY);
      tail.addColorStop(0, `rgba(235, 239, 255, ${alpha})`);
      tail.addColorStop(0.25, `rgba(189, 197, 219, ${alpha * 0.45})`);
      tail.addColorStop(1, "rgba(189, 197, 219, 0)");
      ctx.strokeStyle = tail;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = `rgba(250, 250, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (meteors.length) frame = requestAnimationFrame(animate);
  }

  function createMeteor() {
    const photo = portrait.getBoundingClientRect();
    const range = document.createRange();
    const lines = Array.from(text.querySelectorAll("h1, p"), element => {
      range.selectNodeContents(element);
      return range.getBoundingClientRect();
    });
    const words = lines.length ? {
      left: Math.min(...lines.map(line => line.left)),
      right: Math.max(...lines.map(line => line.right)),
      top: Math.min(...lines.map(line => line.top)),
      bottom: Math.max(...lines.map(line => line.bottom)),
    } : text.getBoundingClientRect();
    const regions = [
      { left: photo.left, right: photo.right + 40, top: photo.top - 70, bottom: photo.top + 10 },
      { left: photo.left - 70, right: photo.left - 10, top: photo.top, bottom: photo.bottom },
      { left: photo.right + 10, right: photo.right + 80, top: photo.top, bottom: photo.bottom },
      { left: words.left - 35, right: words.right + 60, top: words.top - 60, bottom: words.bottom + 65 },
    ].map(region => ({
      left: Math.max(16, region.left),
      right: Math.min(width - 16, region.right),
      top: Math.max(16, region.top),
      bottom: Math.min(height - 16, region.bottom),
    })).filter(region => region.right > region.left && region.bottom > region.top);
    if (!regions.length) return null;

    const region = regions[Math.floor(Math.random() * regions.length)];
    const targetX = region.left + Math.random() * (region.right - region.left);
    const targetY = region.top + Math.random() * (region.bottom - region.top);
    const vx = -160 - Math.random() * 70;
    const vy = 180 + Math.random() * 60;
    const life = 1500 + Math.random() * 500;
    // The brightest part of each path passes close to the profile, not the viewport edge.
    return {
      x: targetX - vx * life / 2000,
      y: targetY - vy * life / 2000,
      vx, vy,
      length: 110 + Math.random() * 80,
      life,
      born: performance.now(),
    };
  }

  function schedule(delay) {
    timer = setTimeout(() => {
      timer = null;
      if (!enabled()) return;
      if (meteors.length < 2) {
        const meteor = createMeteor();
        if (meteor) {
          meteors.push(meteor);
          if (frame === null) frame = requestAnimationFrame(animate);
        }
      }
      schedule(2000 + Math.random() * 1000);
    }, delay);
  }

  function refresh() {
    clearTimeout(timer);
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    timer = null;
    meteors = [];
    ctx.clearRect(0, 0, width, height);
    if (enabled()) schedule(900);
  }

  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", refresh);
  reducedMotion.addEventListener("change", refresh);
  darkPreference.addEventListener("change", refresh);
  new MutationObserver(refresh).observe(document.body, {
    attributes: true, attributeFilter: ["class"],
  });
  resize();
  refresh();
})();
