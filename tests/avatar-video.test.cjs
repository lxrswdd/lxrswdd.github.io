const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const code = fs.readFileSync(path.join(__dirname, '../assets/js/avatar-video.js'), 'utf8');
const revealStart = 7750;

function setup({ reduced = false, loaded = true, rejectPlay = false, canvasSupported = true } = {}) {
  let now = 0, nextFrame = 0, avatarWidth = 400;
  const frames = new Map();
  const events = {}, photoEvents = {}, sourceEvents = {}, pageEvents = {}, mediaEvents = {};
  const classes = new Set(), avatarClasses = new Set();
  const observers = [], draws = [], masks = [];
  const properties = {};
  const avatar = {
    dataset: { avatarStage: 'dark' },
    classList: { add: c => avatarClasses.add(c), remove: c => avatarClasses.delete(c) },
    getBoundingClientRect: () => ({ width: avatarWidth, height: avatarWidth * 4 / 3 }),
    style: { setProperty: (name, value) => { properties[name] = String(value); } },
  };
  const context = {
    clearRect() { draws.length = 0; },
    drawImage(source) { draws.push({ source, composite: this.globalCompositeOperation, smoothing: this.imageSmoothingEnabled }); },
  };
  const canvas = { dataset: {}, getContext: () => canvasSupported ? context : null };
  const poster = { complete: true, naturalWidth: 1162, naturalHeight: 1550 };
  const photo = {
    complete: loaded, naturalWidth: loaded ? 900 : 0, naturalHeight: 1200,
    addEventListener: (name, fn) => { photoEvents[name] = fn; },
  };
  const media = { matches: reduced, addEventListener: (name, fn) => { mediaEvents[name] = fn; } };
  const video = {
    paused: true, plays: 0, readyState: 2,
    classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
    closest: () => avatar,
    querySelector: () => ({ addEventListener: (name, fn) => { sourceEvents[name] = fn; } }),
    addEventListener: (name, fn) => { events[name] = fn; },
    play() {
      this.plays++;
      if (rejectPlay) return Promise.reject(new Error('Playback blocked'));
      this.paused = false;
      events.playing();
      return Promise.resolve();
    },
    pause() { this.paused = true; events.pause?.(); },
  };
  avatar.querySelector = selector => ({
    '[data-avatar-original]': photo, '[data-avatar-reveal]': canvas, '.avatar-ascii-poster': poster,
  })[selector];
  const document = {
    hidden: false, querySelector: () => video,
    createElement() {
      const mask = { fills: [], getContext: () => ({ fillRect(x, y) { mask.fills.push({ x, y }); } }) };
      masks.push(mask);
      return mask;
    },
    addEventListener: (name, fn) => { pageEvents[name] = fn; },
  };
  vm.runInNewContext(code, {
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
      const delta = Math.min(remaining, 10);
      tick(delta);
      remaining -= delta;
    }
  }
  tick(0);
  return {
    avatar, photo, poster, video, canvas, properties, draws, masks, observers, frames, photoEvents, sourceEvents, tick, advance,
    resize(width) { avatarWidth = width; observers.filter(o => !o.disconnected).forEach(o => o.callback()); },
    hide(value) { document.hidden = value; pageEvents.visibilitychange(); tick(0); },
    reduce(value) { media.matches = value; mediaEvents.change(); tick(0); },
  };
}

test('photo illumination and 0.75-second hold precede flicker, darkness, repair, and WebM reveal', () => {
  const h = setup();
  assert.equal(h.avatar.dataset.torchPower, '0');
  for (const [stage, duration] of [['dark', 3000], ['illuminate', 1200], ['photo', 750],
    ['flicker', 1100], ['pause', 500], ['repair', 1200]]) {
    assert.equal(h.avatar.dataset.avatarStage, stage);
    h.advance(duration - 1);
    assert.equal(h.avatar.dataset.avatarStage, stage);
    assert.equal(h.video.plays, 0);
    h.advance(1);
  }
  assert.equal(h.avatar.dataset.avatarStage, 'reveal');
  assert.equal(h.avatar.dataset.torchPower, '1');
  assert.equal(h.video.plays, 1);
  h.tick(0);
  h.advance(2800);
  assert.equal(h.avatar.dataset.avatarStage, 'video');
  assert.equal(h.frames.size, 0);
  assert(h.observers.every(o => o.disconnected));
});

test('photo opacity and torch power share two interruption pulses followed by a final blackout', () => {
  const h = setup();
  h.advance(4950);
  const levels = [h.avatar.dataset.torchPower];
  for (const duration of [140, 120, 160, 120, 220]) {
    h.advance(duration);
    levels.push(h.avatar.dataset.torchPower);
    assert.equal(h.properties['--avatar-power'], h.avatar.dataset.torchPower);
  }
  assert.deepEqual(levels, ['1', '0', '1', '0', '1', '0']);
  h.advance(340);
  assert.equal(h.avatar.dataset.avatarStage, 'pause');
  h.advance(500);
  assert.equal(h.avatar.dataset.avatarStage, 'repair');
  h.advance(1199);
  assert.equal(h.avatar.dataset.torchPower, '0');
  assert.equal(h.video.plays, 0);
  h.advance(1);
  assert.equal(h.avatar.dataset.torchPower, '1');
  assert.equal(h.avatar.dataset.avatarStage, 'reveal');
});

