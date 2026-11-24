const fs = require('fs');
const path = require('path');

const chunk20 = fs.readFileSync(path.join(__dirname, 'vatar_chunks', '20ts_xwi-bdbo.js'), 'utf8');

// Find CATEGORIES, starter, layout, objects
const p1 = chunk20.indexOf('CATEGORIES');
console.log('=== CATEGORIES & OBJECTS IN 20ts_xwi-bdbo.js ===');
console.log(chunk20.substring(p1, p1 + 3000));
