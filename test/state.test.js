import { test } from "node:test";
import assert from "node:assert/strict";
import { parseState, serializeState } from "../src/index.js";

test("returns defaults when no frontmatter is present", () => {
  assert.deepEqual(parseState(""), { active: false, iteration: 0, maxIterations: 100 });
  assert.deepEqual(parseState("just some text"), { active: false, iteration: 0, maxIterations: 100 });
});

test("parses active, iteration, maxIterations, sessionId", () => {
  const content = ["---", "active: true", "iteration: 7", "maxIterations: 50", "sessionId: ses_abc123", "---"].join("\n");
  assert.deepEqual(parseState(content), {
    active: true, iteration: 7, maxIterations: 50, sessionId: "ses_abc123",
  });
});

test("treats `active: anything-but-true` as false", () => {
  assert.equal(parseState("---\nactive: false\niteration: 1\nmaxIterations: 10\n---").active, false);
});

test("captures the body as the prompt", () => {
  const content = ["---", "active: true", "iteration: 0", "maxIterations: 100", "---", "", "Build a REST API"].join("\n");
  assert.equal(parseState(content).prompt, "Build a REST API");
});

test("preserves colons inside values", () => {
  assert.equal(parseState("---\nactive: true\nsessionId: ses:foo:bar\niteration: 0\nmaxIterations: 100\n---").sessionId, "ses:foo:bar");
});

test("parses CRLF-encoded state files", () => {
  const content = "---\r\nactive: true\r\niteration: 5\r\nmaxIterations: 50\r\nsessionId: ses_win\r\n---\r\n\r\nWindows-saved task";
  assert.deepEqual(parseState(content), {
    active: true, iteration: 5, maxIterations: 50, sessionId: "ses_win", prompt: "Windows-saved task",
  });
});

test("serializes required fields and omits absent optionals", () => {
  const out = serializeState({ active: true, iteration: 3, maxIterations: 100 });
  assert.match(out, /^---\n/);
  assert.match(out, /active: true/);
  assert.doesNotMatch(out, /sessionId|undefined/);
});

test("serialize/parse round trip with all fields", () => {
  const original = { active: true, iteration: 12, maxIterations: 200, sessionId: "ses_xyz", prompt: "Build a REST API with auth" };
  assert.deepEqual(parseState(serializeState(original)), original);
});

test("serialize/parse round trip with required fields only", () => {
  const original = { active: false, iteration: 0, maxIterations: 100 };
  assert.deepEqual(parseState(serializeState(original)), original);
});
