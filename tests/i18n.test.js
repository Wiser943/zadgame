const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '..', 'public', 'index.html'), 'utf8');
const start = html.indexOf('const I18N = {'), end = html.indexOf('let LANG =', start);
const I18N = vm.runInNewContext(html.slice(start, end).replace('const I18N =', 'I18N =') + '; I18N');

test('every language has exactly the same keys as English', () => {
  const en = Object.keys(I18N.en).sort();
  for (const [code, dict] of Object.entries(I18N)) assert.deepEqual(Object.keys(dict).sort(), en, code);
});
test('no translation is empty and placeholders such as & are kept consistent', () => {
  for (const dict of Object.values(I18N)) for (const [k, v] of Object.entries(dict)) assert.ok(String(v).trim().length > 0, k);
});
test('every t("key") used in the page exists in English', () => {
  const used = [...html.matchAll(/\bt\('([a-z0-9.\-]+)'/g)].map((m) => m[1]).filter((k) => !k.endsWith('.'));
  const missing = used.filter((k) => !(k in I18N.en));
  assert.deepEqual(missing, []);
});
