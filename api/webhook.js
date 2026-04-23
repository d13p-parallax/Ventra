require("dotenv").config();
const Stripe = require("stripe");
const { supabaseAdmin } = require("./_auth");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Map Stripe price IDs → plan names
function priceIdToPlan(priceId) {
  if (priceId === process.env.STRIPE_PRICE_PRO)     return "pro";
  if (priceId === process.env.STRIPE_PRICE_PREMIUM) return "premium";
  return "basic";
}

// Vercel: disable body parsing so we can verify the raw Stripe signature
module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  // Collect raw body
  const rawBody = await new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => (data += chunk));
    req.on("end",  () => resolve(Buffer.from(data)));
    req.on("error", reject);
  });

  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature error:", err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  const data = event.data.object;

  async function syncSubscription(subscription) {
    const userId = subscription.metadata?.user_id;
    if (!userId) return;

    const priceId = subscription.items?.data[0]?.price?.id;
    const plan    = priceIdToPlan(priceId);
    const status  = subscription.status;
    const periodEnd = new Date(subscription.current_period_end * 1000).toISOString();

    await supabaseAdmin.from("subscriptions").upsert(
      {
        user_id:                userId,
        stripe_customer_id:     subscription.customer,
        stripe_subscription_id: subscription.id,
        stripe_price_id:        priceId,
        status,
        plan,
        current_period_end:     periodEnd,
        updated_at:             new Date().toISOString(),
      },
      { onConflict: "stripe_subscription_id" }
    );

    // Update profiles.plan — active/trialing → plan, anything else → basic
    const activePlan = (status === "active" || status === "trialing") ? plan : "basic";
    await supabaseAdmin.from("profiles").update({ plan: activePlan }).eq("id", userId);
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await syncSubscription(data);
        break;

      case "customer.subscription.deleted": {
        const userId = data.metadata?.user_id;
        if (userId) {
          await supabaseAdmin.from("profiles").update({ plan: "basic" }).eq("id", userId);
          await supabaseAdmin.from("subscriptions")
            .update({ status: "canceled", updated_at: new Date().toISOString() })
            .eq("stripe_subscription_id", data.id);
        }
        break;
      }

      case "invoice.payment_failed": {
        const subId = data.subscription;
        if (subId) {
          await supabaseAdmin.from("subscriptions")
            .update({ status: "past_due", updated_at: new Date().toISOString() })
            .eq("stripe_subscription_id", subId);
        }
        break;
      }
    }
  } catch (err) {
    console.error("Webhook handler error:", err);
    return res.status(500).json({ error: "Handler error" });
  }

  res.json({ received: true });
};

module.exports.config = { api: { bodyParser: false } };
