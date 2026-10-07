/* Site-wide background music: one looping track that plays across every app.
   Lives in the top window only (GameHub runs inside AllConnect in a frame, so it never doubles up).
   Respects Settings -> Music, pauses with the tab, and stays silent in Saver mode. Browsers only allow sound after a tap, so it starts on the first touch. */
(function () {
  if (window.top !== window.self) return;
  var SRC = '/audio/Chrome_Capture_2026-10-06_08-39-17.weba', audio = null, armed = false;
  function prefs() { try { return JSON.parse(localStorage.getItem('ghPrefs') || '{}'); } catch (e) { return {}; } }
  function wanted() { var p = prefs(); return p.music !== false && !p.lowPower; }
  function make() { if (audio) return audio; audio = new Audio(SRC); audio.loop = true; audio.preload = 'auto'; audio.volume = 0.3; return audio; }
  function play() { if (!wanted() || document.hidden) return; var a = make(); var r = a.play(); if (r && r.catch) r.catch(function () { arm(); }); }
  function arm() {
    if (armed) return; armed = true;
    var go = function () { armed = false; ['pointerdown', 'keydown', 'touchstart'].forEach(function (e) { document.removeEventListener(e, go, true); }); play(); };
    ['pointerdown', 'keydown', 'touchstart'].forEach(function (e) { document.addEventListener(e, go, true); });
  }
  function sync() { if (wanted()) { play(); } else if (audio) { audio.pause(); } }
  window.BGM = { sync: sync, play: play, pause: function () { if (audio) audio.pause(); } };
  document.addEventListener('visibilitychange', function () { if (document.hidden) { if (audio) audio.pause(); } else sync(); });
  window.addEventListener('storage', function (e) { if (e.key === 'ghPrefs') sync(); });
  if (wanted()) { arm(); play(); }
})();
