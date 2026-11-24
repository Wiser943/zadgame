const fs = require('fs');
const path = require('path');

const files = [
  '2l9re5ml5wpzk.js',
  '0xng5wil3s4hc.js',
  '3-g-ghc0361de.js',
  '218p1vh9_l-sl.js',
  '09z-vckxzvs6x.js',
  '0s2gsbaxoefg_.js',
  '3g-38brncy0r-.js'
];

const results = {};

files.forEach(file => {
  const code = fs.readFileSync(path.join(__dirname, 'vatar_chunks', file), 'utf8');
  results[file] = {};

  // Extract quoted strings longer than 3 chars that might be gameplay text
  const strings = [...code.matchAll(/"([^"\\]{4,80})"/g)].map(m => m[1]);
  
  // Filter interesting strings
  const gameplayKeywords = ['hustle', 'job', 'work', 'salary', 'energy', 'hunger', 'health', 'cash', 'naira', 'reputation', 'rent', 'stats', 'level', 'skill', 'police', 'hospital', 'party', 'shrine', 'market', 'office', 'bank', 'coins', 'xp', 'shift', 'boss', 'interview', 'promote', 'demote', 'fired', 'wage'];
  
  const relevantStrings = strings.filter(s => {
    const l = s.toLowerCase();
    return gameplayKeywords.some(k => l.includes(k));
  });

  results[file].relevantStrings = [...new Set(relevantStrings)];
});

fs.writeFileSync('gameplay_strings.json', JSON.stringify(results, null, 2));
console.log('Saved gameplay_strings.json');
