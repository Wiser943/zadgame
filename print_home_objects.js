const fs = require('fs');
const path = require('path');

const chunk20 = fs.readFileSync(path.join(__dirname, 'vatar_chunks', '20ts_xwi-bdbo.js'), 'utf8');

const p = chunk20.indexOf('CATEGORIES');
console.log(chunk20.substring(Math.max(0, p - 3500), p));
