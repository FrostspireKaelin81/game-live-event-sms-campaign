import { createHash } from "node:crypto";
import { z } from "zod";
import type { InfraiClient } from "./infrai_sms";

export const campaignRequestSchema = z.object({
  campaignId: z.string().min(1),
  eventId: z.string().min(1),
  message: z.string().min(1).max(480),
  players: z.array(z.object({
    playerId: z.string().min(1),
    phone: z.string().min(7),
    smsOptIn: z.boolean(),
    assetId: z.string().min(1),
  })).min(1),
  assets: z.array(z.object({
    assetId: z.string().min(1),
    creatorPlayerId: z.string().min(1),
  })),
  liveEvents: z.array(z.object({
    eventId: z.string().min(1),
    state: z.enum(["scheduled", "live", "ended"]),
  })),
  moderationQueue: z.array(z.object({
    assetId: z.string().min(1),
    decision: z.enum(["pending", "approved", "rejected"]),
  })),
});

export type CampaignRequest = z.infer<typeof campaignRequestSchema>;
export type SkipReason = "event_not_live" | "sms_opt_out" | "asset_not_approved" | "asset_owner_mismatch";

export type PlannedRecipient = {
  playerId: string;
  phone: string;
};

export type CampaignPlan = {
  recipients: PlannedRecipient[];
  skipped: Array<{ playerId: string; reason: SkipReason }>;
};

export function planCampaign(input: CampaignRequest): CampaignPlan {
  const eventIsLive = input.liveEvents.some(
    (event) => event.eventId === input.eventId && event.state === "live",
  );
  const assets = new Map(input.assets.map((asset) => [asset.assetId, asset]));
  const decisions = new Map(input.moderationQueue.map((item) => [item.assetId, item.decision]));
  const recipients: PlannedRecipient[] = [];
  const skipped: CampaignPlan["skipped"] = [];

  for (const player of input.players) {
    let reason: SkipReason | undefined;
    if (!eventIsLive) reason = "event_not_live";
    else if (!player.smsOptIn) reason = "sms_opt_out";
    else if (assets.get(player.assetId)?.creatorPlayerId !== player.playerId) reason = "asset_owner_mismatch";
    else if (decisions.get(player.assetId) !== "approved") reason = "asset_not_approved";

    if (reason) skipped.push({ playerId: player.playerId, reason });
    else recipients.push({ playerId: player.playerId, phone: player.phone });
  }
  return { recipients, skipped };
}

function deliveryKey(campaignId: string, playerId: string): string {
  return createHash("sha256").update(`${campaignId}:${playerId}`).digest("hex");
}

export async function sendCampaign(input: CampaignRequest, infrai: InfraiClient) {
  const plan = planCampaign(input);
  const sent = await Promise.all(plan.recipients.map(async (recipient) => {
    const result = await infrai.sms.send(
      { to: recipient.phone, body: input.message },
      deliveryKey(input.campaignId, recipient.playerId),
    );
    return { playerId: recipient.playerId, messageId: result.message_id };
  }));
  return { campaignId: input.campaignId, sent, skipped: plan.skipped };
}

export async function readMessageStatus(messageId: string, infrai: InfraiClient) {
  return infrai.sms.status(messageId);
}
