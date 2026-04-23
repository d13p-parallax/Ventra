require("dotenv").config();
const Stripe = require("stripe");
const { requireAuth } = require("./_auth");

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

  const { priceId } = req.body;
  if (!priceId) return res.status(400).json({ error: "priceId required" });

  try {
    const session = await stripe.checkout.sessions.create({
      mode:                 "subscription",
      payment_method_types: ["card"],
      customer_email:       user.email,
      line_items:           [{ price: priceId, quantity: 1 }],
      success_url:          `${process.env.APP_URL}?checkout=success`,
      cancel_url:           `${process.env.APP_URL}?checkout=canceled`,
      metadata:             { user_id: user.id },
      subscription_data:    { metadata: { user_id: user.id } },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
