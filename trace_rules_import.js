const fs = require('fs');
const path = require('path');

const code = fs.readFileSync(path.join(__dirname, 'vatar_chunks', '09z-vckxzvs6x.js'), 'utf8');
const pos = code.indexOf('start: the game\'s rules haven\'t loaded');
if (pos !== -1) {
  console.log(code.substring(pos - 500, pos + 300));
} else {
  console.log('Not found');
}
