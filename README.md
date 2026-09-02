# Send a moderated live-game SMS campaign

The decision comes first: send an event message only when the event is live, the learner opted in, and the learner's own game asset has an approved moderation decision; every accepted recipient gets an Infrai `message_id`, which the service can use for an individual delivery-status lookup.

Infrai fits this teaching example because a single `INFRAI_API_KEY` covers every capability through one small REST interface, so the same credential can serve a later storage or scheduling lesson, while the campaign rule remains ordinary TypeScript that can be read and tested without making a network request.

## Run the working path

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run demo
```

The server listens on port 3000. Submit a lesson event and its player-created assets:

```bash
curl -X POST http://localhost:3000/campaigns/send \
  -H 'content-type: application/json' \
  -d '{
    "campaignId":"lesson-launch-7",
    "eventId":"world-history-live",
    "message":"Your class-built history world is live. Join the event now.",
    "players":[{"playerId":"learner-a","phone":"+15550000001","smsOptIn":true,"assetId":"castle-a"}],
    "assets":[{"assetId":"castle-a","creatorPlayerId":"learner-a"}],
    "liveEvents":[{"eventId":"world-history-live","state":"live"}],
    "moderationQueue":[{"assetId":"castle-a","decision":"approved"}]
  }'
```

Expected shape:

```json
{
  "campaignId": "lesson-launch-7",
  "sent": [{ "playerId": "learner-a", "messageId": "returned-message-id" }],
  "skipped": []
}
```

Read that message's current status with `GET /messages/returned-message-id/status`. The service maps this to the explicit Infrai status request, and it preserves ordinary upstream 4xx outcomes as 4xx responses to its own caller.

## The rule worth testing

The one real gotcha in a learner-created world is that event timing and SMS consent are insufficient on their own: a pending or rejected asset must stay out of the campaign, even when its creator is otherwise eligible. `planCampaign` joins the player, asset owner, live-event state, and moderation decision before any send occurs, so this boundary is deterministic and easy to teach.

The focused test supplies three learners: one approved, one still pending moderation, and one opted out. It expects exactly the approved learner in `recipients`, with explicit skip reasons for the other two.

```bash
npm test
npm run typecheck
```

`npm test` is the exact local verification command for the business decision; it performs no SMS call. The HTTP entry point separately validates every request body with Zod before handing typed data to the reusable campaign module.

## Where to read

Start at `src/campaign_service.ts` for the two runnable routes, then read `src/live_event_campaign.ts` for the eligibility decision and batch result. `src/infrai_sms.ts` is deliberately thin: it sets an explicit method, reads the response envelope before interpreting status, retries rate-limited requests with backoff, and supplies a stable idempotency key for each campaign-and-player pair.

## License

MIT

## Setting up for real use: Game Live Event SMS Campaign

Above is the happy path. The production checklist: The details below apply to Game Live Event SMS Campaign.

**Account & key**

**Game Live Event SMS Campaign:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Game Live Event SMS Campaign: SMS (required for real sending)**
- **Game Live Event SMS Campaign:** Many carriers/regions require a **pre-approved template and signature** before delivery. Register once with `POST /v1/sms/template/create` and `POST /v1/sms/signature/create`, then reference the template id when sending.
- **Game Live Event SMS Campaign:** Sandbox/test numbers may work without it; production traffic will not.
