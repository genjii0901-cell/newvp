import assert from "node:assert/strict";
import test from "node:test";
import { speakText } from "../lib/speech.ts";

function setup(t) {
  const oldWindow = globalThis.window;
  const oldUtterance = globalThis.SpeechSynthesisUtterance;
  const spoken = [];
  const timers = new Map();
  const intervals = new Map();
  let id = 0;
  let canceled = 0;
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  globalThis.window = {
    speechSynthesis: { getVoices: () => [], speak: (utterance) => spoken.push(utterance), cancel: () => { canceled += 1; } },
    setTimeout: (fn, delay) => { timers.set(++id, { fn, delay }); return id; },
    clearTimeout: (key) => timers.delete(key),
    setInterval: (fn) => { intervals.set(++id, fn); return id; },
    clearInterval: (key) => intervals.delete(key),
  };
  t.after(() => {
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldUtterance === undefined) delete globalThis.SpeechSynthesisUtterance; else globalThis.SpeechSynthesisUtterance = oldUtterance;
  });
  return { spoken, timers, intervals, canceled: () => canceled };
}

test("audio completes only after onend, not an estimated short duration", async (t) => {
  const mock = setup(t);
  let done = false;
  const promise = speakText("apple", { preferred: "english", rate: 0.6 }).then((value) => { done = true; return value; });
  await Promise.resolve();
  assert.equal(done, false);
  assert.equal(mock.spoken[0].lang, "en-US");
  assert.ok([...mock.timers.values()][0].delay >= 30_000);
  mock.spoken[0].onend();
  assert.equal(await promise, true);
  assert.equal(mock.timers.size, 0);
});

test("canceled runs settle without canceling the next run's audio", async (t) => {
  const mock = setup(t);
  const signal = { stopped: false };
  const promise = speakText("いとをかし", { preferred: "japanese", signal });
  signal.stopped = true;
  [...mock.intervals.values()][0]();
  assert.equal(await promise, false);
  assert.equal(mock.spoken[0].lang, "ja-JP");
  assert.equal(mock.canceled(), 0);
  assert.equal(mock.timers.size, 0);
});

test("stalled speech fails instead of claiming a successful playback", async (t) => {
  const mock = setup(t);
  const promise = speakText("test", { preferred: "english" });
  [...mock.timers.values()][0].fn();
  assert.equal(await promise, false);
  assert.equal(mock.canceled(), 1);
});
