const registry = require('../games/registry');
const GameConfig = require('../models/GameConfig');
const defaultRules = require('./defaultRules');
const overrides = new Map();
function baseGame(key) { return registry.find(g => g.key === key); }
function effectiveGames() { return registry.map(g => ({ ...g, rules: defaultRules[g.key] || [], ...(overrides.get(g.key) || {}) })); }
function effectiveGame(key) { const g = baseGame(key); return g ? { ...g, rules: defaultRules[key] || [], ...(overrides.get(key) || {}) } : null; }
async function loadGameSettings() {
  const rows = await GameConfig.find({}).lean();
  rows.forEach(row => { if (baseGame(row.key)) overrides.set(row.key, { available: row.available, playerCounts: row.playerCounts, rules: row.rules }); });
}
async function saveGameSettings(key, patch) {
  const next = { ...effectiveGame(key), ...patch };
  await GameConfig.findOneAndUpdate({ key }, { $set: { key, available: next.available, playerCounts: next.playerCounts, rules: next.rules } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  overrides.set(key, { available: next.available, playerCounts: next.playerCounts, rules: next.rules });
  return effectiveGame(key);
}
module.exports = { effectiveGames, effectiveGame, loadGameSettings, saveGameSettings };
