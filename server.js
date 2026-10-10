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
const acPoliceRoutes = require('./routes/acpolice');
const acGistRoutes = require('./routes/acgist');
const acSocialRoutes = require('./routes/acsocial');
const acGroupRoutes = require('./routes/acgroups');
const acJobRoutes = require('./routes/acjobs');
const acAdRoutes = require('./routes/acads');
const acItemRoutes = require('./routes/acitems');
const acInvestRoutes = require('./routes/acinvest');
const publicAdsRoutes = require('./routes/publicads');
const acBankRoutes = require('./routes/acbank');
const acLagosRoutes = require('./routes/aclagos');
const acCreatorRoutes = require('./routes/accreator');
const acMusicRoutes = require('./routes/acmusic');
const acHubRoutes = require('./routes/achub');
const acStyleRoutes = require('./routes/acstyle');
const acPushRoutes = require('./routes/acpush');
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
  const io = new Server(server);
  await attachRedis(io);

  // Render (and most hosts) terminate HTTPS at a proxy. Without this, Express
  // thinks requests are plain HTTP and refuses to set the Secure session cookie.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((req,res,next)=>{ res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('X-Frame-Options','SAMEORIGIN'); res.setHeader('Referrer-Policy','same-origin'); res.setHeader('Permissions-Policy','camera=(self), microphone=(self), geolocation=()'); next(); });
  app.use('/api/ac/photos', express.json({ limit: '6mb' })); // camera photos arrive as base64 JSON (must come before the global parser)
  app.use(express.json({ limit: '1.5mb' })); // profile photos come in as base64 JSON

  const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'dev_secret_change_me',
    proxy: true, // honour X-Forwarded-Proto (also applies to the Socket.io handshake)
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7, httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' ? 'auto' : false } // 7 days
  });
  app.use(sessionMiddleware);

  app.use(passport.initialize());
  app.use(passport.session());

  app.use('/auth', authRoutes);
  app.use('/api', apiRoutes);
  app.use('/admin-api', adminRoutes);
  app.use('/api/social', socialRoutes);
  app.use('/api/tournaments', tournamentRoutes);
  app.use('/api/ac/photos', acPhotoRoutes);
  app.use('/api/ac/police', acPoliceRoutes);
  app.use('/api/ac/gist', acGistRoutes);
  app.use('/api/ac/groups', acGroupRoutes);
  app.use('/api/ac/jobs', acJobRoutes);
  app.use('/api/ac/ads', acAdRoutes);
  app.use('/api/ac/items', acItemRoutes);
  app.use('/api/ac/invest', acInvestRoutes);
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

  app.use('/assets', express.static(path.join(__dirname, 'assets')));
  app.use(express.static(path.join(__dirname, 'public'), { index: false }));

  // AllConnect is the platform (home page). GameHub is an app inside it, served at /gamehub.
  // Old GameHub invite/share links (/?code=..., ?spectate=..., ?h=..., ?by=...) still open GameHub directly.
  const GAMEHUB = path.join(__dirname, 'public', 'index.html');
  app.get('/', (req, res) => {
    const q = req.query || {};
    if (q.code || q.spectate || q.h || q.by) return res.sendFile(GAMEHUB);
    res.sendFile(path.join(__dirname, 'public', 'allconnect', 'index.html'));
  });
  app.get('/gamehub', (req, res) => res.sendFile(GAMEHUB));
  app.get('/advertise', (req, res) => res.sendFile(path.join(__dirname, 'public', 'advertise.html')));
  app.get('/status', (req, res) => res.sendFile(path.join(__dirname, 'public', 'status.html')));
  app.get('/stats', (req, res) => res.sendFile(path.join(__dirname, 'public', 'stats.html')));

  // GameHub's own client-side routes (/lobby, /shop, /friends ...) fall through to GameHub
  app.get('*', (req, res) => res.sendFile(GAMEHUB));

  // Central error handler. Without this, any error passed to next(err) (e.g.
  // a DB error inside the Google OAuth verify callback) falls through to
  // Express's default handler and shows a bare "Internal Server Error" page
  // with no useful info. This logs the real error server-side and gives the
  // client something sane back.
  app.use((err, req, res, next) => {
    console.error('[error]', req.method, req.originalUrl, err);
    if (res.headersSent) return next(err);
    if (req.path.startsWith('/auth/google')) {
      // Send the user back to the landing page with a flag instead of a raw 500,
      // so the front end can show a real message.
      return res.redirect((process.env.CLIENT_URL || '/') + '?auth_error=1');
    }
    res.status(500).json({ message: 'Something went wrong on our end. Please try again.' });
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
  setInterval(() => tournamentService.tick().catch((e) => console.error('[tournament tick]', e.message)), 30 * 1000).unref();
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
