// Regenerates data/words.txt (2–7 letter words, profanity-filtered) from the `word-list` package.
// Usage: npm i -D word-list && node scripts/build-dictionary.js
(async () => {
  const fs = require('fs'), path = require('path');
  const { default: words } = await import('word-list');
  const list = fs.readFileSync(words, 'utf8').split('\n').map(w => w.trim().toLowerCase()).filter(w => /^[a-z]{2,7}$/.test(w));
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'words.txt'), [...new Set(list)].sort().join('\n') + '\n');
  console.log('wrote', list.length, 'words');
})();
