/* ===========================================================
   Advanced Service Worker for PWA
   Features: Pre-caching, Dynamic Caching, Offline Fallback, 
   Push Notifications, Background Sync & Cache Cleanup
=========================================================== */

const CACHE_VERSION = 'v1.0.1'; // আপডেট করার সময় ভার্সন পরিবর্তন করবে
const STATIC_CACHE = `static-cache-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `dynamic-cache-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html'; // অফলাইনে থাকলে এই পেজ দেখাবে

// কোর ফাইলগুলো যা অ্যাপ ইন্সটল হওয়ার সাথেই ক্যাচ (Cache) হবে (App Shell)
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/banner.png',
  // তোমার CSS এবং JS ফাইলগুলো এখানে দেবে
  // '/style.css', 
  // '/script.js'
];

/* ---------------------------------------------------------
   ১. INSTALL EVENT: ফাইলগুলো ক্যাচে সেভ করা
--------------------------------------------------------- */
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing Service Worker...', event);
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[Service Worker] Pre-caching App Shell');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => {
        // নতুন সার্ভিস ওয়ার্কার দ্রুত একটিভ করার জন্য
        return self.skipWaiting(); 
      })
  );
});

/* ---------------------------------------------------------
   ২. ACTIVATE EVENT: পুরনো ক্যাচ (Cache) ডিলিট করা
--------------------------------------------------------- */
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating Service Worker...', event);
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // বর্তমান ভার্সনের সাথে না মিললে ডিলিট করে দেবে
          if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
            console.log('[Service Worker] Removing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim(); // দ্রুত নতুন ক্লায়েন্টদের নিয়ন্ত্রণ নেওয়া
    })
  );
});

/* ---------------------------------------------------------
   ৩. FETCH EVENT: নেটওয়ার্ক রিকোয়েস্ট কন্ট্রোল করা
--------------------------------------------------------- */
self.addEventListener('fetch', (event) => {
  // শুধুমাত্র GET রিকোয়েস্ট ক্যাচ করবে (POST, PUT ক্যাচ করবে না)
  if (event.request.method !== 'GET') return;

  // HTML পেজগুলোর জন্য: Network First, Fallback to Cache, Fallback to Offline Page
  if (event.request.headers.get('accept').includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          // নেটওয়ার্ক থেকে পেলে ডাইনামিক ক্যাচে সেভ করে রাখবে
          return caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(event.request.url, networkResponse.clone());
            return networkResponse;
          });
        })
        .catch(() => {
          // নেটওয়ার্ক না থাকলে ক্যাচ থেকে খুঁজবে
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // ক্যাচেও না থাকলে অফলাইন পেজ দেখাবে
            return caches.match(OFFLINE_URL);
          });
        })
    );
  } 
  // অন্যান্য ফাইল (CSS, JS, Images) এর জন্য: Cache First, Fallback to Network
  else {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse; // ক্যাচ থেকে পেলে দিয়ে দেবে
        }

        // ক্যাচে না থাকলে নেটওয়ার্ক থেকে আনবে এবং ডাইনামিক ক্যাচে সেভ করবে
        return fetch(event.request).then((networkResponse) => {
          // রেসপন্স ঠিক না থাকলে ক্যাচ করবে না
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }

          return caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(event.request.url, networkResponse.clone());
            return networkResponse;
          });
        }).catch((err) => {
          console.error('[Service Worker] Fetch failed:', err);
          // ইমেজ লোড না হলে একটি ডিফল্ট অফলাইন ইমেজ দেখাতে পারো
        });
      })
    );
  }
});

/* ---------------------------------------------------------
   ৪. PUSH EVENT: পুশ নোটিফিকেশন রিসিভ করা (Optional)
--------------------------------------------------------- */
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push Received.');
  let notificationData = { title: 'নতুন আপডেট!', body: 'অ্যাপে নতুন কিছু এসেছে, চেক করে দেখুন!' };

  if (event.data) {
    try {
      notificationData = event.data.json();
    } catch (e) {
      notificationData.body = event.data.text();
    }
  }

  const options = {
    body: notificationData.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [100, 50, 100],
    data: {
      url: notificationData.url || '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(notificationData.title, options)
  );
});

/* ---------------------------------------------------------
   ৫. NOTIFICATION CLICK: নোটিফিকেশনে ক্লিক করলে কী হবে
--------------------------------------------------------- */
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification click Received.');
  event.notification.close();

  const targetUrl = event.notification.data.url;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // যদি অ্যাপ আগে থেকেই ওপেন থাকে, তবে সেখানে ফোকাস করবে
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      // ওপেন না থাকলে নতুন উইন্ডো খুলবে
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

/* ---------------------------------------------------------
   ৬. MESSAGE EVENT: ক্লায়েন্ট থেকে ম্যাসেজ রিসিভ করা
--------------------------------------------------------- */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting(); // জোরপূর্বক নতুন আপডেট একটিভ করার জন্য
  }
});
