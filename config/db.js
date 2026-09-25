const mongoose = require('mongoose');

module.exports = async function connectDB() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set. Add it to your .env (local) or your Render environment variables.');
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[db] connected to MongoDB');

  // Keep real indexes in sync with the schema. This matters a lot for the
  // User model: email/phone/googleId are unique+sparse, and if an index was
  // ever built (e.g. during earlier development) before `sparse: true` was
  // added, Mongoose will NOT rebuild it automatically. A stale non-sparse
  // unique index treats every doc missing that field as email: null / phone:
  // null, so the second user who signs up without one of those fields gets a
  // false "duplicate key" error — which surfaces as a bogus "account already
  // exists" on manual register and an Internal Server Error on the Google
  // callback, even though no such account actually exists in the DB.
  const User = require('../models/User');
  try {
    await User.syncIndexes();
    console.log('[db] User indexes synced with schema');
  } catch (err) {
    console.error('[db] failed to sync User indexes — auth may misbehave until this is fixed:', err.message);
  }
};
