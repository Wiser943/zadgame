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
