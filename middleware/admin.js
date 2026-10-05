module.exports = function ensureAdmin(req, res, next) {
  if (req.session && req.session.isAdmin === true) return next();
  res.status(401).json({ message: 'Admin login required.' });
};
