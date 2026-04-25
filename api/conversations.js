require("dotenv").config();
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
    return res.status(200).json([]);
  }

  const { data: convs, error } = await supabaseAdmin
    .from("conversations")
    .select("id, mode, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error || !convs?.length) return res.status(200).json([]);

  const convIds = convs.map(c => c.id);
  const { data: msgs } = await supabaseAdmin
    .from("messages")
    .select("conversation_id, content")
    .in("conversation_id", convIds)
    .eq("role", "user")
    .order("created_at", { ascending: true });

  const previewMap = {};
  (msgs || []).forEach(m => {
    if (!previewMap[m.conversation_id]) {
      previewMap[m.conversation_id] = m.content.slice(0, 60);
    }
  });

  return res.status(200).json(
    convs.map(c => ({
      id:         c.id,
      mode:       c.mode,
      created_at: c.created_at,
      preview:    previewMap[c.id] || "New conversation",
    }))
  );
};
