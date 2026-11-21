/* Voice commands for the Pet. The Pet turns what the player says (or types) into text; this file decides whether that text is a
   COMMAND ("open Songify and play Starlight by Tema") and, if so, runs it. Rules only, no AI call, so it is free and instant.
   - Only actions on the fixed list below can run. Nothing the player says is ever evaluated as code.
   - Money never moves by voice: a "send ₦5000 to ..." sentence only opens Bank, and the player taps to confirm there.
   handle(text, petName) returns { say } when it was a command (the Pet speaks `say`), or null so the Pet answers as usual. */
const VCMD = {
  /* extra spoken names for the apps in OPEN (app.js). Keys are plain lowercase words, values are the OPEN key. */
  ALIAS: {
    'game hub': 'GameHub', 'games': 'GameHub', 'game': 'GameHub', 'lagosrun': 'Drive', 'lagos run': 'Drive', 'drive': 'Drive', 'run': 'Drive',
    'gist': 'P-Gist', 'p gist': 'P-Gist', 'pgist': 'P-Gist', 'reels': 'P-Gist', 'posts': 'P-Gist',
    'news': 'Gazette', 'newspaper': 'Gazette', 'whats new': "What's New", 'what is new': "What's New", 'updates': "What's New",
    'music': 'Songify', 'songs': 'Songify', 'money': 'Bank', 'wallet': 'Bank', 'bank': 'Bank',
    'chat': 'Messages', 'chats': 'Messages', 'texts': 'Messages', 'messages': 'Messages', 'message': 'Messages', 'friends': 'Contacts',
    'work': 'Jobs', 'job': 'Jobs', 'my pet': 'Pet', 'cat': 'Pet', 'government': 'State House', 'house': 'Homes', 'houses': 'Homes',
    'investments': 'Invest', 'adverts': 'Ads', 'search': 'Search', 'camera': 'Camera', 'photos': 'Camera', 'cop': 'Police', 'cops': 'Police'
  },
  on() { try { return (PET.vp().cmds !== false) } catch (e) { return true } },
  norm(t) { return String(t || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9₦ ]+/g, ' ').replace(/\s+/g, ' ').trim() },
  title(s) { return String(s || '').replace(/\b[a-z]+/g, (w, i) => i > 0 && /^(by|of|the|and|ft|feat|in|on|a)$/.test(w) ? w : w[0].toUpperCase() + w.slice(1)) },
  /* "open X": find the app whose name or alias is X */
  appFor(name) {
    const n = this.norm(name).replace(/ app$/, ''); if (!n || typeof OPEN === 'undefined') return '';
    const keys = Object.keys(OPEN), flat = s => this.norm(s).replace(/ /g, '');
    return keys.find(k => flat(k) === n.replace(/ /g, '')) || (this.ALIAS[n] && OPEN[this.ALIAS[n]] ? this.ALIAS[n] : '') || '';
  },
  /* run one of the fixed OPEN strings (they are written in app.js, never from the player's words) */
  launch(key) { try { new Function(OPEN[key])(); return true } catch (e) { return false } },
  playing() { return typeof SONGIFY !== 'undefined' && SONGIFY.current && SONGIFY.isPlaying && SONGIFY.isPlaying() },
  playSong(query) {
    if (typeof SONGIFY === 'undefined') return false;
    query = query.replace(/\s+(?:on|in|with)\s+(?:songify|the music app|music)\s*$/, '').replace(/\s+please$/, '').trim(); if (query.length < 2) return false;
    try { SONGIFY.open() } catch (e) { return false }
    /* the Songify screen has to be drawn before it can search; "play ..." makes it start the first result by itself */
    setTimeout(() => { try { SONGIFY.q = 'play ' + query; const i = document.getElementById('songify-q'); if (i) i.value = query; SONGIFY.search() } catch (e) {} }, 260);
    return true;
  },
  handle(text, petName) {
    if (!this.on()) return null;
    let t = this.norm(text); if (!t || t.length > 140) return null;
    const nm = this.norm(petName || '');
    t = t.replace(new RegExp('^(?:hey|hi|hello|ok|okay|yo)\\s+' + (nm ? '(?:' + nm.replace(/[^a-z0-9 ]/g, '') + '\\s+)?' : ''), ''), '')
      .replace(/^(?:please|can you|could you|would you|will you|i want you to|i want to|i wanna|abeg)\s+/, '').replace(/^please\s+/, '').trim();
    if (!t) return null;
    let m;
    /* money: never by voice */
    if (/\b(send|transfer|pay|give)\b/.test(t) && /(₦|\bnaira\b|\b\d{3,}\b|\bk\b)/.test(t)) { this.launch('Bank'); return { say: 'Money moves need your tap, so I opened Bank for you.' } }
    /* play a song: "play starlight by tema", "open songify and play ...", "put on ...", "i want to hear ..." */
    if ((m = t.match(/^(?:open (?:songify|music|the music app)(?: app)?(?: and| then)? )?(?:play|put on|throw on|play me|sing|hear|listen to|(?:i )?(?:want to|wanna) (?:hear|listen to)|let me (?:hear|listen to)) (?:me )?(.+)$/))) {
      const q = m[1].replace(/^(?:the )?(?:song|track|music) /, '').trim();
      const ak = this.appFor(q); if (ak && ak !== 'Songify' && this.launch(ak)) return { say: `Opening ${ak}.` };
      if (/^(?:some )?(?:music|songs?)$/.test(q)) { this.launch('Songify'); return { say: 'Opening Songify. What shall we play?' } }
      if (this.playSong(q)) return { say: `Playing ${this.title(q)} 🎶` };
    }
    /* music controls */
    if (/^(?:stop|pause|mute|turn off)(?: the)?(?: music| song| songify| player)?$/.test(t) && typeof SONGIFY !== 'undefined' && SONGIFY.current) {
      if (this.playing()) SONGIFY.toggle(); return { say: 'Music paused.' } }
    if (/^(?:resume|continue|unpause)(?: the)?(?: music| song)?$/.test(t) && typeof SONGIFY !== 'undefined' && SONGIFY.current) { if (!this.playing()) SONGIFY.toggle(); return { say: 'Back to the music.' } }
    if (/^(?:next|skip)(?: the)?(?: song| track)?$/.test(t) && typeof SONGIFY !== 'undefined' && SONGIFY.current) { SONGIFY.next(); return { say: 'Next song!' } }
    if (/^(?:previous|go back)(?: song| track)$/.test(t) && typeof SONGIFY !== 'undefined' && SONGIFY.current) { SONGIFY.prev(); return { say: 'Previous song.' } }
    /* where am I / how much do I have */
    if (/\b(?:balance|how much (?:money|cash|naira)(?: do i have)?|my money)\b/.test(t) && typeof S !== 'undefined' && S.cash != null) return { say: `You have ${UI.fmt(S.cash)}.` };
    if (/^(?:go )?(?:back )?(?:to )?(?:my )?(?:home|room|flat)$/.test(t) && typeof nav === 'function') { nav('home'); return { say: 'Taking you home.' } }
    if (/^(?:go to |open |show |take me to )?(?:the )?(?:city )?map$/.test(t) && typeof nav === 'function') { nav('map'); return { say: 'Opening the map.' } }
    if (/^(?:go to sleep|sleep now|time to sleep)$/.test(t) && typeof PET !== 'undefined' && PET.p && !PET.p.asleep) { PET.sleep(); return { say: '' } }
    /* open an app */
    if ((m = t.match(/^(?:open|launch|start|go to|show me|show|take me to|run)(?: the)? (.+)$/))) {
      const key = this.appFor(m[1]);
      if (key && this.launch(key)) return { say: `Opening ${key}.` };
      if (key === '' && m[1].split(' ').length <= 3) return { say: `I can't find an app called ${m[1]}.` };
    }
    return null;
  },
  /* the Pet calls this; returns true when the text was a command and has been handled */
  run(text, pet) {
    const r = this.handle(text, pet && pet.p && pet.p.name); if (!r) return false;
    if (r.say) pet.speak(r.say); else pet.think(false);
    return true;
  }
};
window.VCMD = VCMD;
