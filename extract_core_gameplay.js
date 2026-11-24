const fs = require('fs');
const path = require('path');

function inspectChunk(fileName, terms) {
  const filePath = path.join(__dirname, 'vatar_chunks', fileName);
  if (!fs.existsSync(filePath)) return;
  const code = fs.readFileSync(filePath, 'utf8');
  console.log(`\n================== ${fileName} ==================`);
  terms.forEach(t => {
    let pos = 0;
    while ((pos = code.indexOf(t, pos)) !== -1) {
      console.log(`--- [${t}] at ${pos} ---`);
      console.log(code.substring(Math.max(0, pos - 100), Math.min(code.length, pos + 500)));
      console.log('--------------------------------------------------');
      pos += t.length + 100;
    }
  });
}

// 1. BASE_NEEDS in 14rjprbdpeouo.js
inspectChunk('14rjprbdpeouo.js', ['BASE_NEEDS']);

// 2. LOCAL_HUSTLES in 1ne7vgr0mwjs-.js and 1pngspn8p3dtn.js
inspectChunk('1ne7vgr0mwjs-.js', ['LOCAL_HUSTLES']);
inspectChunk('1pngspn8p3dtn.js', ['LOCAL_HUSTLES']);

// 3. BASE_NEEDS and LAGOS jobs in 20ts_xwi-bdbo.js
inspectChunk('20ts_xwi-bdbo.js', ['BASE_NEEDS', 'LOCAL_HUSTLES', 'LAGOS_JOBS', 'CAREER']);
