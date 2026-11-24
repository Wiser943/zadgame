const fs = require('fs');
const path = require('path');

const code = fs.readFileSync(path.join(__dirname, 'vatar_chunks', '09z-vckxzvs6x.js'), 'utf8');

// Find all occurrences of create( or set( or store
const pos = code.indexOf('lagos-life-save');
console.log(code.substring(Math.max(0, pos - 1500), Math.min(code.length, pos + 4000)));
