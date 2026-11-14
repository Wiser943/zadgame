/* Site-wide background music: one looping track that plays across every app (Home, Map, Phone, GameHub lobby).
   It goes quiet only while you are INSIDE a game room (waiting room or match) and fades back in when you leave.
   Lives in the top window only (GameHub runs inside AllConnect in a frame, so it never doubles up);
   the GameHub page tells it when a room opens or closes through BGM.room(true/false).
   Respects Settings -> Music, pauses with the tab, and stays silent in Saver mode.
   Browsers only allow sound after a tap, so it starts on the first touch. */
(function () {
  if (window.top !== window.self) return;
  var BASE = '/audio/Chrome_Capture_2026-10-06_08-39-17', VOL = 0.3, armed = false, inRoom = false, fade = null, ramping = false;
  /* The music is played through the Web Audio API on purpose: an <audio> element makes the phone show a lock-screen /
     notification-shade media player (with next / pause) for what is only game background sound. Web Audio does not. */
  var AC = window.AudioContext || window.webkitAudioContext, ctx = null, gain = null, src = null, buf = null, loading = null, want = false, level = 0;
  function prefs() { try { return JSON.parse(localStorage.getItem('ghPrefs') || '{}'); } catch (e) { return {}; } }
  function wanted() { var p = prefs(); return p.music !== false && !p.lowPower; }
  /* GameHub is shown in a frame (#hub) on top of AllConnect: a room only counts while that frame is actually on screen */
  function hubShown() { var h = document.getElementById('hub'); return !h || h.style.display === 'flex'; }
  /* Anything else that makes sound or listens takes priority: reels and videos, voice notes (playing or recording), Songify and other music,
     the microphone, Drive. The track pauses while ANY of these is active and comes back by itself a moment after the last one stops. */
  var holds = {}, media = [], seq = 0, back = null;
  function heldNow() { for (var k in holds) if (holds[k]) return true; for (var i = media.length - 1; i >= 0; i--) { if (!counts(media[i])) media.splice(i, 1); } return media.length > 0; }
  function counts(el) {
    try {
      if (!el || el.paused || el.ended) return false;
      var d = el.duration, isVid = el.tagName === 'VIDEO', reelish = isVid && el.matches && el.matches('.rl-v,.ginline-v,.rl-prev video,#rle_v');
      if (el.muted && !reelish) return false; if (el.volume === 0) return false;
      if (isFinite(d) && d < (isVid ? 2 : 6)) return false;   /* short button clicks and sound effects do not count */
      return true;
    } catch (e) { return false; }
  }
  function changed() { clearTimeout(back); back = setTimeout(sync, heldNow() ? 0 : 700); }   /* wait a beat before coming back so track-to-track gaps do not flutter */
  function hold(key, on) { if (on) holds[key] = 1; else delete holds[key]; changed(); }
  function track(el) {
    if (el.__bgm) return; el.__bgm = 1;
    var add = function () { if (media.indexOf(el) < 0 && counts(el)) media.push(el); changed(); };
    var del = function () { var i = media.indexOf(el); if (i >= 0) media.splice(i, 1); changed(); };
    ['playing', 'timeupdate'].forEach(function (e) { el.addEventListener(e, e === 'timeupdate' ? function () { if (media.indexOf(el) < 0 && counts(el)) add(); } : add); });
    ['pause', 'ended', 'emptied', 'abort', 'error', 'volumechange'].forEach(function (e) { el.addEventListener(e, function () { counts(el) ? add() : del(); }); });
  }
  /* works for <video>/<audio> in the page, for detached new Audio() (voice notes, Songify) and inside the same-origin game frames */
  function patchWin(w) {
    try {
      if (!w || w.__bgmPatched || !w.HTMLMediaElement) return; w.__bgmPatched = 1;
      var P = w.HTMLMediaElement.prototype, op = P.play;
      P.play = function () { track(this); return op.apply(this, arguments); };
      var md = w.navigator && w.navigator.mediaDevices, gum = md && md.getUserMedia;
      if (gum) md.getUserMedia = function () {
        return gum.apply(md, arguments).then(function (st) {
          if (st && st.getAudioTracks && st.getAudioTracks().length) { var k = 'mic' + (++seq); hold(k, true); var iv = setInterval(function () { if (!st.getAudioTracks().some(function (t) { return t.readyState === 'live'; })) { clearInterval(iv); hold(k, false); } }, 600); }
          return st;
        });
      };
    } catch (e) { }
  }
  function patchFrames() { var f = document.getElementsByTagName('iframe'); for (var i = 0; i < f.length; i++) { try { patchWin(f[i].contentWindow); } catch (e) { } } }
  patchWin(window);
  function quiet() { return (inRoom && hubShown()) || heldNow(); }
  function ctxGet() { if (!AC) return null; if (!ctx) { ctx = new AC(); gain = ctx.createGain(); gain.gain.value = 0; gain.connect(ctx.destination); ctx.onstatechange = recover; } return ctx; }
  /* the audio engine can be paused by the phone (a call, another app, a sound from elsewhere): bring it back by itself */
  function recover() { if (want && !document.hidden && !quiet() && ctx && ctx.state !== 'running') { var r = ctx.resume && ctx.resume(); if (r && r.catch) r.catch(function () { arm(); }); } }
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
    clearInterval(fade); ramping = true;
    fade = setInterval(function () {
      var d = to - level; if (Math.abs(d) < 0.02) { level = to; if (gain) gain.gain.value = to; clearInterval(fade); ramping = false; if (done) done(); return; }
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
  function pauseNow() { want = false; clearInterval(fade); ramping = false; level = 0; if (gain) gain.gain.value = 0; if (ctx && ctx.state === 'running' && ctx.suspend) ctx.suspend(); }
  function stop() { want = false; if (ctx && ctx.state === 'running') ramp(0, function () { if (!want && ctx) ctx.suspend(); }); }
  function arm() {
    if (armed) return; armed = true;
    var go = function () { armed = false; ['pointerdown', 'keydown', 'touchstart'].forEach(function (e) { document.removeEventListener(e, go, true); }); play(); };
    ['pointerdown', 'keydown', 'touchstart'].forEach(function (e) { document.addEventListener(e, go, true); });
  }
  function sync() { if (wanted() && !quiet()) { play(); } else if (ctx) { if (!wanted()) pauseNow(); else stop(); } }
  /* The music has ONE fixed loudness (VOL). Nothing in the game changes it except the Music switch in Settings, the HUD mute
     and walking into a game room. A watchdog puts the level back if anything else ever moves it, and wakes the engine if it was paused.
     (The phone's own volume buttons still scale ALL sound from every website: a web page cannot override that.) */
  setInterval(function () {
    if (!want || document.hidden || quiet()) return;
    if (gain && src && !ramping && Math.abs(gain.gain.value - level) > 0.005) gain.gain.value = level;
    if (ctx && ctx.state !== 'running') recover();
  }, 1000);
  window.BGM = {
    sync: sync, play: play, pause: function () { pauseNow(); },
    room: function (on) { inRoom = !!on; sync(); },
    hold: hold
  };
  // the hub frame can be closed from AllConnect while a room is still open: keep the music in step with what is on screen
  setInterval(function () { if (inRoom) sync(); }, 800);
  setInterval(patchFrames, 1500);
  document.addEventListener('visibilitychange', function () { if (document.hidden) { pauseNow(); } else sync(); });
  window.addEventListener('storage', function (e) { if (e.key === 'ghPrefs') sync(); });
  if (wanted()) { arm(); play(); }
})();
