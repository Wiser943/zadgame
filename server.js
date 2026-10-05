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
  app.use((req,res,next)=>{ res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('X-Frame-Options','SAMEORIGIN'); res.setHeader('Referrer-Policy','same-origin'); next(); });
  app.use(express.json({ limit: '1.5mb' })); // profile photos come in as base64 JSON

  const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'dev_secret_change_me',
    proxy: true, // honour X-Forwarded-Proto (also applies to the Socket.io handshake)
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7, httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' } // 7 days
  });
  app.use(sessionMiddleware);

  app.use(passport.initialize());
  app.use(passport.session());

  app.use('/auth', authRoutes);
  app.use('/api', apiRoutes);
  app.use('/admin-api', adminRoutes);
  app.use('/api/social', socialRoutes);
  app.use('/api/tournaments', tournamentRoutes);
  app.use('/api/ac', allconnectRoutes);   // AllConnect platform state (same login as GameHub)
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
  initAllConnect(io);

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
