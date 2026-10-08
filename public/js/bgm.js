/* Site-wide background music: one looping track that plays across every app (Home, Map, Phone, GameHub lobby).
   It goes quiet only while you are INSIDE a game room (waiting room or match) and fades back in when you leave.
   Lives in the top window only (GameHub runs inside AllConnect in a frame, so it never doubles up);
   the GameHub page tells it when a room opens or closes through BGM.room(true/false).
   Respects Settings -> Music, pauses with the tab, and stays silent in Saver mode.
   Browsers only allow sound after a tap, so it starts on the first touch. */
(function () {
  if (window.top !== window.self) return;
  var BASE = '/audio/Chrome_Capture_2026-10-06_08-39-17', VOL = 0.3, audio = null, armed = false, inRoom = false, fade = null;
  function prefs() { try { return JSON.parse(localStorage.getItem('ghPrefs') || '{}'); } catch (e) { return {}; } }
  function wanted() { var p = prefs(); return p.music !== false && !p.lowPower; }
  /* GameHub is shown in a frame (#hub) on top of AllConnect: a room only counts while that frame is actually on screen */
  function hubShown() { var h = document.getElementById('hub'); return !h || h.style.display === 'flex'; }
  function quiet() { return inRoom && hubShown(); }
  function make() {
    if (audio) return audio;
    audio = new Audio();
    // .weba (opus) is small, but older Safari can't play it: fall back to the mp3 copy
    audio.src = (audio.canPlayType('audio/webm; codecs=opus') ? BASE + '.weba' : BASE + '.mp3');
    audio.loop = true; audio.preload = 'auto'; audio.volume = 0; return audio;
  }
  function ramp(to, done) {
    var a = make(); clearInterval(fade);
    fade = setInterval(function () {
      var d = to - a.volume; if (Math.abs(d) < 0.02) { a.volume = to; clearInterval(fade); if (done) done(); return; }
      a.volume = Math.max(0, Math.min(1, a.volume + (d > 0 ? 0.03 : -0.05)));
    }, 50);
  }
  function play() {
    if (!wanted() || document.hidden || quiet()) return;
    var a = make(), r = a.play();
    if (r && r.catch) r.catch(function () { arm(); });
    ramp(VOL);
  }
  function stop() { if (audio && !audio.paused) ramp(0, function () { audio.pause(); }); }
  function arm() {
    if (armed) return; armed = true;
    var go = function () { armed = false; ['pointerdown', 'keydown', 'touchstart'].forEach(function (e) { document.removeEventListener(e, go, true); }); play(); };
    ['pointerdown', 'keydown', 'touchstart'].forEach(function (e) { document.addEventListener(e, go, true); });
  }
  function sync() { if (wanted() && !quiet()) { play(); } else if (audio) { if (!wanted()) { clearInterval(fade); audio.pause(); } else stop(); } }
  window.BGM = {
    sync: sync, play: play, pause: function () { if (audio) audio.pause(); },
    room: function (on) { inRoom = !!on; sync(); }
  };
  // the hub frame can be closed from AllConnect while a room is still open: keep the music in step with what is on screen
  setInterval(function () { if (inRoom) sync(); }, 800);
  document.addEventListener('visibilitychange', function () { if (document.hidden) { if (audio) audio.pause(); } else sync(); });
  window.addEventListener('storage', function (e) { if (e.key === 'ghPrefs') sync(); });
  if (wanted()) { arm(); play(); }
})();
