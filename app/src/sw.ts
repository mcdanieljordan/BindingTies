/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<string | { url: string; revision: string | null }> }

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)
self.addEventListener('install', () => void self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

interface PushData { title: string; body?: string; tag?: string; url?: string; urgent?: boolean }

self.addEventListener('push', (event) => {
  let d: PushData = { title: 'FamilyOS' }
  try { d = { ...d, ...(event.data?.json() as PushData) } } catch { d.body = event.data?.text() }
  event.waitUntil(
    self.registration.showNotification(d.title, {
      body: d.body,
      tag: d.tag,
      icon: self.registration.scope + 'favicon.svg',
      badge: self.registration.scope + 'favicon.svg',
      data: { url: d.url ?? self.registration.scope },
      requireInteraction: !!d.urgent,
    } as NotificationOptions),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string })?.url ?? self.registration.scope
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) return c.focus()
      return self.clients.openWindow(url)
    }),
  )
})
