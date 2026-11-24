const fs = require('fs');
const path = require('path');

const chunk20 = fs.readFileSync(path.join(__dirname, 'vatar_chunks', '20ts_xwi-bdbo.js'), 'utf8');

// The CAREERS definition is around pos 547756
const start = chunk20.lastIndexOf('let e4=', 557385);
console.log('start at', start);
if (start !== -1) {
  console.log(chunk20.substring(start, start + 3500));
} else {
  console.log(chunk20.substring(547000, 552000));
}
