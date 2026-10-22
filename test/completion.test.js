import { test } from "node:test";
import assert from "node:assert/strict";
import { COMPLETION_TAG } from "../src/index.js";

test("matches the canonical form", () => {
  assert.equal(COMPLETION_TAG.test("<promise>DONE</promise>"), true);
});

test("matches with surrounding whitespace inside the tag", () => {
  assert.equal(COMPLETION_TAG.test("<promise>  DONE  </promise>"), true);
  assert.equal(COMPLETION_TAG.test("<promise>\nDONE\n</promise>"), true);
});

test("is case-insensitive", () => {
  assert.equal(COMPLETION_TAG.test("<PROMISE>done</PROMISE>"), true);
  assert.equal(COMPLETION_TAG.test("<Promise>Done</Promise>"), true);
});

test("matches inside larger text", () => {
  const blob = "I finished the work.\n\n<promise>DONE</promise>\n\nMoving on.";
  assert.equal(COMPLETION_TAG.test(blob), true);
});

test("does not match when the inner token is not DONE", () => {
  assert.equal(COMPLETION_TAG.test("<promise>WIP</promise>"), false);
  assert.equal(COMPLETION_TAG.test("<promise>almost done</promise>"), false);
});

test("does not match a stray DONE outside the tag", () => {
  assert.equal(COMPLETION_TAG.test("DONE"), false);
  assert.equal(COMPLETION_TAG.test("the task is DONE"), false);
});
