# GameHub update
Copy these files over your project (same paths), then redeploy.

## Environment variables (all optional)
- CHAT_BLOCKLIST="word1,word2"  extra words for the chat filter
- REDIS_URL  enables the Socket.io Redis adapter. Also run:  npm i redis @socket.io/redis-adapter
  (they are listed as optionalDependencies). Without REDIS_URL everything runs in one process as before.

## New endpoints
- GET /ready  readiness check (MongoDB, plus Redis when configured). /health is unchanged.

## Notes
- Active game rooms still live in each server's memory. If you run more than one instance, use sticky sessions.
- Nothing here moves money. Phase 2 (real rewards/payouts) is a "Coming soon" pre-registration screen only.

## v4
- services/push.js: web-push is now loaded safely. If the package is missing the server still starts and push is just disabled.
- Login screen now shows a clear message when the server is unreachable or the session cookie was not saved (before, it silently reshowed the form).
- Songify now opens: it was missing the "light" class that makes the app screen visible.
- Settings: removed the duplicate "Edit profile" row (the blue Edit button does the same) and the profile photo now fills its circle.
- Music: JioSaavn URL can be changed with env JIOSAAVN_SEARCH_URL; the error now says why it failed (and logs it on the server).
- Music: Audiomack removed. Search now tries Audius (full tracks, free) -> JioSaavn -> iTunes 30s previews. Searching (or typing ".play name") plays the first result right away.
- Settings: "Message alerts" and "Background push notifications" are now ONE "Notifications" row. It is On only when both work (browser permission + push subscription, when the server has push keys). If either can't turn on, it stays off.
- Songify: section labels (Recently played / Search results) now have the same side padding as the rest of the screen.
- Chat: double-tap (or double-click) a message to reply to it. A quote shows above the reply, like WhatsApp. Needs the updated server files (models/ACMessage.js, routes/acsocial.js).
- Bank transfer: added a Max button next to the amount (warns when you are sending your whole balance) and more space under the amount box.
- Chat: a red "New messages" divider shows above the messages that were unread when you opened the chat, and the chat scrolls to it.
- Push notifications for chat now have a Reply button. On Chrome for Android you can type the reply right in the notification; elsewhere it opens the chat with the reply bar ready. Tapping the notification itself opens the chat with that message already quoted for reply (and highlighted).
  (Push only works once VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT are set on the server.)

## Songify + Settings + blocking update
- Songify: songs load on open (default Afrobeats list), bottom tabs Home / Favorites / Recent, 16px side padding on lists, full player (shuffle, prev, play/pause, next, repeat, favorite, share, seek bar), banner text changed to "Music for every mood".
- Songify and Settings: every emoji replaced with Font Awesome icons (not SVG). Phone grid icons for Songify and Settings too.
- Music keeps playing after closing the app, closing the phone or going home; a mini player shows on the home and map scenes.
- Blocking: the blocker can still find (search) and open the blocked person's profile; the Message button becomes Unblock (also Unblock in the profile menu and in Contacts search). The blocked person still cannot see or message the blocker.

## Dynamic island, bank shortcuts, offline screen
- Phone notch (dynamic island) shows the playing song (equaliser, title, play/pause); tap it to expand prev/play/next/stop. The home/map scenes get a matching island-style pill under the HUD (replaces the bottom mini player and hides the visits/online chips while music plays).
- HUD balance opens AllConnect Pay; the + opens a new Deposit page (amount input, quick amounts, "Deposit now" button that shows "Coming soon").
- New offline screen titled "AllConnect" (Try again / Reload): served by the service worker (public/offline.html, cache v4) when the web app is opened offline, and shown in-app when the connection drops.
- Haptic tick on nav bar icons and tabs (Android vibrate; iPhone via native switch haptic on iOS 18+), follows the Settings Vibration toggle.

## Ad apps, Search app, app layout menu
- Ads app: third option "Create your own app" (₦100,000 for 1 day, max 3 per advertiser, 12 on the phone). Advertiser enters platform name (16 chars), https website link and a logo from the in-game gallery, a device upload, or an emoji. Paying adds an app (name + logo + "Ad" tag) to every player's phone; opening it runs the website inside the phone (sandboxed iframe) with an Open in browser button. Apps can be edited while live and expire after the day. Server: utils/acads.js (APP), models/ACAd.js (kind 'app', emoji), routes/acads.js (/apps, booking, updating), plus a test.
- Phone: new Search app (find any app by name, incl. ad apps) and a three-dot menu on the home screen to switch the app layout between vertical scroll and horizontal pages (remembered per device).
