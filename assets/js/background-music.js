(() => {
  const player = document.querySelector("[data-background-music]");
  if (!player) return;

  const audio = player.querySelector("audio");
  const toggle = player.querySelector(".music-toggle");
  const icon = toggle.querySelector("i");
  const volume = player.querySelector(".music-volume");
  const volumeIcon = player.querySelector(".music-volume-icon");
  const error = player.querySelector(".music-error");
  const startTime = Number(audio.dataset.startTime);
  const fadeDuration = Number(audio.dataset.fadeDuration);
  let targetVolume = Number(volume.value) / 100;
  let initialSeek = true;
  let fadeFrame = null;
  let pending = false;

  function stopFade() {
    if (fadeFrame !== null) cancelAnimationFrame(fadeFrame);
    fadeFrame = null;
  }

  function updateToggle() {
    const playing = !audio.paused;
    const label = playing ? "Pause background music" : "Play background music";
    toggle.setAttribute("aria-label", label);
    toggle.setAttribute("aria-pressed", String(playing));
    toggle.title = label;
    toggle.disabled = pending;
    icon.className = playing ? "fa-solid fa-pause" : "fa-solid fa-play";
  }

  function seekToStart() {
    if (!initialSeek || audio.readyState < 1) return;
    if (Number.isFinite(audio.duration) && audio.duration <= startTime) {
      audio.pause();
      error.textContent = "This track is too short to start at 1:20.";
      error.hidden = false;
      return;
    }
    audio.currentTime = startTime;
    initialSeek = false;
  }

  function fadeIn() {
    stopFade();
    audio.volume = 0;
    const started = performance.now();
    function step(now) {
      if (audio.paused) {
        fadeFrame = null;
        return;
      }
      const progress = Math.min((now - started) / fadeDuration, 1);
      audio.volume = targetVolume * progress;
      fadeFrame = progress < 1 ? requestAnimationFrame(step) : null;
    }
    fadeFrame = requestAnimationFrame(step);
  }

  async function play() {
    if (pending) return;
    pending = true;
    error.hidden = true;
    updateToggle();
    try {
      seekToStart();
      // Request audible playback so browser autoplay restrictions apply normally.
      audio.volume = targetVolume;
      await audio.play();
    } catch (failure) {
      stopFade();
      if (failure.name !== "NotAllowedError" && failure.name !== "AbortError") {
        error.textContent = "Music could not be loaded. Please try again.";
        error.hidden = false;
      }
    } finally {
      pending = false;
      updateToggle();
    }
  }

  audio.addEventListener("loadedmetadata", seekToStart);
  audio.addEventListener("play", () => {
    audio.volume = 0;
    updateToggle();
  });
  audio.addEventListener("playing", fadeIn);
  audio.addEventListener("pause", () => {
    stopFade();
    updateToggle();
  });
  audio.addEventListener("ended", () => {
    initialSeek = true;
    play();
  });
  audio.addEventListener("error", () => {
    stopFade();
    error.textContent = "Music could not be loaded. Please try again.";
    error.hidden = false;
  });

  toggle.addEventListener("click", () => {
    if (audio.paused) play();
    else audio.pause();
  });
  volume.addEventListener("input", () => {
    targetVolume = Number(volume.value) / 100;
    if (fadeFrame === null) audio.volume = targetVolume;
    volumeIcon.className = targetVolume === 0
      ? "music-volume-icon fa-solid fa-volume-xmark"
      : "music-volume-icon fa-solid fa-volume-low";
  });

  play();
})();
