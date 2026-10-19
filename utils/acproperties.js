// Server-authoritative catalogue for additional AllConnect homes.
const HOMES = {
  'mainland_room': { name: 'Mainland Room', description: 'A simple private room to make your own.', mode: 'rent', rent: 25000, rentDays: 7, paint: '#c7a17a', max: 1 },
  'self_contained': { name: 'Self-Contained', description: 'Your own compact space with room to furnish.', mode: 'buy', price: 350000, paint: '#d9a93a', max: 1 },
  'mini_flat': { name: 'Mini Flat', description: 'Extra space for a more comfortable setup.', mode: 'buy', price: 900000, paint: '#8eb7c8', max: 1 },
  'two_bedroom': { name: 'Two-Bedroom Apartment', description: 'A larger home for future social gatherings.', mode: 'buy', price: 2200000, paint: '#9a8ac7', max: 1 }
};
const isHome = (id) => Object.prototype.hasOwnProperty.call(HOMES, id);
const publicHome = (p) => ({ id: p.id, type: p.type, name: HOMES[p.type]?.name || 'Home', description: HOMES[p.type]?.description || '', tenure: p.tenure, boughtAt: p.boughtAt, leaseExpiresAt: p.leaseExpiresAt, paint: p.paint, insured: !!p.insured, condition: Number.isFinite(p.condition) ? p.condition : 100, items: (p.items || []).map(i => ({ id: i.id, name: i.name, x: i.x, z: i.z, rot: i.rot, placed: i.placed !== false })) });
module.exports = { HOMES, isHome, publicHome };
