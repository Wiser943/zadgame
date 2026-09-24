require('dotenv').config();

const path = require('path');
const express = require('express');
const http = require('http');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
const { Server } = require('socket.io');

const connectDB = require('./config/db');
const configurePassport = require('./config/passport');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const initSockets = require('./sockets');

const PORT = process.env.PORT || 3000;

async function main() {
  await connectDB();
  configurePassport();

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);

  app.use(express.json());

  const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'dev_secret_change_me',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 7 days
  });
  app.use(sessionMiddleware);

  app.use(passport.initialize());
  app.use(passport.session());

  app.use('/auth', authRoutes);
  app.use('/api', apiRoutes);

  app.use(express.static(path.join(__dirname, 'public')));

  // Anything else -> back to the landing page
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  initSockets(io, sessionMiddleware);

  server.listen(PORT, () => {
    console.log(`[server] GameHub running on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error('[server] failed to start:', err);
  process.exit(1);
});
