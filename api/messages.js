const { requireAuth, supabaseAdmin } = require("./_auth");
const { PLANS } = require("./_plans");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  let user, profile;
  try {
    ({ user, profile } = await requireAuth(req));
  } catch (e) {
    return res.status(e.status || 401).json({ error: e.message });
  }

  if (!PLANS[profile.plan]?.historyPersist) {
    return res.status(403).json({ error: "History is available on Pro and Premium plans." });
  }

  const conversationId = req.query.conversation_id;
  if (!conversationId) {
    return res.status(400).json({ error: "conversation_id is required" });
  }

  // Verify the conversation belongs to this user (prevents ID enumeration)
  const { data: conv } = await supabaseAdmin
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!conv) {
    return res.status(404).json({ error: "Conversation not found" });
  }

  const { data: msgs, error } = await supabaseAdmin
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) return res.status(500).json({ error: "Failed to load messages" });

  return res.status(200).json(msgs || []);
};
