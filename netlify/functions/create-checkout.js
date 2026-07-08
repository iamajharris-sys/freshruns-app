// netlify/functions/create-checkout.js
//
// Creates a Stripe Checkout Session for a Fresh Runs order.
// The amount is looked up SERVER-SIDE from Supabase so the client can't
// tamper with what gets charged. Returns a Checkout URL to redirect to.
//
// Env vars required (set in Netlify → Site settings → Environment variables):
//   STRIPE_SECRET_KEY   = sk_test_...   (your Stripe secret key — NEVER in client code)
//   SUPABASE_URL        = https://ivxrocsvjlxtlidqnion.supabase.co
//   SUPABASE_ANON_KEY   = eyJ...        (anon key is fine here)
//   SITE_URL            = https://<your-netlify-site>.netlify.app  (for redirect back)

const Stripe = require("stripe");

exports.handler = async (event) => {
  // CORS / method guard
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors(), body: "" };
  }
  if (event.httpMethod !== "POST") {
    return resp(405, { error: "Method not allowed" });
  }

  try {
    const { order_id } = JSON.parse(event.body || "{}");
    if (!order_id) return resp(400, { error: "missing order_id" });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
    const SITE_URL = process.env.SITE_URL || "";
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

    // 1) Look up the order total SERVER-SIDE (source of truth = the shopper's entered prices)
    const orderRes = await fetch(
      `${SUPABASE_URL}/rest/v1/fr_orders?id=eq.${order_id}&select=*`,
      { headers: sbHeaders(SUPABASE_ANON_KEY) }
    );
    const orders = await orderRes.json();
    const order = orders && orders[0];
    if (!order) return resp(404, { error: "order not found" });

    // must be awaiting approval, with a computed total
    if (order.status !== "awaiting_approval") {
      return resp(409, { error: `order not ready to pay (status: ${order.status})` });
    }
    const total = Number(order.total_charged);
    if (!total || total <= 0) return resp(400, { error: "order has no total to charge" });

    // 2) Create a Checkout Session for the EXACT total (single line item).
    //    Apple Pay & Google Pay appear automatically on the hosted page.
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Fresh Runs grocery order",
              description: `Order ${order_id.slice(0, 8)} · groceries + delivery`,
            },
            unit_amount: Math.round(total * 100), // cents
          },
          quantity: 1,
        },
      ],
      metadata: { order_id },
      success_url: `${SITE_URL}/approve.html?o=${order_id}&paid=1`,
      cancel_url: `${SITE_URL}/approve.html?o=${order_id}`,
    });

    return resp(200, { url: session.url, id: session.id });
  } catch (err) {
    console.error(err);
    return resp(500, { error: err.message || "server error" });
  }
};

function sbHeaders(anon) {
  return {
    apikey: anon,
    Authorization: `Bearer ${anon}`,
    "Content-Type": "application/json",
  };
}
function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
function resp(statusCode, body) {
  return { statusCode, headers: { ...cors(), "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
