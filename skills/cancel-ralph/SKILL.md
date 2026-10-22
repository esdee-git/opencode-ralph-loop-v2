---
name: cancel-ralph
description: Cancel active Ralph Loop
---

# Cancel Ralph

Stop an active Ralph Loop before completion.

## How to Use

When you invoke this skill, call the `cancel-ralph` tool in the active
session. It removes that session's loop state and reports the iteration count.

## When to Use

Use this command when:
- The task requirements have changed
- You want to restart with different parameters
- The loop appears stuck and you want manual control
- You need to work on something else

Note: Prefer completing tasks properly with `<promise>DONE</promise>` when possible.
