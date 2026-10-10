## City districts and maps (items 41-60) + one-time character pick

Twenty new districts on the 3D map (`public/allconnect/map3d.js`): 41 Lagos Island (cathedral, mosque, market stalls, rowhouses), 42 Victoria Island commerce towers, 43 Yaba creators, 44 Ikeja business, 45 Surulere sports, 46 Lekki nightlife, 47 Ajah residential, 48 Agege market, 49 mainland transport, 50 university campus, 51 beach resort, 52 stadium, 53 convention centre, 54 port (cranes, containers, ship), 55 technology park, 56 film village, 57 museum quarter, 58 government quarter, 59 rural outskirts, 60 offshore island (new land mass reached by a jetty from Lekki).

Each district has a tinted ground zone, its own buildings, and a map pin. Tap a pin for a one-line description; your character walks there. At far zoom the district pins show only the emoji so the map stays readable. The pathfinder was checked: every district is reachable on foot.

Character picker (Male / Female):
- Moved off the login card. It now appears once, on the "Pick a username" step of first-time setup, under the username suggestions. "Move into Lagos" stays disabled until both a username and a character are chosen.
- Saved with the account (`POST /api/ac/onboard` now accepts `gender`, only when none is saved yet). It never shows again at login.
- Players who finished setup before this change and never picked get the picker once (`HUB.charSheet`).
- To change it later: Phone → Settings → Avatar → Style → Model 1 / Model 2.

Login card footer (Official / X / TikTok) sits higher: bottom padding of `.sfoot` raised.

## Chat: press-and-hold menu, reactions, forward, edit, delete, photos

