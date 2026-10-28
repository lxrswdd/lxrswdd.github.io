(() => {
  const video = document.querySelector("[data-avatar-video]");
  if (!video) return;

  const avatar = video.closest(".avatar-ascii");
  const photo = avatar.querySelector("[data-avatar-original]");
  const poster = avatar.querySelector(".avatar-ascii-poster");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const darkDuration = 3000;
  const illuminateDuration = 1200;
  const photoDuration = 1500;
  const disperseDuration = 1100;
  const pauseDuration = 500;
  const revealDuration = 2800;
  let stage = "photo";
  let elapsed = 0;
  let previousTime = null;
  let frame = null;
  let photoLoaded = false;
  let introComplete = false;
  let revealComplete = false;
  let failed = false;
  let playRequest = 0;
  let portrait = null;
  let characterReveal = null;

  const canAnimate = () => !document.hidden && !reducedMotion.matches;
  const canPlay = () => !failed && canAnimate();

  function setStage(next) {
    stage = next;
    avatar.dataset.avatarStage = next;
  }

  function stopIntro() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    previousTime = null;
  }

  function showStill() {
    video.classList.remove("is-playing");
    if (revealComplete) setStage("still");
  }

  function playVideo() {
    if (!canPlay()) return;
    const request = ++playRequest;
    video.play().catch(() => {
      if (request === playRequest) showStill();
    });
  }

  function createPortraitParticles() {
    const canvas = avatar.querySelector("[data-avatar-particles]");
    if (!canvas) return null;
    try {
      const context = canvas.getContext("2d");
      const sampleCanvas = document.createElement("canvas");
      const sample = sampleCanvas.getContext("2d", { willReadFrequently: true });
      if (!context || !sample) return null;
      const width = 400;
      const height = Math.round(width * photo.naturalHeight / photo.naturalWidth);
      sampleCanvas.width = width;
      sampleCanvas.height = height;
      sample.drawImage(photo, 0, 0, width, height);
      const pixels = sample.getImageData(0, 0, width, height).data;
      const particles = [];
      // Sample once; the clear-photo hold uses the original image instead of this canvas.
      for (let row = 1; row < height; row += 3) {
        for (let column = 1; column < width; column += 3) {
          const x = column + (Math.random() - 0.5) * 1.3;
          const y = row + (Math.random() - 0.5) * 1.3;
          const i = (Math.floor(y) * width + Math.floor(x)) * 4;
          const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
          if (pixels[i + 3] === 0 || Math.max(r, g, b) < 15) continue;
          const color = `rgb(${r},${g},${b})`;
          const size = 2.35 + Math.random() * 0.4;
          particles.push({
            x, y, color, size,
            seed: Math.random(),
            phase: Math.random() * Math.PI * 2,
            delay: Math.random() * 0.44,
            travel: 0.4 + Math.random() * 0.16,
            sway: 18 + Math.random() * 45,
            turns: 0.6 + Math.random() * 1.2,
          });
        }
      }
      let lastStage = "dark";
      let lastProgress = 0;
      const clamp = value => Math.max(0, Math.min(1, value));
      function draw(nextStage, progress) {
        lastStage = nextStage;
        lastProgress = progress;
        context.clearRect(0, 0, width, height);
        if (nextStage !== "disperse") return;
        for (const particle of particles) {
          const { x, y, seed, phase, color, size, delay, travel, sway, turns } = particle;
          const departure = clamp((progress - x / width * 0.08 - delay) / (travel * 0.85));
          const drift = departure ** 1.6;
          const dx = (width + seed * 160) * drift;
          const dy = -(35 + seed * 100) * drift + Math.sin(departure * Math.PI * 2 * turns + phase) * sway * departure;
          const alpha = (1 - departure) ** 1.4;
          const dotSize = size * (1 - departure * 0.62);
          if (alpha < 0.005) continue;
          context.globalAlpha = alpha;
          context.fillStyle = color;
          context.fillRect(x + dx - dotSize / 2, y + dy - dotSize / 2, dotSize, dotSize);
        }
        context.globalAlpha = 1;
      }
      function resize() {
        const scale = Math.min(window.devicePixelRatio || 1, 2) * avatar.getBoundingClientRect().width / width;
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
        draw(lastStage, lastProgress);
      }
      const observer = new ResizeObserver(resize);
      observer.observe(avatar);
      resize();
      avatar.classList.add("has-photo-particles");
      return {
        draw,
        dispose() {
          observer.disconnect();
          canvas.width = canvas.height = 1;
          particles.length = 0;
          avatar.classList.remove("has-photo-particles");
        },
      };
    } catch {
      // Keep the normal photo intro if canvas or image sampling is unavailable.
      return null;
    }
  }

  function releasePortrait() {
    portrait?.dispose();
    portrait = null;
  }

  function setPhotoClarity(value) {
    const progress = Math.max(0, Math.min(1, value));
    const smooth = progress * progress * (3 - 2 * progress);
    avatar.style.setProperty("--avatar-photo-clarity", smooth.toFixed(3));
  }

  function createCharacterReveal() {
    const canvas = avatar.querySelector("[data-avatar-reveal]");
    if (!canvas) return null;
    try {
      const context = canvas.getContext("2d");
      const mask = document.createElement("canvas");
      const maskContext = mask.getContext("2d");
      if (!context || !maskContext) return null;
      // Match the export's logical glyph grid before its high-DPI video scaling.
      const gridWidth = Number(canvas.dataset.gridWidth) || 900;
      const gridHeight = Number(canvas.dataset.gridHeight) || 1200;
      const cellWidth = Number(canvas.dataset.gridSize) || 8;
      const cellHeight = cellWidth * 1.4;
      const columns = Math.ceil(gridWidth / cellWidth);
      const rows = Math.ceil(gridHeight / cellHeight);
      mask.width = columns;
      mask.height = rows;
      const cells = Array.from({ length: columns * rows }, (_, index) => index);
      for (let i = cells.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cells[i], cells[j]] = [cells[j], cells[i]];
      }
      let visibleCells = 0;
      let lastProgress = 0;
      maskContext.fillStyle = "#fff";
      function draw(progress) {
        lastProgress = progress;
        const count = Math.floor(cells.length * progress);
        while (visibleCells < count) {
          const cell = cells[visibleCells++];
          maskContext.fillRect(cell % columns, Math.floor(cell / columns), 1, 1);
        }
        context.clearRect(0, 0, canvas.width, canvas.height);
        const source = video.classList.contains("is-playing") && video.readyState >= 2 ? video : poster;
        if (source === poster && (!poster.complete || !poster.naturalWidth)) return;
        context.drawImage(source, 0, 0, canvas.width, canvas.height);
        context.globalCompositeOperation = "destination-in";
        context.imageSmoothingEnabled = false;
        context.drawImage(mask, 0, 0,
          columns * cellWidth / gridWidth * canvas.width,
          rows * cellHeight / gridHeight * canvas.height);
        context.globalCompositeOperation = "source-over";
        context.imageSmoothingEnabled = true;
      }
      function resize() {
        const box = avatar.getBoundingClientRect();
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.max(1, Math.round(box.width * ratio));
        canvas.height = Math.max(1, Math.round(box.height * ratio));
        draw(lastProgress);
      }
      const observer = new ResizeObserver(resize);
      observer.observe(avatar);
      resize();
      avatar.classList.add("has-character-reveal");
      return {
        draw,
        dispose() {
          observer.disconnect();
          canvas.width = canvas.height = 1;
          cells.length = 0;
          avatar.classList.remove("has-character-reveal");
        },
      };
    } catch {
      return null;
    }
  }

  function releaseCharacterReveal() {
    characterReveal?.dispose();
    characterReveal = null;
  }

  function beginReveal() {
    releasePortrait();
    introComplete = true;
    stopIntro();
    elapsed = 0;
    characterReveal = createCharacterReveal();
    avatar.style.setProperty("--avatar-reveal-opacity", "0");
    setStage("reveal");
    syncPlayback();
  }

  function finishReveal() {
    revealComplete = true;
    stopIntro();
    setStage(video.classList.contains("is-playing") ? "video" : "still");
    releaseCharacterReveal();
  }

  function animate(now) {
    frame = null;
    if (!canAnimate()) return;
    elapsed += previousTime === null ? 0 : Math.min(now - previousTime, 100);
    previousTime = now;
    if (stage === "dark" && elapsed >= darkDuration) {
      elapsed = 0;
      setStage("illuminate");
    }
    if (stage === "illuminate") {
      const progress = Math.min(elapsed / illuminateDuration, 1);
      const spread = progress * progress * (3 - 2 * progress);
      setPhotoClarity(progress * 2);
      avatar.style.setProperty("--avatar-light-width", `${(0.1 + 199.9 * spread).toFixed(2)}%`);
      avatar.style.setProperty("--avatar-light-height", `${(0.1 + 199.9 * spread).toFixed(2)}%`);
      if (elapsed >= illuminateDuration) {
        elapsed = 0;
        setStage("photo");
        portrait?.draw("photo", 1);
      }
    }
    if (stage === "photo" && elapsed >= photoDuration) {
      elapsed = 0;
      setStage("disperse");
    }
    if (stage === "disperse") {
      setPhotoClarity(1 - elapsed / 200);
      portrait?.draw("disperse", Math.min(elapsed / disperseDuration, 1));
      if (elapsed >= disperseDuration) {
        elapsed = 0;
        setStage("pause");
      }
    }
    if (stage === "pause" && elapsed >= pauseDuration) {
      beginReveal();
      return;
    }
    if (stage === "reveal") {
      const progress = Math.min(elapsed / revealDuration, 1) ** 2;
      if (characterReveal) characterReveal.draw(progress);
      else avatar.style.setProperty("--avatar-reveal-opacity", progress.toFixed(3));
      if (progress === 1) {
        finishReveal();
        return;
      }
    }
    frame = requestAnimationFrame(animate);
  }

  function syncPlayback() {
    video.autoplay = introComplete && canPlay();
    if (!canAnimate()) {
      stopIntro();
      playRequest++;
      video.pause();
      if (reducedMotion.matches) {
        releasePortrait();
        releaseCharacterReveal();
        introComplete = true;
        revealComplete = true;
      }
      showStill();
      return;
    }
    if (introComplete) {
      if (canPlay()) playVideo();
      else showStill();
    }
    if (!revealComplete && photoLoaded && frame === null) {
      frame = requestAnimationFrame(animate);
    }
  }

  function onError() {
    failed = true;
    video.pause();
    showStill();
  }

  function startIntro() {
    if (photoLoaded) return;
    photoLoaded = true;
    if (!reducedMotion.matches) portrait = createPortraitParticles();
    setStage("dark");
    syncPlayback();
  }

  video.addEventListener("playing", () => {
    if (!introComplete || !canPlay()) {
      video.pause();
      return;
    }
    video.classList.add("is-playing");
    if (revealComplete) setStage("video");
  });
  video.addEventListener("pause", showStill);
  video.addEventListener("error", onError);
  video.querySelector("source")?.addEventListener("error", onError);
  document.addEventListener("visibilitychange", syncPlayback);
  reducedMotion.addEventListener("change", syncPlayback);
  photo.addEventListener("load", startIntro, { once: true });
  photo.addEventListener("error", () => {
    photoLoaded = true;
    beginReveal();
  }, { once: true });
  video.muted = true;
  video.autoplay = false;
  if (photo.complete && photo.naturalWidth) startIntro();
  else syncPlayback();
})();
