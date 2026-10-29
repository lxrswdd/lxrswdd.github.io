const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const code = fs.readFileSync(path.join(__dirname, '../assets/js/home-rope-light.js'), 'utf8');

function setup({ reduced = false, dark = true, loaded = true, stage = 'dark', supported = true, canvasWidth = 1280 } = {}) {
  let now = 0;
  let nextFrame = 0;
  let box = { left: 90, top: 160, width: 400, height: 400 * 4 / 3 };
  const frames = new Map();
  const mutations = [];
  const pageEvents = {};
  const photoEvents = {};
  const strokes = [];
  const translations = [];
  const glyphs = [];
  let points = [];
  const context = {
    clearRect() { strokes.length = 0; translations.length = 0; glyphs.length = 0; },
    fillText(character, x, y) { glyphs.push({ character, x, y }); },
    beginPath() { points = []; },
    moveTo(x, y) { points.push([x, y]); },
    lineTo(x, y) { points.push([x, y]); },
    bezierCurveTo(...values) { points.push(values); },
    stroke() { strokes.push({ points, color: this.strokeStyle, width: this.lineWidth }); },
    closePath() {}, fill() {}, fillRect() {}, setTransform() {}, save() {}, restore() {}, scale() {},
    translate(x, y) { translations.push({ x, y }); },
    createLinearGradient(...values) { return { values, addColorStop() {} }; },
  };
  const canvas = {
    dataset: { ropeState: 'waiting' },
    getContext: () => supported ? context : null,
    getBoundingClientRect: () => ({ width: canvasWidth, height: 860 }),
  };
  const photo = {
    complete: loaded, naturalWidth: loaded ? 900 : 0,
    addEventListener(name, fn) { photoEvents[name] = fn; },
  };
  const avatar = {
    dataset: { avatarStage: stage },
    querySelector: () => photo,
    getBoundingClientRect: () => box,
  };
  const body = { classList: { contains: value => value === 'colorscheme-dark' && dark } };
  const document = {
    hidden: false, body,
    querySelector: selector => selector === '[data-home-rope-light]' ? canvas : avatar,
    addEventListener(name, fn) { pageEvents[name] = fn; },
  };
  const reducedMedia = { matches: reduced, addEventListener(name, fn) { this.change = fn; } };
  const darkMedia = { matches: true, addEventListener() {} };
  const window = { innerWidth: 1280, innerHeight: 860, devicePixelRatio: 2, addEventListener(name, fn) { this[name] = fn; } };
  vm.runInNewContext(code, {
    document, window,
    matchMedia: query => query.includes('reduced-motion') ? reducedMedia : darkMedia,
    MutationObserver: class {
      constructor(callback) { this.callback = callback; }
      observe(target) { mutations.push({ target, callback: this.callback }); }
    },
    ResizeObserver: class { observe() {} },
    requestAnimationFrame(fn) { const id = ++nextFrame; frames.set(id, fn); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
  });
  function tick(delta) {
    now += delta;
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach(fn => fn(now));
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
    canvas, photo, frames, strokes, glyphs, translations, photoEvents, tick, advance,
    stage(value) {
      avatar.dataset.avatarStage = value;
      mutations.filter(m => m.target === avatar).forEach(m => m.callback());
      tick(0);
    },
    power(value) {
      avatar.dataset.torchPower = String(value);
      mutations.filter(m => m.target === avatar).forEach(m => m.callback());
      tick(0);
    },
    front(value) {
      avatar.dataset.asciiLightProgress = String(value);
      mutations.filter(m => m.target === avatar).forEach(m => m.callback());
      tick(0);
    },
    hide(value) { document.hidden = value; pageEvents.visibilitychange(); tick(0); },
    reduce(value) { reducedMedia.matches = value; reducedMedia.change(); tick(0); },
    dark(value) { dark = value; mutations.filter(m => m.target === body).forEach(m => m.callback()); tick(0); },
    resize(next) { box = next; window.resize(); },
  };
}

test('the ASCII figure descends from above the page and the torch aligns with the photographed shaft', () => {
  const h = setup();
  assert.equal(h.canvas.dataset.ropeState, 'descending');
  assert(h.translations[0].y < 0);
  assert.equal(h.canvas.dataset.lightLevel, '0.000');
  h.advance(2850);
  assert.equal(h.translations[0].y, 109);
  h.stage('illuminate');
  h.advance(180);
  assert.equal(h.canvas.dataset.ropeState, 'lighting');
  assert.equal(h.canvas.dataset.lightLevel, '1.000');
  assert(h.glyphs.some(glyph => glyph.character === 'O'));
  assert(h.glyphs.some(glyph => glyph.character === ':'));
  assert(h.glyphs.some(glyph => glyph.character === '[]'));
  assert(h.glyphs.every(glyph => /^[\x20-\x7e]+$/.test(glyph.character)));
  const target = 90 + 400 * 465 / 900;
  assert(Math.abs(Number(h.canvas.dataset.beamX) - target) < 0.005);
  assert(Math.abs(h.translations[0].x + 47 - target) < 0.005);
  assert(h.strokes.some(stroke => stroke.points.length === 2 &&
    Math.abs(stroke.points[0][0] - target) < 0.005 && Math.abs(stroke.points[1][0] - target) < 0.005));
});

test('the torch lights before the photo hold and remains on across the stage transition', () => {
  const h = setup();
  h.advance(3000);
  assert.equal(h.canvas.dataset.lightLevel, '0.000');
  h.stage('illuminate');
  h.advance(1200);
  assert.equal(h.canvas.dataset.lightLevel, '1.000');
  h.stage('photo');
  assert.equal(h.canvas.dataset.lightLevel, '1.000');
});

test('the rope pays out from the top instead of appearing at full length', () => {
  const h = setup();
  assert.equal(h.glyphs.filter(glyph => glyph.character === ':').length, 0);
  let previousEnd = Number(h.canvas.dataset.ropeEnd);
  const lengths = [];
  for (const duration of [200, 200, 450]) {
    h.advance(duration);
    const end = Number(h.canvas.dataset.ropeEnd);
    assert(end > previousEnd);
    assert(end > h.translations[0].y + 5);
    previousEnd = end;
    lengths.push(h.glyphs.filter(glyph => glyph.character === ':').length);
  }
  assert(lengths[0] < lengths[1] && lengths[1] < lengths[2]);
  assert.equal(previousEnd, 178);
  h.stage('illuminate');
  h.advance(200);
  assert.equal(Number(h.canvas.dataset.ropeEnd), 178);
  h.stage('pause');
  h.advance(350);
  assert.equal(Number(h.canvas.dataset.ropeEnd), 178);
});

test('the figure stays above the viewport until the rope is fully deployed and settled', () => {
  const h = setup();
  h.advance(850);
  assert.equal(Number(h.canvas.dataset.ropeEnd), 178);
  assert.equal(h.translations[0].y, -64);
  h.advance(150);
  assert.equal(h.translations[0].y, -64);
  h.advance(925);
  assert(h.translations[0].y > -64 && h.translations[0].y < 109);
  assert.equal(Number(h.canvas.dataset.ropeEnd), 178);
  h.advance(925);
  assert.equal(h.translations[0].y, 109);
});

test('the torch follows the same power signal as the photo during both flickers', () => {
  const h = setup();
  h.advance(3000);
  h.stage('photo');
  h.advance(750);
  h.stage('flicker');
  for (const power of [1, 0, 1, 0, 1, 0]) {
    h.power(power);
    assert.equal(Number(h.canvas.dataset.lightLevel), power);
  }
  h.stage('pause');
  assert.equal(h.canvas.dataset.ropeState, 'broken');
  assert.equal(h.canvas.dataset.lightLevel, '0.000');
  assert.equal(Number(h.canvas.dataset.ropeEnd), 178);
});

test('the figure taps the unlit torch twice before relighting it for the WebM', () => {
  const h = setup();
  h.stage('repair');
  assert.equal(h.canvas.dataset.ropeState, 'repairing');
  h.advance(340);
  assert.equal(h.canvas.dataset.tapCount, '1');
  assert(h.glyphs.some(g => g.character === '+' && g.x === 44 && g.y === 29));
  assert(h.glyphs.some(g => g.character === '*'));
  h.hide(true);
  h.advance(10000);
  h.hide(false);
  assert.equal(h.canvas.dataset.tapCount, '1');
  h.advance(180);
  assert(h.glyphs.some(g => g.character === '+' && g.x === 24 && g.y === 16));
  h.advance(240);
  assert.equal(h.canvas.dataset.tapCount, '2');
  assert.equal(h.canvas.dataset.lightLevel, '0.000');
  h.advance(440);
  h.stage('reveal');
  assert.equal(h.canvas.dataset.ropeState, 'relighting');
  h.advance(180);
  assert.equal(h.canvas.dataset.lightLevel, '1.000');
  h.stage('video');
  assert.equal(h.canvas.dataset.ropeState, 'holding');
  assert.equal(h.canvas.dataset.lightLevel, '1.000');
  assert.equal(h.frames.size, 0);
  h.hide(true);
  assert.equal(h.glyphs.length, 0);
  h.hide(false);
  assert(h.glyphs.length > 0);
  assert.equal(h.frames.size, 0);
  h.reduce(true);
  assert.equal(h.canvas.width, 1);
});

test('photo loading gates the descent; errors and late video stages skip it', () => {
  const h = setup({ loaded: false });
  h.advance(5000);
  assert.equal(h.canvas.dataset.ropeState, 'waiting');
  h.photo.naturalWidth = 900;
  h.photoEvents.load();
  h.tick(0);
  assert.equal(h.canvas.dataset.ropeState, 'descending');
  const failed = setup({ loaded: false });
  failed.photoEvents.error();
  assert.equal(failed.canvas.dataset.ropeState, 'done');
  const late = setup({ stage: 'video' });
  assert.equal(late.canvas.dataset.ropeState, 'done');
  assert.equal(late.frames.size, 0);
});

test('the relit beam follows shared downward progress before settling on the original shaft', () => {
  const h = setup();
  h.stage('reveal');
  h.advance(180);
  for (const front of [0.1, 0.4, 0.75, 1]) {
    h.front(front);
    assert.equal(Number(h.canvas.dataset.lightFront), front);
    const tipY = 160 + 400 * 4 / 3 * front;
    assert(h.strokes.some(stroke => stroke.points.length === 2 &&
      Math.abs(stroke.points[0][1] - tipY) < 0.01 && Math.abs(stroke.points[1][1] - tipY) < 0.01));
  }
  h.stage('video');
  assert.equal(Number(h.canvas.dataset.lightFront), 0.435);
  assert.equal(h.frames.size, 0);
});

test('hidden pages pause the descent and resume from the same position', () => {
  const h = setup();
  h.advance(1000);
  const position = h.translations[0].y;
  h.hide(true);
  h.advance(10000);
  assert.equal(h.frames.size, 0);
  h.hide(false);
  assert.equal(h.translations[0].y, position);
  h.advance(1850);
  assert.equal(h.translations[0].y, 109);
});

test('reduced motion skips the scene and a light theme pauses it', () => {
  const reduced = setup({ reduced: true });
  assert.equal(reduced.canvas.dataset.ropeState, 'done');
  assert.equal(reduced.frames.size, 0);
  const h = setup({ dark: false });
  assert.equal(h.frames.size, 0);
  h.dark(true);
  assert.equal(h.frames.size, 1);
  h.stage('photo');
  h.reduce(true);
  assert.equal(h.canvas.dataset.ropeState, 'done');
  assert.equal(h.frames.size, 0);
});

test('mobile resize keeps the lamp directly above the same relative photo column', () => {
  const h = setup();
  h.advance(3000);
  h.stage('photo');
  h.advance(180);
  h.resize({ left: 28, top: 105, width: 316, height: 316 * 4 / 3 });
  const target = 28 + 316 * 465 / 900;
  assert(Math.abs(Number(h.canvas.dataset.beamX) - target) < 0.005);
  assert(Math.abs(h.translations[0].x - 47 * 316 / 400 - target) < 0.005);
  assert.equal(h.canvas.dataset.lightLevel, '1.000');
});

test('unrelated pages and missing canvas support remain unchanged', () => {
  vm.runInNewContext(code, { document: { querySelector: () => null } });
  const h = setup({ supported: false });
  assert.equal(h.canvas.dataset.ropeState, 'waiting');
  assert.equal(h.frames.size, 0);
});

test('canvas backing size follows its CSS bounds so scrollbars do not offset the torch', () => {
  const h = setup({ canvasWidth: 1265 });
  assert.equal(h.canvas.width, 2530);
  assert.equal(h.canvas.height, 1720);
});
