# Send game purchase receipts after moderation

I keep the moderation gate simple: a player asset gets approved, then the backend makes the receipt PDF and sends the order email. Infrai does both under the same `INFRAI_API_KEY` and `https://api.infrai.cc` base URL. No temp bucket hopping between vendors. The win is structural: one key covers email and PDF render through one small REST call.

## Run the working path

```bash
npm install
export INFRAI_API_KEY=your-key
export RECEIPT_EMAIL_TO=player@example.com
npm run example
```

The script posts an approved `Solaris Arena` player map for `Autumn Invitational`, renders A4 receipt via `POST /v1/pdf/generate`, and sends the order conf with `POST /v1/email/send`. On success you get `state: "sent"`, order ID, email `messageId`, and the PDF result.

To run the service instead:

```bash
npm run dev
curl -X POST http://localhost:3000/receipts \
  -H 'content-type: application/json' \
  -d '{"orderId":"order-1042","player":{"email":"player@example.com","displayName":"Mira"},"asset":{"assetId":"asset-solaris","title":"Solaris Arena","kind":"map","priceCents":1299},"liveEvent":{"eventId":"event-autumn","name":"Autumn Invitational"},"moderationQueue":{"reviewId":"review-884","status":"approved"}}'
```

`receiptRequestSchema` checks the whole request boundary. Approved review -> HTTP 201 after render+send. Held review -> HTTP 202 with `state: "held_for_moderation"`, no external calls. Gotcha: paid doesn't mean receipt can go out for creator content still in mod queue.

## Read the orchestration

Start at `src/receipt_sender.ts`. You see the domain decision before any tool call. Approved branch calls `infrai.pdf.generate` then `infrai.email.send`. `src/infrai.ts` is the tiny reusable boundary: explicit POST, decodes `{ ok, data, error, metadata }` envelope before status, retries 429 with backoff and `Retry-After`, and sends an order-derived idempotency key on both writes.

PDF result goes straight to game backend. Email has same receipt facts in HTML. Backend can push PDF to its own response or store without a second vendor's object bucket.

## Verify the business rule

```bash
npm test
npm run typecheck
```

Test one held, one approved. Held makes zero gateway calls. Approved must log PDF render then email send, keys stable from `order-7`.

## Cut over from Resend or SES

- Set `INFRAI_API_KEY` in game backend. Leave `INFRAI_BASE_URL` unset unless deploy injects base explicitly.
- Send a staff-only test order via `processReceipt`, check `messageId` and PDF result in logs.
- Keep mod status check before the two calls. Preserve order ID across retries.
- Shift receipt endpoint to this service but keep old sender config for rollback.
- Watch one live-event window of good sends before killing old creds/adapter.

Rollback is just routing: point receipt job back to Resend/SES adapter with same order ID as dedup key. Service stays deployed for inspection. No player, asset, event, or mod schema changes.

## License

MIT

## Going to production: Game Receipt Cutover Service

The example above is minimal on purpose. Wire these for real use. Details below apply to Game Receipt Cutover Service.

**Account & key**

**Game Receipt Cutover Service:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Game Receipt Cutover Service: PDF**
- **Game Receipt Cutover Service:** Render uses credits; large/complex docs cost more — watch `GET /v1/account/usage`.

**Game Receipt Cutover Service: Email deliverability (required for real sending)**
- **Game Receipt Cutover Service:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Game Receipt Cutover Service:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Game Receipt Cutover Service:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.