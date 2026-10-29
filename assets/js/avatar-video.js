(() => {
  const video = document.querySelector("[data-avatar-video]");
  if (!video) return;

  const avatar = video.closest(".avatar-ascii");
  const photo = avatar.querySelector("[data-avatar-original]");
  const poster = avatar.querySelector(".avatar-ascii-poster");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const darkDuration = 3000;
  const illuminateDuration = 1200;
  const photoDuration = 750;
  const flickerDuration = 1100;
  const pauseDuration = 500;
  const repairDuration = 1200;
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

  function setTorchPower(value) {
    if (avatar.dataset.torchPower === String(value)) return;
    avatar.dataset.torchPower = String(value);
    avatar.style.setProperty("--avatar-power", String(value));
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
      const cells = Array.from({ length: columns * rows }, (_, index) => ({
        index,
        arrival: Math.floor(index / columns) / (rows - 1) * 0.9 + Math.random() * 0.1,
      })).sort((a, b) => a.arrival - b.arrival);
      let visibleCells = 0;
      let lastProgress = 0;
      maskContext.fillStyle = "#fff";
      function draw(progress) {
        lastProgress = progress;
        while (visibleCells < cells.length && cells[visibleCells].arrival <= progress) {
          const cell = cells[visibleCells++].index;
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
    setTorchPower(1);
    avatar.dataset.asciiLightProgress = "0";
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
      setTorchPower(1);
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
      }
    }
    if (stage === "photo" && elapsed >= photoDuration) {
      elapsed = 0;
      setStage("flicker");
    }
    if (stage === "flicker") {
      const power = elapsed < 140 ? 1 : elapsed < 260 ? 0 : elapsed < 420 ? 1 :
        elapsed < 540 ? 0 : elapsed < 760 ? 1 : 0;
      setTorchPower(power);
      if (elapsed >= flickerDuration) {
        elapsed = 0;
        setStage("pause");
      }
    }
    if (stage === "pause" && elapsed >= pauseDuration) {
      elapsed = 0;
      setStage("repair");
    }
    if (stage === "repair" && elapsed >= repairDuration) {
      beginReveal();
      return;
    }
    if (stage === "reveal") {
      const progress = Math.min(elapsed / revealDuration, 1) ** 2;
      avatar.dataset.asciiLightProgress = Math.min(1, progress / 0.9).toFixed(4);
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
  setTorchPower(0);
  if (photo.complete && photo.naturalWidth) startIntro();
  else syncPlayback();
})();
