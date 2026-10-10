import assert from "node:assert/strict";
import { test } from "node:test";
import { attributeTakerFills } from "../app/lib/perpl-trade-reconstruction";

test("attributeTakerFills is available", () => {
  assert.equal(typeof attributeTakerFills, "function");
});
