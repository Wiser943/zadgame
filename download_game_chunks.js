const fs = require('fs');
const https = require('https');
const path = require('path');

const code = fs.readFileSync('vatar_chunks/43iioxxz37-84.js', 'utf8');
const regex = /static\/chunks\/([a-zA-Z0-9_\-\.]+\.js)/g;
const matches = [...new Set([...code.matchAll(regex)].map(m => m[1]))];

console.log(`Found ${matches.length} dynamic chunk files to download.`);

const outDir = path.join(__dirname, 'vatar_chunks');

async function download(file) {
  const dest = path.join(outDir, file);
  if (fs.existsSync(dest)) return;
  const url = `https://vatarverse.com/_next/static/chunks/${file}`;
  return new Promise((resolve) => {
    https.get(url, res => {
      if (res.statusCode !== 200) {
        console.error(`Failed ${file}: ${res.statusCode}`);
        return resolve();
      }
      const stream = fs.createWriteStream(dest);
      res.pipe(stream);
      stream.on('finish', () => { stream.close(); resolve(); });
    }).on('error', err => {
      console.error(`Error ${file}: ${err.message}`);
      resolve();
    });
  });
}

async function run() {
  for (let i = 0; i < matches.length; i += 10) {
    const batch = matches.slice(i, i + 10);
    await Promise.all(batch.map(download));
    process.stdout.write('.');
  }
  console.log('\nFinished downloading dynamic chunks!');
}

run();
