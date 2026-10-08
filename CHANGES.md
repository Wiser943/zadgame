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
