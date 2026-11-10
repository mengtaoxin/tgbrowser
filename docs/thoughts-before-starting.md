# Thoughts Before Starting

## Why

This project exists to run a browser service in an isolated environment.

Early product intent (pre-implementation). For the live stack and API contract, prefer [tech-stack.md](./tech-stack.md) and [api-design-browserless-style.md](./api-design-browserless-style.md).

## Goals

- **Self-hosted** — run and operate the stack ourselves; no reliance on a hosted browser SaaS as the core path.
- **Prefer mature solutions** — adopt proven tools and patterns rather than inventing a custom browser stack from scratch.

## Core Features

| Feature | Intent |
| --- | --- |
| **Docker-hosted** | Package and run the browser service in containers for isolation and reproducibility. |
| **Chrome ecosystem** | Build on Chromium/Chrome (DevTools Protocol, extensions, profiles) rather than a non-Chrome engine. |
| **HITL** | Human-in-the-loop: allow a person to intervene when automation needs judgment, login, or CAPTCHA handling. |
| **Stealth** | Reduce automation fingerprints so the browser looks closer to a normal user session. |
| **Saved profile** | Persist browser profiles (cookies, storage, extensions, settings) across runs. |