Press and hold a message (or right-click it) in a private chat or a group chat: React (6 quick emojis + 6 more), Reply, Forward (to up to 5 chats or groups), Copy, Edit (your own, 15 minutes, shows "edited"), Delete (for me, or for everyone within 2 days; group admins can remove anyone's). Double-tap still replies. The new photo button sends a picture with an optional caption in private and group chats; tap a photo to open it full screen.
- Server: `utils/acchat.js` (rules), `routes/acsocial.js` and `routes/acgroups.js` (react / edit / delete / forward / photo fields), `POST /api/ac/photos/chat` (same storage as the gallery, not added to it). Live updates arrive as `dmupd` / `gmsgupd`.
- Client: `public/allconnect/chatx.js`. Tests: `tests/acchat.test.js`.

## Avatar & identity: Style app (items 141-160)

New phone app **Style** (👗). Everything is priced and validated on the server (`utils/acstyle.js`, `routes/acstyle.js`, model `ACStyle`); the browser only sends item ids and colours.

| # | Feature | Where |
|---|---------|-------|
| 141 | 10 free body types + 10 skin tones (separate from the base model and from pronouns) | Style > Body |
| 142 | 22 hairstyles (cuts, afros, braids, locs, twists, wigs...) + 12 hair colours + 7 beard styles | Style > Salon |
| 143 | 12 traditional outfits (agbada, buba & sokoto, iro & buba, isiagu, babariga, etibo, aso-oke, George...) each with where it comes from | Style > Culture |
| 144 | 6 work uniforms, free while you hold that job, optional "wear it 8-5 on weekdays" | Style > Work |
| 145 | Seasonal fashion for Harmattan, Rainy season, Detty December, Independence and Sallah (moon-based dates). Buy in season, wear forever | Style > Seasonal |
| 146 | Tailor-made clothing: base garment, fabric, fit, 2 colours, embroidered name, ready time, rush order, 20% off for fashion workers | Style > Tailor |
| 147 | Dye any dyeable garment (palette or custom colour), reset is free | the 🎨 button |
| 148 | 8 outfit presets (clothes, shoes, accessories, jewellery, makeup) | Style > Outfits |
| 149 | Durability: clothes and shoes wear out with worn time (server-side, capped per day), look ragged, can't be worn until repaired | Style > Outfits |
| 150 | 14 collectable sneakers with rarities, progress bar, milestone rewards and titles | Style > Shoes |
| 151 | 16 pieces of jewellery (necklaces, earrings, wrist, rings, waist beads, anklets), collection rewards | Style > Jewels |
| 152 | 12 wearable cultural items (gele, fila, red cap, Hausa cap, coral beads, adire/aso-oke scarves, abebe fan, staff...) | Style > Culture |
| 153 | Makeup: lips, eyes, liner, cheeks, glow, face gems, each with shades and strength | Style > Makeup |
| 154 | Barber & salon visits: style, colour, beard, touch-up, wash, facial. Hair grows out, "fresh" glow after a visit, every 5th visit 10% off | Style > Salon |
| 155 | 11 photo poses + backdrops; "Take photo" saves into the Camera gallery | Style > Photo |
| 156 | 10 moods with faces and body language; "mood follows my needs" | Style > Motion |
| 157 | 8 walk styles | Style > Motion |
| 158 | 9 idle animations | Style > Motion |
| 159 | Pronouns (presets + custom), collector title, accessibility: reduce avatar motion, text description, high-contrast outlines, captions, no sparkles, colour names | Style > Identity (also linked from Settings) |
| 160 | Privacy: who sees look / pronouns / mood / collections / photo poses (everyone, friends, only me), hide from the map, hide model, "what strangers/friends can see" summary, erase identity info | Style > Identity |

How it fits together
- `GET /api/ac/style/state` returns the catalogue and the player's resolved look. `PUT /look`, `/motion`, `/identity`, `POST /buy /dye /repair /salon /tailor/order /tailor/collect /presets /wear`, `GET /of/:id` (what *you* may see of someone else).
- `public/allconnect/avatar.js` draws any look on the map (2D) and `room3d.js` in the room (3D). Both take the same "render look" object produced by `resolve()` on the server. `styleapp.js` keeps map, room, HUD portrait and live roster in sync.
- The live roster (`sockets/allconnect.js`) only carries a player's look when their privacy allows strangers to see it.
- "New life" now also wipes the wardrobe (bought clothes go with the old balance). Body, skin, hair, pronouns, privacy and accessibility settings stay.
- Tests: `tests/acstyle*.test.js` (rules, routes with an in-memory database, client/server consistency, 3D smoke test).

## One balance, match stakes, Invest app, public /advertise

- **One balance.** The GameHub balance is now `User.ac.cash` (₦), the same number as AllConnect. The old `coins` field is gone; API responses still call it `coins` so older screens keep working. All wallet changes go through `utils/economy.js` and are pushed live to the phone and GameHub (`balance` / `cash` events). Shop prices, daily reward, challenge rewards and tournament prizes are multiplied by `COIN` (1000) in `config/economy.js`. Old coin totals are not converted.
- **Match stakes.** Human-vs-human matches charge every player a stake when the match starts (default ₦5,000, `GAME_STAKE` env or `STAKES` per game in `config/economy.js`). Winner is credited the pot, a draw pays nobody (both stakes are lost), and if nobody is left to finish the match everyone is refunded. Tournament matches are free. Players who can't afford it are blocked at create/join/quick/ranked and at rematch.
- **Bot matches** are free and leave no trace: no ₦, stats, XP, rating, streak, challenge progress, highlight badge or P-Gist post.
- **Invest app** (`routes/acinvest.js`, `utils/acinvest.js`, `models/ACInvest.js`, `public/allconnect/invest.js`): land, street businesses and haulage trailers. Payouts at 6:00 PM Lagos time, 10% tax, deterministic per evening so refreshing can't re-roll. Every number is in `utils/acinvest.js`. "New life" also clears Invest holdings.
- **Public pages:** `/advertise` (billboards, sea plots, phone apps, stats-page ad, airport boards, NGN/USD total; the pay button stays disabled) and `/stats` (live numbers). Data from `/api/public/advertise` and `/api/public/stats`. Rates in `utils/acads.js` (`PUBLIC`, `AIRPORTS`, `USD_RATE` env).
- Ads app footer now links to `<this site>/advertise` using `location.host`.
- **Tournaments are admin-only.** Players can no longer create or start tournaments (those routes answer 403). The admin page has a new **Tournaments** section to create one (game, size, minimum players, minimum level, start time), set its **registration fee** and its **prizes** (₦ and XP for champion and runner-up), start it, or cancel it. Joining charges the fee; leaving before the start, a cancel, or a tournament that never reaches its minimum refunds it. Prizes are paid from the platform into the winners' balance. Tournaments are never free: the fee is required (minimum ₦1,000, `TOURNAMENT_MIN_FEE` env), and any older tournament without a fee is hidden and can't be joined. Tournament matches themselves carry no stake. GameHub shows the fee and prizes on each tournament.

# Latest: 3D map, male/female characters, music, ad bar, controls

- **Map** (`public/allconnect/map3d.js`): real 3D Lagos you can drag (pan), pinch/scroll (zoom), twist or right-drag (rotate), two-finger swipe (tilt). Tap the ground to walk (path-finding, bridges only over water), tap a place to open it. Sea plots and billboards from the Ads board are drawn on the map and tappable.
- **Characters** (`avatar.js`, `room3d.js`): male and female models, picked once on the start card (saved as `ac.gender`). Walk, run (map), 4 dance moves, wave. Emote buttons: tap the dance button again for the next move.
- **Music** (`public/js/bgm.js`): the Chrome capture track plays everywhere and goes quiet only while you are inside a GameHub game room (GameHub calls `BGM.room(true/false)`); mp3 fallback for browsers without opus/webm.
- **Sponsored apps**: top bar is one row (back, title, Open with arrow), website name only on wide screens, tinted per ad, shrinks to floating glass buttons after load. Other phone apps hide their header while scrolling down.
- **HUD**: speaker is an SVG icon; zoom/rotate/reset are one expandable button.

# GameHub update
Copy these files over your project (same paths), then redeploy.

## Environment variables (all optional)
- CHAT_BLOCKLIST="word1,word2"  extra words for the chat filter
- REDIS_URL  enables the Socket.io Redis adapter. Also run:  npm i redis @socket.io/redis-adapter
  (they are listed as optionalDependencies). Without REDIS_URL everything runs in one process as before.

## New endpoints
- GET /ready  readiness check (MongoDB, plus Redis when configured). /health is unchanged.

## Notes
- Active game rooms still live in each server's memory. If you run more than one instance, use sticky sessions.
- Nothing here moves money. Phase 2 (real rewards/payouts) is a "Coming soon" pre-registration screen only.

## v4
- services/push.js: web-push is now loaded safely. If the package is missing the server still starts and push is just disabled.
- Login screen now shows a clear message when the server is unreachable or the session cookie was not saved (before, it silently reshowed the form).
- Songify now opens: it was missing the "light" class that makes the app screen visible.
- Settings: removed the duplicate "Edit profile" row (the blue Edit button does the same) and the profile photo now fills its circle.
- Music: JioSaavn URL can be changed with env JIOSAAVN_SEARCH_URL; the error now says why it failed (and logs it on the server).
- Music: Audiomack removed. Search now tries Audius (full tracks, free) -> JioSaavn -> iTunes 30s previews. Searching (or typing ".play name") plays the first result right away.
- Settings: "Message alerts" and "Background push notifications" are now ONE "Notifications" row. It is On only when both work (browser permission + push subscription, when the server has push keys). If either can't turn on, it stays off.
- Songify: section labels (Recently played / Search results) now have the same side padding as the rest of the screen.
- Chat: double-tap (or double-click) a message to reply to it. A quote shows above the reply, like WhatsApp. Needs the updated server files (models/ACMessage.js, routes/acsocial.js).
- Bank transfer: added a Max button next to the amount (warns when you are sending your whole balance) and more space under the amount box.
- Chat: a red "New messages" divider shows above the messages that were unread when you opened the chat, and the chat scrolls to it.
- Push notifications for chat now have a Reply button. On Chrome for Android you can type the reply right in the notification; elsewhere it opens the chat with the reply bar ready. Tapping the notification itself opens the chat with that message already quoted for reply (and highlighted).
  (Push only works once VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT are set on the server.)

## Songify + Settings + blocking update
- Songify: songs load on open (default Afrobeats list), bottom tabs Home / Favorites / Recent, 16px side padding on lists, full player (shuffle, prev, play/pause, next, repeat, favorite, share, seek bar), banner text changed to "Music for every mood".
- Songify and Settings: every emoji replaced with Font Awesome icons (not SVG). Phone grid icons for Songify and Settings too.
- Music keeps playing after closing the app, closing the phone or going home; a mini player shows on the home and map scenes.
- Blocking: the blocker can still find (search) and open the blocked person's profile; the Message button becomes Unblock (also Unblock in the profile menu and in Contacts search). The blocked person still cannot see or message the blocker.

## Dynamic island, bank shortcuts, offline screen
- Phone notch (dynamic island) shows the playing song (equaliser, title, play/pause); tap it to expand prev/play/next/stop. The home/map scenes get a matching island-style pill under the HUD (replaces the bottom mini player and hides the visits/online chips while music plays).
- HUD balance opens AllConnect Pay; the + opens a new Deposit page (amount input, quick amounts, "Deposit now" button that shows "Coming soon").
- New offline screen titled "AllConnect" (Try again / Reload): served by the service worker (public/offline.html, cache v4) when the web app is opened offline, and shown in-app when the connection drops.
- Haptic tick on nav bar icons and tabs (Android vibrate; iPhone via native switch haptic on iOS 18+), follows the Settings Vibration toggle.

## Ad apps, Search app, app layout menu
- Ads app: third option "Create your own app" (₦100,000 for 1 day, max 3 per advertiser, 12 on the phone). Advertiser enters platform name (16 chars), https website link and a logo from the in-game gallery, a device upload, or an emoji. Paying adds an app (name + logo + "Ad" tag) to every player's phone; opening it runs the website inside the phone (sandboxed iframe) with an Open in browser button. Apps can be edited while live and expire after the day. Server: utils/acads.js (APP), models/ACAd.js (kind 'app', emoji), routes/acads.js (/apps, booking, updating), plus a test.
- Phone: new Search app (find any app by name, incl. ad apps) and a three-dot menu on the home screen to switch the app layout between vertical scroll and horizontal pages (remembered per device).

## Lagos Life update
- **City events** (`utils/aclagos.js`): a new event every 12 hours (6 AM / 6 PM Lagos), the same for every player: fuel scarcity, power outage, Third Mainland go-slow, heavy rain, owambe weekend, Balogun market day, or a calm day. Each has an English and a Pidgin line, district flavour, and real effects: job pay (drivers earn more in a go-slow), electricity and water bills, and food prices when you buy food for a friend. A global update is posted when a new event starts.
- **Bills**: electricity, water and waste, issued every Monday, due Sunday night, scaled by what is in your room and by the city event. 3 free days for new players, 10% late fee, unpaid electricity = power cut (screen dims). Phone → Bank → Bills, or the Lagos Life sheet. Payments are atomic and show in transaction history.
- **Starter quests** (8, each verified on the server, small cash rewards) and a **daily streak** (7-day cycle).
- New endpoints under `/api/ac/lagos`: `city`, `bills`, `bills/pay`, `quests`, `quests/claim`, `daily`. Tests in `tests/aclagos.test.js`.
- Updates panel: pull down from the top-left of the phone; "Clear" empties it (`/api/ac/updates/clear`).

## Creator programme (real-money payouts, reviewed by the team)
- Own profile → **Manage** button (top right of the Profile header) → creator screen: status, requirements checklist, milestones, stats, earnings note.
- Requirements (edit in `utils/accreator.js`): verified tick, 1,000 followers, 20 gists, 500 reactions+comments, account 30 days old, no penalties or suspension.
- States: locked → eligible → applied → approved (or rejected with a 14-day wait / suspended).
- API: `GET /api/ac/creator/status`, `POST /api/ac/creator/apply`. Admin: `GET /api/admin/creators?status=applied`, `POST /api/admin/creators/:id/decide {status, note}` (no admin screen yet).
- Payouts are NOT live: the screen says so. Nothing pays out until payments are connected.

## Lagos hub: onboarding, missions, news, help, result cards (this update)
**Fixes**
- Creator "Manage" requirements list: completed rows had white, overlapping text. A global `.ok` style (green circle) was hitting the row. Renamed to `.gmdone`.

**Reusable UI** (`public/allconnect/ui.js`)
- `SHEET.open({id,title,tabs,body,back})`: the Lagos Life style bottom sheet, now generic. Lagos Life itself uses it.
- `CARD.show({icon,title,text,lines,tone,btn})`: the "Back from Work" style result popup. Cards queue. Server can send them too (`utils/accards.js` → `queueCard`), stored on the player so offline results still show. Used for: Back from Work (summed shifts), promotions, investment payouts / truck repairs, daily bonus, quest and mission rewards, welcome parcel, invite bonus, welcome back.

**Hub** (`public/allconnect/hub.js`, `routes/achub.js`, `utils/achub.js`; API under `/api/ac/hub`)
- Day-one promise, new-player setup (area, starter job, hobby, interest-based username suggestions), recovery code, 60-second tour, replayable interactive controls tutorial, guest city tour on the sign-in screen, city-world loading sequence.
- "What can I do now?" pill on Home (also shows a rotating live ticker). City hub app (Phone → City) with: missions + onboarding progress map, life timeline, newspaper (also a Gazette app), near me, play path (placement matches, bot-to-human, Beginner queue), map legend, help desk, roadmap, feature voting, changelog (also a What's New app), lore archive, city anthem (tune generated in the browser), status, invite, recovery.
- Missions are verified on the server (friend, group, first shift, decorating, bills, placement matches vs bots, first human match, 2-day game streak) and paid once. Welcome parcel (7 days), welcome-back gift after 3+ days away, invite bonus (both sides, first week only).
- New-player protection (first 7 days): transfers ≤ ₦20,000, investments ≤ ₦1.5m each, no ad booking. Limits in `PROTECT` (`utils/achub.js`).
- Beginner queue: GameHub game sheet → "Beginner queue". Free (no stake), only for players in their first week or with under 10 games, never mixed with the normal quick match, hidden from the room list.
- Recovery: sign-in screen → "Recover account" with the 12-character code (stored as a salted scrypt hash; 8 tries / 15 min per IP).
- Public status: `/status` page and `GET /api/ac/public/status`.
- Invite links: `/?ref=<username>`; redeemed after setup.
- Tests: `tests/achub.test.js`. Service worker cache bumped to v5.
