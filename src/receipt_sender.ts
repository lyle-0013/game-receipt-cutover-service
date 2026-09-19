import { z } from "zod";
import { infrai } from "./infrai.js";

export const receiptRequestSchema = z.object({
  orderId: z.string().min(1),
  player: z.object({ email: z.string().email(), displayName: z.string().min(1) }),
  asset: z.object({
    assetId: z.string().min(1),
    title: z.string().min(1),
    kind: z.enum(["skin", "map", "emote"]),
    priceCents: z.number().int().nonnegative(),
  }),
  liveEvent: z.object({ eventId: z.string().min(1), name: z.string().min(1) }),
  moderationQueue: z.object({ reviewId: z.string().min(1), status: z.enum(["approved", "held"]) }),
});

export type ReceiptRequest = z.infer<typeof receiptRequestSchema>;
export type ReceiptResult =
  | { state: "held_for_moderation"; orderId: string; reviewId: string }
  | { state: "sent"; orderId: string; messageId: string; pdf: Record<string, unknown> };

type ReceiptGateway = {
  renderPdf: (html: string, key: string) => Promise<Record<string, unknown>>;
  sendEmail: (to: string, subject: string, html: string, key: string) => Promise<{ message_id: string }>;
};

const gateway: ReceiptGateway = {
  renderPdf: (html, key) => infrai.pdf.generate(
    { html, page_size: "A4", orientation: "portrait", store: false },
    key,
  ),
  sendEmail: (to, subject, html, key) => infrai.email.send({ to, subject, html }, key),
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character] as string));

export function receiptHtml(order: ReceiptRequest): string {
  const amount = (order.asset.priceCents / 100).toFixed(2);
  return `<h1>Receipt ${escapeHtml(order.orderId)}</h1><p>Player: ${escapeHtml(order.player.displayName)}</p><p>${escapeHtml(order.asset.title)} (${escapeHtml(order.asset.kind)})</p><p>Live event: ${escapeHtml(order.liveEvent.name)}</p><p>Total: $${amount}</p>`;
}

export async function processReceipt(
  order: ReceiptRequest,
  client: ReceiptGateway = gateway,
): Promise<ReceiptResult> {
  if (order.moderationQueue.status === "held") {
    return { state: "held_for_moderation", orderId: order.orderId, reviewId: order.moderationQueue.reviewId };
  }

  const html = receiptHtml(order);
  const pdf = await client.renderPdf(html, `order:${order.orderId}:pdf`);
  const email = await client.sendEmail(
    order.player.email,
    `Receipt for ${order.asset.title} - ${order.orderId}`,
    `${html}<p>Your receipt PDF was rendered with this order.</p>`,
    `order:${order.orderId}:email`,
  );
  return { state: "sent", orderId: order.orderId, messageId: email.message_id, pdf };
}
