// Server-authoritative catalogue for AllConnect Nigerian homes & real-estate ladder.
// Reverse-engineered and adapted from Vatarverse property systems.

const HOMES = {
  // Legacy mappings preserved for backwards compatibility
  'mainland_room': { name: 'Mainland Room', area: 'Mushin', description: 'A simple private room to make your own.', mode: 'rent', rent: 2500, rentDays: 7, size: 6, maxGuests: 3, paint: '#c7a17a', max: 1 },
  'self_contained': { name: 'Self-Contained', area: 'Yaba', description: 'Your own compact space with room to furnish near the tech hubs.', mode: 'buy', price: 350000, rent: 6000, rentDays: 7, size: 7, maxGuests: 5, paint: '#e9c46a', max: 1 },
  'mini_flat': { name: 'Mini Flat', area: 'Lekki Phase 1', description: 'A real mini flat: bedroom, sitting room, kitchen and bathroom with POP ceiling.', mode: 'buy', price: 900000, rent: 17000, rentDays: 7, size: 10, maxGuests: 8, paint: '#2a9d8f', max: 1 },
  'two_bedroom': { name: 'Two-Bedroom Apartment', area: 'Ikate, Lekki', description: 'A larger home for future social gatherings with a balcony.', mode: 'buy', price: 2200000, rent: 45000, rentDays: 7, size: 11, maxGuests: 10, paint: '#9a8ac7', max: 1 },

  // Authentic Nigerian City Life Tiers (Vatarverse Parity)
  'mushin_faceme': { name: 'Face-me-I-face-you', area: 'Mushin', description: 'One room, shared compound, loud neighbours. Cheap rent, big dreams.', mode: 'rent', rent: 2400, rentDays: 7, size: 6, maxGuests: 3, paint: '#6fa3c7', max: 1 },
  'yaba_selfcon': { name: 'Yaba Tech Self-Con', area: 'Yaba', description: 'Your own toilet and kitchen corner, right beside the Yaba tech clusters.', mode: 'buy', price: 380000, rent: 6500, rentDays: 7, size: 7, maxGuests: 5, paint: '#f1d27f', max: 1 },
  'lekki_flat': { name: 'Lekki Executive Mini-Flat', area: 'Lekki Phase 1', description: 'Bedroom, sitting room, fitted kitchen and private bath. High rent, high status.', mode: 'buy', price: 950000, rent: 18000, rentDays: 7, size: 10, maxGuests: 8, paint: '#3fb5a6', max: 1 },
  'ikate_terrace': { name: 'Ikate Terrace Duplex', area: 'Ikate, Lekki', description: 'Multi-level living, private parking, and a breezy cantilevered balcony.', mode: 'buy', price: 2800000, rent: 50000, rentDays: 7, size: 11, maxGuests: 10, balcony: true, floors: 2, paint: '#ebe3d6', max: 1 },
  'ikoyi_duplex': { name: 'Old Ikoyi Duplex', area: 'Ikoyi', description: 'Old-money Ikoyi prestige: master suite, guest room, grand sitting room, and snooker space.', mode: 'buy', price: 16000000, rent: 250000, rentDays: 7, size: 12, maxGuests: 12, balcony: true, floors: 2, paint: '#5c677d', max: 1 },
  'banana_island': { name: 'Banana Island Mansion', area: 'Banana Island', description: 'The pinnacle address: grand sitting room, private jetty, pool terrace, and marble everywhere.', mode: 'buy', price: 150000000, rent: 1500000, rentDays: 7, size: 14, maxGuests: 18, balcony: true, floors: 3, paint: '#1d3557', max: 1 }
};

const isHome = (id) => Object.prototype.hasOwnProperty.call(HOMES, id);

const publicHome = (p) => {
  const hDef = HOMES[p.type] || {};
  return {
    id: p.id,
    type: p.type,
    name: hDef.name || 'Home',
    area: hDef.area || 'Lagos',
    description: hDef.description || '',
    size: hDef.size || 6,
    maxGuests: hDef.maxGuests || 4,
    hasBalcony: !!(p.hasBalcony || hDef.balcony),
    floors: p.floors || hDef.floors || 1,
    tenure: p.tenure,
    boughtAt: p.boughtAt,
    leaseExpiresAt: p.leaseExpiresAt,
    paint: p.paint,
    insured: !!p.insured,
    condition: Number.isFinite(p.condition) ? p.condition : 100,
    items: (p.items || []).map(i => ({
      id: i.id,
      name: i.name,
      x: i.x,
      z: i.z,
      rot: i.rot,
      placed: i.placed !== false
    }))
  };
};

module.exports = { HOMES, isHome, publicHome };
