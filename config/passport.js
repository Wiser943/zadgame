const passport = require('passport');
const bcrypt = require('bcryptjs');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const { Strategy: LocalStrategy } = require('passport-local');
const User = require('../models/User');
const { normalizeIdentifier } = require('../utils/identifier');

module.exports = function configurePassport() {
  const required = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'CLIENT_URL'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing env vars: ${missing.join(', ')}. Set them in .env (local) or Render's dashboard.`);
  }

  passport.use(new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.CLIENT_URL}/auth/google/callback`
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({ googleId: profile.id });
        const email = (profile.emails?.[0]?.value || '').toLowerCase();
        if (!user && email) user = await User.findOne({ email }); // link to a manually-registered account
        if (!user) {
          try {
            user = await User.create({
              googleId: profile.id,
              displayName: profile.displayName || 'Player',
              email: email || undefined,
              avatar: profile.photos?.[0]?.value || ''
            });
          } catch (createErr) {
            // Duplicate key on a concurrent request (e.g. double-clicked
            // "Continue with Google", or two tabs) shouldn't 500 the callback —
            // someone else just created the same account a moment ago, so fetch it.
            if (createErr.code === 11000) {
              user = await User.findOne({ googleId: profile.id }) || (email && await User.findOne({ email }));
              if (!user) throw createErr;
            } else {
              throw createErr;
            }
          }
        } else {
          user.googleId = user.googleId || profile.id;
          user.displayName = user.displayName === 'Player' ? (profile.displayName || user.displayName) : user.displayName;
          user.avatar = user.avatar || profile.photos?.[0]?.value || '';
          await user.save();
        }
        done(null, user);
      } catch (err) {
        done(err);
      }
    }
  ));

  passport.use(new LocalStrategy(
    { usernameField: 'identifier', passwordField: 'password' },
    async (identifier, password, done) => {
      try {
        const id = normalizeIdentifier(identifier);
        const user = await User.findOne(id.type === 'email' ? { email: id.value } : { phone: id.value });
        if (!user || !user.passwordHash) return done(null, false, { message: 'No account found with that email or phone number.' });
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return done(null, false, { message: 'Incorrect password.' });
        done(null, user);
      } catch (err) { done(err); }
    }
  ));

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id, done) => {
    try { done(null, await User.findById(id)); }
    catch (err) { done(err); }
  });
};
