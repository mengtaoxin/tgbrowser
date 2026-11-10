---
name: task-divide-and-conquer
description: >-
  Splits a large user request into a parent task with serial subtasks tracked
  in a markdown file under `.task-divide-and-conquer/`. After the plan is
  written, wait for the user to confirm before running further subtasks. An
  orchestrator then runs one subtask per sub-agent so no single context grows
  too long. Hosts without sub-agents fall back to one subtask per conversation.
  Use when the user asks to divide and conquer a big task, split work across
  sub-agents or multiple conversations, create a parent task / subtasks,
  continue or resume a task file, or cancel one; also when they mention
  task-divide-and-conquer.
license: MIT
metadata:
  author: mengtaoxin
  version: "1.4.0"
---

# Task divide and conquer

One parent task → N subtasks, executed **serially**, **one subtask per
isolated context**. A markdown task file is the only shared state between
contexts, so it must always be accurate.

After Mode A writes the plan, **wait for the user to confirm** before any
further subtask runs. Confirmation is once per plan; resume / continue /
orchestrate prompts also count. Between later subtasks, do not re-ask.

When the host can launch sub-agents, an **orchestrator** runs the chain and
each subtask runs in its own **executor** sub-agent. When it cannot, fall
back to one subtask per new conversation.

## Roles

### Orchestrator

The conversation that created the task, or any later conversation told to
continue it, when sub-agents are available.

- Do not implement subtask 2 or later in this context.
- Only start the chain after the user has confirmed the plan (see Mode A),
  or after they asked to continue / orchestrate an existing task file.
- Launch **one** executor at a time, for the first `Pending` subtask only.
  Wait until it finishes, then re-read the task file. Decide the next step
  from the file, not from the sub-agent transcript.
- Between subtasks, post one short status line. Do not ask the user to
  confirm again before continuing.
- Stop when the parent status is `Failed`, `Completed`, or `Cancelled`, or
  when the user cancels. On `Completed`, relay the commit message from the
  last subtask's `Result`.
- If the executor returns and that subtask is still `Pending`, report that
  it did not finish and stop. Do not launch another executor for it.

Executor prompt (use the real path):

```text
Execute the first Pending subtask in .task-divide-and-conquer/<file>.md (task-divide-and-conquer). You are the executor: do only that subtask, update the task file, and return a short summary. Do not launch sub-agents or start the next subtask.
```

If this chain is interrupted, a new conversation resumes it with:

```text
Orchestrate task .task-divide-and-conquer/<file>.md (task-divide-and-conquer): run each remaining subtask in its own sub-agent, serially.
```

### Executor

A sub-agent launched with the executor prompt. Follow Mode B for exactly one
subtask. Return a few lines: what changed, subtask status, parent status.
Do not launch sub-agents.

### Fallback (no sub-agents)

Run Mode B in this conversation, then stop and hand the user:

```text
Continue task .task-divide-and-conquer/<file>.md in a new conversation (task-divide-and-conquer).
```

A conversation that receives that prompt, and can launch sub-agents, becomes
the orchestrator instead of executing the subtask inline.

## Task file

- Directory: `.task-divide-and-conquer/` at the project root (create if
  missing). The leading dot keeps these files out of the project's docs tree.
- Name: `<YYYY-MM-DD>-<kebab-slug>.md`; never overwrite an existing file.
- Write the content in the user's language. No task file exists unless a
  parent task was created.

### Parent statuses

| Status | Meaning |
| --- | --- |
| `In progress` | Created; subtasks remain |
| `Completed` | All subtasks done, including the commit message offered to the user |
| `Failed` | Task design problem found; reason recorded |
| `Cancelled` | Stopped, usually by the user |

`Failed`, `Completed`, and `Cancelled` are terminal: never execute subtasks of
such a task. A redesign means a new parent task (new file).

### Template

