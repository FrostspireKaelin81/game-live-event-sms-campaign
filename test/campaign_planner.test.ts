import assert from "node:assert/strict";
import test from "node:test";
import { campaignRequestSchema, planCampaign } from "../src/live_event_campaign";

test("sends only opted-in players whose own asset passed moderation for a live event", () => {
  const input = campaignRequestSchema.parse({
    campaignId: "lesson-launch-7",
    eventId: "world-history-live",
    message: "Your class-built history world is live. Join the event now.",
    players: [
      { playerId: "learner-a", phone: "+15550000001", smsOptIn: true, assetId: "castle-a" },
      { playerId: "learner-b", phone: "+15550000002", smsOptIn: true, assetId: "castle-b" },
      { playerId: "learner-c", phone: "+15550000003", smsOptIn: false, assetId: "castle-c" }
    ],
    assets: [
      { assetId: "castle-a", creatorPlayerId: "learner-a" },
      { assetId: "castle-b", creatorPlayerId: "learner-b" },
      { assetId: "castle-c", creatorPlayerId: "learner-c" }
    ],
    liveEvents: [{ eventId: "world-history-live", state: "live" }],
    moderationQueue: [
      { assetId: "castle-a", decision: "approved" },
      { assetId: "castle-b", decision: "pending" },
      { assetId: "castle-c", decision: "approved" }
    ]
  });

  assert.deepEqual(planCampaign(input), {
    recipients: [{ playerId: "learner-a", phone: "+15550000001" }],
    skipped: [
      { playerId: "learner-b", reason: "asset_not_approved" },
      { playerId: "learner-c", reason: "sms_opt_out" }
    ]
  });
});
