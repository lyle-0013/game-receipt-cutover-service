import assert from "node:assert/strict";
import test from "node:test";
import { processReceipt, receiptRequestSchema } from "../src/receipt_sender.js";

const baseOrder = receiptRequestSchema.parse({
  orderId: "order-7",
  player: { email: "player@example.com", displayName: "Ari" },
  asset: { assetId: "asset-3", title: "Foundry Map", kind: "map", priceCents: 500 },
  liveEvent: { eventId: "event-2", name: "Creator Cup" },
  moderationQueue: { reviewId: "review-9", status: "approved" },
});

test("a held asset does not render or send", async () => {
  const calls: string[] = [];
  const result = await processReceipt(
    { ...baseOrder, moderationQueue: { ...baseOrder.moderationQueue, status: "held" } },
    {
      renderPdf: async () => { calls.push("pdf"); return {}; },
      sendEmail: async () => { calls.push("email"); return { message_id: "unused" }; },
    },
  );
  assert.deepEqual(calls, []);
  assert.equal(result.state, "held_for_moderation");
});

test("an approved asset renders before the receipt is sent", async () => {
  const calls: string[] = [];
  const result = await processReceipt(baseOrder, {
    renderPdf: async (_html, key) => { calls.push(`pdf:${key}`); return { document: "ready" }; },
    sendEmail: async (_to, _subject, _html, key) => {
      calls.push(`email:${key}`);
      return { message_id: "msg-42" };
    },
  });
  assert.deepEqual(calls, ["pdf:order:order-7:pdf", "email:order:order-7:email"]);
  assert.deepEqual(result, { state: "sent", orderId: "order-7", messageId: "msg-42", pdf: { document: "ready" } });
});
