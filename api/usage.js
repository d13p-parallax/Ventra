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

  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabaseAdmin
    .from("usage")
    .select("message_count")
    .eq("user_id", user.id)
    .eq("day", today)
    .maybeSingle();

  const dayCount = data?.message_count ?? 0;
  const cap = PLANS[profile.plan]?.dailyMessages ?? null;

  return res.status(200).json({ dayCount, cap });
};
