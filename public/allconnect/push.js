'use strict';

const PUSH = {
  registration: null,
  ok: undefined, // true/false once we know whether notifications are fully on
  async init() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) { this.status().catch(() => {}); return; }
    try { this.registration = await navigator.serviceWorker.register('/sw.js'); } catch { /* ignore */ }
    this.status().catch(() => {});
  },
  /* On = browser permission granted AND (the server has no push keys yet, OR this device is subscribed). */
  async status() {
    const perm = 'Notification' in window ? Notification.permission : 'unsupported';
    if (perm === 'unsupported') { this.ok = false; return { perm, on: false }; }
    let configured = false, subscribed = false;
    try { configured = !!(await NET.api('/api/ac/push/config')).configured; } catch { /* offline */ }
    if (configured) {
      try { if (!this.registration) await this.init(); const sub = this.registration && await this.registration.pushManager.getSubscription(); subscribed = !!sub; } catch { /* ignore */ }
    }
    const on = perm === 'granted' && (!configured || subscribed);
    this.ok = on;
    return { perm, configured, subscribed, on };
  },
  /* Returns true only when everything that can be turned on is on. */
  async enable() {
    if (!('Notification' in window)) { toast('Notifications are not supported on this device.'); return false; }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') { toast('Notifications are blocked in browser settings.'); return false; }
    let config = { configured: false };
    try { config = await NET.api('/api/ac/push/config'); } catch { /* treat as not configured */ }
    if (!config.configured) { this.ok = true; return true; } // server has no push keys yet: in-app alerts only
    if (!this.registration) await this.init();
    if (!this.registration || !this.registration.pushManager) { this.ok = false; toast('Background notifications are not supported on this device.'); return false; }
    try {
      const existing = await this.registration.pushManager.getSubscription();
      const subscription = existing || await this.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: this.decode(config.publicKey) });
      await NET.api('/api/ac/push/subscribe', { method: 'POST', body: { subscription: subscription.toJSON() } });
    } catch (e) { this.ok = false; toast(e.message || 'Could not turn on notifications.'); return false; }
    this.ok = true;
    return true;
  },
  decode(value) { const pad = '='.repeat((4 - value.length % 4) % 4), raw = atob((value + pad).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...raw].map((c) => c.charCodeAt(0))); }
};
window.PUSH = PUSH;
