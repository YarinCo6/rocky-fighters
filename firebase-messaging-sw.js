/* Rocky Fighters — background push handler (Firebase Cloud Messaging).
   Scope: the site folder. Displays notifications while the tab/browser is closed. */
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyAU2knBfIaTMBEXsQOduCcX-3KOAEfqFwo",
    authDomain: "rocky-fighters-il.firebaseapp.com",
    projectId: "rocky-fighters-il",
    storageBucket: "rocky-fighters-il.firebasestorage.app",
    messagingSenderId: "40144569501",
    appId: "1:40144569501:web:ccb6e362e4511478bec074"
});

const messaging = firebase.messaging();

// Messages carry a `notification` block, so the SDK shows them itself while the
// page is not focused. This handler only covers data-only payloads.
messaging.onBackgroundMessage((payload) => {
    if (payload.notification) return;
    const d = payload.data || {};
    self.registration.showNotification(d.title || 'Rocky Fighters', {
        body: d.body || '', icon: 'images/rocky-icon.png', badge: 'images/rocky-icon.png', dir: 'rtl', lang: 'he', tag: 'rocky', renotify: true,
        data: { link: d.link || './' }
    });
});

// Focus an open tab of the site if there is one, otherwise open it.
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const target = (event.notification.data && event.notification.data.link) || (event.notification.data && event.notification.data.FCM_MSG && event.notification.data.FCM_MSG.notification && event.notification.data.FCM_MSG.notification.click_action) || self.registration.scope;
    event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
        for (const c of list) { if (c.url.startsWith(self.registration.scope) && 'focus' in c) return c.focus(); }
        return clients.openWindow(target);
    }));
});
