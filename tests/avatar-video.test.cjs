const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const code = fs.readFileSync(path.join(__dirname, '../assets/js/avatar-video.js'), 'utf8');

function setup({ reduced = false, loaded = true, rejectPlay = false, canvasSupported = true, revealSupported = true, sampleError = false, seed = 1 } = {}) {
  let now = 0;
  let nextFrame = 0;
  const frames = new Map();
  const listeners = {};
  const photoEvents = {};
  const sourceEvents = {};
  const pageEvents = {};
  const mediaEvents = {};
  const classes = new Set();
  const avatarClasses = new Set();
  const observers = [];
  const draws = [];
  const revealDraws = [];
  const offscreens = [];
  let avatarWidth = 400;
  const properties = {};
  const avatar = {
    dataset: { avatarStage: 'assemble' },
    classList: { add: c => avatarClasses.add(c), remove: c => avatarClasses.delete(c) },
    getBoundingClientRect: () => ({ width: avatarWidth, height: avatarWidth * 4 / 3 }),
    style: { setProperty: (name, value) => { properties[name] = String(value); } },
  };
  const context = {
    globalAlpha: 1,
    clearRect() { draws.length = 0; },
    fillRect(x, y, w, h) { draws.push({ x, y, w, h, alpha: this.globalAlpha, color: this.fillStyle }); },
    drawImage() { draws.push({ cached: true }); },
    setTransform() {},
  };
  const canvas = { getContext: () => canvasSupported ? context : null };
  const revealContext = {
    clearRect() { revealDraws.length = 0; },
    drawImage(source, ...args) {
      revealDraws.push({ source, args, composite: this.globalCompositeOperation, smoothing: this.imageSmoothingEnabled });
    },
  };
  const revealCanvas = { dataset: {}, getContext: () => canvasSupported && revealSupported ? revealContext : null };
  const poster = { complete: true, naturalWidth: 1162, naturalHeight: 1550 };
  const sample = {
    clearRect() {}, fillRect() {}, drawImage() {}, setTransform() {},
    getImageData(x, y, width, height) {
      if (sampleError) throw new Error('Image sampling unavailable');
      const data = new Uint8ClampedArray(width * height * 4);
      for (const [px, py] of [[31, 31], [151, 101], [301, 301]]) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            data.set([180, 100, 70, 255], ((py + dy) * width + px + dx) * 4);
          }
        }
      }
      return { data };
    },
  };
  const media = { matches: reduced, addEventListener: (name, fn) => { mediaEvents[name] = fn; } };
  const photo = {
    complete: loaded, naturalWidth: loaded ? 900 : 0, naturalHeight: 1200,
    addEventListener: (name, fn) => { photoEvents[name] = fn; },
  };
  const video = {
    paused: true, plays: 0, readyState: 2,
    classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
    closest: () => avatar,
    querySelector: () => ({ addEventListener: (name, fn) => { sourceEvents[name] = fn; } }),
    addEventListener: (name, fn) => { listeners[name] = fn; },
    play() {
      this.plays++;
      if (rejectPlay) return Promise.reject(new Error('Playback blocked'));
      this.paused = false;
      listeners.playing();
      return Promise.resolve();
    },
    pause() { this.paused = true; listeners.pause?.(); },
  };
  avatar.querySelector = selector => ({
    '[data-avatar-original]': photo,
    '[data-avatar-particles]': canvas,
    '[data-avatar-reveal]': revealCanvas,
    '.avatar-ascii-poster': poster,
  })[selector];
  const document = {
    hidden: false, querySelector: () => video,
    createElement: () => {
      const offscreen = { fills: [] };
      const offscreenContext = {
        ...sample,
        fillRect(x, y, width, height) { offscreen.fills.push({ x, y, width, height }); },
      };
      offscreen.getContext = () => offscreenContext;
      offscreens.push(offscreen);
      return offscreen;
    },
    addEventListener: (name, fn) => { pageEvents[name] = fn; },
  };
  const randomMath = Object.create(Math);
  randomMath.random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  vm.runInNewContext(code, {
    Math: randomMath,
    document, matchMedia: () => media, window: { devicePixelRatio: 2 },
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe() {}
      disconnect() { this.disconnected = true; }
    },
    requestAnimationFrame(fn) { const id = ++nextFrame; frames.set(id, fn); return id; },
    cancelAnimationFrame: id => frames.delete(id),
  });
  function tick(delta) {
    now += delta;
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach(fn => fn(now));
  }
  function advance(duration) {
    for (let remaining = duration; remaining > 0;) {
      const delta = Math.min(remaining, 20);
      tick(delta);
      remaining -= delta;
    }
  }
  tick(0);
  return {
    avatar, photo, poster, video, properties, classes, avatarClasses, canvas, revealCanvas, draws, revealDraws, offscreens, observers, frames, listeners, photoEvents, sourceEvents, tick, advance,
    resize(width) { avatarWidth = width; observers.filter(o => !o.disconnected).forEach(o => o.callback()); },
    hide(value) { document.hidden = value; pageEvents.visibilitychange(); tick(0); },
    reduce(value) { media.matches = value; mediaEvents.change(); tick(0); },
  };
}

