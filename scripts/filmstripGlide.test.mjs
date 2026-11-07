import assert from "node:assert/strict";
import test from "node:test";
import { createGlideTick } from "../src/renderer/filmstripGlide.ts";

// Chromium keeps scrollLeft in whole pixels at a 1x scale and clamps it to the
// scroll range, so sub-pixel writes are lost. The strip here behaves the same.
const makeStrip = (scrollLeft, max = 20_000) => {
   let value = scrollLeft;
   return {
      get scrollLeft() {
         return value;
      },
      set scrollLeft(next) {
         value = Math.max(0, Math.min(max, Math.round(next)));
      },
   };
};

const run = (tick, limit = 500) => {
   let frames = 0;
   while (tick()) {
      frames += 1;
      if (frames > limit) return Infinity;
   }
   return frames;
};

test("the recenter glide always ends, for sub-pixel targets and targets past the scroll range", () => {
   // A target 1.4px away used to step 0.3px per frame, round to no movement,
   // and keep the animation alive forever.
   const nearby = makeStrip(9536);
   assert.ok(Number.isFinite(run(createGlideTick(nearby, () => 9537.4))), "sub-pixel glide never ended");
   assert.ok(Math.abs(nearby.scrollLeft - 9537.4) <= 1);

   const clamped = makeStrip(100, 500);
   assert.ok(Number.isFinite(run(createGlideTick(clamped, () => 900))), "clamped glide never ended");
   assert.equal(clamped.scrollLeft, 500);
});

test("the recenter glide reaches a distant target in a bounded number of frames", () => {
   const strip = makeStrip(0);
   const frames = run(createGlideTick(strip, () => 9537));
   assert.ok(frames < 80, `frames: ${frames}`);
   assert.equal(strip.scrollLeft, 9537);
});

test("a manual scroll stops the glide instead of being pulled back", () => {
   const strip = makeStrip(9000);
   const tick = createGlideTick(strip, () => 9537);
   assert.equal(tick(), true);
   strip.scrollLeft = 0; // the user drags the scrollbar
   assert.equal(tick(), false);
   assert.equal(strip.scrollLeft, 0);
});
