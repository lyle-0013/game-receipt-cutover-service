import { processReceipt, receiptRequestSchema } from "../src/receipt_sender.js";

const to = process.env.RECEIPT_EMAIL_TO;
if (!to) throw new Error("RECEIPT_EMAIL_TO is required");

const order = receiptRequestSchema.parse({
  orderId: "order-1042",
  player: { email: to, displayName: "Mira" },
  asset: { assetId: "asset-solaris", title: "Solaris Arena", kind: "map", priceCents: 1299 },
  liveEvent: { eventId: "event-autumn", name: "Autumn Invitational" },
  moderationQueue: { reviewId: "review-884", status: "approved" },
});

console.log(await processReceipt(order));
