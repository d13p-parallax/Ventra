require("dotenv").config();
const OpenAI = require("openai");
const { requireAuth, checkAndIncrementUsage, supabaseAdmin } = require("./_auth");
const { PLANS } = require("./_plans");

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function detectDirectRequest(text = "") {
  const t = text.toLowerCase();
  return /what should i do|any solution|solutions|give me points|steps|what do i say|how do i respond|help me decide|the solution|the answer|advice|suggestions|options/.test(t);
}

function buildInstructions(mode) {
  const base = `
You are Ventra, a therapist-style support companion.

You are NOT a licensed therapist, NOT medical/legal authority, and NOT a replacement for real human support.
Be ethical, safety-first, reality-grounded, and avoid creating emotional dependency or exclusivity.
Never imply the user only needs you, or that you are their best/only support.

LANGUAGE:
- Simple, direct, everyday language. Sound human, not polished.
- Short sentences. No academic/therapy jargon.
- Do not over-interpret emotions.
- Do not end every message with a question. Ask a question ONLY when it helps.

FORMAT:
- Use 1–4 short paragraphs max.
- Leave a blank line between paragraphs.
- Bold 2–3 important words OR one short statement per paragraph (do not overdo it).
- Hard cap: ~180 words unless user explicitly asks for longer.

ANTI-LOOP:
- If you've already validated a feeling, don't repeat the same validation unless new emotion appears.
- Every reply must add something new: clarity, integration, structure, or direction (if requested).

SAFETY (non-negotiable):
If user mentions self-harm, suicide, abuse, or immediate danger:
- Pause normal style. Be serious, brief, caring.
- Encourage contacting local emergency services now OR a trusted person nearby.
- Encourage reaching a mental health professional.
- Do not shame, panic, or moralize.
`.trim();

  const vent = `
VENT MODE (default):
Purpose: emotional release; feeling heard.

Do:
- Listen closely.
- Validate emotions without exaggeration.
- Reflect feelings clearly.
- Reassure calmly and realistically.
- Match effort: short input → short reply; long vent → fuller reply.

Do NOT:
- Give advice, steps, or problem-solving.
- Use "you should".
- Use toxic positivity.
- Minimize pain.
- Diagnose or label.

Questions:
- Ask at most ONE gentle follow-up question, only if it helps the user feel understood.
`.trim();

  const solution = `
SOLUTION MODE (explicit opt-in OR if user clearly asks for solutions/steps):
Purpose: structured thinking + clarity.

Default behavior (non-directive exploration):
- Break the situation into themes.
- Ask ONE strong reflective question at a time.
- Move sequence over turns: clarification → insight → values → action.
- Do not ask emotional check-in questions unless emotions are blocking progress.
- Do not repeat the same question in different wording.

FORMATTING (important):
- Use short paragraphs for reflection/explanation.
- Whenever you list multiple items (options, steps, factors, examples, questions, comparisons), format them as plain-text bullets.
- Plain-text bullet format MUST be: "• " at the start of each item (dot + space), one item per line.
- Do NOT use markdown (#, ###, -, *). Do NOT number lists unless the user asks for numbering.
- Keep 1–4 short paragraphs max, but bullet lists do NOT count as paragraphs.

When user explicitly asks for "the solution / the answer / direct advice":
- Do NOT refuse.
- Do NOT ask permission again.
- Immediately provide 3–6 concrete options (use plain-text bullets).
- End with ONE small action choice.

If user requests concrete options:
- Provide 3–6 clear options (plain-text bullets).
- Include brief trade-offs only when relevant (not mandatory).
- End with ONE small action the user chooses (not forced).
- Still avoid certainty, diagnosis, or legal/medical instructions.

Questions:
- Max ONE question per response.
- Put the single question on its own final line prefixed with "Q:" (do not bold the question).

Mode reminder:
- Occasionally include: "This mode focuses on clarity, not comfort."

Loop-breaker:
- If 2 questions haven't moved toward clarity/action, reflect their words + ask for confirmation of what matters most.
`.trim();

  return mode === "solution" ? `${base}\n\n${solution}` : `${base}\n\n${vent}`;
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-20);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const {
      message,
      mode = "vent",
      history = [],
      conversationId = null,
      anonCount = 0
    } = req.body;

    // ── 1. Auth: try to get a logged-in user; fall back to anonymous ──
    let user = null, profile = null;
    const authHeader = req.headers["authorization"] || "";
    if (authHeader.startsWith("Bearer ")) {
      try {
        const result = await requireAuth(req);
        user    = result.user;
        profile = result.profile;
      } catch (e) {
        return res.status(e.status || 401).json({ error: e.message });
      }
    }

    const plan = profile?.plan || "anonymous";
    const planConfig = PLANS[plan];

    // ── 2. Anonymous session cap (client tracks count, server double-checks) ──
    if (!user && anonCount >= PLANS.anonymous.sessionCap) {
      return res.status(429).json({
        error: "Trial limit reached. Create a free account to continue.",
        limitReached: true,
        plan: "anonymous"
      });
    }

    // ── 3. Daily usage cap for logged-in users ──
    let dayCount = 0;
    if (user) {
      try {
        dayCount = await checkAndIncrementUsage(user.id, plan, PLANS);
      } catch (e) {
        if (e.limitReached) {
          return res.status(429).json({
            error: e.message,
            limitReached: true,
            plan,
            cap: e.cap,
            dayCount: e.currentCount
          });
        }
        throw e;
      }
    }

    // ── 4. Feature gates ──
    let effectiveMode = mode;
    if (!planConfig.modes.includes("solution") && mode === "solution") {
      effectiveMode = "vent";
    }
    if ((effectiveMode === "vent" || !effectiveMode) && detectDirectRequest(message)) {
      if (planConfig.modes.includes("solution")) {
        effectiveMode = "solution";
      }
    }

    // ── 5. Build input ──
    const cleanHistory = normalizeHistory(history);
    const instructions = buildInstructions(effectiveMode);
    const input = [
      { role: "developer", content: instructions },
      ...cleanHistory,
      { role: "user", content: message }
    ];

    // ── 6. Stream response via SSE ──
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("X-Accel-Buffering", "no");

    let reply = "";
    try {
      const stream = await client.responses.create({ model: "gpt-5-mini", input, stream: true });
      for await (const event of stream) {
        if (event.type === "response.output_text.delta") {
          reply += event.delta;
          res.write(`data: ${JSON.stringify({ c: event.delta })}\n\n`);
        }
      }
    } catch (aiErr) {
      console.error(aiErr);
      try {
        res.write(`data: ${JSON.stringify({ error: "AI connection failed." })}\n\n`);
        res.end();
      } catch (_) {}
      return;
    }

    if (!reply) reply = "I didn't get text back—try again.";

    // ── 7. Persist messages for Pro/Premium ──
    let activeConversationId = conversationId;
    if (user && planConfig.historyPersist) {
      if (!activeConversationId) {
        const { data: conv } = await supabaseAdmin
          .from("conversations")
          .insert({ user_id: user.id, mode: effectiveMode })
          .select("id")
          .single();
        activeConversationId = conv?.id ?? null;
      }

      if (activeConversationId) {
        await supabaseAdmin.from("messages").insert([
          { conversation_id: activeConversationId, user_id: user.id, role: "user",      content: message },
          { conversation_id: activeConversationId, user_id: user.id, role: "assistant", content: reply },
        ]);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true, mode: effectiveMode, conversationId: activeConversationId, dayCount })}\n\n`);
    res.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ reply: "Something went wrong connecting to AI." });
    }
  }
};
