# GameHub

A for-fun multiplayer game web app: sign in with Google, drop into a lobby, and
play real-time matches against other people. No money anywhere — "coins" are
just a bragging-rights score.

**Stack:** Node.js, Express, MongoDB (Mongoose), Socket.io, Passport (Google OAuth 2.0),
and a plain HTML/CSS/JS front end (no build step required).

**Games included and working right now:** Tic-Tac-Toe, Connect Four, Rock Paper
Scissors (best of 5). Ludo, Chess and Whot! are listed in the lobby as
**"Coming soon"** — clicking them tells the user honestly that the game isn't
built yet instead of pretending it works. See "Adding a new game" below to
build one out.

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
- There's no rate limiting, profanity filter, or abuse reporting — add before
  opening this up to strangers on the open internet.
- Reconnect handling is basic: a disconnected player's opponent is notified
  but there's no forced-forfeit timer yet; add one if you want abandoned
  matches to resolve automatically.
