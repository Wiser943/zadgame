const crypto = require('crypto');
const PEPPER = () => String(process.env.SESSION_SECRET || 'dev_secret_change_me');
const validPin = (p) => /^\d{4}$/.test(String(p));
const hashPin = (pin, salt) => crypto.scryptSync(String(pin), String(salt) + PEPPER(), 32).toString('hex');
const verifyPin = (pin, salt, hash) => {
  try { const a = Buffer.from(hashPin(pin, salt), 'hex'), b = Buffer.from(String(hash), 'hex'); return a.length === b.length && crypto.timingSafeEqual(a, b); } catch (e) { return false; }
};
const genAcNum = () => String(crypto.randomInt(1000000000, 10000000000));   // 10 digits, no leading zero
const validAcNum = (q) => /^\d{10}$/.test(String(q));
const makeRef = () => 'AC' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(3).toString('hex').toUpperCase();
module.exports = { validPin, hashPin, verifyPin, genAcNum, validAcNum, makeRef };
