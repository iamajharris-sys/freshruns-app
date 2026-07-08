// netlify/functions/confirm-payment.js
//
// After Stripe redirects back with success, the approval page calls this
// to VERIFY the session was actually paid (so nobody can fake ?paid=1),
// then flips the order to 'paid' in Supabase.
//
// Env vars: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_ANON_KEY

const Stripe = require("stripe");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors(), body: "" };
  if (event.httpMethod !== "POST") return resp(405, { error: "Method not allowed" });

  try {
    const { order_id } = JSON.parse(event.body || "{}");
    if (!order_id) return resp(400, { error: "missing order_id" });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

    // Find the most recent paid Checkout session for this order via metadata.
    // (Simple + robust for a beta. For scale, use a Stripe webhook instead.)
    const sessions = await stripe.checkout.sessions.list({ limit: 5 });
    const match = sessions.data.find(
      (s) => s.metadata && s.metadata.order_id === order_id && s.payment_status === "paid"
    );

    if (!match) {
      return resp(402, { paid: false, error: "no paid session found for this order yet" });
    }

    // Mark the order paid in Supabase
    const patch = await fetch(`${SUPABASE_URL}/rest/v1/fr_orders?id=eq.${order_id}`, {
      method: "PATCH",
      headers: { ...sbHeaders(SUPABASE_ANON_KEY), Prefer: "return=representation" },
      body: JSON.stringify({
        status: "paid",
        paid_at: new Date().toISOString(),
        total_charged: (match.amount_total || 0) / 100,
      }),
    });
    const updated = await patch.json();

    return resp(200, { paid: true, order: updated && updated[0] });
  } catch (err) {
    console.error(err);
    return resp(500, { error: err.message || "server error" });
  }
};

function sbHeaders(anon) {
  return { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" };
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
