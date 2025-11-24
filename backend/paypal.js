// paypal.js
import checkoutNodeJssdk from "@paypal/checkout-server-sdk";
import dotenv from "dotenv";

dotenv.config();

const clientId = process.env.PAYPAL_CLIENT_ID;
const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

const environment = new checkoutNodeJssdk.core.SandboxEnvironment(
  clientId,
  clientSecret
);
const client = new checkoutNodeJssdk.core.PayPalHttpClient(environment);

export default client;
