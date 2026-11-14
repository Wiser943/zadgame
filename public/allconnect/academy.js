/* Creator Academy: short lessons + handy tools for creators. Opens from P-Gist > Manage. Everything runs on the phone; progress is saved on this device. */
Object.assign(GIST, {
  acTab: 'learn',
  academy() {
    this.set('academy'); PH.shell('Creator Academy', 'GIST.back()', '<div class="abody" id="ab"></div>'); this.acDraw()
  },
  acDone() { try { return JSON.parse(localStorage.getItem('ac:academy') || '[]') } catch (e) { return [] } },
  acMark(id) { const d = this.acDone(), i = d.indexOf(id); if (i >= 0) d.splice(i, 1); else d.push(id); try { localStorage.setItem('ac:academy', JSON.stringify(d)) } catch (e) { } this.acDraw(id) },
  LESSONS: [
    ['hook', '🎣', 'Hook them in 3 seconds', '4 min', ['Most people decide in the first 3 seconds whether to keep watching. Start with the most interesting moment, not a long hello.', 'Show the result first, then explain how you got there.', 'Ask a question or make a bold promise in the first line of the video and in the caption.', 'Cut any slow start. If the first second is silent or blank, trim it.']],
    ['own', '✅', 'Make original content', '3 min', ['Post videos you filmed or made yourself. Reposted clips from other people can be flagged and hidden.', 'Do not use songs you do not have the right to use. Use your own audio or royalty-free sound.', 'If you react to or remix someone else, add a lot of your own work and say who made the original.', 'If a video is flagged by mistake you can open it, tap Learn more, and request a review.']],
    ['edit', '✂️', 'Edit like a pro', '5 min', ['Keep reels short. 15 to 30 seconds is the sweet spot for most topics.', 'Crop to 9:16 so your video fills the whole phone screen.', 'Use speed to skip boring parts: 1.5x for walking or setup, 0.5x for the moment you want people to see.', 'Mirror your video if text or a logo is reading backwards.']],
    ['cap', '✍️', 'Captions and hashtags', '3 min', ['Write the caption like a short sentence that makes people curious.', 'Use 3 to 5 hashtags. Mix one broad tag with two or three specific ones.', 'Mention @friends only when it is relevant. Spamming mentions can get you muted.', 'Put the hashtags first and the story after, the app shows tags above your caption.']],
    ['grow', '📈', 'Grow your followers', '5 min', ['Post on a steady schedule. 3 to 5 times a week beats 10 posts in one day and then nothing.', 'Reply to comments in the first hour. It tells the app people are talking about your video.', 'Watch your Manage stats. Repeat what worked: the topic, the length, the time of day.', 'Follow creators like you and leave real comments. Be a regular, not a robot.']],
    ['safe', '🛡️', 'Stay in good standing', '2 min', ['No nudity, violence, hate, scams or fake claims. These are removed fast.', 'Every video goes live as Under review and an admin may check it. You will get a notice if anything is wrong.', 'Warnings and suspensions can block creator access and withdrawals.', 'Settings in the post step let you choose who can watch, turn comments off, and allow or block reposts.']],
    ['earn', '💰', 'Getting paid', '3 min', ['The creator programme is reviewed by the team. Meet the requirements in Manage, then apply.', 'Your naira balance is in-game money. Real withdrawals are done in AllConnect Pay > Withdraw during an open season and batch.', 'Keep your bank details correct. A wrong name can delay a payment.', 'Never share your password or PIN with anyone, including people who say they work for AllConnect.']]
  ],
  acDraw(open) {
    const ab = $('ab'); if (!ab) return; const done = this.acDone(), t = this.acTab, tabs = [['learn', 'Learn'], ['tools', 'Tools']];
    const pct = Math.round(done.filter(x => this.LESSONS.some(l => l[0] === x)).length / this.LESSONS.length * 100);
    const head = `<div class="gm acad"><div class="gmst" style="--c:#6366f1"><span class="gmsi"><span class="fa-solid fa-graduation-cap"></span></span><div><h3>Creator Academy</h3><p>${pct}% complete. Short lessons and tools to help your videos do better.</p></div></div><div class="gmbar" style="margin:4px 0 12px"><i style="width:${pct}%"></i></div><div class="seg2 gpk">${tabs.map(x => `<button class="${t === x[0] ? 'on' : ''}" onclick="GIST.acTab='${x[0]}';GIST.acDraw()">${x[1]}</button>`).join('')}</div>`;
    ab.innerHTML = head + (t === 'learn' ? this.acLearn(done, open) : this.acTools()) + '</div>'; if (t === 'tools') this.acToolsInit()
  },
  acLearn(done, open) {
    return this.LESSONS.map(l => { const d = done.includes(l[0]), o = open === l[0];
      return `<div class="gmcard acl" style="margin-top:10px"><button class="gmrwh" onclick="GIST.acOpen('${l[0]}')" aria-expanded="${o}"><span class="gmrwi">${l[1]}</span><span class="gmrwt"><b>${esc(l[2])}</b><small>${l[3]} read${d ? ' · Done' : ''}</small></span><span class="fa-solid fa-${d ? 'circle-check' : o ? 'chevron-up' : 'chevron-down'}" style="color:${d ? '#22b573' : 'inherit'}"></span></button>
        <div class="acb" id="acb_${l[0]}" style="display:${o ? 'block' : 'none'};padding:4px 4px 6px"><ul style="margin:6px 0 10px;padding-left:18px;line-height:1.5">${l[4].map(x => `<li style="margin:4px 0">${esc(x)}</li>`).join('')}</ul><button class="btn ${d ? 's' : 'p'}" onclick="GIST.acMark('${l[0]}')">${d ? 'Mark as not done' : 'Mark as done'}</button></div></div>` }).join('')
  },
  acOpen(id) { const el = $('acb_' + id); if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none' },
  acTools() {
    const S = (this.cr && this.cr.stats) || null, n = x => Number(x || 0).toLocaleString('en-NG');
    const chk = ['I filmed or made this video myself', 'The audio is mine or I may use it', 'The first 3 seconds grab attention', 'It fills the screen (9:16) and is not blurry', 'The caption is clear and has 3 to 5 hashtags', 'Nothing in it breaks the community rules'];
    return `<div class="gmcard" style="margin-top:12px"><h4 style="margin:0 0 8px">✍️ Caption and hashtag helper</h4><input class="sinput" id="acTopic" maxlength="40" placeholder="What is your video about? e.g. jollof, football, comedy" oninput="GIST.acGen()" autocomplete="off"><div id="acOut" class="acout" style="margin-top:10px"></div></div>
      <div class="gmcard" style="margin-top:12px"><h4 style="margin:0 0 8px">☑️ Before you post</h4>${chk.map((c, i) => `<label class="chk" style="display:flex;gap:8px;align-items:flex-start;margin:6px 0"><input type="checkbox" class="acck" onchange="GIST.acReady()"> <span>${esc(c)}</span></label>`).join('')}<p id="acRdy" class="gmnote" style="margin:8px 0 0">Tick everything that is true.</p></div>
      <div class="gmcard" style="margin-top:12px"><h4 style="margin:0 0 8px">⏰ Best times to post</h4><p class="gmnote" style="margin:0 0 6px">A good starting point for Nigeria. Check your own stats and adjust.</p><div class="gmgrid"><div><b>7 to 9am</b><span>Before work</span></div><div><b>12 to 2pm</b><span>Lunch break</span></div><div><b>7 to 10pm</b><span>Evening, best</span></div></div></div>
      <div class="gmcard" style="margin-top:12px"><h4 style="margin:0 0 8px">📊 Your numbers</h4>${S ? `<div class="gmgrid"><div><b>${n(S.followers)}</b><span>Followers</span></div><div><b>${n(S.posts)}</b><span>Gists</span></div><div><b>${n(S.avgReactions)}</b><span>Avg reactions</span></div></div>` : '<p class="gmnote">Open Manage first to load your stats.</p>'}</div>
      <div class="gmcard" style="margin-top:12px"><h4 style="margin:0 0 8px">🎬 Make a reel</h4><p class="gmnote" style="margin:0 0 8px">Pick a video, edit it (crop, mirror, speed, trim), then set your caption and who can watch.</p><button class="btn p" onclick="RL.create()">Create a reel</button></div>`
  },
  acToolsInit() { this.acGen(); this.acReady() },
  acGen() {
    const el = $('acOut'); if (!el) return; const raw = (($('acTopic') || {}).value || '').trim().toLowerCase(), w = raw.replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(Boolean).slice(0, 3);
    if (!w.length) { el.innerHTML = '<p class="gmnote">Type a topic to get caption and hashtag ideas.</p>'; return }
    const t = w.join(' '), tag = w.join(''), tags = ['#' + tag, '#' + tag + 'naija', '#' + tag + 'tips', '#naija', '#fyp'].filter((x, i, a) => a.indexOf(x) === i).slice(0, 5);
    const caps = [`Wait for the end 👀 ${t}`, `Nobody told me this about ${t}`, `${t.charAt(0).toUpperCase() + t.slice(1)}: you need to see this`, `POV: you finally get ${t} right`];
    el.innerHTML = `<div class="chips">${tags.map(x => `<button class="btn s" style="margin:2px" onclick="GIST.acCopy(this.textContent)">${esc(x)}</button>`).join('')}</div><p class="gmnote" style="margin:8px 0 4px">Tap to copy:</p>${caps.map(c => `<button class="fopt" onclick="GIST.acCopy(this.textContent.trim())"><span>${esc(c)}</span></button>`).join('')}<button class="btn s" onclick="GIST.acCopy('${esc(tags.join(' '))}')">Copy all hashtags</button>`
  },
  acCopy(t) { PH.copy(String(t)) },
  acReady() { const c = [...document.querySelectorAll('.acck')], k = c.filter(x => x.checked).length, e = $('acRdy'); if (e) e.textContent = k === c.length ? 'Looking good. You are ready to post. ✅' : k + ' of ' + c.length + ' checked.' }
});
