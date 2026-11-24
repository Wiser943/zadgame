const fs = require('fs');
const path = require('path');

const rulesChunks = [
  "2w_f_u97-p3wv.js",
  "060hwsh77dfa5.js",
  "215nczdjne_kd.js",
  "0-zv2nh5-bo1o.js",
  "0qlza-i2e72cj.js",
  "0kgrwobv8zlib.js",
  "1kyejlmsp4oae.js",
  "3c9kp8wjhni9-.js",
  "40ssz60ea5cir.js",
  "20ts_xwi-bdbo.js"
];

rulesChunks.forEach(file => {
  const filePath = path.join(__dirname, 'vatar_chunks', file);
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  console.log(`=== File: ${file} (size ${content.length}) ===`);
  const exportMatches = [...content.matchAll(/e\.s\(\[([^\]]+)\]\)/g)];
  exportMatches.forEach(m => {
    const names = m[1].match(/"([^"]+)"/g);
    if (names) {
      console.log('  Exports:', names.slice(0, 30).join(', '));
    }
  });
});