test('assembles particles, holds 1.5 seconds, disperses, pauses 500 ms, then reveals video', () => {
  const h = setup();
  assert.equal(h.avatar.dataset.avatarStage, 'assemble');
  h.advance(1999);
  assert.equal(h.avatar.dataset.avatarStage, 'assemble');
  h.advance(1);
  assert.equal(h.avatar.dataset.avatarStage, 'photo');
  h.advance(1499);
  assert.equal(h.avatar.dataset.avatarStage, 'photo');
  assert.equal(h.video.plays, 0);
  h.advance(1);
  assert.equal(h.avatar.dataset.avatarStage, 'disperse');
  h.advance(1099);
  assert.equal(h.video.plays, 0);
  h.advance(1);
  assert.equal(h.avatar.dataset.avatarStage, 'pause');
  h.advance(499);
  assert.equal(h.avatar.dataset.avatarStage, 'pause');
  assert.equal(h.video.plays, 0);
  h.advance(1);
  assert.equal(h.avatar.dataset.avatarStage, 'reveal');
  assert.equal(h.video.plays, 1);
  assert(!h.avatarClasses.has('has-photo-particles'));
  assert(h.observers[0].disconnected);
  assert(h.avatarClasses.has('has-character-reveal'));
  assert(h.video.muted);
  const mask = h.offscreens.at(-1);
  const totalCells = mask.width * mask.height;
  assert.equal(mask.fills.length, 0);
  h.tick(0);
  h.advance(1400);
  assert.equal(mask.fills.length, Math.floor(totalCells / 4));
  assert.equal(h.revealDraws[0].source, h.video);
  assert.equal(h.revealDraws[1].source, mask);
  assert.equal(h.revealDraws[1].composite, 'destination-in');
  assert.equal(h.revealDraws[1].smoothing, false);
  h.advance(1400);
  assert.equal(mask.fills.length, totalCells);
  assert(!h.avatarClasses.has('has-character-reveal'));
  assert(h.observers.every(o => o.disconnected));
  assert.equal(h.avatar.dataset.avatarStage, 'video');
  assert.equal(h.frames.size, 0);
  h.listeners.playing();
  assert.equal(h.avatar.dataset.avatarStage, 'video');
  assert.equal(h.frames.size, 0);
});

test('particles keep photo colors, yield to the original image, then drift right', () => {
  const h = setup();
  assert.equal(h.draws.length, 0);
  h.advance(1000);
  assert(h.draws.length > 0);
  assert(h.draws.every(d => d.color === 'rgb(180,100,70)' && d.w > 0 && d.w < 2.8));
  h.advance(1000);
  assert.equal(h.draws.length, 0);
  assert.equal(h.properties['--avatar-photo-clarity'], '1.000');
  h.advance(1500);
  const start = h.draws.map(d => d.x);
  h.advance(550);
  assert(h.draws[0].x > start[0]);
  assert(h.draws.some(d => d.alpha < 1));
  h.advance(550);
  assert.equal(h.avatar.dataset.avatarStage, 'pause');
  assert.equal(h.draws.length, 0);
});

