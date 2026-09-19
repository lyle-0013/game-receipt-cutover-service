import { createServer } from "node:http";
import { ZodError } from "zod";
import { InfraiError } from "./infrai.js";
import { processReceipt, receiptRequestSchema } from "./receipt_sender.js";

const port = Number(process.env.PORT ?? 3000);

createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/receipts") {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input = receiptRequestSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const result = await processReceipt(input);
    response.writeHead(result.state === "sent" ? 201 : 202, { "content-type": "application/json" });
    response.end(JSON.stringify(result));
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "invalid_receipt_request" }));
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: error.code }));
      return;
    }
    response.writeHead(502, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "receipt_delivery_failed" }));
  }
}).listen(port, () => console.log(`Receipt backend listening on http://localhost:${port}`));
