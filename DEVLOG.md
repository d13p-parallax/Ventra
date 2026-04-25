# Ventra Devlog

A running log of building Ventra — a therapist-style AI support companion. Built with Claude Code (claude-sonnet-4-6) as an experiment in AI-assisted product development.

---

## 2026-04-24 — Auth, payments, and persistence

### What Ventra is
A support companion where users can vent or get solution-oriented help from an AI. Two modes: Vent (emotional support, no advice) and Solution (actionable steps). Therapist-style tone, hard word caps, anti-loop rules.

### Stack
- **Frontend:** Single-file vanilla JS (`index.html`) — no framework, no build step
- **Backend:** Vercel serverless functions (`api/*.js`)
- **AI:** OpenAI Responses API (`client.responses.create`) with `gpt-5-mini`
- **Auth + DB:** Supabase (email/password, profiles/usage/conversations/messages/subscriptions tables)
- **Payments:** Stripe (checkout, billing portal, webhooks)
- **Hosting:** Vercel

### Features shipped
- **3-tier subscription system** — Basic (free, 10 msg/day), Pro ($10/mo, 100 msg/day, history), Premium ($20/mo, unlimited, history + reports)
- **Supabase auth** — email/password sign in/up, JWT validation server-side via service role key
- **Daily usage tracking** — per-user per-day message count in `usage` table, enforced server-side
- **Chat history persistence** — Pro/Premium conversations and messages saved to Supabase, loadable from sidebar
- **Stripe checkout + webhooks** — checkout sessions, webhook handler syncs `subscriptions` table on payment events
- **Billing portal** — Stripe customer portal for plan management
- **Admin bypass** — hardcoded admin email gets premium plan server-side without Stripe
- **Streaming responses** — token-by-token typewriter effect on AI replies
- **Sidebar** — conversation history list, new chat button, user badge with plan chip

### Key decisions
- **Responses API not Chat Completions** — uses `client.responses.create` with `role: "developer"` instructions
- **Service role key only on backend** — frontend uses anon key, all sensitive ops go through `api/` routes
- **Admin bypass in `_auth.js`** — applies to all routes, not just chat

---

## 2026-04-25 — Debugging session: production broke after env var reorganisation

### Problems & fixes

**Problem 1: 403 "permission denied for table profiles"**
After reorganising Vercel env vars (deleting and re-adding), all `/api/chat` calls returned 403.

Root cause (two compounding issues):

**1. dotenv v17 stripping env vars** — `dotenv` v17 in `package.json` is actually `@dotenvx/dotenvx` rebranded. On Vercel, it was interfering with native env var injection, stripping `SUPABASE_SERVICE_ROLE_KEY` before the Supabase client initialised. The client fell back to anon-level access. Removed `require("dotenv").config()` from all 9 API files and removed `dotenv` from `package.json`. Vercel (and `vercel dev` locally) injects env vars natively — dotenv was never needed.

**2. Missing GRANT on Supabase tables** — Even with the correct service role key, the `profiles` table (and others) lacked explicit PostgreSQL GRANTs for the `service_role` role. Fixed by running in Supabase SQL Editor:
```sql
GRANT ALL ON TABLE public.profiles TO service_role;
GRANT ALL ON TABLE public.usage TO service_role;
GRANT ALL ON TABLE public.conversations TO service_role;
GRANT ALL ON TABLE public.messages TO service_role;
GRANT ALL ON TABLE public.subscriptions TO service_role;
```

**Problem 2: Sidebar not showing saved conversations**
Messages were saving to the DB correctly but the sidebar showed "Your chats will appear here." always.

Root cause: Admin bypass only existed in `chat.js`. All other routes (`conversations.js`, `usage.js`, etc.) returned the raw DB profile which had `plan: "basic"`. `conversations.js` checked `historyPersist` → false for basic → returned `[]`. Sidebar saw empty array and never updated.

Fix: Moved admin bypass into `_auth.js` so it applies to every route. Also added `loadConversationList()` call in the frontend after the first message of a new session creates a conversation.

**Problem 3: `const` reassignment causing TypeError → 401**
Moving the bypass to `_auth.js` introduced `profile = { ...profile, plan: "premium" }` where `profile` was a `const` (from destructuring). Node threw `TypeError: Assignment to constant variable`, caught as 401 on every admin request.

Fix: Used a new variable `finalProfile` instead of reassigning.

**Problem 4: AI revealing it's built on OpenAI**
System prompt didn't explicitly prevent identity disclosure. Added to `buildInstructions()`:
```
IDENTITY (non-negotiable):
- You are Ventra. Never say you are built by OpenAI, that you are ChatGPT, or that you are a large language model.
- If asked who made you or how you work, say you are Ventra, a support companion, and nothing more.
```

**Problem 5: "Manage Plan" button showing for admin users**
Admin accounts get premium via bypass — no Stripe subscription exists. Portal returned "No active subscription found." Updated `usage.js` to return `hasSubscription` flag (checks `subscriptions` table). Frontend now only shows "Manage Plan" if `hasSubscription` is true.
