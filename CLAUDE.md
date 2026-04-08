# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Squinchy is a therapist-style AI support companion with two components:

- **`squinchy-backend/`** — Node.js/Express server that proxies requests to OpenAI
- **`squinchy-frontend/`** — A single static `index.html` file (no build step, no framework)

## Running the Backend

```bash
cd squinchy-backend
node index.js
```

Requires a `.env` file with `OPENAI_API_KEY`. The server defaults to port 3000.

The backend is deployed on Render at `https://squinchy-backend.onrender.com`.

## Frontend

No build process. Open `squinchy-frontend/index.html` directly in a browser, or serve it with any static file server. The frontend hardcodes the Render backend URLs — update `BACKEND_URL` and `REPORT_URL` in the `<script>` block if pointing at a local backend.

## Architecture

### Backend (`squinchy-backend/index.js`)

Two endpoints:

- `POST /api/chat` — accepts `{ message, mode, history[] }`. Builds a system prompt via `buildInstructions(mode)`, prepends conversation history (capped at 20 turns), and calls OpenAI using the **Responses API** (`client.responses.create`), not the Chat Completions API.
- `POST /api/report` — accepts `{ history[] }` and generates a structured plain-text summary report.

Key logic:
- `buildInstructions(mode)` constructs the system prompt for `"vent"` or `"solution"` mode — this is the core AI behavior definition
- `detectDirectRequest(text)` auto-upgrades vent → solution mode when the user explicitly asks for advice/steps/solutions
- `normalizeHistory()` filters and caps history to prevent runaway token usage

### Frontend (`squinchy-frontend/index.html`)

Single-file vanilla JS app. State is kept entirely in memory (no localStorage, no persistence). Key JS variables:
- `mode` — `"vent"` or `"solution"`, toggled by UI buttons
- `history` — array of `{ role, content }` objects sent to backend on each request

The frontend wakes the backend on page load with a silent ping to avoid cold-start delay on Render's free tier.

## OpenAI API Usage

The backend uses the **Responses API** (`client.responses.create`), not `client.chat.completions.create`. The `role: "developer"` message is used instead of `role: "system"` for the instructions. Current model: `gpt-5-mini`.
