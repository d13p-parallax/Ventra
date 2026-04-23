require("dotenv").config();
const Stripe = require("stripe");
const { requireAuth, supabaseAdmin } = require("./_auth");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  let user;
  try {
    const result = await requireAuth(req);
    user = result.user;
  } catch (e) {
    return res.status(e.status || 401).json({ error: e.message });
  }

  try {
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!sub?.stripe_customer_id) {
      return res.status(404).json({ error: "No active subscription found." });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer:   sub.stripe_customer_id,
      return_url: process.env.APP_URL,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
