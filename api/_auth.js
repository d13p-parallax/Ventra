// api/_auth.js
// Shared auth helpers — require()'d by other handlers.
// Underscore prefix prevents Vercel from exposing this as a route.

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

// Service role client — bypasses RLS. Only used server-side.
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Validates Authorization: Bearer <jwt> header.
// Returns { user, profile } on success, throws on failure.
async function requireAuth(req) {
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    const err = new Error("No token");
    err.status = 401;
    throw err;
  }

  // Verify JWT against Supabase Auth (handles expiry, revocation, key rotation)
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) {
    const err = new Error("Invalid or expired token");
    err.status = 401;
    throw err;
  }

  const { data: profile, error: profileErr } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profileErr || !profile) {
    if (profileErr) console.error("[auth] profile select error:", profileErr.message, profileErr.code);
    const { data: newProfile, error: insertErr } = await supabaseAdmin
      .from("profiles")
      .upsert({ id: user.id, plan: "basic" }, { onConflict: "id" })
      .select("*")
      .single();
    if (insertErr || !newProfile) {
      console.error("[auth] profile upsert error:", insertErr?.message, insertErr?.code, insertErr?.details);
      const err = new Error(`Profile upsert failed: ${insertErr?.message || "no data returned"}`);
      err.status = 403;
      throw err;
    }
    return { user, profile: newProfile };
  }

  return { user, profile };
}

// Checks and increments today's usage for a logged-in user.
// Throws a 429 error if the plan cap is exceeded.
// Returns the new count after incrementing.
async function checkAndIncrementUsage(userId, plan, PLANS) {
  const planConfig = PLANS[plan];
  const cap = planConfig?.dailyMessages ?? null;

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC

  const { data: usageRow } = await supabaseAdmin
    .from("usage")
    .select("message_count")
    .eq("user_id", userId)
    .eq("day", today)
    .maybeSingle();

  const currentCount = usageRow?.message_count ?? 0;

  if (cap !== null && currentCount >= cap) {
    const err = new Error(`Daily limit of ${cap} messages reached`);
    err.status = 429;
    err.limitReached = true;
    err.cap = cap;
    err.currentCount = currentCount;
    throw err;
  }

  await supabaseAdmin.from("usage").upsert(
    { user_id: userId, day: today, message_count: currentCount + 1 },
    { onConflict: "user_id,day" }
  );

  return currentCount + 1;
}

module.exports = { requireAuth, checkAndIncrementUsage, supabaseAdmin };