test('the clear original blends in before the 1.5-second hold and out before dispersion', () => {
  const h = setup();
  h.advance(1600);
  assert.equal(h.properties['--avatar-photo-clarity'], '0.000');
  h.advance(200);
  assert.equal(h.properties['--avatar-photo-clarity'], '0.500');
  h.advance(200);
  assert.equal(h.avatar.dataset.avatarStage, 'photo');
  assert.equal(h.properties['--avatar-photo-clarity'], '1.000');
  h.advance(1499);
  assert.equal(h.avatar.dataset.avatarStage, 'photo');
  h.advance(1);
  assert.equal(h.avatar.dataset.avatarStage, 'disperse');
  assert.equal(h.properties['--avatar-photo-clarity'], '1.000');
  h.advance(100);
  assert.equal(h.properties['--avatar-photo-clarity'], '0.500');
  h.advance(100);
  assert.equal(h.properties['--avatar-photo-clarity'], '0.000');
});

test('waits for the original photo to load before assembling particles', () => {
  const h = setup({ loaded: false });
  h.advance(5000);
  assert.equal(h.frames.size, 0);
  assert.equal(h.video.plays, 0);
  h.photo.naturalWidth = 900;
  h.photoEvents.load();
  h.tick(0);
  h.advance(1999);
  assert.equal(h.avatar.dataset.avatarStage, 'assemble');
  h.advance(1);
  assert.equal(h.avatar.dataset.avatarStage, 'photo');
});

test('background tabs pause the intro clock and resume without restarting it', () => {
  const h = setup();
  for (const [stage, duration] of [['assemble', 2000], ['photo', 1500], ['disperse', 1100], ['pause', 500], ['reveal', 2800]]) {
    h.tick(0);
    h.advance(200);
    h.hide(true);
    h.advance(10000);
    assert.equal(h.avatar.dataset.avatarStage, stage);
    assert.equal(h.frames.size, 0);
    h.hide(false);
    h.advance(duration - 200);
  }
  assert.equal(h.avatar.dataset.avatarStage, 'video');
});

test('video visibility changes never repeat particles or the reveal', () => {
  const h = setup();
  h.advance(8500);
  h.hide(true);
  assert.equal(h.avatar.dataset.avatarStage, 'still');
  h.hide(false);
  assert.equal(h.avatar.dataset.avatarStage, 'video');
  assert(!h.avatarClasses.has('has-character-reveal'));
  assert.equal(h.frames.size, 0);
});

test('reduced motion skips particles, the reveal, and video playback', () => {
  const h = setup({ reduced: true });
  assert.equal(h.avatar.dataset.avatarStage, 'still');
  assert.equal(h.video.plays, 0);
  assert.equal(h.frames.size, 0);
  assert.equal(h.observers.length, 0);
  h.reduce(false);
  assert.equal(h.avatar.dataset.avatarStage, 'video');
  h.reduce(true);
  assert(h.video.paused);
  assert.equal(h.avatar.dataset.avatarStage, 'still');
  const duringIntro = setup();
  duringIntro.advance(1700);
  duringIntro.reduce(true);
  assert(duringIntro.observers.every(o => o.disconnected));
  assert.equal(duringIntro.avatar.dataset.avatarStage, 'still');
  assert.equal(duringIntro.frames.size, 0);
  duringIntro.reduce(false);
  assert.equal(duringIntro.avatar.dataset.avatarStage, 'video');
});

test('source errors and blocked autoplay fall back to the ASCII still', async () => {
  const failed = setup();
  failed.sourceEvents.error();
  failed.advance(8500);
  assert.equal(failed.avatar.dataset.avatarStage, 'still');
  assert.equal(failed.video.plays, 0);
  const blocked = setup({ rejectPlay: true });
  blocked.advance(8500);
  await Promise.resolve();
  assert.equal(blocked.avatar.dataset.avatarStage, 'still');
  assert(!blocked.classes.has('is-playing'));
});

test('ASCII cells appear randomly across all rows and cover the full video exactly once', () => {
  const h = setup();
  h.advance(5100);
  const mask = h.offscreens.at(-1);
  assert.equal(mask.width, 113);
  assert.equal(mask.height, 108);
  h.tick(0);
  h.advance(1400);
  const quarter = mask.fills.length;
  assert.equal(quarter, Math.floor(mask.width * mask.height / 4));
  assert(mask.fills.some(cell => cell.y < 10));
  assert(mask.fills.some(cell => cell.y > mask.height - 10));
  assert(mask.fills.some((cell, index) => index > 0 && cell.y < mask.fills[index - 1].y));
  h.resize(300);
  assert.equal(h.revealCanvas.width, 600);
  assert.equal(mask.fills.length, quarter);
  h.hide(true);
  h.advance(10000);
  assert.equal(mask.fills.length, quarter);
  h.hide(false);
  h.advance(1400);
  assert.equal(new Set(mask.fills.map(cell => `${cell.x}:${cell.y}`)).size, mask.width * mask.height);
  assert.equal(h.avatar.dataset.avatarStage, 'video');
});

