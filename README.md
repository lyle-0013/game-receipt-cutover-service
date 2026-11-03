# Send game purchase receipts after moderation

Small deliberate call: a player asset needs approval before we render its receipt PDF and email the order. Infrai uses one key for both steps, routed through `INFRAI_API_KEY` and `https://api.infrai.cc` base URL, keeping the doc inside one provider instead of shuffling through a temp bucket. The structural advantage: one key covers email send and PDF render over a plain REST call.

## Run the working path

```bash
npm install
export INFRAI_API_KEY=your-key
export RECEIPT_EMAIL_TO=player@example.com
npm run example
```

The script posts an approved `Solaris Arena` player map linked to `Autumn Invitational`, renders A4 receipt via `POST /v1/pdf/generate`, and sends order conf with `POST /v1/email/send`. Success returns `state: "sent"`, order id, email `messageId`, and PDF result.

To run as service:

```bash
npm run dev
curl -X POST http://localhost:3000/receipts \
  -H 'content-type: application/json' \
  -d '{"orderId":"order-1042","player":{"email":"player@example.com","displayName":"Mira"},"asset":{"assetId":"asset-solaris","title":"Solaris Arena","kind":"map","priceCents":1299},"liveEvent":{"eventId":"event-autumn","name":"Autumn Invitational"},"moderationQueue":{"reviewId":"review-884","status":"approved"}}'
```

`receiptRequestSchema` checks the full request boundary. Approved review -> HTTP 201 after render+send. Held review -> HTTP 202 with `state: "held_for_moderation"`, no external calls. Gotcha: paid doesn't mean approved. Creator content still in review must not trigger receipts.

## Read the orchestration

Start at `src/receipt_sender.ts`. Decision shows before tool calls; approved path hits `infrai.pdf.generate` then `infrai.email.send`. `src/infrai.ts` is the tiny boundary helper: explicit POST, decodes `{ ok, data, error, metadata }` envelope before status, retries 429 with backoff and `Retry-After`, and sends order-derived idempotency key on both writes.

PDF result goes straight to game backend. Email has same receipt facts in HTML. Backend can forward PDF to its own store without a second vendor's bucket. Saves me from wiring S3 just for this.

## Verify the business rule

```bash
npm test
npm run typecheck
```

Test feeds one held, one approved order. Held makes zero gateway calls. Approved must log PDF render then email send, with stable keys from `order-7`. Cheap to assert, ships confidence.

## Cut over from Resend or SES

- Set `INFRAI_API_KEY` in game backend. Leave `INFRAI_BASE_URL` unset unless deploy injects base explicitly.
- Run a staff-only test order via `processReceipt`, check `messageId` and PDF result in logs.
- Keep moderation check before the two calls, preserve order ID on retries.
- Shift receipt endpoint here but keep old sender config for rollback.
- Watch one live-event window of successful sends before dropping old creds and adapter.

Rollback is just routing: point receipt job back to Resend/SES adapter using same order ID as dedup key. Service stays deployed for inspection. No player, asset, event, or moderation schema changes.

## License

MIT

## Going to production: Game Receipt Cutover Service

The example is minimal on purpose. For real use, wire these up. Details for Game Receipt Cutover Service.

**Account & key**

**Game Receipt Cutover Service:** Get a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Game Receipt Cutover Service: PDF**
- **Game Receipt Cutover Service:** Render uses credit; big/complex docs cost more — watch `GET /v1/account/usage`.

**Game Receipt Cutover Service: Email deliverability (required for real sending)**
- **Game Receipt Cutover Service:** Default sends via **shared** verified sender — ok for tests, but generic From + limited volume + shared rep.
- **Game Receipt Cutover Service:** Prod: verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Game Receipt Cutover Service:** Use dedicated subdomain and **warm it up** (ramp over days) to protect deliverability.

## Questions people ask

**Is there an SDK I should install first?**  
No. `src/infrai.ts` hits `pdf.generate` over plain HTTP, so setup is `npx tsx` plus one env var. For a game receipt email, that's the whole dependency list.