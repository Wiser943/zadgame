---
name: connected
description: Unified project docs for AllConnect + GameHub (allconnect): setup/run/deploy, architecture, full feature reference, and changelog. Supersedes README.md, ALLCONNECT.md, CHANGES.md, PUSH_NOTIFICATIONS.md (kept as one file so nothing drifts out of sync).
---

# AllConnect + GameHub

AllConnect is a browser "live a whole Lagos life" platform at `/` — splash/login, a home room, buy mode, a 3D map, phone apps (Contacts, Messages, Bank, P-Gist, Style, Venues, Transport, State House, Police, Camera, Lagos Run, Settings...) and more. **GameHub** is a for-fun multiplayer game app living inside it (Phone → GameHub, also served standalone at `/gamehub`): sign in once, drop into a lobby, play real-time matches. No real money anywhere in GameHub — "coins"/₦ are an in-world score, not cash.

**Stack:** Node.js, Express, MongoDB (Mongoose), Socket.io, Passport (Google OAuth 2.0 + email/phone password), plain HTML/CSS/JS front end (no build step).

**Games included and working right now:** Tic-Tac-Toe (2p = 3×3, 4p = 5×5 connect-4, bots fill empty seats), Connect Four, Rock Paper Scissors (best of 5), Ludo, Chess, Whot!, Joker, Checkers, Ayo/Mancala, Battleship, Snakes & Ladders, Dominoes. New games use server-authoritative JavaScript engines — see "Adding a new game" below.

Both the platform and GameHub share **one login session** — the same `User` record. AllConnect adds an `ac` field (cash, paint, owned items, needs, time); GameHub's own coins/stats are a separate field and untouched by it ("New life" only resets `ac`).

---

## 1. Prerequisites

