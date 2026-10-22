import { readFile, mkdir, writeFile, unlink } from "node:fs/promises";
import { join, dirname } from "node:path";

const filename = ".opencode/ralph-loop.local.md";

// Named value exports are safe in V2 (the loader only validates the default
// export shape). Kept exported for tests; upstream moved it to a sibling
// module only because the V1 loader rejected non-function entry exports.
export const COMPLETION_TAG = /<promise>\s*DONE\s*<\/promise>/i;

// parseState/serializeState mirror the upstream (v1) frontmatter format and
// are exported for tests: CRLF-tolerant parsing, optional sessionId and prompt.
export function parseState(content) {
  const state = { active: false, iteration: 0, maxIterations: 100 };
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return state;
  const fields = Object.fromEntries(match[1].split(/\r?\n/).filter(Boolean).map((line) => {
    const colon = line.indexOf(":");
    return [line.slice(0, colon), line.slice(colon + 1).trim()];
  }));
  state.active = fields.active === "true";
  state.iteration = Number(fields.iteration) || 0;
  state.maxIterations = Number(fields.maxIterations) || 100;
  if (fields.sessionId) state.sessionId = fields.sessionId;
  const body = content.slice(match[0].length).trim();
  if (body) state.prompt = body;
  return state;
}

export function serializeState(state) {
  const lines = ["---", `active: ${state.active}`, `iteration: ${state.iteration}`, `maxIterations: ${state.maxIterations}`];
  if (state.sessionId) lines.push(`sessionId: ${state.sessionId}`);
  lines.push("---");
  if (state.prompt) lines.push("", state.prompt);
  return lines.join("\n");
}

async function readState(path) {
  try {
    return parseState(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
}

async function clear(path) {
  try {
    await unlink(path);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function save(path, state) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, serializeState(state), "utf8");
}

function continuation(state) {
  return `[RALPH LOOP - ITERATION ${state.iteration}/${state.maxIterations}]

Your previous attempt did not output the completion promise. Continue working on the task.

Review progress, continue from where you left off, and only when fully done output: <promise>DONE</promise>

Original task:
${state.prompt}`;
}

export default {
  id: "ralph-loop.v2",
  async setup(ctx) {
    const directory = ctx.location.directory;
    const path = join(directory, filename);
    const pending = new Set();

    async function start(sessionID, task, maxIterations = 100) {
      if (!task.trim()) return "Provide a task to start Ralph Loop.";
      if (!Number.isInteger(maxIterations) || maxIterations < 1) return "maxIterations must be a positive integer.";
      const current = await readState(path);
      if (current?.active && current.sessionId && current.sessionId !== sessionID) {
        return `A Ralph Loop is already active in session ${current.sessionId}. Cancel it there first.`;
      }
      await save(path, { active: true, iteration: 0, maxIterations, sessionId: sessionID, prompt: task.trim() });
      return `Ralph Loop started (max ${maxIterations} iterations). When the task is fully complete, output <promise>DONE</promise>.`;
    }

    async function cancel(sessionID) {
      const state = await readState(path);
      if (!state?.active || (state.sessionId && state.sessionId !== sessionID)) return "No Ralph Loop active in this session.";
      await clear(path);
      return `Ralph Loop cancelled after ${state.iteration} iteration(s).`;
    }

    await ctx.tool.transform((editor) => {
      editor.add({
        name: "ralph-loop",
        description: "Start a Ralph Loop that continues this session until completion.",
        input: {
          type: "object",
          properties: { task: { type: "string" }, maxIterations: { type: "integer", minimum: 1, default: 100 } },
          required: ["task"],
          additionalProperties: false,
        },
        execute: async (input, context) => ({ content: await start(context.sessionID, input.task, input.maxIterations) }),
      });
      editor.add({
        name: "cancel-ralph",
        description: "Stop the active Ralph Loop in this session.",
        input: { type: "object", properties: {}, additionalProperties: false },
        execute: async (_input, context) => ({ content: await cancel(context.sessionID) }),
      });
    });

    await ctx.command.transform((editor) => {
      editor.add({
        name: "ralph-loop",
        description: "Start a Ralph Loop for this session",
        execute: async ({ sessionID, prompt }) => {
          const result = await start(sessionID, prompt.text);
          await ctx.session.prompt({
            sessionID,
            text: result.startsWith("Ralph Loop started") ? `${prompt.text}\n\n${result}` : result,
            delivery: "steer",
            resume: result.startsWith("Ralph Loop started"),
          });
        },
      });
      editor.add({
        name: "cancel-ralph",
        description: "Stop this session's Ralph Loop",
        execute: async ({ sessionID }) => {
          const result = await cancel(sessionID);
          await ctx.session.prompt({ sessionID, text: result, delivery: "steer", resume: false });
        },
      });
    });

    async function onSuccess(sessionID) {
      if (pending.has(sessionID)) return;
      pending.add(sessionID);
      try {
        const state = await readState(path);
        if (!state?.active || state.sessionId !== sessionID) return;
        const messages = await ctx.session.context({ sessionID });
        const last = messages.findLast((message) => message.type === "assistant");
        if (!last || last.error) return;
        if (last.content?.some((part) => part.type === "text" && COMPLETION_TAG.test(part.text))) {
          await clear(path);
          return;
        }
        if (state.iteration >= state.maxIterations) {
          await clear(path);
          return;
        }
        const next = { ...state, iteration: state.iteration + 1 };
        await save(path, next);
        await ctx.session.prompt({ sessionID, text: continuation(next), delivery: "queue" });
      } finally {
        pending.delete(sessionID);
      }
    }

    const controller = new AbortController();
    void (async () => {
      try {
        for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
          if (event.location?.directory && event.location.directory !== directory) continue;
          try {
            if (event.type === "session.execution.succeeded") {
              await onSuccess(event.data.sessionID);
            } else if (event.type === "session.deleted") {
              const state = await readState(path);
              if (state?.sessionId === event.data.sessionID) await clear(path);
            }
          } catch {
            console.error("Ralph Loop could not process a session event");
          }
        }
      } catch {
        if (!controller.signal.aborted) console.error("Ralph Loop event subscription failed");
      }
    })();
    return () => controller.abort();
  },
};
