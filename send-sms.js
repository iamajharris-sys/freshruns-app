// netlify/functions/send-sms.js
//
// Texts the customer their approval + pay link when the shopper requests approval.
// Also usable for other transactional texts (order received, on the way, delivered).
//
// Env vars required (Netlify → Site settings → Environment variables):
//   TWILIO_ACCOUNT_SID   = ACxxxx…
//   TWILIO_AUTH_TOKEN    = your auth token   (SECRET — check "Contains secret values")
//   TWILIO_FROM          = +1XXXXXXXXXX      (your Twilio number, E.164 format)
//   SITE_URL             = https://freshruns.netlify.app
//   SUPABASE_URL, SUPABASE_ANON_KEY  (to look up the order)

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors(), body: "" };
  if (event.httpMethod !== "POST") return resp(405, { error: "Method not allowed" });

  try {
    const { order_id, kind } = JSON.parse(event.body || "{}");
    if (!order_id) return resp(400, { error: "missing order_id" });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
    const SITE_URL = process.env.SITE_URL || "";
    const SID = process.env.TWILIO_ACCOUNT_SID;
    const TOKEN = process.env.TWILIO_AUTH_TOKEN;
    const FROM = process.env.TWILIO_FROM;

    if (!SID || !TOKEN || !FROM) {
      return resp(500, { error: "twilio env vars not set (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM)" });
    }

    // Look up the order to get phone + total
    const r = await fetch(`${SUPABASE_URL}/rest/v1/fr_orders?id=eq.${order_id}&select=*`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    const rows = await r.json();
    const order = rows && rows[0];
    if (!order) return resp(404, { error: "order not found" });

    const phone = normalizePhone(order.phone);
    if (!phone) return resp(400, { error: "order has no valid phone number" });

    const name = (order.customer_name || "").split(" ")[0] || "there";
    const total = Number(order.total_charged || 0).toFixed(2);
    const link = `${SITE_URL}/approve.html?o=${order_id}`;

    // message templates
    let body;
    if (kind === "received") {
      body = `fresh runs: hi ${name}! got your order — your neighbor's shopping it now. we'll text you to approve the total before checkout. 🛒`;
    } else if (kind === "delivered") {
      body = `fresh runs: delivered! 🎉 thanks ${name} — enjoy. reply with any issues and we'll make it right.`;
    } else {
      // default: ready to approve/pay
      body = `fresh runs: ${name}, your order's shopped and ready — total $${total}. tap to see the itemized receipt & pay: ${link}`;
    }

    // Send via Twilio REST API (no SDK needed)
    const creds = Buffer.from(`${SID}:${TOKEN}`).toString("base64");
    const form = new URLSearchParams({ To: phone, From: FROM, Body: body });
    const tw = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const twData = await tw.json();
    if (!tw.ok) {
      console.error("twilio error", twData);
      return resp(502, { error: twData.message || "twilio send failed", code: twData.code });
    }

    return resp(200, { sent: true, sid: twData.sid, to: phone });
  } catch (err) {
    console.error(err);
    return resp(500, { error: err.message || "server error" });
  }
};

// accept 10-digit US or already-E.164; return +1XXXXXXXXXX or null
function normalizePhone(p) {
  if (!p) return null;
  const digits = String(p).replace(/\D/g, "");
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits[0] === "1") return "+" + digits;
  if (String(p).startsWith("+")) return String(p);
  return null;
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
