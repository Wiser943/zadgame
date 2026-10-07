# AllConnect (platform) + GameHub (app)

AllConnect is now the platform at `/`. GameHub is an app inside it (Phone → GameHub), served at `/gamehub`
and shown full-screen in a frame. The platform and GameHub share ONE login session, so signing in once covers both.

## Run
    npm install
    cp .env.example .env     # set SESSION_SECRET, MONGODB_URI (Google keys optional)
    npm start                # http://localhost:3000

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

## Deploy on Render
- Put the files of this folder at the ROOT of your repo (`server.js` must sit next to `package.json`), or set Render "Root Directory" to the folder that contains it.
- Build Command: `npm install`   Start Command: `npm start`
- Environment: SESSION_SECRET (32+ chars), MONGODB_URI, CLIENT_URL (your https://….onrender.com URL), NODE_ENV=production; ADMIN_PHONE and ADMIN_PIN (needed for /admin login); optional GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET

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
- Game files from `zadgame-updated.zip` are merged: 2–4 player Connect Four / RPS / Snakes / Word Clash, DOM-only renderers (Snakes uses Phaser), improved room listing, new tests. Beach Blitz and the old Pixi/Three renderers are not in the updated game, so they were removed.
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
