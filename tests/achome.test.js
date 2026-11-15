// The home a player entered last is saved on the server and sent back with their AllConnect state.
const test = require('node:test');
const assert = require('node:assert/strict');
const { publicAC } = require('../utils/allconnect');

test('publicAC carries the last entered home', () => {
  assert.equal(publicAC({ cash: 1, paint: '#fff', needs: [], owned: [], items: [], properties: [], activeProperty: 'home-123' }).activeProperty, 'home-123');
  assert.equal(publicAC({ cash: 1, paint: '#fff', needs: [], owned: [], items: [], properties: [] }).activeProperty, '', 'starter room when nothing is saved');
});
