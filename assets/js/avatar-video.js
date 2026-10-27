(() => {
  const video = document.querySelector("[data-avatar-video]");
  if (!video) return;

  const avatar = video.closest(".avatar-ascii");
  const photo = avatar.querySelector("[data-avatar-original]");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const photoDuration = 1500;
  const flickerDuration = 650;
  const revealDuration = 1250;
  const flickerLevels = [1, 0.16, 0.85, 0.08, 0.6, 0];
  const flickerOffsets = [0, -2, 1, 0, -1, 0];
  let stage = "photo";
  let elapsed = 0;
  let previousTime = null;
  let frame = null;
  let photoLoaded = false;
  let introComplete = false;
  let revealComplete = false;
  let failed = false;
  let playRequest = 0;

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

  function updateFlicker() {
    const blink = Math.min(Math.floor(elapsed / 110), flickerLevels.length - 1);
    avatar.style.setProperty("--avatar-flicker-opacity", flickerLevels[blink]);
    avatar.style.setProperty("--avatar-flicker-offset", `${flickerOffsets[blink]}px`);
  }

  function beginReveal() {
    introComplete = true;
    stopIntro();
    elapsed = 0;
    avatar.style.setProperty("--avatar-reveal-bottom", "100%");
    setStage("reveal");
    syncPlayback();
  }

  function finishReveal() {
    revealComplete = true;
    stopIntro();
    setStage(video.classList.contains("is-playing") ? "video" : "still");
  }

  function animate(now) {
    frame = null;
    if (!canAnimate()) return;
    elapsed += previousTime === null ? 0 : Math.min(now - previousTime, 100);
    previousTime = now;
    if (stage === "photo" && elapsed >= photoDuration) {
      elapsed = 0;
      setStage("flicker");
    }
    if (stage === "flicker") {
      if (elapsed >= flickerDuration) {
        beginReveal();
        return;
      }
      updateFlicker();
    }
    if (stage === "reveal") {
      const progress = Math.min(elapsed / revealDuration, 1);
      avatar.style.setProperty("--avatar-reveal-bottom", `${(100 - progress * 100).toFixed(2)}%`);
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
    photoLoaded = true;
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
