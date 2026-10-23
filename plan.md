# AllConnect feature rollout plan

## Implementation approach

Reuse the existing AllConnect Node/Express + MongoDB architecture. Preserve the already-working P-Gist feed/follows/drafts, Songify official-provider playback, Pet care/mini-games, Homes/furniture, Lagos map/venues, GameHub matches/tournaments/replays/spectators, and chat/groups/voice foundations. Add a small authenticated feature persistence layer for the missing cross-app capabilities: playlists and collaborative queues, saved searches, scheduled/draft content, care reminders and room activities, saved places and guided routes, city events, game invites/rematch metadata, and social privacy preferences. Keep all data server-authoritative and scoped to the signed-in user or explicit collaborators.

Gemini is the preferred optional external Pet provider. Typed answers fall back to the built-in Pet Brain if Gemini is unavailable; voice transcription remains provider-dependent. No API key is stored in the client.

Homes keep the existing prices: Mainland Room rent ₦25,000 for 7 days; owned homes start at ₦350,000. Acquisition error responses will distinguish authentication, insufficient funds, duplicate active home, and unexpected database failures while logging a safe correlation id server-side.

## Project structure

- `models/ACFeature.js`: flexible, indexed persistence for cross-app feature records.
- `routes/acfeatures.js`: authenticated APIs grouped by feature domain.
- `routes/acproperties.js`: server-authoritative home acquisition and diagnostics.
- `utils/acpetai.js`: Gemini-first provider selection and built-in typed-answer fallback.
- `public/allconnect/feature-pack.js`: small client API helper for existing and future phone-app screens.
- `server.js`: route registration and static feature helper loading.
- `plan.md` and `TODO.md`: approved implementation record and acceptance outcomes.

## Design direction

- **Possible styles:** Lagos civic-tech utility (0.07); warm playful mobile life-sim (0.06); dark music-social studio (0.05).
- **Chosen style:** warm playful mobile life-sim.
- **Design movement:** soft skeuomorphic phone UI with Lagos street-life energy and familiar app cards.
- **Core principles:** useful first, warm personality, safe server-authoritative actions, small progressive surfaces.
- **Color philosophy:** keep the existing warm sand/gold/coral palette; use teal for trust and indigo for saved/planned items.
- **Layout paradigm:** app-specific screens inside the existing phone shell, with compact sheets for secondary actions.
- **Signature elements:** rounded pill controls, Lagos-flavoured microcopy, and live result cards.
- **Interaction philosophy:** every save/action gives a reversible confirmation and refreshable state.
- **Animation:** short, purposeful transitions only; respect reduced-motion preferences already supported by the app.
- **Typography:** preserve the existing system and bundled font stack.
- **Brand essence:** one connected Lagos life with games, music, friends, and a home; playful, social, practical.
- **Brand voice:** direct, warm, lightly local. Example: “Save it for later.” “Your padi queue is ready.”
- **Wordmark/logo:** preserve the existing AllConnect mark.
- **Signature color:** the existing warm gold used for the shared wallet and home UI.
