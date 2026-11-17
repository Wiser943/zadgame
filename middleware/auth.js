module.exports = function ensureAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    if (req.user?.suspendedUntil && new Date(req.user.suspendedUntil).getTime() > Date.now()) return res.status(403).json({ message: 'Your account is temporarily suspended.' });
    return next();
  }
  res.status(401).json({ message: 'Unauthorized' });
};
