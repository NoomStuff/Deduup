import assert from "node:assert/strict";
import test from "node:test";
import { assertNoActiveOperation, runExclusiveOperation } from "../src/main/operationCoordinator.ts";
import { parseDecisions } from "../src/shared/schema.ts";

test("file operation coordination rejects overlap and releases after failure", async () => {
   let release;
   const barrier = new Promise((resolve) => {
      release = resolve;
   });
   const first = runExclusiveOperation("scan", async () => {
      await barrier;
      throw new Error("scan failed");
   });
   assert.throws(assertNoActiveOperation, /scan/u);
   await assert.rejects(
      runExclusiveOperation("move", async () => undefined),
      /scan/u
   );
   release();
   await assert.rejects(first, /scan failed/u);
   assert.doesNotThrow(assertNoActiveOperation);
   assert.equal(await runExclusiveOperation("restore", async () => 42), 42);
});

test("decision payload parsing rejects malformed values instead of clearing choices", () => {
   for (const value of [null, [], { a: { deletedImages: [42] } }, { a: { deletedImages: "image" } }]) {
      assert.throws(() => parseDecisions(value), TypeError);
   }
   assert.deepEqual(parseDecisions({ a: { deletedImages: ["image", "image"] } }), { a: { deletedImages: ["image"] } });
});