- Node.js 18+
- A MongoDB database — either:
  - Local: `brew install mongodb-community` (Mac) or the Docker image `mongo`, or
  - Free hosted: a [MongoDB Atlas](https://www.mongodb.com/atlas) cluster
- A Google Cloud project for OAuth credentials (free, takes ~3 minutes)

## 2. Get Google OAuth credentials

1. Go to https://console.cloud.google.com/apis/credentials
2. Create a project (or pick an existing one)
3. Click **Create Credentials → OAuth client ID**
   - If prompted, configure the OAuth consent screen first (External, add your
     email as a test user is fine for development)
   - Application type: **Web application**
   - Authorized redirect URI: `http://localhost:3000/auth/google/callback`
     (update the host/port if you deploy elsewhere)
4. Copy the **Client ID** and **Client Secret** — you'll need them in step 4.

## 3. Install dependencies

```bash
cd gamehub
npm install
```

## 4. Configure environment variables

```bash
cp .env.example .env
```

Then edit `.env`:

```
PORT=3000
SESSION_SECRET=<any long random string>
CLIENT_URL=http://localhost:3000
MONGODB_URI=<your MongoDB connection string>
GOOGLE_CLIENT_ID=<from step 2>
GOOGLE_CLIENT_SECRET=<from step 2>
```

## 5. Run it

```bash
npm run dev     # with auto-restart (nodemon)
# or
npm start
```

Visit **http://localhost:3000**, sign in with Google, and you're in the lobby.
Open a second browser (or an incognito window, signed in as a different Google
account) to play against yourself and confirm real-time sync end to end.

---

## How it works

- **Auth:** Passport's Google OAuth2 strategy creates/loads a `User` document
  on first login and stores the session in MongoDB (`connect-mongo`), shared
  between Express and Socket.io so every socket connection is authenticated.
- **Lobby:** `GET /api/games` returns the game registry (`games/registry.js`),
  the single source of truth for which games exist and whether they're
  playable. `GET /api/rooms?game=X` lists open waiting rooms for the "Open
  Rooms" list, polled every few seconds.
- **Matchmaking & gameplay:** all real-time logic lives in `sockets/index.js`.
  Rooms are held in memory (`activeRooms`) for speed and mirrored to MongoDB
  (`Room` model) so a server restart doesn't corrupt state mid-match. Every
  move is validated **server-side** against the relevant engine in `/games`
  before it's applied — clients never decide game outcomes, so there's no
  trusting-the-browser cheating vector.
- **Fairness:** Rock Paper Scissors is simultaneous-reveal. The server masks
  each player's pending pick (sending only a `submitted: true/false` flag)
  until both players have locked in for the round, so no one can peek at the
  opponent's choice via the network tab before committing.
- **Coins & stats:** on every match end, both players' `User.coins` and
  `stats` (wins/losses/draws/gamesPlayed) are updated server-side. This is a
  fun counter only — there is no deposit, purchase, or cash-out path anywhere
  in the codebase, by design.

## Accounts
- Existing GameHub accounts sign in on the AllConnect screen (email/phone + password, or Google).
- "Create account" makes a new account (POST /auth/register); it works in GameHub too.
- Same `User` record for both. The platform adds an `ac` field (cash, paint, owned items, needs, time).
  GameHub coins/stats are separate and untouched ("New life" resets only the `ac` field).

## What's where
- `public/allconnect/`   platform UI (splash/login, home room, buy mode, map, phone, GameHub frame)
- `routes/allconnect.js` GET /api/ac/state, POST /api/ac/save, /buy, /new   (all require login)
- `sockets/allconnect.js` Socket.io namespace `/ac`: live online count, visits, gem hunt, who's on the map
- `utils/allconnect.js`  server catalogue/prices + save sanitising (tests in `tests/allconnect.test.js`)
- `server.js`            `/` = AllConnect, `/gamehub` = GameHub; old `/?code=…` invite links still open GameHub
- Unchanged: all games, GameHub front end, admin, tournaments, social, auth/passport (Google is now optional)

## Server-side rules
Purchases are atomic and priced by the server; the client can't save cash or owned items. Gems: 1 per 2s, every 5th pays ₦3,000.

## Friends, chat, updates (phone apps)
- Settings → set your @username. Contacts → search by @username or name → Add. When they accept, they appear under My Friends and in Messages.
- Friends are GameHub's own Friendship records, so they are shared between both apps; reports go to the existing admin Reports queue.
- Chat buttons: Invite over, Visit them, Buy food, Block, Report. All checked on the server.
- Updates feed: friend requests/accepts, money/food received, visits, leaderboard #1 changes (checked every minute), admin posts.
- Admin post (logged-in admin session): POST /admin-api/ac/post  {"text":"...", "kind":"admin" | "update"}

## AllConnect Pay (Bank app on the phone)
- Every user gets a 10-digit Account ID (shown in Bank, copyable). Transfer = paste Account ID or @username -> name appears -> amount -> Confirm -> 4-digit payment PIN.
- The PIN is created in the app (Bank -> Pay PIN), stored only as a salted scrypt hash in `ACWallet`; 5 wrong tries lock it for 15 minutes.
- Limits (in-game ₦): ₦100 min, ₦200,000 per transfer, ₦500,000 per day. Change them in `MONEY` in `utils/allconnect.js`.
- "To Bank Account" is shown as Coming soon. Airtime, Data, Bills, Savings are Coming soon tiles.
- API: GET /api/ac/bank/summary | history | lookup?q=  ·  POST /api/ac/bank/pin | transfer. Money moves only through these (the old chat "Send money" was removed).

## Updated GameHub merged + Settings moved to the phone
- Game files from `allconnect-updated.zip` are merged: 2–4 player Connect Four / RPS / Snakes / Word Clash, DOM-only renderers (Snakes uses Phaser), improved room listing, new tests. Beach Blitz and the old Pixi/Three renderers are not in the updated game, so they were removed.
- GameHub no longer has a profile button, Accessibility tile or Settings screen. Tapping other players still shows their stats/friend actions (own profile is read-only there).
- Phone -> Settings now has: profile edit (photo + name), username, Chat Support, Socials, Game Tutorial, About, Legal, Shop, all sound/theme/accessibility toggles, language, tour replay, voice settings, notifications, log out.
- Preferences use the same `ghPrefs` localStorage key; the game applies changes live through `window.GHBridge` (public/index.html) and the `storage` event.
- Put your real support email / WhatsApp / social links at the top of `public/allconnect/settings.js`.

## Police app, Camera app, tablet layout, server clock
- **Police** (Phone -> Police, `public/allconnect/police.js`, `routes/acpolice.js`): your record, report a player by @username (lands in the admin Reports queue as roomCode `POLICE`), and the Support page that used to live in Settings -> Chat Support. Set `SUPPORT_EMAIL` / `SUPPORT_WHATSAPP` at the top of `police.js`.
- **Camera** (Phone -> Camera, `public/allconnect/camera.js`, `routes/acphotos.js`, `models/ACPhoto.js`): front/back camera, flash/torch, timer, grid, zoom (hardware or digital, pinch/wheel), 4:3 / 1:1 / 16:9 / Full, live filters, mirror, import from device, gallery (view, share, download, delete). Photos upload to imgbb via the server.
  Set **IMGBB_KEY** in Render -> Environment (key from https://api.imgbb.com/). Without it the camera works but saving shows "Photo storage is not set up yet" and shots can be retried or saved to the device. Deleting removes it from the in-game gallery only (imgbb has no delete API; the link is kept in the DB as `deleteUrl`).
  Video is not included: imgbb only hosts images.
- **Desktop/tablet**: at >= 768px wide and >= 520px tall the platform fills the window and the phone becomes a landscape tablet (6-column app grid). Phones keep the original layout.
- **Phone clock** uses server time (`GET /api/ac/time`, Africa/Lagos), re-synced every 5 minutes. The HUD clock is still the in-game life clock.

## Admin login troubleshooting
- Needs `ADMIN_PHONE` and `ADMIN_PIN` in the environment (spaces/quotes around them are now ignored). The login page tells you if they are missing.
- If you sign in and are sent back to the login page, it now says why: cookies blocked / not https, or the real server error.
- Only wrong attempts count toward the 10-per-15-minutes limit.

## P-Gist (social feed)
Phone -> P-Gist. Files: `public/allconnect/gist.js`, `routes/acgist.js` (mounted at `/api/ac/gist`), `models/Gist.js`.
- Posts: text (500 chars), up to 4 photos, a game link (game + optional room code; "Join" opens GameHub with `?code=`), and reshares (repost, or share with a comment).
- Photo sources: My gallery (Camera photos), Platform gallery (photos already posted on P-Gist), or Device (uploaded via imgbb, so IMGBB_KEY is needed).
- Likes, comments (author or post owner can delete), follow/unfollow, profiles with followers/following lists, find a player by @username.
- Safety: per-user rate limits, blocked users are hidden, "Report gist" goes to the admin Reports queue (roomCode `GIST`).

## Gist 2.0, one profile, instant feel (this update)
- **Gist** (`public/allconnect/gist.js`, `routes/acgist.js`, `models/Gist.js`): Latest / Trending / Following / Me tabs, #hashtags + trending strip, @mentions, edit with "edited" label, reactions (long-press the heart: ❤️ 😂 🔥 😢 😮), polls, pin one post to your profile, comment replies + comment likes, photo swipe carousel (up to 10), auto-posted match-win cards (real opponents only, 1 per 90s, opt-out in Settings), and a live "N new gists" pill over the `/ac` socket (`gist:new`).
- **Notifications** (likes, comments, replies, mentions, follows, reshares, poll votes) go to the Messages app -> Updates tab (+ bell with unread badge in Gist). Tapping one opens the gist/profile. Stored in `ACUpdate` (`ref`, `from`).
- **Verified tick**: admin only. Admin panel -> Users -> "Verify ✔" (`POST /admin-api/users/:id/verify`).
- **One profile**: cover, bio, verified, game stats, follow, Message, friend/block/report/send-money menu. GameHub leaderboard + room avatars, Settings, Contacts and Gist all open it (GameHub posts `ac:profile` to the parent).
- **Messages**: anyone not blocked can be messaged (from a profile); friend-only extras (invite/visit/food) show only for friends. Chat has 💸 Send money -> Bank pre-filled with that player.
- **Instant UI**: optimistic likes/reactions/follow/comments/posts; stale-while-revalidate cache (`NET.swr`); on login the app preloads feeds, chats, updates, friends, bank, photos and the GameHub frame. **Saver mode** (Settings -> Display) turns all background loading and music off.
- **Audio**: `public/js/bgm.js` loops `public/audio/Chrome_Capture_2026-10-06_08-39-17.weba` across the whole site (starts after first tap; Settings -> Music toggles it).
- **Branding**: `public/logo.png` (splash), `icon-192/512.png` + `icon-maskable-512.png` (mobile app icon), `pwa-192/512.png` (web app icon), `favicon.png`; manifest updated.

## Home screen polish
- Splash footer: Official tick + X / TikTok / Instagram / LinkedIn (edit the hrefs in `.sfoot` in `public/allconnect/index.html`).
- HUD clock is server (Lagos) time with a sun/moon by hour; the speaker in the HUD mutes/unmutes music, effects and announcer.
- `BAN` in `app.js`: NEPA banners ("NEPA took light" dims the house, later "UP NEPA! Light don come!") every ~1-2 min.
- Clean screen hides everything except the HUD and shows a ☰ Menu button that brings it all back.
- House: pinch / wheel to zoom, drag to pan, double-tap or ⌖ to reset, ⟲ flips the view to the other side.

## 3D house
`public/allconnect/room3d.js` (Three.js r128 from cdnjs, loaded when you tap Continue). Drag = rotate, pinch/wheel = zoom, tap floor = walk, tap cooler = eat, ⟲ = turn 90°, ⌖ / double-tap = reset. Walls facing the camera fade out. Bought items (Queen Bed, Foam Mattress, Net, Fridge, Gas Cooker, Gen Set, Shower, Water Closet, Bucket Set) and wall paint appear in the room; NEPA blackouts dim the lights. If WebGL or the library can't load, the old flat SVG room is used automatically.
Also fixed: `PH`, `GIST`, `CAM`, `POL` are now attached to `window` (top-level `const` is not on `window`, so live notifications/badges never reached the phone apps).

## Merged update (Jobs, Ads, Groups) + environment
- Merged `lagoslife_update.zip` (groups, jobs, ads, balance shortening, needs-on-avatar-tap) on top of everything above. All tests pass (174).
- Admin panel -> **Social links**: X / TikTok / Instagram / LinkedIn. Empty = hidden; all empty = the login footer and the Settings "Join our socials" row disappear. Public endpoint: `GET /api/ac/public-config`.
- Time of day uses Lagos server time: sun icon from 6:30am to 6:30pm, moon otherwise. Sky, ground, window and house light fade through dawn/dusk/night.
- New shop tab **Light** (Ceiling Bulb ₦4,000, Wall Lamp ₦6,000, Standing Lamp ₦18,000). Owned lamps are real lights in the 3D house; they are on while NEPA gives light, or always if you own a Gen Set.
- 3D character rebuilt: face (eyes that blink, brows, nose, mouth, ears), hair, patterned shirt, belt, trousers, trainers, swinging arms and legs.

## Buy mode 2.0 (furniture you can place, move, store and sell)
- Open **Buy**: a Catalogue sheet (Sleep, Kitchen, Bath, Comfort, Light, Design, ♡ Wishlist, 📦 Stored) with 3D thumbnails, size (2×1), stars and price. Tap outside the sheet to hide it (a green **Catalogue** button brings it back). The house can still be rotated/zoomed while you shop.
- Tap an item = preview ("ghost") in the room: ↖↗↙↘ nudge it, ⟳ turns it, tap the floor to jump. Green = fits, red = taken. A warning shows if it would block the way to the cooler box. **Place** pays and adds it. Not enough ₦? You can still preview it, and it is saved to your **wishlist** (also automatically when you close Buy mode with an unpaid preview).
- Tap any item you own: **Move / Turn / Store / Close / Sell**. Selling pays 20% of the price (Spring Bed sells for ₦4,700), so selling is always far below buying. The Cooler Box can be moved/turned but not sold/stored.
- Server rules: `utils/furniture.js` (catalogue, 6×6 grid, overlap, sell value) + `routes/acitems.js` (`/api/ac/items/*`). Browser copy: `public/allconnect/furniture.js` (generate with `node scripts/gen-furniture.js` after editing prices). Old accounts are migrated once: starter items + what they already bought, placed in free cells (Net is refunded ₦8,000).
- The avatar now walks around furniture (grid pathfinding) and walks next to the cooler to eat.

## Photo storage (imgbb) fixes
- Key is read from IMGBB_KEY (also IMGBB_API_KEY, IBB_KEY, ... quotes/spaces are stripped). Uploads try multipart then url-encoded, and the real imgbb error is logged.
- If imgbb fails or is not configured, the photo is saved in our own database so the player never sees an error (max 80 such photos per user, 1.6 MB each).
- Admin panel -> **Photo storage**: shows whether the key is found, the last real result, and a "Test imgbb now" button with imgbb's exact reply.

## Lagos Run (full-screen app) + Lagos Run art on the map
- **Lagos Run** (the danfo game from `lagos.zip`) is now an app on the phone (Phone -> Lagos Run). Like GameHub it takes over the whole screen:
  no AllConnect header, phone frame or nav, just a small ✕ at the top-left (Esc also closes it). The game is unloaded on close so it never runs or plays sound in the background.
- Files: `public/lagosrun/` (game, fonts, SW, manifest) served at `/lagosrun/`. Its paths were rewritten from `/assets`, `/api`, `/sw.js` to `/lagosrun/...` so nothing clashes with AllConnect/GameHub;
  its service worker is scoped to `/lagosrun/` only. It can also be installed on its own (`/lagosrun/manifest.webmanifest`, fullscreen).
- Leaderboard/account API: not part of AllConnect, `/lagosrun/api/*` answers 503 "offline" (set in `server.js`), so the game runs in guest/local mode.
- The upload did not include `facades/`, `pickups/`, `keyart/` or most `buses/` sprites; the game skips them (console warns "missing sprite"). Drop them into `public/lagosrun/assets/sprites/<folder>/` to get them back.
- **Map** (`public/allconnect/map3d.js`, block "Lagos Run art on the map"): asphalt texture on the roads, potholes / manholes / drains / puddles / oil / litter / skid marks, zebra crossings at some junctions,
  Lagos roofs (zinc, red metal, tarp, clothesline, dish, water tank) on small flat roofs, and danfos driving the horizontal roads. Images are loaded lazily from `/lagosrun/assets/sprites/`; with Saver mode or a missing image the map draws exactly as before.

## Venues app (Phone -> Venues): "Open a ..." 101-120
Open one of each: 101 cinema, 102 restaurant, 103 salon, 104 gym, 105 football pitch, 106 gaming café, 107 recording studio, 108 fashion boutique, 109 supermarket, 110 pharmacy,
111 clinic, 112 school, 113 library, 114 coworking space, 115 nightclub, 116 art gallery, 117 church / community hall, 118 repair workshop, 119 hotel, 120 wedding venue.
- Files: `utils/acvenues.js` (all prices, rates, peak hours, upgrade/close rules; tune here), `routes/acvenues.js` (`/api/ac/venues`: GET state, POST open | upgrade | collect | close), `models/ACVenue.js`, `public/allconnect/venues.js`, `tests/acvenues.test.js`.
- Money: opening costs the price (server-side, same wallet as Invest/Bank). Each venue earns hourly, shaped by its busy hours (nightclub at night, church hall on Sunday, wedding venue on Saturday, restaurant at meals ...) with a daily +/-30% "how was business" luck that is the same for the same player/venue/day.
- Income is stored for up to 24 hours: tap **Collect** (or **Collect all**). Running costs are 25% of sales, then 10% tax. Collections are compare-and-set on `last`, so the same hours can never be paid twice.
- Upgrade to level 2 (60% of the price) and 3 (100%): income x1.35 and x1.75. Closing pays back 50% of everything invested.
- New-player protection applies like Invest: during the first week purchases above `PROTECT.investMax` (₦1.5m) are refused.

## Night mode everywhere, Settings display controls, map place sheet
- **Night mode** is now **Off / On / Auto** (Settings -> Display) and covers AllConnect, the phone apps, the map sheets and GameHub. Auto = dark from 6:30 pm to 6:30 am Lagos time (same window as the home-screen sun/moon), re-checked every minute.
- **How it works** (`PREFX` in `app.js`): Settings stores the choices (`ghPrefs.night`, `ghPrefs.saver`, `ghPrefs.camAuto`); `PREFX.derive()` turns them into `ghPrefs.theme` and `ghPrefs.lowPower`, which GameHub, the map, music and the loaders already read, so none of them changed. Old saves are migrated (theme dark -> night On, lowPower -> saver On).
- **Data & battery saver**: Auto / On / Off. Auto turns on when the battery is 20% or less and not charging, Data Saver is on, or the connection is slow (2g or under 0.7 Mbps). The row says whether it is on right now and why.
- **Camera turns by itself** (Off / On): when On, the map camera swings round to follow the way you walk. Off = stays where you leave it.
- **Sound effects** is a switch in Display; Music, Voice announcements and Vibration stay under Sound.
- **Dark styles**: `scripts/gen-dark.py` reads `style.css` and appends dark versions of every light surface/ink/border at the end of the file (inside `AUTO-GENERATED DARK MODE OVERRIDES`). They use `:where()` so they keep the specificity of the light rule and `.on`/`.sel` states still win. Re-run `python3 scripts/gen-dark.py` after adding CSS; hand-written dark rules go above that block.
- **Map place sheet**: tapping any pin label (places and districts) opens the Lagos Life style sheet: **Details** tab (description + **Visit**, which says "coming soon") and **Nearby** tab (the closest places with a short distance label; tap one to open it).

---

## Deploy on Render
- Put the files of this folder at the ROOT of your repo (`server.js` must sit next to `package.json`), or set Render "Root Directory" to the folder that contains it.
- Build Command: `npm install`   Start Command: `npm start`
- Environment: SESSION_SECRET (32+ chars), MONGODB_URI, CLIENT_URL (your https://….onrender.com URL), NODE_ENV=production; ADMIN_PHONE and ADMIN_PIN (needed for /admin login); optional GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET

---

## Push notifications (VAPID)

AllConnect uses the open Web Push standard with VAPID. Browser push delivery does not require a paid push provider.

## Render environment variables

Generate a persistent key pair once from the project directory:

```bash
npx web-push generate-vapid-keys
```

Add the generated values to Render:

```text
VAPID_PUBLIC_KEY=<generated public key>
VAPID_PRIVATE_KEY=<generated private key>
VAPID_SUBJECT=mailto:your-real-admin-email@example.com
```

Keep the same keys across deploys. If the keys change, existing browser subscriptions must be recreated.

## User flow

1. Deploy with the three variables above.
2. Sign in to AllConnect.
3. Open **Phone → Settings**.
4. Tap **Background push notifications → Enable**.
5. Accept the browser notification permission prompt.

Subscriptions are stored in MongoDB and automatically removed when a browser reports them as expired. Notification clicks open the relevant chat, Updates screen, or Gist post.

Without the VAPID variables, the rest of AllConnect still works and the Settings action reports that push is not configured.

---

## Project structure

```
gamehub/
├── server.js              # Express + Socket.io bootstrap
├── config/
│   ├── db.js               # MongoDB connection
│   └── passport.js         # Google OAuth strategy
├── middleware/auth.js      # route guard
├── models/
│   ├── User.js
│   └── Room.js
├── routes/
│   ├── auth.js              # /auth/google, /auth/google/callback, /auth/logout
│   └── api.js                # /api/me, /api/games, /api/rooms
├── games/
│   ├── registry.js          # list of every game, available or not
│   ├── index.js              # engine key -> engine module lookup
│   ├── tictactoe.js          # pure game logic, no I/O
│   ├── connectfour.js
│   └── rps.js
├── sockets/index.js        # matchmaking + authoritative move handling
└── public/                 # static front end (no build step)
    ├── index.html            # landing / Google sign-in
    ├── lobby.html + js/lobby.js
    ├── game-tictactoe.html + js/tictactoe.js
    ├── game-connectfour.html + js/connectfour.js
    ├── game-rps.html + js/rps.js
    ├── js/common.js          # shared toast/auth/socket helpers
    └── css/style.css
```

## Adding a new game (e.g. turning "Coming soon" Ludo into a real one)

1. Create `games/<key>.js` exporting:
   - `createInitialState()`
   - `assignSymbol(playerIndex)`
   - `isValidMove(state, playerIndex, move)`
   - `applyMove(state, playerIndex, move)` → new state
   - `checkResult(state)` → `{status: 'ongoing'|'win'|'draw', winnerIndex?}`
2. Register it in `games/registry.js` with `available: true`, `engine: '<key>'`,
   and a `playUrl`.
3. Add it to `ENGINES` in `games/index.js`.
4. If it's turn-based, add `<key>: true` to `TURN_BASED` in `sockets/index.js`
   (simultaneous games like RPS use `false`).
5. Build `public/game-<key>.html` + `public/js/<key>.js` following the pattern
   in the existing three games (join room by `?code=`, listen for
   `room:update` / `game:state` / `game:over`, emit `game:move`).

No other file needs to change — the lobby, matchmaking, auth, and stats system
are all generic.

## Notes on scope

This is a solid, working foundation, not a finished consumer product:

- Sessions/rooms are held in memory per server process, so this runs on a
  single Node instance as-is. To scale horizontally you'd move `activeRooms`
  into Redis (or a Socket.io Redis adapter) and add sticky sessions.
- Basic socket throttling and admin login throttling are included, but add a reverse-proxy rate limit, profanity filter, abuse reporting and moderation workflow before opening this up to strangers.
- Reconnect handling is basic: a disconnected player's opponent is notified
  but there's no forced-forfeit timer yet; add one if you want abandoned
  matches to resolve automatically.

## Upgrade notes

The UI remains plain JavaScript. The backend now exposes `/api/daily-claim` and `/api/matches`, records completed matches, supports spectator sockets via `room:spectate`, and includes Checkers, Ayo/Mancala, Battleship, Snakes & Ladders and Dominoes. Phaser, PixiJS and Three.js should be loaded lazily only for games that need richer rendering; the existing CSS/DOM boards remain the fallback.

## Renderer and product expansion

The browser remains framework-free JavaScript. `public/js/renderer-manager.js` only lazy-loads Phaser for the Snakes & Ladders board when WebGL is available; there is no renderer setting, and every other board is plain DOM.

Social endpoints are available under `/api/social`: friends, requests, blocking, reports, daily challenges, and tournaments. These are foundations for the full social/competitive UI and should be paired with a moderation dashboard before public launch.

---

# Changelog

Newest changes first.

## Docs unified + two more layout-crash fixes
- All four separate docs (`README.md`, `ALLCONNECT.md`, `CHANGES.md`, `PUSH_NOTIFICATIONS.md`) are merged into this one file, `connected.md`, so setup/architecture/feature reference/changelog can't drift out of sync again. The old files are removed.
- **Fix:** State House → Run for (Governor/Commissioner/President) → the requirements checklist rendered with its lines overlapping (text from several rows bunched on top of each other). Same root cause as the "Lagos hub" fix below: `gov.js` put the bare class `ok` on each `<li>`, which collided with the sitewide `.ok` badge style (a fixed 24×24px circle with no overflow clipping), squashing the row and spilling its text into its neighbours. Renamed to the scoped `gvcok`/`gvcno` in `gov.js` + `style.css`. The same collision existed, unused but latent, in the City Status screen (`hub.js`'s `.hstat.ok` / `.sdot.ok`); renamed those to `hgood` before anything actually broke. As a general safety net, every Font Awesome icon (`.fa-solid`/`.fa-regular`/`.fa-brands`) is now boxed to exactly 1em × 1em with clipped overflow, so a dropped/corrupted icon-font load on a weak connection can no longer blow out a layout the same way.
- **Fix:** the shared bottom-sheet helper (`PH.sheet()` / `PH.closeSheet()` in `phone.js`, used by Style, Ads, Bank and others) could stack a second sheet on top of an open one, and `closeSheet()` only ever removed the oldest `.asheet` in the DOM — so closing the sheet you were looking at could silently delete the one underneath instead, leaving its dark overlay stuck on screen with no way to dismiss it. `sheet()` now closes any existing sheet before opening a new one, and `closeSheet()` removes every `.asheet` it finds.

## State House: elections every 14 days (Governor, Commissioner, President)

New phone app **State House** (🏛️), built on the shared `SHEET` (tabs), `CARD`, `PH.av` avatars and the Lagos Life rows / buttons. Files: `public/allconnect/gov.js`, `routes/acgov.js` (`/api/ac/gov`), `services/govService.js` (database work + the 30 s tick), `utils/acgov.js` (every rule and number, no database), `models/ACGov.js`, tests in `tests/acgov.test.js`.

| Step | What happens |
|------|--------------|
| Round | 14 days, from Monday 00:00 Lagos. The winner of round N holds office for round N+1. |
| Days 0-10: campaign | Players pay the filing fee and file with a slogan (one race per round). Everyone with a day-old account can back one candidate per race (changeable). |
| Day 10: ballot | The 5 with the most backers go on the ballot (ties: who filed first). Everyone else gets the fee back. |
| Days 10-14: voting | One final vote per player per race, only for the 5. Counts show after you vote. |
| Day 14: result | Most votes wins (ties: more backers, then first to file). Winner gets the fee back plus a term allowance, a P-Gist result card, and a city-wide update. Losers on the ballot are told. |

Requirements (all checked on the server, shown as a tick list): @username, account age, P-Gist followers, filing fee. Governor ₦5M / 5 days / 5 followers, Commissioner ₦1.5M / 2 days / 2 followers, President ₦10M / 7 days / 10 followers.

**Powers.** The sitting officeholder can (1) post up to 2 official announcements a day (to every player's Updates and as a P-Gist post), (2) choose policies, one change per policy every 6 hours, and (3) earn a term allowance. Policies are preset options with a benefit and a price, each within +/-20%, and all offices together stay within -30% / +35%. They plug into the existing city-event multipliers through `setMultHook` in `utils/aclagos.js`, so electricity / water / waste bills, food prices, fares and job pay all follow them with no other code changed. Bills use the policy in place on the Monday they are issued; the rest is immediate.

**P-Gist.** New `election` card on posts (running for office, elected, official announcement). Everything that must happen once (the ballot, the winner, each refund) is claimed with one atomic update, so several server instances are safe.

## Keyboard shortcuts + Visit only at the place

- Desktop only: a ⌨️ Keyboard button (bottom-left) opens the shortcuts list (also the K key). Keys: N map, H home, B buy mode, P phone, S needs, Esc close; in Buy mode also C catalogue, arrows move, R rotate, Enter place, Del sell. Ignored while typing in a field. File: `public/allconnect/keys.js`.
- Visit only works when the player is at the place (within about 90 map units); from farther away it says to get there first.

## Extended map (fills the screen when zoomed out or dragged)

The city now continues past its edges: a sea channel, then outer land with decorative streets, buildings and trees on all four sides (scenery only, tapping there does nothing). You can pan about 490 units past the edge, and zoom out further (2100 on wide screens, 1700 on phones, was 1500), so the screen is always full of map, even on desktop. Battery saver uses fewer outer buildings. Code: `extendWorld`, `XLAND`, `XOBJ`, `maxD` in `map3d.js`.

## Transport systems (items 81-100) + dark-mode night map

New phone app **Transport** (🚕), built on the shared `SHEET` (tabs) and `CARD` (result popup) from `ui.js`, the same rows/bars/buttons as Lagos Life, Jobs and Invest, and the Lagos quest list. Files: `public/allconnect/transport.js`, `routes/actransport.js` (`/api/ac/transport`), `utils/actransport.js` (all numbers live here), `models/ACTrafficReport.js`, tests in `tests/actransport.test.js`.

| # | Feature | Where |
|---|---------|-------|
| 81 / 83 / 85 | Buy a bicycle, motorcycle, car (also bus, van, boat for businesses and careers). Motor vehicles need the licence | Shop |
| 82 | Rent a bicycle (3 h). Counts as your bicycle for Delivery Rider shifts | Shop |
| 84 | Okada minigame: pick a free lane for 6 rounds, fare from lanes cleared, daily limits | Drive |
| 86 | Fuel per vehicle (price follows the city event) and maintenance: condition wears, service restores it | Garage > Manage > Care |
| 87 | Customisation garage: 10 paints and per-vehicle upgrades, each adds up to 10% pay | Manage > Style |
| 88 | Driving licence: theory test (fee, 8/10) then practical traffic-light test | Drive |
| 89 | Road-sign quiz (21 signs, rules bank), daily limit, reward per correct answer | Drive |
| 90 | Traffic-light timing challenge, server checks the timings are humanly possible | Drive |
| 91 / 95 | Bus route business and airport shuttle business: assign a bus or van to a route, collect up to 12 h of fares, uses fuel and condition, rush hours pay more | Routes |
| 92 / 93 / 94 | Taxi Driver, Delivery Rider, Boat Captain careers added to **Jobs** (vehicle needed; shifts use its fuel and condition; work uniforms added in Style) | Jobs |
| 96 | Vehicle insurance (third-party / comprehensive, 30 days) + three quests (licence, first vehicle, insure) in Lagos Life | Manage > Cover |
| 97 | Roadside assistance: membership or pay-per-call emergency fuel and fix | Shop / Manage > Care |
| 98 | Parking lots with shared capacity (6 lots, one space per player per lot); street-parked vehicles can get a ticket after a trip | Manage > Park |
| 99 | Community traffic reports (12 roads), confirm / dispute, reporter paid when 3 drivers confirm | Traffic |
| 100 | Public transport reputation (0-100, 5 tiers): lifts route income, cuts insurance, top-10 board | Routes |

Rounds that need answers (quiz, lights, Okada) keep the right answers on the server and can be finished once; every payout has a daily cap. Rented bicycle, fuel, condition and money changes are single atomic updates.

**Dark mode map**: with the dark theme on, the map is always drawn as a night scene (deeper blue tint) with glowing street lights along both sides of every road. In the light theme the lights also come on at night by the in-game clock. Battery saver draws plain dots instead of glows (`map3d.js`: `lampBuild`, `drawLamps`).

## Map interaction (items 61-80)

New file `public/allconnect/maptools.js` plus layer/routing hooks in `map3d.js`. Open it with the 🧭 Tools button on the map; tap any landmark to get a sheet (preview route, walk now, fast travel, bookmark).

- 61 Fast travel: walk near a landmark once to unlock it, then jump between unlocked ones (free, 20 s cooldown).
- 62 Route preview: coloured line on the map, start/finish markers and an ETA bubble, with a mode bar (walk, bike, keke, bus, ride, ferry).
- 63 Traffic-aware times: rush hours, the city event (go-slow, rain, fuel) and bridge sections change the ETA. Optional traffic layer colours the main roads.
- 64 Bus stops: four BRT lines with moving buses. The timetable is read from the same buses, so "next in N min" matches what you see. No service 11:30 pm to 5 am.
- 65 Ride-hail pickup points (14), 66 bike and tricycle stands, 67 three ferry routes with departures every 15 min, 68 airport terminal guide (departures and arrivals walks).
- 69-71 Search by business, player or event; 72 bookmarks (30); 73 favourite routes (12).
- 74 Accessible routes: wide, step-free paths; buses and rides only.
- 75 Night safety, 76 crowd density, 77 weather (rain and flood zones from the city event), 78 festival overlay, 79 treasure hunt (6 daily spots, each pickup uses the existing gem socket so the server still rate-limits payouts), 80 photo spots with best-light hours (opens the camera).

**Tapping a map circle (landmark, bus stop, pier, pickup point, bookmark, photo spot)** opens one popup. Within about 1.2 km (`WALK_MAX` in `maptools.js`) it offers 🚶 Walk there now. Further than that, walking is disabled and the popup lists the ways to travel (bike, tricycle, BRT bus, ride, ferry) with time and fare, the fastest marked Recommended. The route bar also drops the walk option for far trips. Code: `destSheet`, `destBody`, `walkInfo`, `transportOpts`.

Fares shown are estimates and are not charged. Bookmarks, favourites, unlocks and layer choices are stored per account in the browser.


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

## Latest: 3D map, male/female characters, music, ad bar, controls

- **Map** (`public/allconnect/map3d.js`): real 3D Lagos you can drag (pan), pinch/scroll (zoom), twist or right-drag (rotate), two-finger swipe (tilt). Tap the ground to walk (path-finding, bridges only over water), tap a place to open it. Sea plots and billboards from the Ads board are drawn on the map and tappable.
- **Characters** (`avatar.js`, `room3d.js`): male and female models, picked once on the start card (saved as `ac.gender`). Walk, run (map), 4 dance moves, wave. Emote buttons: tap the dance button again for the next move.
- **Music** (`public/js/bgm.js`): the Chrome capture track plays everywhere and goes quiet only while you are inside a GameHub game room (GameHub calls `BGM.room(true/false)`); mp3 fallback for browsers without opus/webm.
- **Sponsored apps**: top bar is one row (back, title, Open with arrow), website name only on wide screens, tinted per ad, shrinks to floating glass buttons after load. Other phone apps hide their header while scrolling down.
- **HUD**: speaker is an SVG icon; zoom/rotate/reset are one expandable button.

## GameHub update (apply these files over the existing project, same paths, then redeploy)
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
- **Starter quests** (8, each verified on the server, small cash rewards).
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

## Pet app (talking cat)
Phone -> Pet. Files: `public/allconnect/pet.js`, `routes/acpet.js` (mounted at `/api/ac/pet`), `utils/acpet.js` (prices, needs, growth, check-in, emergencies, milestones), `utils/acpetai.js` (Gemini), `services/petalerts.js` (away alerts), `models/ACPet.js`, `tests/acpet.test.js`. Her 3D room cat lives in `room3d.js` (`setPet`, `petStep`).
- State is saved on the server per player. Everything bought for the pet (food, care, toys, clothes, vaccine, gifts to friends' pets) is charged from the main balance (`User.ac.cash`) and shows on the bank statement as "Pet shop" / "Pet gift". Rewards (mini-games, check-in, milestones) go back as "Pet" credits. "New life" resets the pet.
- **Daily check-in is the game's only daily reward** (the old Lagos "Daily bonus" of ₦10,000+ was removed). Day 1 pays ₦90, +₦30 per streak day up to day 10, and every 7th day adds ₦150 (about 3% of the old amounts). Change `CHECKIN` in `utils/acpet.js`.
- **Two talk modes** (switch above the chat box): **Repeat** says back what you say or type; **Answer** sends it to Google Gemini and she answers out loud. Everything she says is English.
- **Gemini setup:** set **GEMINI_API_KEY** in Render -> Environment (key from https://aistudio.google.com/apikey; also read from GOOGLE_API_KEY / GEMINI_KEY). Optional: `GEMINI_MODEL` (default `gemini-2.5-flash`, falls back to `gemini-2.0-flash`) and `PET_AI_DAILY` (answers per player per day, default 60). The key is only used on the server. Without it, Answer mode shows as "(off)", Repeat mode still works, and the mic uses the browser's speech recognition (tap to talk).
- **Pet memory:** in Answer mode she can save short, harmless facts about the owner (name, likes). They are filtered, capped at 8, shown in Menu -> What she remembers, and can be forgotten one by one or all at once.
- **Growth:** care earns growth points (max 40 a day, cuddles/chat only 10 of those, nothing while she is ill). Stages: Baby kitten, Kitten (120), Young cat (360), Adult cat (720), Big boss (1200). She gets visibly bigger at each stage.
- **Sudden illnesses:** every 3 to 6 days (after a 2 to 4 day grace period for a new pet) she may catch something. A **Vaccine** (₦30,000, 7 days) prevents it; medicine or a vet visit cures it. Needs only count the minutes she was actually hungry or dirty when making her ill.
- **Away alerts** (`services/petalerts.js`, every 10 min from `server.js`): a notification (Updates + push) when she is hungry or ill. Max 2 per absence, 6 hours apart, never between 22:00 and 07:00 Lagos time; owners can switch them off in Menu.
- **Milestones:** 19 badges in `ACH` (first meal, stages, streaks, friends...). Each pays once, small amounts only.
- **Limited costumes:** 5 items that are only sold while their city event is on (Owambe, rain, market, power cut, go-slow). You keep them.
- **Friends visiting:** Menu -> Friends. A friend's pet can be cuddled once a day (free) and gifted food (3 a day, paid by the visitor, the owner gets a notification).
- **Pet photo:** Menu -> Pet photo draws her on a canvas, saves it in the Camera gallery and can post it on P-Gist. **Show in my room** puts a little cat in the 3D house.
- **Lip-sync:** her mouth follows the sentence (seven mouth shapes, re-aligned on every word event the browser sends); she perks her ears while listening and shows thinking dots while Gemini works.

## Voice notes: hold the mic (WhatsApp style)
`public/allconnect/voice.js`. The round button next to a chat box is a microphone while the box is empty and turns into **send** as soon as you type (pure CSS, `:placeholder-shown`). **Press and hold** the mic: the box becomes a live sound wave with a timer. Release to send, **slide left** to cancel, **slide up** to lock (hands free, then tap send or the bin). A quick tap only shows a hint. Private chats, group chats and the Pet use it: give the button class `sbtn vnmic` and `data-vn="name"`, place it right after the `<input>` inside a `.cin` row, and register `VN.cfg.name = { send(), voice(v) }` (or `blob(blob, seconds)` for the raw recording, plus optional `canStart()`, `onStart()`, `onEnd()`, `max`). The older tap-to-record bar (`VN.record`) is still used for keyboard users.
