// AllConnect platform rules shared by routes + tests. No database access in here.
const CATALOGUE = {
  'Classic Cream': 3000, 'Lagos Sky': 3000, 'Mint Fresh': 3000, 'Peach Glow': 3000, 'Soft Lilac': 3000,
  'Naija Green': 4000, 'Lekki Charcoal': 5000, 'Owambe Gold': 6000,
  'Single Bed': 45000, 'Foam Mattress': 60000, 'Queen Bed': 250000, 'Net': 8000,
  'Gas Cooker': 85000, 'Fridge': 320000, 'Gen Set': 180000,
  'Bucket Set': 2000, 'Water Closet': 70000, 'Shower': 40000
};
const DEFAULT_AC = () => ({ cash: 2000000, paint: '#d9a93a', owned: ['Classic Cream'], needs: [.9, .9, .9, .9, .9, .9], min: 19 * 60 });
const priceOf = (name) => (Object.prototype.hasOwnProperty.call(CATALOGUE, name) ? CATALOGUE[name] : null);
// The client may only save cosmetic/state fields. Cash and owned items are server-controlled.
function sanitizeSave(b = {}) {
  const out = {};
  if (typeof b.paint === 'string' && /^#[0-9a-f]{6}$/i.test(b.paint)) out.paint = b.paint.toLowerCase();
  if (Array.isArray(b.needs) && b.needs.length === 6 && b.needs.every((v) => typeof v === 'number' && isFinite(v))) out.needs = b.needs.map((v) => Math.max(0, Math.min(1, v)));
  if (Number.isFinite(b.min)) out.min = Math.max(0, Math.floor(b.min)) % 100000;
  return out;
}
const publicAC = (ac) => ({ cash: ac.cash, paint: ac.paint, owned: [...(ac.owned || [])], needs: [...(ac.needs || [])], min: ac.min, gemsFound: ac.gemsFound || 0 });
module.exports = { CATALOGUE, DEFAULT_AC, priceOf, sanitizeSave, publicAC };
