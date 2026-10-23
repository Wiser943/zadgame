# AllConnect implementation outcomes

## Cross-app saved feature layer

- Add authenticated persistence for Songify saved searches, playlists, collaborative queues, and play-next items.
- Add authenticated persistence for P-Gist drafts and scheduled posts without changing the existing feed, follow, upload, or recovery behavior.
- Add authenticated persistence for Pet care reminders and room activities.
- Add authenticated persistence for saved city places, guided routes, and city events.
- Add authenticated persistence for chat/privacy preferences and game invite/rematch metadata.
- Keep records scoped to their owner and only expose collaborator-visible playlist/queue data.

## Gemini Pet provider and fallback

- Prefer Gemini when `PET_AI_PROVIDER=gemini` or when the default provider mode is used with a Gemini key.
- Keep provider credentials server-side.
- Typed Pet answers must fall back to the built-in Pet Brain if Gemini fails.
- Preserve the existing safe input/reply sanitisation and voice-provider behavior.

## Homes reliability

- Preserve Mainland Room rent at ₦25,000 for 7 days and owned-home pricing from ₦350,000 upward.
- Reject insufficient balance, duplicate owned homes, and duplicate active rentals with specific safe messages.
- Return a correlation id for unexpected acquisition failures and log the detailed server-side error without exposing secrets.
- Preserve atomic debit-and-create behavior.

## Validation and delivery

- Install dependencies and run syntax checks plus the project test suite.
- Add focused tests for the new feature persistence validation, Gemini provider selection/fallback, and home acquisition error classification.
- Keep existing GameHub replay, rematch, tournament, spectator, P-Gist follow, Songify official playback, Pet, chat, and venue behavior intact.
