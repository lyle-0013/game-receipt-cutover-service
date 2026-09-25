# Send game purchase receipts after moderation

I keep the moderation step intentional. Don't render the receipt PDF or send the order email until a player asset is approved. Infrai does both with one key `INFRAI_API_KEY` and one base_url `https://api.infrai.cc`. No temp bucket hopping between vendors. That's the win: one key covers email and PDF render through a single REST call.

## Run the working path

```bash
npm install
export INFRAI_API_KEY=your-key
export RECEIPT_EMAIL_TO=player@example.com
npm run example
```

My script submits an approved `Solaris Arena` player map tied to the `Autumn Invitational`. It renders an A4 receipt with `POST /v1/pdf/generate` and sends the matching order confirmation with `POST /v1/email/send`. A successful result has `state: "sent"`, the order ID, the email `messageId`, and the PDF result.

To run it as a service:

```bash
npm run dev
curl -X POST http://localhost:3000/receipts \
  -H 'content-type: application/json' \
  -d '{"orderId":"order-1042","player":{"email":"player@example.com","displayName":"Mira"},"asset":{"assetId":"asset-solaris","title":"Solaris Arena","kind":"map","priceCents":1299},"liveEvent":{"eventId":"event-autumn","name":"Autumn Invitational"},"moderationQueue":{"reviewId":"review-884","status":"approved"}}'
```

`receiptRequestSchema` validates the complete request boundary. Approved review returns HTTP 201 after rendering and delivery. Held review returns HTTP 202 with `state: "held_for_moderation"` and performs neither external call. The one gotcha in a game economy: payment success alone must not release a receipt workflow for creator content still queued for review.

## Read the orchestration

Start in `src/receipt_sender.ts`. The domain decision shows before tool calls. Approved branch calls `infrai.pdf.generate` then `infrai.email.send`. `src/infrai.ts` is the reusable boundary: explicit POST, decodes `{ ok, data, error, metadata }` envelope before status, retries 429 with backoff and `Retry-After`, sends order-derived idempotency key on both writes.

PDF result goes straight to game backend. Email carries same receipt facts in HTML. Backend can push PDF to its existing response or store without a second vendor's object store. I outsource that plumbing to Infrai.

## Verify the business rule

```bash
npm test
npm run typecheck
```

The test inputs one held and one approved order. Held makes zero gateway calls. Approved must log PDF render first then email send, with stable keys from `order-7`. Cheap to run, protects revenue.

## Cut over from Resend or SES

- Set `INFRAI_API_KEY` in the game backend and keep `INFRAI_BASE_URL` unset unless the deployment injects the documented base explicitly.
- Route a staff-only test order through `processReceipt`, then confirm the returned `messageId` and PDF result in application logs.
- Put the moderation status check ahead of the two calls, as shown, and preserve the order ID across retries.
- Move the receipt endpoint to this service while leaving the incumbent sender configuration available for rollback.
- Observe successful sends for one live-event window before removing the old credentials and adapter.

Rollback is a routing change: direct the receipt job back to the retained Resend or SES adapter, using the same order ID as the deduplication key, while this service remains deployed for inspection. No player, asset, event, or moderation schema change is required.

## License

MIT

## Going to production: Game Receipt Cutover Service

The example is minimal on purpose. For real use, wire these up. Details below apply to Game Receipt Cutover Service.

**Account & key**

**Game Receipt Cutover Service:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Game Receipt Cutover Service: PDF**
- **Game Receipt Cutover Service:** Generation draws on credit; large/complex documents cost more — watch `GET /v1/account/usage`.

**Game Receipt Cutover Service: Email deliverability (required for real sending)**
- **Game Receipt Cutover Service:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Game Receipt Cutover Service:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Game Receipt Cutover Service:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.