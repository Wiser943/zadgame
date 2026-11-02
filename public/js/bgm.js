/* Site-wide background music: one looping track that plays across every app (Home, Map, Phone, GameHub lobby).
   It goes quiet only while you are INSIDE a game room (waiting room or match) and fades back in when you leave.
   Lives in the top window only (GameHub runs inside AllConnect in a frame, so it never doubles up);
   the GameHub page tells it when a room opens or closes through BGM.room(true/false).
   Respects Settings -> Music, pauses with the tab, and stays silent in Saver mode.
   Browsers only allow sound after a tap, so it starts on the first touch. */
(function () {
  if (window.top !== window.self) return;
  var BASE = '/audio/Chrome_Capture_2026-10-06_08-39-17', VOL = 0.3, armed = false, inRoom = false, fade = null;
  /* The music is played through the Web Audio API on purpose: an <audio> element makes the phone show a lock-screen /
     notification-shade media player (with next / pause) for what is only game background sound. Web Audio does not. */
  var AC = window.AudioContext || window.webkitAudioContext, ctx = null, gain = null, src = null, buf = null, loading = null, want = false, level = 0;
  function prefs() { try { return JSON.parse(localStorage.getItem('ghPrefs') || '{}'); } catch (e) { return {}; } }
  function wanted() { var p = prefs(); return p.music !== false && !p.lowPower; }
  /* GameHub is shown in a frame (#hub) on top of AllConnect: a room only counts while that frame is actually on screen */
  function hubShown() { var h = document.getElementById('hub'); return !h || h.style.display === 'flex'; }
  function quiet() { return inRoom && hubShown(); }
  function ctxGet() { if (!AC) return null; if (!ctx) { ctx = new AC(); gain = ctx.createGain(); gain.gain.value = 0; gain.connect(ctx.destination); } return ctx; }
  function load() {
    if (buf) return Promise.resolve(buf); if (loading) return loading;
    var c = ctxGet(); if (!c) return Promise.reject(new Error('no webaudio'));
    var url = BASE + ((new Audio()).canPlayType('audio/webm; codecs=opus') ? '.weba' : '.mp3');
    loading = fetch(url).then(function (r) { return r.arrayBuffer(); }).then(function (ab) {
      return new Promise(function (ok, no) { c.decodeAudioData(ab, ok, no); });
    }).then(function (b) { buf = b; loading = null; return b; }, function (e) { loading = null; throw e; });
    return loading;
  }
  function start() {
    if (src || !buf || !ctx) return;
    src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.connect(gain); src.start(0);
  }
  function ramp(to, done) {
    clearInterval(fade);
    fade = setInterval(function () {
      var d = to - level; if (Math.abs(d) < 0.02) { level = to; if (gain) gain.gain.value = to; clearInterval(fade); if (done) done(); return; }
      level = Math.max(0, Math.min(1, level + (d > 0 ? 0.03 : -0.05))); if (gain) gain.gain.value = level;
    }, 50);
  }
  function play() {
    if (!wanted() || document.hidden || quiet()) return;
    var c = ctxGet(); if (!c) return; want = true;
    var r = c.resume && c.resume(); if (r && r.catch) r.catch(function () { arm(); });
    if (c.state !== 'running') { arm(); }
    load().then(function () { if (want) { start(); ramp(VOL); } }).catch(function () {});
  }
  function pauseNow() { want = false; clearInterval(fade); level = 0; if (gain) gain.gain.value = 0; if (ctx && ctx.state === 'running' && ctx.suspend) ctx.suspend(); }
  function stop() { want = false; if (ctx && ctx.state === 'running') ramp(0, function () { if (!want && ctx) ctx.suspend(); }); }
  function arm() {
    if (armed) return; armed = true;
    var go = function () { armed = false; ['pointerdown', 'keydown', 'touchstart'].forEach(function (e) { document.removeEventListener(e, go, true); }); play(); };
    ['pointerdown', 'keydown', 'touchstart'].forEach(function (e) { document.addEventListener(e, go, true); });
  }
  function sync() { if (wanted() && !quiet()) { play(); } else if (ctx) { if (!wanted()) pauseNow(); else stop(); } }
  window.BGM = {
    sync: sync, play: play, pause: function () { pauseNow(); },
    room: function (on) { inRoom = !!on; sync(); }
  };
  // the hub frame can be closed from AllConnect while a room is still open: keep the music in step with what is on screen
  setInterval(function () { if (inRoom) sync(); }, 800);
  document.addEventListener('visibilitychange', function () { if (document.hidden) { pauseNow(); } else sync(); });
  window.addEventListener('storage', function (e) { if (e.key === 'ghPrefs') sync(); });
  if (wanted()) { arm(); play(); }
})();
