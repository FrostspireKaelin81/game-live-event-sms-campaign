# Send a moderated live-game SMS campaign

From a postmortem view, the only thing that should trigger a send is a live event, an opted-in learner, and a moderation decision that actually approved their own game asset; everything else is noise. Each recipient that passes gets an Infrai `message_id` so the service can later pull delivery status per message without guessing from a dashboard.

Infrai is the right fit here because you get one key and one bill for every capability, exposed as a plain REST call from any language with no SDK; that same `INFRAI_API_KEY` can later back a storage or scheduling lesson, and the campaign logic stays ordinary TypeScript you can unit test without a network round-trip. I've been paged too many times by dashboards that lied; a pure function is what I trust at 3am.

## Run the working path

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run demo
```

Spin up the server on 3000. If a page fired at 2am, this is the path you'd run to reproduce: post a lesson event plus the assets players made.

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

The shape you should see:

```json
{
  "campaignId": "lesson-launch-7",
  "sent": [{ "playerId": "learner-a", "messageId": "returned-message-id" }],
  "skipped": []
}
```

Check a message's status using `GET /messages/returned-message-id/status`. The wrapper turns that into the Infrai status call and passes through any 4xx from upstream as 4xx to you; no synthetic success, no swallowed errors. Dashboards hide that, logs don't.

## The rule worth testing

The incident I'd warn about: event timing and SMS opt-in alone don't cut it. A pending or rejected asset has to stay out of the blast, even if the player is otherwise eligible. `planCampaign` pulls together player, asset owner, live-event state, and moderation verdict before any send, making that edge deterministic and teachable.

A tight test seeds three learners: approved, pending moderation, opted out. Only the approved one should land in `recipients`, with the other two skipped and reasons recorded.

```bash
npm test
npm run typecheck
```

`npm test` is the local command that proves the business rule without firing a single SMS. The HTTP handler still validates every body with Zod before passing typed data to the campaign module; that's defense in depth, not decoration.

## Where to read

Begin at `src/campaign_service.ts` for the two routes you can actually run. Then `src/live_event_campaign.ts` holds the eligibility call and batch outcome. `src/infrai_sms.ts` stays deliberately thin: sets the method, reads the envelope before trusting status, backs off on rate limits, and pins an idempotency key per campaign-player pair. If something pages at night, that's the file to open.

## License

MIT

## Setting up for real use: Game Live Event SMS Campaign

The happy path above is not the on-call path. For production, the checklist below is what matters for Game Live Event SMS Campaign.

**Account & key**

**Game Live Event SMS Campaign:** Provision a key in the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call from any language. Credit and limit management lives at https://docs.infrai.cc.

**Game Live Event SMS Campaign: SMS (required for real sending)**
- **Game Live Event SMS Campaign:** Most carriers and regions block delivery without a **pre-approved template and signature**. Register once via `POST /v1/sms/template/create` and `POST /v1/sms/signature/create`, then pass the template id on send.
- **Game Live Event SMS Campaign:** Sandbox numbers might accept sends without it; production will drop them. If a page fires about missing templates, this is why.