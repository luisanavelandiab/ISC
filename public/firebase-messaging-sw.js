importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyC6Q628yR9Myyk8n9kmQPUyanwGwSHpgLI",
  authDomain: "iscperu-2411d.firebaseapp.com",
  projectId: "iscperu-2411d",
  messagingSenderId: "1042661465060",
  appId: "1:1042661465060:web:9ae4341280faba0a1bc5f1",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title = "Visita programada", body = "" } = payload.notification;
  self.registration.showNotification(title, {
    body,
    icon: "/icon-192.png",
    badge: "/badge-72.png",
    data: payload.data,
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/admin/visitas';
  event.waitUntil(clients.openWindow(url));
});