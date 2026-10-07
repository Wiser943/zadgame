# Background push notifications

AllConnect uses the open Web Push standard with VAPID. Browser push delivery does not require a paid push provider.

## Render environment variables

Generate a persistent key pair once from the project directory:

```bash
npx web-push generate-vapid-keys
```

Add the generated values to Render:

```text
VAPID_PUBLIC_KEY=<generated public key>
VAPID_PRIVATE_KEY=<generated private key>
VAPID_SUBJECT=mailto:your-real-admin-email@example.com
```

Keep the same keys across deploys. If the keys change, existing browser subscriptions must be recreated.

## User flow

1. Deploy with the three variables above.
2. Sign in to AllConnect.
3. Open **Phone → Settings**.
4. Tap **Background push notifications → Enable**.
5. Accept the browser notification permission prompt.

Subscriptions are stored in MongoDB and automatically removed when a browser reports them as expired. Notification clicks open the relevant chat, Updates screen, or Gist post.

Without the VAPID variables, the rest of AllConnect still works and the Settings action reports that push is not configured.
