// api/_plans.js
// Single source of truth for plan limits and feature flags.
// The underscore prefix prevents Vercel from exposing this as a route.
// Keep the PLANS const in index.html in sync with this file.

const PLANS = {
  anonymous: {
    label:          "Trial",
    sessionCap:     5,          // total messages per browser session, no account
    dailyMessages:  null,       // n/a for anonymous
    modes:          ["vent"],
    historyPersist: false,
    reports:        false,
  },
  basic: {
    label:          "Basic",
    sessionCap:     null,
    dailyMessages:  10,         // messages per UTC day
    modes:          ["vent"],
    historyPersist: false,
    reports:        false,
  },
  pro: {
    label:          "Pro",
    priceMonthly:   "$10/mo",   // display only — set real price in Stripe dashboard
    stripePriceId:  process.env.STRIPE_PRICE_PRO || "price_PRO_PLACEHOLDER",
    sessionCap:     null,
    dailyMessages:  100,
    modes:          ["vent", "solution"],
    historyPersist: true,
    reports:        true,
  },
  premium: {
    label:          "Premium",
    priceMonthly:   "$20/mo",   // display only
    stripePriceId:  process.env.STRIPE_PRICE_PREMIUM || "price_PREM_PLACEHOLDER",
    sessionCap:     null,
    dailyMessages:  null,       // null = unlimited
    modes:          ["vent", "solution"],
    historyPersist: true,
    reports:        true,
  },
};

module.exports = { PLANS };
