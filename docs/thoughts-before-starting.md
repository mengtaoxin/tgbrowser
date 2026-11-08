# Thoughts Before Starting

## Why

This project exists to run a browser service in an isolated environment.

No technology choices have been made yet. This document captures intent and constraints before implementation begins.

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
