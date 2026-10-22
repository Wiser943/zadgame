require('dotenv').config();

const path = require('path');
const express = require('express');
const http = require('http');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
const { Server } = require('socket.io');

const connectDB = require('./config/db');
const { attachRedis, redisHealth, closeRedis } = require('./config/redis');
const mongoose = require('mongoose');
const configurePassport = require('./config/passport');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');
const socialRoutes = require('./routes/social');
const tournamentRoutes = require('./routes/tournaments');
const allconnectRoutes = require('./routes/allconnect');
const acPhotoRoutes = require('./routes/acphotos');
const acVoiceRoutes = require('./routes/acvoice');
const acPoliceRoutes = require('./routes/acpolice');
const acGistRoutes = require('./routes/acgist');
const acSocialRoutes = require('./routes/acsocial');
const acGroupRoutes = require('./routes/acgroups');
const acJobRoutes = require('./routes/acjobs');
const acAdRoutes = require('./routes/acads');
const acItemRoutes = require('./routes/acitems');
const acPropertyRoutes = require('./routes/acproperties');
const acInvestRoutes = require('./routes/acinvest');
const acVenuesRoutes = require('./routes/acvenues');
const publicAdsRoutes = require('./routes/publicads');
const acBankRoutes = require('./routes/acbank');
const acLagosRoutes = require('./routes/aclagos');
const acCreatorRoutes = require('./routes/accreator');
const acMusicRoutes = require('./routes/acmusic');
const acHubRoutes = require('./routes/achub');
const acStyleRoutes = require('./routes/acstyle');
const acPushRoutes = require('./routes/acpush');
const acTransportRoutes = require('./routes/actransport');
const acGovRoutes = require('./routes/acgov');
const acGemRoutes = require('./routes/acgem');
const acPetRoutes = require('./routes/acpet');
const reportRoutes = require('./routes/reports');
const developerRoutes = require('./routes/developers');
const govService = require('./services/govService');
const initAllConnect = require('./sockets/allconnect');
const tournamentService = require('./services/tournaments');
const initSockets = require('./sockets');
const { loadGameSettings } = require('./config/gameSettings');

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV === 'production' && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) throw new Error('SESSION_SECRET must be at least 32 characters in production.');

