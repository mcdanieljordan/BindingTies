# FamilyOS app

Local-first family PWA: calendar, picture routines with print studio, team quests, medicine log, timers/alarms, shared lists, wall display, and a Learning Vault.

```bash
npm install
npm run dev      # http://localhost:5173 (or next free port)
npm run build    # production build with service worker
```

Data lives in the browser's IndexedDB. Settings → Export backup makes a JSON file (includes saved files).
Stack: React 19, TypeScript, Vite, Dexie, chrono-node, lucide-react, vite-plugin-pwa.