test('random reveal uses the poster if playback is blocked, and fades if canvas is unavailable', () => {
  const blocked = setup({ rejectPlay: true });
  blocked.advance(5100);
  blocked.tick(0);
  blocked.advance(1400);
  assert.equal(blocked.revealDraws[0].source, blocked.poster);
  const fallback = setup({ revealSupported: false });
  fallback.advance(5100);
  fallback.tick(0);
  fallback.advance(1400);
  assert.equal(fallback.properties['--avatar-reveal-opacity'], '0.250');
  fallback.advance(1400);
  assert.equal(fallback.avatar.dataset.avatarStage, 'video');
});

test('reduced motion during the random reveal releases its canvas and observers', () => {
  const h = setup();
  h.advance(5400);
  assert(h.avatarClasses.has('has-character-reveal'));
  h.reduce(true);
  assert(!h.avatarClasses.has('has-character-reveal'));
  assert(h.observers.every(o => o.disconnected));
  assert.equal(h.avatar.dataset.avatarStage, 'still');
  assert.equal(h.frames.size, 0);
});

test('character reveal accelerates continuously over 2.8 seconds', () => {
  const h = setup();
  h.advance(5100);
  h.tick(0);
  const mask = h.offscreens.at(-1);
  const totalCells = mask.width * mask.height;
  let previous = 0;
  const increments = [];
  for (let step = 1; step <= 4; step++) {
    h.advance(700);
    const expected = Math.floor(totalCells * (step / 4) ** 2);
    assert.equal(mask.fills.length, expected);
    increments.push(expected - previous);
    previous = expected;
  }
  assert(increments.every((count, index) => index === 0 || count > increments[index - 1]));
  assert.equal(h.avatar.dataset.avatarStage, 'video');
});

test('particles adapt to screen size without restarting their stage', () => {
  const h = setup();
  assert.equal(h.canvas.width, 800);
  h.advance(1000);
  const before = h.draws.map(d => ({ ...d }));
  h.resize(300);
  assert.equal(h.canvas.width, 600);
  assert.deepEqual(h.draws, before);
  h.advance(1000);
  assert.equal(h.avatar.dataset.avatarStage, 'photo');
});

test('wind paths and arrival times vary between visits without moving on resize', () => {
  const first = setup({ seed: 1 });
  const second = setup({ seed: 99 });
  first.advance(900);
  second.advance(900);
  assert(first.draws.length > 0 && second.draws.length > 0);
  assert.notDeepEqual(first.draws, second.draws);
  assert(first.draws.every(d => Number.isFinite(d.x) && Number.isFinite(d.y)));
  assert(new Set(first.draws.map(d => d.w)).size > 1);
});

test('unsupported canvas and unreadable images retain a plain-photo fallback', () => {
  for (const options of [{ canvasSupported: false }, { sampleError: true }]) {
    const h = setup(options);
    assert.equal(h.avatar.dataset.avatarStage, 'photo');
    assert(!h.avatarClasses.has('has-photo-particles'));
    h.advance(1500);
    assert.equal(h.avatar.dataset.avatarStage, 'disperse');
    h.advance(4500);
    assert.equal(h.avatar.dataset.avatarStage, 'video');
  }
});

test('photo errors skip directly to the reveal; unrelated pages remain unchanged', () => {
  const brokenPhoto = setup({ loaded: false });
  brokenPhoto.photoEvents.error();
  assert.equal(brokenPhoto.avatar.dataset.avatarStage, 'reveal');
  brokenPhoto.tick(0);
  brokenPhoto.advance(2800);
  assert.equal(brokenPhoto.avatar.dataset.avatarStage, 'video');
  vm.runInNewContext(code, { document: { querySelector: () => null } });
});
