import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import dotenv from "dotenv";
import admin from "firebase-admin";
import cors from "cors";

dotenv.config();

/* -------------------- FIREBASE SETUP (Render-friendly) -------------------- */

// We now load the full service account JSON from an environment variable
if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  console.error("FIREBASE_SERVICE_ACCOUNT_JSON is not set in env!");
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
} catch (err) {
  console.error("Invalid FIREBASE_SERVICE_ACCOUNT_JSON:", err);
  process.exit(1);
}

if (!process.env.FIREBASE_DATABASE_URL) {
  console.error("FIREBASE_DATABASE_URL is not set in env!");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL,
});

const db = admin.database();

/* --------------------------- EXPRESS SETUP --------------------------- */

const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://lsm-bojr3c63z-artins-projects-8d0a28db.vercel.app",
      "https://bizcall.vercel.app",
      "https://lsm-wozo.onrender.com", // replace with your real frontend URL
    ],
    credentials: true,
  })
);

app.use(bodyParser.json());

/* --------------------------- PAYPAL HELPER --------------------------- */

async function generateAccessToken() {
  const auth = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString("base64");

  const url =
    process.env.PAYPAL_ENVIRONMENT === "sandbox"
      ? "https://api-m.sandbox.paypal.com/v1/oauth2/token"
      : "https://api-m.paypal.com/v1/oauth2/token";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const data = await response.json();
  if (!response.ok) {
    console.error("PayPal access token error:", data);
    throw new Error("Failed to get PayPal access token");
  }

  return data.access_token;
}

/* ----------------------- CREATE PAYPAL ORDER ------------------------ */

app.post("/api/paypal/create-order", async (req, res) => {
  const { listingId, amount, action } = req.body;
  console.log("Creating order for", listingId, "action:", action, "amount:", amount);

  if (!listingId || !amount) {
    return res.status(400).json({ error: "listingId and amount required" });
  }

  try {
    const accessToken = await generateAccessToken();

    const orderResponse = await fetch(
      process.env.PAYPAL_ENVIRONMENT === "sandbox"
        ? "https://api-m.sandbox.paypal.com/v2/checkout/orders"
        : "https://api-m.paypal.com/v2/checkout/orders",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [
            {
              reference_id: listingId,
              amount: {
                currency_code: "EUR",
                value: String(amount),
              },
              description: "Digital Service Listing Payment",
            },
          ],
          application_context: {
            brand_name: "Local Support Market",
            landing_page: "NO_PREFERENCE",
            user_action: "PAY_NOW",
            shipping_preference: "NO_SHIPPING",
          },
        }),
      }
    );

    const order = await orderResponse.json();
    if (!order.id) {
      console.error("PayPal order creation failed:", order);
      await db.ref(`listings/${listingId}`).update({
        status: "expired",
      });
      return res.status(500).json({ error: order });
    }

    res.json({ orderID: order.id });
  } catch (err) {
    console.error("Create order error:", err);
    try {
      await db.ref(`listings/${req.body.listingId}`).update({
        status: "expired",
      });
    } catch (innerErr) {
      console.error("Failed to update Firebase on error:", innerErr);
    }
    res.status(500).json({ error: "Failed to create PayPal order" });
  }
});

/* ----------------------- CAPTURE PAYPAL ORDER ----------------------- */

app.post("/api/paypal/capture", async (req, res) => {
  const { orderID, listingId, action } = req.body;
  console.log("Capturing order", orderID, "for", listingId, "action:", action);

  if (!orderID || !listingId) {
    return res.status(400).json({ error: "orderID and listingId required" });
  }

  try {
    const accessToken = await generateAccessToken();

    // Step 1: Check order status first (important for card flow)
    const orderCheck = await fetch(
      `${
        process.env.PAYPAL_ENVIRONMENT === "sandbox"
          ? "https://api-m.sandbox.paypal.com"
          : "https://api-m.paypal.com"
      }/v2/checkout/orders/${orderID}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    const orderData = await orderCheck.json();

    // Already completed?
    if (orderData.status === "COMPLETED") {
      console.log("✅ Order already captured by PayPal (card flow)");
      await db.ref(`listings/${listingId}`).update({
        status: "verified",
        pricePaid:
          orderData.purchase_units?.[0]?.amount?.value ||
          orderData.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value ||
          0,
      });
      return res.json({ ok: true, status: "ALREADY_COMPLETED" });
    }

    // Step 2: Capture manually for popup (PayPal login flow)
    const captureResponse = await fetch(
      `${
        process.env.PAYPAL_ENVIRONMENT === "sandbox"
          ? "https://api-m.sandbox.paypal.com"
          : "https://api-m.paypal.com"
      }/v2/checkout/orders/${orderID}/capture`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const captureData = await captureResponse.json();

    if (
      captureData.name === "UNPROCESSABLE_ENTITY" &&
      captureData.details?.[0]?.issue === "ORDER_ALREADY_CAPTURED"
    ) {
      console.warn("⚠️ Order already captured:", captureData);
      await db.ref(`listings/${listingId}`).update({ status: "verified" });
      return res.json({ ok: true, status: "ALREADY_CAPTURED" });
    }

    if (captureData.status !== "COMPLETED") {
      console.error("❌ Capture failed:", captureData);
      await db.ref(`listings/${listingId}`).update({ status: "expired" });
      return res.status(500).json({ error: captureData });
    }

    const amountPaid =
      captureData.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value || 0;

    await db.ref(`listings/${listingId}`).update({
      pricePaid: Number(amountPaid),
      status: "verified",
    });

    res.json({ ok: true, status: captureData.status });
  } catch (err) {
    console.error("Capture error:", err);
    try {
      await db.ref(`listings/${listingId}`).update({ status: "expired" });
    } catch (innerErr) {
      console.error("Failed to update Firebase after capture error:", innerErr);
    }
    res.status(500).json({ error: "PayPal capture failed" });
  }
});

/* ----------------------- VERIFY ORDER (OPTIONAL) ----------------------- */

app.get("/api/paypal/verify-order/:orderId/:listingId", async (req, res) => {
  const { orderId, listingId } = req.params;
  try {
    const accessToken = await generateAccessToken();
    const response = await fetch(
      `${
        process.env.PAYPAL_ENVIRONMENT === "sandbox"
          ? "https://api-m.sandbox.paypal.com"
          : "https://api-m.paypal.com"
      }/v2/checkout/orders/${orderId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    const data = await response.json();

    if (data.status === "COMPLETED") {
      await db.ref(`listings/${listingId}`).update({ status: "verified" });
      return res.json({ ok: true });
    }

    res.status(400).json({ error: "Order not completed", status: data.status });
  } catch (err) {
    res.status(500).json({ error: "Verification failed" });
  }
});

/* -------------------------- START SERVER -------------------------- */

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
