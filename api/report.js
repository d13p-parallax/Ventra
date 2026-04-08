require("dotenv").config();
const OpenAI = require("openai");

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-20);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const { history = [] } = req.body;
    const cleanHistory = normalizeHistory(history);

    const reportPrompt = `
Generate a structured SUMMARY REPORT of the conversation.

OUTPUT RULES (must follow exactly):
- Output MUST be plain text (no markdown).
- Do NOT use #, ###, or markdown.
- Use section titles in ALL CAPS followed by a colon.
- Use bullets starting with "• " (dot + space).
- No paragraphs longer than 2 lines.
- No advice, no steps, no diagnosis.
- Calm, neutral, grounded tone.

Include EXACTLY these sections, in this order:

WHAT THEY'RE DEALING WITH:
• 1–2 concise bullets only

KEY EMOTIONS:
• Bulleted list

REPEATING THEMES:
• Bulleted list

REFLECTIVE QUESTIONS:
• 1–3 bullets phrased as questions

CLOSING:
• One calm, supportive sentence only
`.trim();

    const input = [
      { role: "developer", content: reportPrompt },
      ...cleanHistory
    ];

    const response = await client.responses.create({ model: "gpt-5-mini", input });
    const report = response.output_text || "No report text returned—try again.";
    res.json({ report });
  } catch (err) {
    console.error(err);
    res.status(500).json({ report: "Something went wrong generating the report." });
  }
};
