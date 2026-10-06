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
- Chat buttons: Invite over, Visit them, Send money (₦100–200k each, ₦500k/day), Buy food, Block, Report. All checked on the server.
- Updates feed: friend requests/accepts, money/food received, visits, leaderboard #1 changes (checked every minute), admin posts.
- Admin post (logged-in admin session): POST /admin-api/ac/post  {"text":"...", "kind":"admin" | "update"}
