const fs = require('fs');
const path = require('path');
const chunks = fs.readdirSync('vatar_chunks');

chunks.forEach(c => {
  const code = fs.readFileSync(path.join('vatar_chunks', c), 'utf8');
  ['job', 'hustle', 'energy', 'hunger', 'health', 'career', 'shift', 'salary'].forEach(w => {
    let count = 0;
    let pos = 0;
    while((pos = code.toLowerCase().indexOf(w, pos)) !== -1) {
      count++;
      pos += w.length;
    }
    if (count > 5) {
      console.log(`${c}: '${w}' appears ${count} times`);
    }
  });
});
