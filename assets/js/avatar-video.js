(() => {
  const video = document.querySelector("[data-avatar-video]");
  if (!video) return;

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let failed = false;
  const showStill = () => video.classList.remove("is-playing");
  const canPlay = () => !failed && !document.hidden && !reducedMotion.matches;

  function syncPlayback() {
    video.autoplay = canPlay();
    if (!canPlay()) {
      video.pause();
      showStill();
      return;
    }
    video.play().catch(showStill);
  }

  function onError() {
    failed = true;
    syncPlayback();
  }

  video.addEventListener("playing", () => {
    if (canPlay()) video.classList.add("is-playing");
    else syncPlayback();
  });
  video.addEventListener("pause", showStill);
  video.addEventListener("error", onError);
  video.querySelector("source")?.addEventListener("error", onError);
  document.addEventListener("visibilitychange", syncPlayback);
  reducedMotion.addEventListener("change", syncPlayback);
  video.muted = true;
  syncPlayback();
})();