```markdown
# <Parent task title>

- **Status**: In progress
- **Failure reason**: —
- **Created**: <YYYY-MM-DD>
- **Updated**: <YYYY-MM-DD>
- **Progress**: 1/<N> subtasks done

## Requirement

<The user's request, constraints, and overall acceptance criteria.>

## Checklist

- [x] 1. Create parent task
- [ ] 2. <Subtask title>
- [ ] <N>. Propose a commit message

## Subtasks

### 1. Create parent task

- **Status**: Done
- **Goal**: Analyze the request and create this task file.
- **Result**: <Key findings: relevant files, conventions, decisions.>

### 2. <Subtask title>

- **Status**: Pending
- **Goal**: <One outcome.>
- **Scope**: <Files / modules / areas to touch.>
- **Steps**: <Short ordered list.>
- **Acceptance**: <How to verify: tests, build, manual check.>
- **Result**: —

### <N>. Propose a commit message

- **Status**: Pending
- **Goal**: Draft a commit message for this task's changes and hand it to the user. Do not commit.
- **Acceptance**: The reply contains a commit message; this subtask created no commit.
- **Result**: —
```

Subtask statuses: `Pending`, `Done`, `Failed`.

## Mode A: create the parent task

This conversation only plans. It does not implement subtask 2 itself.

1. Clarify the requirement if it is ambiguous; explore the codebase enough to
   plan (conventions, affected areas, test/build commands).
2. Split into serial subtasks. Each subtask must:
   - fit comfortably in one isolated context (bounded files, bounded time);
   - depend only on earlier subtasks;
   - have concrete acceptance criteria;
   - leave the project in a working state where practical.
3. Fixed bookends: subtask 1 is **Create parent task** (already `Done` when
   the file is written); the last subtask is **Propose a commit message**
   (draft the message only; never commit).
4. Write the file from the template with status `In progress`.
5. Reply with the file path and the subtask list. Ask the user to **confirm**
   whether to run the remaining subtasks. Stop here — do not launch
   executors, become the orchestrator, or start Mode B until they confirm.
6. After the user confirms (for example yes / confirm / go ahead / continue):
   - If sub-agents are available, become the orchestrator and run the chain.
   - Otherwise reply with the fallback continue prompt.
   If they decline or want changes, stop. Do not start the chain. On a
   redesign request, create a new parent task (new file) rather than silently
   rewriting this one.

## Mode B: run the next subtask

1. Locate the task file: use the one the user named; otherwise list files in
   `.task-divide-and-conquer/` with status `In progress` — use it if there
   is exactly one, else ask.
2. If the status is terminal, report it and stop.
3. Pick the **first** `Pending` subtask. Read the requirement and the
   `Result` of earlier subtasks for context.
4. Execute only that subtask and verify its acceptance criteria.
5. Update the file:
   - subtask `Status: Done`, fill `Result` (what changed, files, anything the
     next subtask must know);
   - tick its checklist box, bump `Progress` and `Updated`.
6. Stop. Do not start the next subtask.
   - Executor: return the short summary to the orchestrator.
   - Fallback: reply with what was done and the continue prompt for a new
     conversation.

### Commit-message subtask (last)

The user decides whether to commit. Do not commit, stage, or push — some host
projects forbid the agent from committing on its own.

1. Review the diff of this task's changes (include the task file unless the
   host project ignores `.task-divide-and-conquer/`).
2. Draft one commit message in the host repo's style. Mark this subtask
   `Done`, the parent `Completed`, and update `Progress`/`Updated`, so the
   task file is final. Put the message in `Result`.
3. Reply with the message and say the user may commit with it if they want.
   The orchestrator relays that message when the executor returns.
4. Stop. If the user does not commit, commits differently, or anything else
   happens, do nothing further.

## Edge cases

### Task design is wrong

Examples: a subtask's premise is false, the order is impossible, the scope is
far larger than planned, or the requirement contradicts the codebase.

1. Do not silently redesign or add subtasks.
2. Mark the current subtask `Failed` with details in `Result`.
3. Set parent `Status: Failed` and `Failure reason`: which subtask, what was
   wrong, and what a redesigned task should change.
4. **Do not revert** local changes already made; list them in the reply.
5. Stop and report. The orchestrator launches no further executors.

Ordinary bugs or failing tests inside a subtask's scope are not design
failures — fix them as part of the subtask.

### User cancels

Set parent `Status: Cancelled` (add the reason if given) and `Updated`. Do not
revert local changes unless the user asks. The orchestrator launches no
further executors.

### File and reality disagree

If the file says `Pending` but the work appears done (e.g. a previous context
ended before updating), verify against the acceptance criteria, then mark it
`Done` with a note instead of redoing it.
