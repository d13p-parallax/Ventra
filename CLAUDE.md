# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ventra is a therapist-style AI support companion. It is a monorepo deployed as a single Vercel project.

- **`index.html`** — Single-file vanilla JS frontend (no build step, no framework)
- **`api/chat.js`** — Vercel serverless handler for `POST /api/chat`
- **`api/report.js`** — Vercel serverless handler for `POST /api/report`

## Running Locally

Vercel CLI is the easiest way to run both frontend and API routes together:

```bash
npx vercel dev
```

Requires a `.env` file with `OPENAI_API_KEY`.

## Deployment

Deployed on Vercel from the `d13p-parallax/Ventra` GitHub repo. No separate backend project needed — Vercel serves `index.html` as the frontend and `api/*.js` files as serverless functions automatically.

Environment variables required in Vercel:
- `OPENAI_API_KEY`

## Architecture

### API Routes

- `POST /api/chat` — accepts `{ message, mode, history[] }`. Builds a system prompt via `buildInstructions(mode)`, prepends conversation history (capped at 20 turns), and calls OpenAI using the **Responses API** (`client.responses.create`), not the Chat Completions API.
- `POST /api/report` — accepts `{ history[] }` and generates a structured plain-text summary report.

Key logic in `api/chat.js`:
- `buildInstructions(mode)` constructs the system prompt for `"vent"` or `"solution"` mode
- `detectDirectRequest(text)` auto-upgrades vent → solution mode when the user explicitly asks for advice/steps/solutions
- `normalizeHistory()` filters and caps history to prevent runaway token usage

### Frontend (`index.html`)

Single-file vanilla JS app. State is kept entirely in memory (no localStorage, no persistence). Key JS variables:
- `mode` — `"vent"` or `"solution"`, toggled by UI buttons
- `history` — array of `{ role, content }` objects sent to backend on each request

API calls use relative URLs (`/api/chat`, `/api/report`) — no hardcoded domain needed.

## OpenAI API Usage

Uses the **Responses API** (`client.responses.create`), not `client.chat.completions.create`. The `role: "developer"` message is used instead of `role: "system"` for instructions. Current model: `gpt-5-mini`.
