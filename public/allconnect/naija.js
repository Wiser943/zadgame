/* Naija language helper. Default voice is Naija Pidgin with a touch of English; players can switch to English or Francais in Settings.
   NG.say('English line', 'Pidgin line') returns the right one. Anything that is not Pidgin (en / fr) gets the English line. */
const NG = {
  lang() { let p = {}; try { p = JSON.parse(localStorage.getItem('ghPrefs') || '{}') } catch (e) {} return p.lang === 'en' || p.lang === 'fr' ? p.lang : 'pcm' },
  pcm() { return this.lang() === 'pcm' },
  say(en, pcm) { return pcm != null && this.pcm() ? pcm : en }
};
window.NG = NG;
