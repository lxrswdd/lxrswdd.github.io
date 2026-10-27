const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const code = fs.readFileSync(path.join(__dirname, '../assets/js/avatar-video.js'), 'utf8');

function setup({ reduced = false, loaded = true, rejectPlay = false } = {}) {
  let now = 0;
  let nextFrame = 0;
  const frames = new Map();
  const listeners = {};
  const photoEvents = {};
  const sourceEvents = {};
  const pageEvents = {};
  const mediaEvents = {};
  const classes = new Set();
  const properties = {};
  const avatar = {
    dataset: { avatarStage: 'photo' },
    style: { setProperty: (name, value) => { properties[name] = String(value); } },
  };
  const media = { matches: reduced, addEventListener: (name, fn) => { mediaEvents[name] = fn; } };
  const photo = {
    complete: loaded, naturalWidth: loaded ? 900 : 0,
    addEventListener: (name, fn) => { photoEvents[name] = fn; },
  };
  const video = {
    paused: true, plays: 0,
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
  avatar.querySelector = () => photo;
  const document = {
    hidden: false, querySelector: () => video,
    addEventListener: (name, fn) => { pageEvents[name] = fn; },
  };
  vm.runInNewContext(code, {
    document, matchMedia: () => media,
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
    avatar, video, properties, classes, frames, listeners, photoEvents, sourceEvents, tick, advance,
    hide(value) { document.hidden = value; pageEvents.visibilitychange(); tick(0); },
    reduce(value) { media.matches = value; mediaEvents.change(); tick(0); },
  };
}

test('holds the photo for 1.5 seconds, flickers for 650 ms, then reveals video top to bottom', () => {
  const h = setup();
  h.advance(1499);
  assert.equal(h.avatar.dataset.avatarStage, 'photo');
  assert.equal(h.video.plays, 0);
  h.advance(1);
  assert.equal(h.avatar.dataset.avatarStage, 'flicker');
  h.advance(649);
  assert.equal(h.video.plays, 0);
  h.advance(1);
  assert.equal(h.avatar.dataset.avatarStage, 'reveal');
  assert.equal(h.video.plays, 1);
  assert(h.video.muted);
  assert.equal(h.properties['--avatar-reveal-bottom'], '100%');
  h.tick(0);
  h.advance(625);
  assert.equal(h.properties['--avatar-reveal-bottom'], '50.00%');
  h.advance(625);
  assert.equal(h.properties['--avatar-reveal-bottom'], '0.00%');
  assert.equal(h.avatar.dataset.avatarStage, 'video');
  assert.equal(h.frames.size, 0);
  h.listeners.playing();
  assert.equal(h.avatar.dataset.avatarStage, 'video');
  assert.equal(h.frames.size, 0);
});

test('flickers three times and ends with the original photo invisible', () => {
  const h = setup();
  h.advance(1500);
  const levels = [h.properties['--avatar-flicker-opacity']];
  for (let blink = 1; blink < 6; blink++) {
    h.advance(110);
    levels.push(h.properties['--avatar-flicker-opacity']);
  }
  assert.deepEqual(levels, ['1', '0.16', '0.85', '0.08', '0.6', '0']);
  assert.equal(h.avatar.dataset.avatarStage, 'flicker');
});

test('waits for the original photo to load before counting 1.5 seconds', () => {
  const h = setup({ loaded: false });
  h.advance(5000);
  assert.equal(h.frames.size, 0);
  assert.equal(h.video.plays, 0);
  h.photoEvents.load();
  h.tick(0);
  h.advance(1499);
  assert.equal(h.avatar.dataset.avatarStage, 'photo');
  h.advance(1);
  assert.equal(h.avatar.dataset.avatarStage, 'flicker');
});

test('background tabs pause the intro clock and resume without restarting it', () => {
  const h = setup();
  h.advance(1000);
  h.hide(true);
  h.advance(10000);
  assert.equal(h.avatar.dataset.avatarStage, 'photo');
  assert.equal(h.frames.size, 0);
  h.hide(false);
  h.advance(500);
  assert.equal(h.avatar.dataset.avatarStage, 'flicker');
  h.advance(300);
  h.hide(true);
  h.advance(10000);
  h.hide(false);
  h.advance(350);
  assert.equal(h.avatar.dataset.avatarStage, 'reveal');
  h.tick(0);
  h.advance(400);
  h.hide(true);
  h.advance(10000);
  h.hide(false);
  h.advance(850);
  assert.equal(h.avatar.dataset.avatarStage, 'video');
});

test('video visibility changes never repeat flickering or the reveal', () => {
  const h = setup();
  h.advance(3500);
  h.hide(true);
  assert.equal(h.avatar.dataset.avatarStage, 'still');
  h.hide(false);
  assert.equal(h.avatar.dataset.avatarStage, 'video');
  assert.equal(h.properties['--avatar-reveal-bottom'], '0.00%');
  assert.equal(h.frames.size, 0);
});

test('reduced motion skips flickering, the reveal, and video playback', () => {
  const h = setup({ reduced: true });
  assert.equal(h.avatar.dataset.avatarStage, 'still');
  assert.equal(h.video.plays, 0);
  assert.equal(h.frames.size, 0);
  h.reduce(false);
  assert.equal(h.avatar.dataset.avatarStage, 'video');
  h.reduce(true);
  assert(h.video.paused);
  assert.equal(h.avatar.dataset.avatarStage, 'still');
  const duringIntro = setup();
  duringIntro.advance(1700);
  duringIntro.reduce(true);
  assert.equal(duringIntro.avatar.dataset.avatarStage, 'still');
  assert.equal(duringIntro.frames.size, 0);
  duringIntro.reduce(false);
  assert.equal(duringIntro.avatar.dataset.avatarStage, 'video');
});

test('source errors and blocked autoplay fall back to the ASCII still', async () => {
  const failed = setup();
  failed.sourceEvents.error();
  failed.advance(3500);
  assert.equal(failed.avatar.dataset.avatarStage, 'still');
  assert.equal(failed.video.plays, 0);
  const blocked = setup({ rejectPlay: true });
  blocked.advance(3500);
  await Promise.resolve();
  assert.equal(blocked.avatar.dataset.avatarStage, 'still');
  assert(!blocked.classes.has('is-playing'));
});

test('photo errors skip directly to the reveal; unrelated pages remain unchanged', () => {
  const brokenPhoto = setup({ loaded: false });
  brokenPhoto.photoEvents.error();
  assert.equal(brokenPhoto.avatar.dataset.avatarStage, 'reveal');
  brokenPhoto.tick(0);
  brokenPhoto.advance(1250);
  assert.equal(brokenPhoto.avatar.dataset.avatarStage, 'video');
  vm.runInNewContext(code, { document: { querySelector: () => null } });
});
