import { createServer, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { InfraiError, createInfrai } from "./infrai_sms";
import { campaignRequestSchema, readMessageStatus, sendCampaign } from "./live_event_campaign";

function json(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

function clientStatus(error: InfraiError): number {
  return error.status >= 400 && error.status < 500 ? error.status : 502;
}

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("INFRAI_API_KEY is required");
const infrai = createInfrai(apiKey);

const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/campaigns/send") {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const input = campaignRequestSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      const result = await sendCampaign(input, infrai);
      json(response, 200, result);
      return;
    }

    const statusMatch = request.method === "GET"
      ? request.url?.match(/^\/messages\/([^/]+)\/status$/)
      : undefined;
    if (statusMatch) {
      const status = await readMessageStatus(decodeURIComponent(statusMatch[1]), infrai);
      json(response, 200, status);
      return;
    }
    json(response, 404, { error: "route_not_found" });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      json(response, 400, { error: "invalid_request" });
    } else if (error instanceof InfraiError) {
      json(response, clientStatus(error), { error: error.code, message: error.message });
    } else {
      json(response, 500, { error: "service_error" });
    }
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  console.log(`Game campaign service listening on http://localhost:${port}`);
});
