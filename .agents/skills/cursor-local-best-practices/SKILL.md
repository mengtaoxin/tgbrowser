---
name: cursor-local-best-practices
description: >-
  Use for local Cursor port and session hygiene: free occupied ports on
  EADDRINUSE, close ports this chat opened before ending, only check
  concurrent chats when starting or stopping servers, and leave commits and
  other chats' working-tree changes alone. Use when hitting EADDRINUSE /
  port-in-use, starting or stopping a local server, finishing a conversation
  that opened ports or changed files, or when the user asks for local session /
  port hygiene.
license: MIT
metadata:
  author: mengtaoxin
  version: "1.5.0"
---

# Cursor local best practices

Apply when the agent runs in a **local** Cursor environment (same machine and
workspace as the user). Goal: leave ports free for the next chat or the user’s
own debugging.

## When to apply

Apply this skill only when one of these is true:

- Binding or freeing a **port** (dev server, preview, proxy, tunnel)
- Hitting **`EADDRINUSE`** / “port already in use”
- **Ending** a conversation that opened ports in this chat
- **Finishing** a conversation that changed files (only the
  **Finishing — commits and other chats' changes** section below)
- The user **explicitly** asks for local session / port hygiene

The port rules do **not** apply to ordinary code edits, reviews, Q&A, docs, or
tests that do not start a long-lived listener.

## Rules

1. **Before starting or stopping a server** (or other long-lived port binder),
   check whether another in-repo chat is already running a server that would
   collide. If so, coordinate — do not blindly start a second listener on the
   same port.
2. **During the conversation**, if a port this chat needs is occupied, free it
   carefully (see below); prefer not to kill the user’s intentional servers.
3. **Before the conversation ends**, close ports that **this chat** opened,
   unless the user asked to leave them running.

## Before starting a server — light concurrency check

Do this only when about to start a **dev server, preview, proxy, or other
long-lived port binder** — not before every edit.

1. Identify the current workspace / repo root.
2. Check project `terminals` metadata (and similar) for an **active** command
   in this repo that already holds the target port or the same kind of server.
   Ignore idle/historical terminals and finished chats.
3. If the port / server is free → proceed.
4. If another chat (or the user) already holds it:
   - Tell the user about the conflict.
   - Prefer reusing that server, or ask whether to stop it — do **not** enter a
     multi-minute wait loop, and do **not** abort the whole conversation for
     unrelated edits.

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

Track every port **this conversation** successfully opens (dev servers,
preview, proxies, one-off listeners).

## Before ending — close ports this chat opened

Before the final reply / handoff for this conversation (when this chat opened
ports, or the user asked for cleanup):

1. Shut down each server this chat started that still holds a port (dev
   servers, watchers, tunnels, etc.). Pick a stop method that fits how that
   process was started and what this environment actually provides — the same
   session, the project's own stop path, or another method that works. Do not
   require one specific command; projects and machines vary, and a named tool
   may not exist.
2. Confirm those ports are free, without assuming a particular command.
3. Do **not** stop unrelated user processes or servers started outside this
   chat, unless the user confirmed freeing that port.

If the user asked to leave a server running, say so and leave it; otherwise
default to closing ports opened here.

## Finishing — commits and other chats' changes

Other chats and the user often edit the same working tree in parallel, and the
user commits. Unless the user or the host project's workflow asks otherwise:

- Do not commit, offer to commit, or report commit state.
- Do not run `git status` / `git diff` to review the tree at the end, and do not
  inspect or comment on changes this chat did not make.
