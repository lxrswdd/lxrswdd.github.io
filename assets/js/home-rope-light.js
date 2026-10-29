(() => {
  const canvas = document.querySelector("[data-home-rope-light]");
  const avatar = document.querySelector(".avatar-ascii");
  const photo = avatar?.querySelector("[data-avatar-original]");
  if (!canvas || !avatar || !photo) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const darkPreference = matchMedia("(prefers-color-scheme: dark)");
  const descentDuration = 1850;
  const ropeDeployDuration = 850;
  const descentDelay = ropeDeployDuration + 150;
  let mode = "waiting";
  let elapsed = 0;
  let previousTime = null;
  let frame = null;
  let lastStage = null;
  let width = 0;
  let height = 0;
  let box;

  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
  const enabled = () => !document.hidden && !reducedMotion.matches &&
    (document.body.classList.contains("colorscheme-dark") ||
      (document.body.classList.contains("colorscheme-auto") && darkPreference.matches));

  function setMode(next) {
    mode = next;
    canvas.dataset.ropeState = next;
    elapsed = 0;
    previousTime = null;
  }

  function stop() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    previousTime = null;
  }

  function clear() {
    ctx.clearRect(0, 0, width, height);
  }

  function finish() {
    stop();
    setMode("done");
    clear();
    canvas.width = canvas.height = 1;
  }

  function sketch(points, color = "#deddd5", thickness = 1.7) {
    ctx.strokeStyle = color;
    ctx.lineWidth = thickness;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.stroke();
  }

  function drawLight(beamX, outletY, intensity, scale) {
    if (intensity <= 0) return;
    const sweeping = mode === "relighting";
    const front = sweeping ? clamp(Number(avatar.dataset.asciiLightProgress) || 0) : 0.435;
    canvas.dataset.lightFront = front.toFixed(4);
    const end = box.top + box.height * Math.min(0.435, front);
    const cone = ctx.createLinearGradient(beamX, outletY, beamX, end);
    cone.addColorStop(0, `rgba(255, 221, 154, ${0.22 * intensity})`);
    cone.addColorStop(0.3, `rgba(247, 195, 103, ${0.08 * intensity})`);
    cone.addColorStop(1, "rgba(247, 195, 103, 0)");
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(beamX - 2 * scale, outletY);
    ctx.lineTo(beamX - 13 * scale, end);
    ctx.lineTo(beamX + 13 * scale, end);
    ctx.lineTo(beamX + 2 * scale, outletY);
    ctx.closePath();
    ctx.fill();

    // Align the narrow core with the photographed shaft, not the center of the container.
    const core = ctx.createLinearGradient(beamX, box.top, beamX, end);
    core.addColorStop(0, "rgba(255, 215, 135, 0)");
    core.addColorStop(0.15, `rgba(255, 222, 157, ${0.58 * intensity})`);
    core.addColorStop(0.75, `rgba(255, 200, 105, ${0.3 * intensity})`);
    core.addColorStop(1, "rgba(255, 200, 105, 0)");
    sketch([[beamX, box.top], [beamX, end]], core, 2.2 * scale);
    if (sweeping) {
      const frontY = box.top + box.height * front;
      const alpha = Math.sin(Math.PI * front) * intensity;
      const leading = ctx.createLinearGradient(beamX, end, beamX, frontY);
      leading.addColorStop(0, "rgba(255, 218, 148, 0)");
      leading.addColorStop(1, `rgba(255, 218, 148, ${alpha * 0.5})`);
      if (front > 0.435) sketch([[beamX, end], [beamX, frontY]], leading, 2 * scale);
      sketch([[beamX - 5 * scale, frontY], [beamX + 5 * scale, frontY]],
        `rgba(255, 228, 174, ${alpha * 0.6})`, 1.4 * scale);
    }
  }

  function glyph(character, x, y, color = "#deddd5", size = 11) {
    ctx.font = `600 ${size}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.fillText(character, x, y);
  }

  function draw() {
    clear();
    if (!box || mode === "waiting" || mode === "done") return;
    const scale = Math.max(0.75, Math.min(box.width / 400, 1));
    const arrival = mode === "descending" ? 1 - (1 - clamp((elapsed - descentDelay) / descentDuration)) ** 2 : 1;
    const position = arrival;
    const beamX = box.left + box.width * (465 / 900);
    const direction = box.width < 350 ? -1 : 1;
    const ropeX = beamX - direction * 47 * scale;
    const finalHead = box.top - 51 * scale;
    const headY = -64 * scale + (finalHead + 64 * scale) * position;
    const sway = Math.sin(elapsed / 190) * 2 * (1 - position);
    const intensity = mode === "lighting" || mode === "relighting" ? smooth(elapsed / 180) :
      mode === "holding" ? 1 : mode === "flickering" ? Number(avatar.dataset.torchPower ?? 1) : 0;
    canvas.dataset.beamX = beamX.toFixed(2);
    canvas.dataset.lightLevel = intensity.toFixed(3);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = 1;

    const deployed = mode === "descending" ? smooth(elapsed / ropeDeployDuration) : 1;
    const ropeEnd = -7 * scale + (box.top + 25 * scale) * deployed;
    canvas.dataset.ropeEnd = ropeEnd.toFixed(2);
    for (let y = 2; y < ropeEnd; y += 7 * scale) glyph(":", ropeX, y, "#8e8877", 9 * scale);
    drawLight(beamX, headY + 43 * scale, intensity, scale);

    ctx.save();
    ctx.translate(ropeX + sway, headY);
    ctx.scale(direction * scale, scale);
    // Every part of the figure is a monospace ASCII glyph, including the rope and torch.
    glyph(mode === "broken" || mode === "repairing" ? "o" : "O", 15, 0, "#e8e5db", 13);
    for (const [character, x, y] of [
      ["|", 15, 10], ["|", 14, 19], ["+", 11, 27],
      ["\\", 22, 16], ["-", 29, 22], ["-", 37, 27], ["+", 44, 29],
      ["/", 4, 34], ["_", 3, 42], ["\\", 20, 34], ["/", 18, 43],
    ]) glyph(character, x, y);
    const tap = mode === "repairing" ? Math.max(0, 1 - Math.abs(elapsed - 340) / 180,
      1 - Math.abs(elapsed - 760) / 180) : 0;
    canvas.dataset.tapCount = mode === "repairing" ? String(Number(elapsed >= 340) + Number(elapsed >= 760)) : "0";
    if (mode === "repairing") {
      glyph("\\", 20, 14);
      glyph("-", 25 + 8 * tap, 18 + 6 * tap);
      glyph("+", 24 + 20 * tap, 16 + 13 * tap);
      if (tap > 0.85) glyph("*", 53, 29, "#e8d298", 9);
    } else {
      for (const [character, x, y] of [["-", 8, 12], ["/", 3, 8], ["+", 0, 5]]) glyph(character, x, y);
    }
    const torchX = 47;
    glyph("[]", torchX, 34, "#c8b78b", 9);
    glyph("=", torchX, 42, intensity > 0 ? "#ffe6ac" : "#8b816b", 10);
    if ((mode === "lighting" || mode === "relighting") && elapsed < 160) {
      glyph("*", torchX + 10, 26, "#e8d298", 9);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function animate(now) {
    frame = null;
    if (!enabled() || mode === "waiting" || mode === "done") return;
    elapsed += previousTime === null ? 0 : Math.min(now - previousTime, 100);
    previousTime = now;
    box = avatar.getBoundingClientRect();
    draw();
    frame = requestAnimationFrame(animate);
  }

  function sync() {
    if (reducedMotion.matches) {
      finish();
      return;
    }
    if (!enabled()) {
      stop();
      clear();
      return;
    }
    if (mode === "holding") {
      stop();
      draw();
      return;
    }
    if (mode !== "waiting" && mode !== "done" && frame === null) frame = requestAnimationFrame(animate);
  }

  function syncStage() {
    const stage = avatar.dataset.avatarStage;
    if (mode === "done") return;
    if (stage === lastStage) {
      if ((mode === "flickering" || mode === "relighting") && enabled()) draw();
      return;
    }
    const late = lastStage === null;
    lastStage = stage;
    if (stage === "illuminate" || stage === "photo") {
      if (mode !== "lighting") setMode("lighting");
    }
    else if (stage === "flicker") setMode("flickering");
    else if (stage === "pause") setMode("broken");
    else if (stage === "repair") setMode("repairing");
    else if (stage === "reveal") setMode("relighting");
    else if (stage === "video" || stage === "still") {
      if (late) finish();
      else setMode("holding");
    }
    sync();
  }

  function start() {
    if (mode !== "waiting") return;
    setMode("descending");
    syncStage();
    sync();
  }

  function resize() {
    if (mode === "done") return;
    const bounds = canvas.getBoundingClientRect();
    width = bounds.width;
    height = bounds.height;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.ceil(width * ratio);
    canvas.height = Math.ceil(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    box = avatar.getBoundingClientRect();
    if (enabled()) draw();
  }

  new MutationObserver(syncStage).observe(avatar, {
    attributes: true, attributeFilter: ["data-avatar-stage", "data-torch-power", "data-ascii-light-progress"],
  });
  new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  new ResizeObserver(resize).observe(avatar);
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", sync);
  reducedMotion.addEventListener("change", sync);
  darkPreference.addEventListener("change", sync);
  photo.addEventListener("load", start, { once: true });
  photo.addEventListener("error", finish, { once: true });
  resize();
  if (photo.complete && photo.naturalWidth) start();
  else sync();
})();
