import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import plugin from "../src/index.js";

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "ralph-v2-"));
  const path = join(directory, ".opencode/ralph-loop.local.md");
  const tools = new Map();
  const commands = new Map();
  const prompts = [];
  let receive;
  let messages = [{ type: "assistant", content: [{ type: "text", text: "Working" }] }];
  const ctx = {
    location: { directory },
    tool: { transform: async (register) => register({ add: (item) => tools.set(item.name, item) }) },
    command: { transform: async (register) => register({ add: (item) => commands.set(item.name, item) }) },
    session: {
      context: async () => messages,
      prompt: async (input) => { prompts.push(input); },
    },
    event: {
      subscribe: () => ({
        [Symbol.asyncIterator]: () => ({ next: () => new Promise((resolve) => { receive = resolve; }) }),
      }),
    },
  };
  const cleanup = await plugin.setup(ctx);
  t.after(async () => {
    cleanup();
    await rm(directory, { recursive: true, force: true });
  });
  async function emit(type, sessionID, location = { directory }) {
    receive({ value: { type, location, data: { sessionID } }, done: false });
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return {
    path, tools, commands, prompts, emit,
    setMessages: (next) => { messages = next; },
  };
}

test("registers native V2 tools and commands", async (t) => {
  const { tools, commands } = await fixture(t);
  assert.equal(plugin.id, "ralph-loop.v2");
  assert.deepEqual([...tools.keys()], ["ralph-loop", "cancel-ralph"]);
  assert.deepEqual([...commands.keys()], ["ralph-loop", "cancel-ralph"]);
});

test("loops only the initiating session and stops on the completion promise", async (t) => {
  const { path, tools, prompts, emit, setMessages } = await fixture(t);
  const start = tools.get("ralph-loop");
  await start.execute({ task: "Finish the task", maxIterations: 2 }, { sessionID: "ses_one" });
  assert.match(await readFile(path, "utf8"), /sessionId: ses_one/);
  assert.match((await start.execute({ task: "Steal it" }, { sessionID: "ses_other" })).content, /already active/);

  await emit("session.execution.succeeded", "ses_other");
  await emit("session.execution.succeeded", "ses_one", { directory: "/somewhere/else" });
  assert.equal(prompts.length, 0);
  await emit("session.execution.succeeded", "ses_one");
  assert.match(prompts[0].text, /ITERATION 1\/2/);
  assert.equal(prompts[0].delivery, "queue");
  setMessages([{ type: "assistant", content: [{ type: "text", text: "All done. <promise>DONE</promise>" }] }]);
  await emit("session.execution.succeeded", "ses_one");
  await assert.rejects(readFile(path), { code: "ENOENT" });
  assert.equal(prompts.length, 1);
});

test("stops after the configured number of continuations", async (t) => {
  const { path, tools, prompts, emit } = await fixture(t);
  await tools.get("ralph-loop").execute({ task: "Bounded", maxIterations: 1 }, { sessionID: "ses_one" });
  await emit("session.execution.succeeded", "ses_one");
  await emit("session.execution.succeeded", "ses_one");
  assert.equal(prompts.length, 1);
  await assert.rejects(readFile(path), { code: "ENOENT" });
});

test("does not auto-resume an unbound V1 state file", async (t) => {
  const { path, tools, prompts, emit } = await fixture(t);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, "---\nactive: true\niteration: 0\nmaxIterations: 100\n---\n\nLegacy task\n");
  await emit("session.execution.succeeded", "ses_one");
  assert.equal(prompts.length, 0);
  assert.match(await readFile(path, "utf8"), /Legacy task/);
  await tools.get("ralph-loop").execute({ task: "New task" }, { sessionID: "ses_one" });
  assert.match(await readFile(path, "utf8"), /sessionId: ses_one/);
});

test("failed executions and erroring replies do not continue or clear the loop", async (t) => {
  const { path, tools, prompts, emit, setMessages } = await fixture(t);
  await tools.get("ralph-loop").execute({ task: "Recoverable", maxIterations: 2 }, { sessionID: "ses_one" });
  await emit("session.execution.failed", "ses_one");
  setMessages([{ type: "assistant", error: { name: "APIError" }, content: [{ type: "text", text: "partial" }] }]);
  await emit("session.execution.succeeded", "ses_one");
  assert.equal(prompts.length, 0);
  const state = await readFile(path, "utf8");
  assert.match(state, /Recoverable/);
});

test("slash commands start and cancel; deleted session clears its state", async (t) => {
  const { path, commands, tools, prompts, emit } = await fixture(t);
  await commands.get("ralph-loop").execute({ sessionID: "ses_one", prompt: { text: "Build it" } });
  assert.match(await readFile(path, "utf8"), /Build it/);
  assert.match(prompts[0].text, /Build it/);
  assert.equal(prompts[0].resume, true);
  await commands.get("cancel-ralph").execute({ sessionID: "ses_one" });
  assert.equal(prompts[1].resume, false);
  await assert.rejects(readFile(path), { code: "ENOENT" });

  await tools.get("ralph-loop").execute({ task: "Again" }, { sessionID: "ses_one" });
  await emit("session.deleted", "ses_other");
  assert.match(await readFile(path, "utf8"), /Again/);
  await emit("session.deleted", "ses_one");
  await assert.rejects(readFile(path), { code: "ENOENT" });
});