test('illumination spreads from the shaft to the complete original before its hold', () => {
  const h = setup();
  h.advance(3000);
  assert.equal(h.properties['--avatar-photo-clarity'], '0.000');
  assert.equal(h.properties['--avatar-light-width'], '0.10%');
  h.advance(300);
  assert.equal(h.properties['--avatar-photo-clarity'], '0.500');
  h.advance(900);
  assert.equal(h.avatar.dataset.avatarStage, 'photo');
  assert.equal(h.properties['--avatar-light-width'], '200.00%');
});

test('photo loading gates the intro and a failed photo skips to WebM', () => {
  const h = setup({ loaded: false });
  h.advance(5000);
  assert.equal(h.frames.size, 0);
  h.photo.naturalWidth = 900;
  h.photoEvents.load();
  h.tick(0);
  h.advance(3000);
  assert.equal(h.avatar.dataset.avatarStage, 'illuminate');
  const failed = setup({ loaded: false });
  failed.photoEvents.error();
  assert.equal(failed.avatar.dataset.avatarStage, 'reveal');
  failed.tick(0);
  failed.advance(2800);
  assert.equal(failed.avatar.dataset.avatarStage, 'video');
});

test('hidden tabs pause every stage, including flicker and repairs', () => {
  const h = setup();
  for (const [stage, duration] of [['dark', 3000], ['illuminate', 1200], ['photo', 750],
    ['flicker', 1100], ['pause', 500], ['repair', 1200], ['reveal', 2800]]) {
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

test('the descending light leads randomized ASCII cells and accelerates over 2.8 seconds', () => {
  const h = setup();
  h.advance(revealStart);
  h.tick(0);
  const mask = h.masks[0];
  assert.equal(mask.width, 113);
  assert.equal(mask.height, 108);
  const total = mask.width * mask.height;
  let previous = 0, previousIncrement = 0;
  for (let step = 1; step <= 4; step++) {
    h.advance(700);
    const count = mask.fills.length;
    assert(count - previous > previousIncrement);
    previousIncrement = count - previous;
    previous = count;
    const lightFront = Number(h.avatar.dataset.asciiLightProgress);
    assert(mask.fills.every(cell => cell.y / (mask.height - 1) <= lightFront + 0.0001));
    if (step === 1) {
      assert(mask.fills.some(c => c.y < 10));
      assert(mask.fills.every(c => c.y < 10));
      assert(mask.fills.some((c, i) => i > 0 && c.y < mask.fills[i - 1].y));
      h.resize(300);
      assert.equal(h.canvas.width, 600);
      assert.equal(mask.fills.length, count);
      assert.equal(h.draws[0].source, h.video);
      assert.equal(h.draws[1].composite, 'destination-in');
      assert.equal(h.draws[1].smoothing, false);
    }
  }
  assert.equal(new Set(mask.fills.map(c => `${c.x}:${c.y}`)).size, total);
});

test('reduced motion skips the intro and releases an active reveal', () => {
  const h = setup({ reduced: true });
  assert.equal(h.avatar.dataset.avatarStage, 'still');
  assert.equal(h.video.plays, 0);
  assert.equal(h.frames.size, 0);
  h.reduce(false);
  assert.equal(h.avatar.dataset.avatarStage, 'video');
  for (const elapsed of [5400, 7200, revealStart + 300]) {
    const active = setup();
    active.advance(elapsed);
    active.reduce(true);
    assert.equal(active.avatar.dataset.avatarStage, 'still');
    assert.equal(active.frames.size, 0);
    assert(active.observers.every(o => o.disconnected));
  }
});

test('playback failures use the poster and canvas failure retains a fade fallback', async () => {
  const blocked = setup({ rejectPlay: true });
  blocked.advance(revealStart);
  blocked.tick(0);
  blocked.advance(1400);
  assert.equal(blocked.draws[0].source, blocked.poster);
  blocked.advance(1400);
  await Promise.resolve();
  assert.equal(blocked.avatar.dataset.avatarStage, 'still');
  const failed = setup();
  failed.sourceEvents.error();
  failed.advance(11000);
  assert.equal(failed.avatar.dataset.avatarStage, 'still');
  assert.equal(failed.video.plays, 0);
  const fallback = setup({ canvasSupported: false });
  fallback.advance(revealStart);
  fallback.tick(0);
  fallback.advance(1400);
  assert.equal(fallback.properties['--avatar-reveal-opacity'], '0.250');
});

test('completed videos resume without repeating the intro and unrelated pages are untouched', () => {
  const h = setup();
  h.advance(11000);
  h.hide(true);
  assert.equal(h.avatar.dataset.avatarStage, 'still');
  h.hide(false);
  assert.equal(h.avatar.dataset.avatarStage, 'video');
  assert.equal(h.frames.size, 0);
  vm.runInNewContext(code, { document: { querySelector: () => null } });
});
