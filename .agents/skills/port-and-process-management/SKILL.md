---
name: port-and-process-management
description: >-
  Local port and long-lived process hygiene: free occupied ports on
  EADDRINUSE carefully, stop servers and background processes this chat
  started before ending, and check concurrent chats only when starting or
  stopping listeners. Use when hitting EADDRINUSE / port-in-use, starting or
  stopping a local server, watcher, proxy, tunnel, or other long-lived
  process, finishing a conversation that opened ports or background jobs, or
  when the user asks for port / process cleanup.
license: MIT
metadata:
  author: mengtaoxin
  version: "1.0.0"
---

# Port and process management

Apply when the agent runs in a **local** environment (same machine and
workspace as the user) and needs a **port** or other **long-lived process**.
Goal: leave ports free and processes stopped for the next chat or the user’s
own debugging.

## When to apply

Apply this skill only when one of these is true:

- Binding or freeing a **port** (dev server, preview, proxy, tunnel)
- Starting or stopping a **long-lived process** that may not bind a port
  (file watchers, background jobs, queues, one-off daemons this chat started)
- Hitting **`EADDRINUSE`** / “port already in use”
- **Ending** a conversation that opened ports or long-lived processes here
- The user **explicitly** asks for port / process cleanup

Do **not** apply to ordinary code edits, reviews, Q&A, docs, or tests that do
not start a long-lived listener or background process.

## Rules

1. **Before starting or stopping** a server or other long-lived process that
   binds a port (or would collide with one already running), check whether
   another in-repo chat is already running something that would collide. If
   so, coordinate — do not blindly start a second listener on the same port.
2. **During the conversation**, if a port this chat needs is occupied, free it
   carefully (see below); prefer not to kill the user’s intentional servers.
3. **Before the conversation ends**, stop ports and long-lived processes that
   **this chat** started, unless the user asked to leave them running.

## Before starting — light concurrency check

Do this only when about to start a **dev server, preview, proxy, watcher, or
other long-lived process** — not before every edit.

1. Identify the current workspace / repo root.
2. Check project `terminals` metadata (and similar) for an **active** command
   in this repo that already holds the target port or the same kind of
   process. Ignore idle/historical terminals and finished chats.
3. If the port / process is free → proceed.
4. If another chat (or the user) already holds it:
   - Tell the user about the conflict.
   - Prefer reusing that server/process, or ask whether to stop it — do
     **not** enter a multi-minute wait loop, and do **not** abort the whole
     conversation for unrelated edits.

## During the conversation — occupied ports

When binding a port fails (e.g. `EADDRINUSE`, “port already in use”) or a needed
port is already taken:

1. Identify what is holding the port from what this chat and the environment
   already show (the session that started it, project tooling, or another
   method that works here). Do not require a particular command.
2. If the holder was **started by this chat** → stop it in a way that fits how
   it was started, then retry.
3. If the holder looks like the **user’s** or **another chat’s** intentional
   server → tell the user; stop it only if they confirm, or if they already
   asked you to free that port. Prefer a graceful stop when practical.
4. Do not leave the conflict unresolved and switch to a random alternate port
   unless the user or project config requires a different port.

Track every port and long-lived process **this conversation** successfully
starts (dev servers, preview, proxies, watchers, tunnels, background jobs).

## Before ending — close what this chat opened

Before the final reply / handoff for this conversation (when this chat opened
ports or long-lived processes, or the user asked for cleanup):

1. Shut down each server or long-lived process this chat started that is still
   running (dev servers, watchers, tunnels, background jobs, etc.). Pick a
   stop method that fits how that process was started and what this
   environment actually provides — the same session, the project's own stop
   path, or another method that works. Do not require one specific command;
   projects and machines vary, and a named tool may not exist.
2. Confirm tracked ports are free and those processes are stopped, without
   assuming a particular command.
3. Do **not** stop unrelated user processes or servers started outside this
   chat, unless the user confirmed freeing that port / stopping that process.

If the user asked to leave a server or process running, say so and leave it;
otherwise default to closing what this chat opened.
