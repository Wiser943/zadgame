// Posts a birthday card on P-Gist for every player whose birthday it is today (Lagos time), once a year, unless they turned it off.
const User = require('../models/User');
const { GistPost } = require('../models/Gist');
const { notify } = require('../utils/acnotify');

const WISHES = [
  'Another year, another level up. Wishing you joy, good health and plenty of money dey. 🎉',
  'May your cash flow, your friends laugh with you, and every shift pay double. 🥳',
  'A fresh year for you: new homes, new jobs, new wins. Enjoy your day! 🎈',
  'Life is sweet and you deserve every bit of it. Happy birthday! 🍰',
  'Wishing you a year of soft life, steady light and good vibes. 🕺'
];
const leap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

async function tick(io) {
  const lagos = new Date(Date.now() + 3600000), m = lagos.getUTCMonth() + 1, d = lagos.getUTCDate(), y = lagos.getUTCFullYear();
  const days = [d]; if (m === 2 && d === 28 && !leap(y)) days.push(29);          // Feb 29 birthdays celebrate on Feb 28 in common years
  const rows = await User.find({ 'ac.bday.m': m, 'ac.bday.d': { $in: days }, 'ac.prefs.showBirthday': true, 'ac.bdayPosted': { $ne: y } }).select('displayName').limit(500).lean();
  let n = 0;
  for (const u of rows) {
    const claim = await User.updateOne({ _id: u._id, 'ac.bdayPosted': { $ne: y } }, { $set: { 'ac.bdayPosted': y } });
    if (claim.modifiedCount !== 1) continue;                                      // another instance already did it
    const theme = Math.floor(Math.random() * 5), wish = WISHES[Math.floor(Math.random() * WISHES.length)];
    await GistPost.create({ author: String(u._id), text: "It's my birthday! 🎂🎉", birthday: { name: String(u.displayName || 'Player').slice(0, 40), wish, theme } });
    try { await notify(io, String(u._id), { icon: '🎂', text: 'Happy birthday! We posted your birthday card on P-Gist.', kind: 'good', ref: 'u:gist' }) } catch (e) { /* the card is posted either way */ }
    n++;
  }
  return n;
}
module.exports = { tick };
