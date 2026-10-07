'use strict';

const PUSH = {
  registration: null,
  async init() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
    try { this.registration = await navigator.serviceWorker.register('/sw.js'); } catch { return; }
  },
  async enable() {
    if (!this.registration) await this.init();
    if (!this.registration) return toast('Push notifications are not supported here.');
    const config = await NET.api('/api/ac/push/config');
    if (!config.configured) return toast('Push notifications need VAPID keys in the server environment.');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return toast('Notifications are blocked in browser settings.');
    const existing = await this.registration.pushManager.getSubscription();
    const subscription = existing || await this.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: this.decode(config.publicKey) });
    await NET.api('/api/ac/push/subscribe', { method: 'POST', body: { subscription: subscription.toJSON() } });
    toast('Push notifications enabled ✓');
  },
  decode(value) { const pad = '='.repeat((4 - value.length % 4) % 4), raw = atob((value + pad).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...raw].map((c) => c.charCodeAt(0))); }
};
window.PUSH = PUSH;