async function main() {
  await connectDB();
  await loadGameSettings();
  configurePassport();

  const app = express();
  const server = http.createServer(app);
  // Origins allowed to call this API from a browser (only needed when the front end is on another site, e.g. Netlify).
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.CLIENT_URL || '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
  const crossSite = process.env.CROSS_SITE_COOKIES === 'true';   // only for "direct" mode (no Netlify proxy)
  const io = new Server(server, { cors: { origin: allowedOrigins.length ? allowedOrigins : false, credentials: true } });
  await attachRedis(io);

  // Render (and most hosts) terminate HTTPS at a proxy. Without this, Express
  // thinks requests are plain HTTP and refuses to set the Secure session cookie.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((req, res, next) => {   // CORS for the separately-hosted front end
    const o = req.headers.origin;
    if (o && allowedOrigins.includes(o)) {
      res.setHeader('Access-Control-Allow-Origin', o);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      if (req.method === 'OPTIONS') return res.sendStatus(204);
    }
    next();
  });
  app.use((req,res,next)=>{ res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('X-Frame-Options','SAMEORIGIN'); res.setHeader('Referrer-Policy','same-origin'); res.setHeader('Permissions-Policy','camera=(self), microphone=(self), geolocation=()'); next(); });
  app.use('/api/ac/gist/mux-webhook', express.raw({ type: '*/*', limit: '1mb' })); // Mux webhooks must reach the signature check untouched
  app.use('/api/ac/voice', express.json({ limit: '1.4mb' })); // voice notes arrive as base64 JSON
  app.use('/api/ac/photos', express.json({ limit: '6mb' })); // camera photos arrive as base64 JSON (must come before the global parser)
  app.use(express.json({ limit: '1.5mb' })); // profile photos come in as base64 JSON

  const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'dev_secret_change_me',
    proxy: true, // honour X-Forwarded-Proto (also applies to the Socket.io handshake)
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7, httpOnly: true, sameSite: crossSite ? 'none' : 'lax', secure: crossSite ? true : (process.env.NODE_ENV === 'production' ? 'auto' : false) } // 7 days
  });
  app.use(sessionMiddleware);

  app.use(passport.initialize());
  app.use(passport.session());

  // Lets the browser's Socket.io connection authenticate without a cookie (see utils/socketToken.js)
  app.get('/api/socket-token', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!(req.isAuthenticated && req.isAuthenticated()) || !req.user) return res.status(401).json({ message: 'Not signed in' });
    res.json({ token: require('./utils/socketToken').sign(req.user.id) });
  });

  app.use('/auth', authRoutes);
  app.use('/api', apiRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/developers', developerRoutes);
  app.use('/admin-api', adminRoutes);
  app.use('/api/social', socialRoutes);
  app.use('/api/tournaments', tournamentRoutes);
  app.use('/api/ac/voice', acVoiceRoutes);
  app.use('/api/ac/photos', acPhotoRoutes);
  app.use('/api/ac/police', acPoliceRoutes);
  app.use('/api/ac/gist', acGistRoutes);
  app.use('/api/ac/groups', acGroupRoutes);
  app.use('/api/ac/jobs', acJobRoutes);
  app.use('/api/ac/ads', acAdRoutes);
  app.use('/api/ac/items', acItemRoutes);
  app.use('/api/ac/properties', acPropertyRoutes);
  app.use('/api/ac/invest', acInvestRoutes);
  app.use('/api/ac/transport', acTransportRoutes);
  app.use('/api/ac/gem', acGemRoutes);      // Daily gem hunt
  app.use('/api/ac/pet', acPetRoutes);      // Pet app: needs, shop, clothes, mini-games (all paid from the main balance)
  app.use('/api/ac/gov', acGovRoutes);          // State House: elections, announcements, policies
  app.use('/api/ac/venues', acVenuesRoutes);
  app.use('/api/public', publicAdsRoutes);   // no login: prices + live numbers for /advertise and /stats
  app.use('/api/ac', allconnectRoutes);
  app.use('/api/ac', acSocialRoutes);
  app.use('/api/ac/lagos', acLagosRoutes);
  app.use('/api/ac/creator', acCreatorRoutes);
  app.use('/api/ac/bank', acBankRoutes);   // AllConnect platform state (same login as GameHub)
  app.use('/api/ac/music', acMusicRoutes);
  app.use('/api/ac/public', acHubRoutes.pub);   // no login: public status + account recovery
  app.use('/api/ac/style', acStyleRoutes);
  app.use('/api/ac/hub', acHubRoutes);          // onboarding, missions, news, votes, result cards
  app.use('/api/ac/push', acPushRoutes);
  app.get('/health', (req,res) => res.json({ ok: true, service: 'allconnect', time: new Date().toISOString() }));
  // Readiness: only "ready" when MongoDB is connected (and Redis too, when it is configured).
  app.get('/ready', async (req, res) => {
    const db = mongoose.connection.readyState === 1, redis = await redisHealth();
    const ok = db && (!redis.configured || redis.ok);
    res.status(ok ? 200 : 503).json({ ok, db, redis, time: new Date().toISOString() });
  });
  app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

  // Lagos Run: a standalone full-screen app (own folder, own service-worker scope, own manifest).
  // Its leaderboard/account API is not part of AllConnect, so it answers "offline" and the game runs in guest mode.
  app.use('/lagosrun/api', (req, res) => res.status(503).json({ ok: false, error: 'offline' }));
  app.get(['/lagosrun', '/lagosrun/'], (req, res) => res.sendFile(path.join(__dirname, 'public', 'lagosrun', 'index.html')));

  app.use('/assets', express.static(path.join(__dirname, 'assets')));
  app.use(express.static(path.join(__dirname, 'public'), { index: false }));

  // Marketing landing at /. The life-sim is /play. GameHub stays at /gamehub.
  // Old GameHub invite/share links (/?code=..., ?spectate=..., ?h=..., ?by=...) still open GameHub directly.
  const GAMEHUB = path.join(__dirname, 'public', 'index.html');
  const LANDING = path.join(__dirname, 'public', 'landing.html');
  const ALLCONNECT = path.join(__dirname, 'public', 'allconnect', 'index.html');
  app.get('/', (req, res) => {
    const q = req.query || {};
    if (q.code || q.spectate || q.h || q.by) return res.sendFile(GAMEHUB);
    res.sendFile(LANDING);
  });
  // /play is a single-page app: /play/home, /play/map, /play/buy, /play/phone, /play/phone/bank ... all serve the same shell and the client router picks the screen.
  app.get(['/play', '/play/', '/play/*'], (req, res) => res.sendFile(ALLCONNECT));
  app.get('/gamehub', (req, res) => res.sendFile(GAMEHUB));
  app.get('/advertise', (req, res) => res.sendFile(path.join(__dirname, 'public', 'advertise.html')));
  app.get('/status', (req, res) => res.sendFile(path.join(__dirname, 'public', 'status.html')));
  app.get('/stats', (req, res) => res.sendFile(path.join(__dirname, 'public', 'stats.html')));
  app.get('/report', (req, res) => res.sendFile(path.join(__dirname, 'public', 'report.html')));
  app.get('/developers', (req, res) => res.sendFile(path.join(__dirname, 'public', 'developers.html')));

  // GameHub's own client-side routes (/lobby, /shop, /friends ...) fall through to GameHub
  app.get('*', (req, res) => res.sendFile(GAMEHUB));

  // Central error handler. Without this, any error passed to next(err) (e.g.
  // a DB error inside the Google OAuth verify callback) falls through to
  // Express's default handler and shows a bare "Internal Server Error" page
  // with no useful info. This logs the real error server-side and gives the
  // client something sane back.
  app.use((err, req, res, next) => {
    // Keep the full diagnostic on the server, but return safe, actionable errors
    // for common database/model failures instead of masking every failure as the
    // same generic 500. Never expose raw database messages to players.
    console.error('[error]', req.method, req.originalUrl, err);
    if (res.headersSent) return next(err);
    if (req.path.startsWith('/auth/google')) {
      return res.redirect((process.env.CLIENT_URL || '') + '/play?auth_error=1');
    }

    const name = String(err && err.name || '');
    const code = err && err.code;
    if (code === 11000) {
      return res.status(409).json({ message: 'That record already exists. Refresh and try again.' });
    }
    if (name === 'ValidationError') {
      return res.status(400).json({ message: 'Some information is missing or invalid. Check your entries and try again.' });
    }
    if (name === 'CastError') {
      return res.status(400).json({ message: 'That item or player could not be found. Refresh and try again.' });
    }
    if (name === 'MongooseServerSelectionError' || name === 'MongoNetworkError' || name === 'MongoServerSelectionError') {
      return res.status(503).json({ message: 'The game database is temporarily unavailable. Please wait a moment and try again.' });
    }
    res.status(500).json({ message: 'This action could not be completed. Please try again. If it keeps happening, contact support.' });
  });

  initSockets(io, sessionMiddleware);
  app.set('io', io);
  initAllConnect(io);
  require('./utils/economy').setIO(io);   // lets every wallet change update open screens live

  /* announce each new city event once (the first server instance to claim the 12-hour window posts it) */
  const ACSetting = require('./models/ACSetting'), LAGOS = require('./utils/aclagos'), { notify: ncity } = require('./utils/acnotify');
  const cityTick = async () => {
    const ev = LAGOS.currentEvent(); if (ev.id === 'calm') return;
    try { await ACSetting.findOneAndUpdate({ _id: 'cityEvent', 'value.windowKey': { $ne: ev.windowKey } }, { $set: { value: { windowKey: ev.windowKey, id: ev.id } } }, { upsert: true }); }
    catch (e) { return; }   // duplicate key = somebody else already announced this window
    ncity(io, null, { icon: ev.icon, text: `${ev.title}: ${ev.pidgin} ${ev.text}`, kind: 'info' }).catch(() => {});
  };
  setTimeout(() => cityTick().catch(() => {}), 20000).unref(); setInterval(() => cityTick().catch(() => {}), 5 * 60 * 1000).unref();
  /* State House: policies change prices, so the active ones are loaded before the first request and refreshed every 30 s
     (this tick also closes the campaign, counts the votes and announces winners; each step is claimed once across instances) */
  require('./utils/aclagos').setMultHook(require('./utils/acgov').applyPolicies);
  await govService.refreshOffices().catch((e) => console.error('[gov load]', e.message));
  setTimeout(() => govService.tick(io).catch((e) => console.error('[gov tick]', e.message)), 15000).unref();
  setInterval(() => govService.tick(io).catch((e) => console.error('[gov tick]', e.message)), 30 * 1000).unref();
  /* pets: hungry / ill alerts for owners who are away (every 10 minutes; each pet is claimed once across instances) */
  const petAlerts = require('./services/petalerts');
  setTimeout(() => petAlerts.tick(io).catch((e) => console.error('[pet alerts]', e.message)), 60000).unref();
  setInterval(() => petAlerts.tick(io).catch((e) => console.error('[pet alerts]', e.message)), 10 * 60 * 1000).unref();
  setInterval(() => tournamentService.tick().catch((e) => console.error('[tournament tick]', e.message)), 30 * 1000).unref();
  require('./utils/mux').startSweep();   // tidies uploads that never finished (only when Mux is configured)
  server.listen(PORT, () => {
    console.log(`[server] AllConnect running on http://localhost:${PORT}`);
  });

  // Graceful shutdown: stop accepting connections, close sockets, then the databases.
  let closing = false;
  const shutdown = async (sig) => {
    if (closing) return; closing = true;
    console.log(`[server] ${sig} received, shutting down`);
    const force = setTimeout(() => process.exit(1), 10000); force.unref();
    try { io.close(); } catch {}
    await new Promise((r) => server.close(() => r()));
    await closeRedis();
    try { await mongoose.disconnect(); } catch {}
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[server] failed to start:', err);
  process.exit(1);
});
