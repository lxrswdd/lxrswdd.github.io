(() => {
  const host = document.querySelector("[data-particle-text]");
  if (!host) return;

  const source = host.querySelector(".particle-text-source");
  const canvas = host.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const mask = document.createElement("canvas");
  const ink = mask.getContext("2d", { willReadFrequently: true });
  if (!ctx || !ink) return;

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const padding = 24;
  const maskScale = 3;
  const spacing = 0.9;
  const pointer = { x: 0, y: 0, active: false };
  let particles = [];
  let width = 0;
  let height = 0;
  let frame = null;
  let rebuildFrame = null;
  let visible = true;
  let previousTime = 0;
  let textColor = "#dadada";

  function rebuild() {
    const bounds = host.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    width = Math.ceil(bounds.width + padding * 2);
    height = Math.ceil(bounds.height + padding * 2);
    const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);
    canvas.width = Math.ceil(width * dpr);
    canvas.height = Math.ceil(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    mask.width = Math.ceil(width * maskScale);
    mask.height = Math.ceil(height * maskScale);
    ink.setTransform(maskScale, 0, 0, maskScale, 0, 0);
    ink.fillStyle = "#fff";
    ink.textBaseline = "alphabetic";
    const dark = document.body.classList.contains("colorscheme-dark") ||
      (document.body.classList.contains("colorscheme-auto") &&
        matchMedia("(prefers-color-scheme: dark)").matches);
    textColor = dark ? "#f1f0ed" : getComputedStyle(source.querySelector("h1")).color;

    // Oversample the real glyphs, then clip resting dots to their exact contours.
    const walker = document.createTreeWalker(source, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent.trim()) continue;
      const style = getComputedStyle(node.parentElement);
      ink.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      let offset = 0;
      for (const letter of node.textContent) {
        range.setStart(node, offset);
        offset += letter.length;
        range.setEnd(node, offset);
        if (!letter.trim()) continue;
        const rect = range.getBoundingClientRect();
        const metrics = ink.measureText(letter);
        const ascent = metrics.fontBoundingBoxAscent;
        const descent = metrics.fontBoundingBoxDescent;
        const baseline = Number.isFinite(ascent + descent)
          ? (rect.height - ascent - descent) / 2 + ascent : rect.height * 0.8;
        ink.fillText(letter, rect.left - bounds.left + padding,
          rect.top - bounds.top + padding + baseline);
      }
    }

    const pixels = ink.getImageData(0, 0, mask.width, mask.height).data;
    particles = [];
    for (let y = spacing / 2; y < height; y += spacing) {
      for (let x = spacing / 2; x < width; x += spacing) {
        const pixel = Math.floor(y * maskScale) * mask.width + Math.floor(x * maskScale);
        if (pixels[pixel * 4 + 3] < 100) continue;
        particles.push({
          homeX: x, homeY: y, x, y, vx: 0, vy: 0,
          radius: 0.38,
          phase: Math.random() * Math.PI * 2,
          gold: Math.random() < 0.03,
        });
      }
    }
    host.classList.remove("is-dispersing");
    host.classList.toggle("is-ready", particles.length > 0);
    previousTime = 0;
    draw(performance.now());
    start();
  }

  function draw(now) {
    const dt = previousTime ? Math.min((now - previousTime) / 16.67, 2) : 1;
    previousTime = now;
    ctx.clearRect(0, 0, width, height);
    let moving = false;
    for (const particle of particles) {
      if (!reducedMotion.matches) {
        const dx = particle.x - pointer.x;
        const dy = particle.y - pointer.y;
        const distance = Math.hypot(dx, dy);
        if (pointer.active && distance < 64 && distance > 0.1) {
          const force = (1 - distance / 64) * 0.4;
          particle.vx += dx / distance * force * dt;
          particle.vy += dy / distance * force * dt;
        }
        particle.vx += (particle.homeX - particle.x) * 0.055 * dt;
        particle.vy += (particle.homeY - particle.y) * 0.055 * dt;
        particle.vx *= Math.pow(0.8, dt);
        particle.vy *= Math.pow(0.8, dt);
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
      }
      if (Math.abs(particle.x - particle.homeX) + Math.abs(particle.y - particle.homeY) > 0.04) {
        moving = true;
      }
      const shimmer = pointer.active && !reducedMotion.matches
        ? 0.97 + Math.sin(now * 0.0014 + particle.phase) * 0.03 : 1;
      ctx.globalAlpha = shimmer;
      ctx.fillStyle = particle.gold ? "#c5a46d" : textColor;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    host.classList.toggle("is-dispersing", pointer.active || moving);
    if (!pointer.active && !moving) {
      ctx.save();
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(mask, 0, 0, width, height);
      ctx.restore();
    }
    return moving;
  }

  function animate(now) {
    frame = null;
    if (document.hidden || !visible || reducedMotion.matches) {
      pointer.active = false;
      host.classList.remove("is-dispersing");
      for (const particle of particles) {
        particle.x = particle.homeX;
        particle.y = particle.homeY;
        particle.vx = 0;
        particle.vy = 0;
      }
      draw(now);
      return;
    }
    const moving = draw(now);
    if (pointer.active || moving) {
      frame = requestAnimationFrame(animate);
    } else {
      host.classList.remove("is-dispersing");
    }
  }

  function start() {
    if (frame === null && !document.hidden && visible && !reducedMotion.matches) {
      previousTime = 0;
      frame = requestAnimationFrame(animate);
    }
  }

  function movePointer(event) {
    const rect = host.getBoundingClientRect();
    pointer.x = event.clientX - rect.left + padding;
    pointer.y = event.clientY - rect.top + padding;
    pointer.active = true;
    start();
  }

  host.addEventListener("pointermove", event => {
    if (event.pointerType !== "touch") movePointer(event);
  });
  host.addEventListener("pointerleave", () => {
    pointer.active = false;
    start();
  });
  host.addEventListener("pointerdown", event => {
    movePointer(event);
  });
  host.addEventListener("pointerup", event => {
    if (event.pointerType === "touch") pointer.active = false;
  });
  host.addEventListener("pointercancel", () => {
    pointer.active = false;
  });

  function queueRebuild() {
    if (rebuildFrame !== null) cancelAnimationFrame(rebuildFrame);
    rebuildFrame = requestAnimationFrame(() => {
      rebuildFrame = null;
      rebuild();
    });
  }

  new ResizeObserver(queueRebuild).observe(source);
  new MutationObserver(queueRebuild).observe(document.body, {
    attributes: true, attributeFilter: ["class"],
  });
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) start();
  }).observe(host);
  document.addEventListener("visibilitychange", start);
  reducedMotion.addEventListener("change", queueRebuild);
  window.addEventListener("resize", queueRebuild);
  document.fonts.ready.then(queueRebuild);
  queueRebuild();
})();
