# Performance Optimization Deployment Guide

## 🚀 Problem Solved
Employee users (waiters) experience slow loading times on deployed cPanel, especially when loading menu items and orders. The app is too sensitive to internet speed.

## ✅ Optimizations Implemented

### Backend Improvements:
1. **Aggressive API Caching** - Menu and orders cached for 5 minutes (was 30 seconds)
2. **Browser Cache Headers** - Static assets cached for 5 minutes (300 seconds)
3. **Reduced Logging** - Disabled verbose request logging in production
4. **Employee-Specific Caching** - Orders filtered and cached per employee
5. **Broader Endpoint Caching** - Added caching for users, inventory, tables/status, payments, and order subsets
6. **Attendance API Completion** - Added missing attendance endpoints and aligned response format used by dashboards

### Frontend Improvements:
1. **localStorage Caching** - Menu items cached locally for 5 minutes
2. **Instant Display** - Cached data shown immediately while fetching fresh data
3. **Service Worker SWR Strategy** - API cache now returns cached data instantly, then refreshes in background
4. **Dashboard Hardening** - Waiter/Cashier/Kitchen/Admin/Bakery dashboards now use partial-data loading (`Promise.allSettled`) with cache fallback
5. **Reduced API Calls** - Reuse cached data across components and lower background polling overhead

---

## 📦 Deploy Performance Fixes to cPanel

### Step 1: Build Frontend with Service Worker

```bash
cd d:\Hosting files\cafe\frontend
npm run build
```

**Important:** This build now includes the service worker for offline capability.

### Step 2: Upload Files to cPanel

**Via File Manager or FTP, upload:**

1. **Backend files:**
   - `server.js` (UPDATED - aggressive caching)
   - `package.json` (UPDATED - `start:prod` now uses `server.js`)

2. **Frontend files (entire build folder):**
   - `frontend/build/` (entire folder - DELETE old build first!)
   - Includes new `service-worker.js` automatically

**Upload locations:**
```
Local: d:\Hosting files\cafe\server.js
Server: /home/username/public_html/server.js

Local: d:\Hosting files\cafe\frontend\build\
Server: /home/username/public_html/frontend/build/
```

### Step 3: Verify Environment Variables

Go to **cPanel → Node.js Selector → Your App → Environment Variables**

**Ensure these are set:**
```
NODE_ENV=production
ENABLE_REQUEST_LOGS=false
```

**Why:** This disables verbose logging and enables production optimizations.

### Step 4: Restart Node.js Application

1. In cPanel **Node.js Selector**
2. Click **"Restart"**
3. Wait 10-15 seconds
4. Verify status shows "Running"

### Step 4.1: Confirm Startup File

In **cPanel Node.js Selector**, ensure startup file/entrypoint is `server.js` (not `app.js`).

### Step 5: Clear Browser Cache on Employee Devices

**Important:** Employees must clear their browser cache once to get the new service worker.

**On each employee device:**
1. Open browser (Chrome/Edge/Firefox)
2. Press `Ctrl + Shift + Delete`
3. Select "Cached images and files"
4. Click "Clear data"
5. Refresh the app (`Ctrl + F5`)

---

## 🎯 Expected Performance Improvements

### Before Optimization:
- ❌ Menu loads in 3-5 seconds on slow internet
- ❌ Every page navigation requires full API call
- ❌ No offline capability
- ❌ Sensitive to internet speed

### After Optimization:
- ✅ Menu loads **instantly** from cache (< 100ms)
- ✅ Fresh data fetched in background
- ✅ Works offline with cached data
- ✅ **Much less sensitive** to internet speed
- ✅ Subsequent page loads are near-instant
- ✅ All employee dashboards degrade gracefully on partial/slow API responses

---

## 🔍 How It Works

### 1. Backend Caching (Server-Side)
```
First request: Server processes → 200ms
Cached requests: Server returns cached data → 10ms
Cache expires: After 5 minutes, refresh cache
```

### 2. localStorage Caching (Client-Side)
```
First visit: API call → Store in localStorage
Next visit: Show cached data instantly → Fetch fresh data in background
Cache expires: After 5 minutes
```

### 3. Service Worker (Browser-Level)
```
Network available: Fetch from server → Cache response
Network slow/unavailable: Return cached response immediately
Static assets: Cached permanently until app update
```

### Combined Effect:
```
Employee opens app:
1. Service worker returns cached HTML/CSS/JS → Instant load
2. localStorage shows cached menu → Instant display
3. Fresh data fetched in background → Updates if changed
4. Total perceived load time: < 500ms (was 3-5 seconds)
```

---

## 📊 Verification Checklist

After deployment, test on employee device:

- [ ] Open waiter dashboard - should load in < 1 second
- [ ] Open cashier dashboard - should render quickly even on slow internet
- [ ] Open kitchen dashboard - should show cached data immediately when available
- [ ] Open admin dashboard - should render partial data even if one endpoint is slow
- [ ] Navigate to "Create Order" - menu should appear instantly
- [ ] Check browser console for "[SW] Service Worker registered"
- [ ] Turn off WiFi - app should still work with cached data
- [ ] Turn WiFi back on - app should sync new data
- [ ] Create a new order - should work normally
- [ ] Check Network tab - API calls should show "from ServiceWorker"

---

## 🐛 Troubleshooting

### Menu Still Loads Slowly

**Check 1: Service Worker Registered?**
- Open browser DevTools (F12)
- Go to "Application" tab → "Service Workers"
- Should see "service-worker.js" with status "activated"

**Fix:** Clear browser cache and hard refresh (`Ctrl + Shift + R`)

**Check 2: Backend Caching Working?**
- Check server logs for menu requests
- Should see very few "GET MENU" logs (cached requests don't log)

**Fix:** Verify `NODE_ENV=production` is set in cPanel

**Check 3: localStorage Working?**
- Open DevTools → "Application" → "Local Storage"
- Should see keys like `waiter_dashboard_menu_v1`

**Fix:** Check browser allows localStorage (not in incognito mode)

### Service Worker Not Registering

**Possible causes:**
1. **HTTPS Required** - Service workers only work on HTTPS
   - Ensure your domain uses SSL certificate
   - Check URL starts with `https://`

2. **Build Not Uploaded** - Service worker file missing
   - Verify `service-worker.js` exists in `frontend/build/`
   - Re-upload entire build folder

3. **Browser Compatibility** - Old browser version
   - Update browser to latest version
   - Service workers supported in Chrome 40+, Firefox 44+, Edge 17+

### App Works But Still Feels Slow

**Check internet speed:**
```bash
# On employee device, test speed
speedtest.net
```

**If speed < 1 Mbps:**
- Increase cache TTL to 10 minutes (edit server.js)
- Reduce image sizes in menu items
- Consider compressing assets more aggressively

**Check server resources:**
- Go to cPanel → "Resource Usage"
- If CPU/RAM near limit, upgrade hosting plan

---

## 🔧 Advanced Configuration

### Increase Cache Duration (If Needed)

**Backend (`server.js`):**
```javascript
// Change from 5 minutes to 10 minutes
const cached = getCachedJson('menu:cafe', 10 * 60 * 1000);
setApiCacheHeaders(res, 600); // 10 minutes
```

**Frontend (`CafeWaiterDashboard.js`, `CreateOrder.js`, `OrderHistory.js`):**
```javascript
// Change from 5 minutes to 10 minutes
const CACHE_TTL_MS = 10 * 60 * 1000;
```

**Trade-off:** Longer cache = faster loading, but menu changes take longer to appear.

### Disable Service Worker (If Needed)

**Edit `frontend/src/index.js`:**
```javascript
// Change from:
serviceWorkerRegistration.register();

// To:
serviceWorkerRegistration.unregister();
```

Then rebuild and redeploy.

---

## 📝 Files Changed

### Backend:
- `server.js` - Expanded cache/invalidation coverage, added attendance endpoints, optimized filtered order endpoints
- `package.json` - Production startup aligned to `server.js`

### Frontend:
- `frontend/src/pages/dashboards/CafeWaiterDashboard.js` - Added localStorage caching
- `frontend/src/pages/dashboards/CashierDashboard.js` - Added local cache + partial fetch fallback
- `frontend/src/pages/dashboards/KitchenStaffDashboard.js` - Added local cache + partial fetch fallback
- `frontend/src/pages/dashboards/AdminDashboard.js` - Added local cache + partial fetch fallback
- `frontend/src/pages/dashboards/BakeryEmployeeDashboard.js` - Added local cache + partial fetch fallback
- `frontend/src/pages/waiter/CreateOrder.js` - Already had caching (kept as-is)
- `frontend/src/pages/waiter/OrderHistory.js` - Added localStorage caching + orders cache
- `frontend/src/index.js` - Registered service worker
- `frontend/src/serviceWorkerRegistration.js` - NEW FILE
- `frontend/public/service-worker.js` - selective SWR API caching (faster + safer for live print endpoints)
- `frontend/src/services/api.js` - removed strict offline hard-block, added timeout + throttled network toasts

---

## 🎉 Success Indicators

Your optimization is successful when:

- ✅ Waiter dashboard loads in < 1 second (was 3-5 seconds)
- ✅ Menu items appear instantly on "Create Order" page
- ✅ App works offline with cached data
- ✅ Network tab shows "from ServiceWorker" for cached requests
- ✅ Employees report app feels "much faster"
- ✅ App works well even on slow internet (< 2 Mbps)

---

## 💡 Tips for Employees

**For Best Performance:**
1. Keep browser updated to latest version
2. Don't use incognito/private mode (disables caching)
3. Stay logged in (cache persists between sessions)
4. If app feels slow, hard refresh once (`Ctrl + Shift + R`)

**Understanding Offline Mode:**
- Green indicator = Online, fresh data
- Yellow indicator = Offline, using cached data
- Red indicator = Offline, no cached data available

---

## 📞 Support

**If issues persist:**
1. Check browser console for errors (F12 → Console tab)
2. Check server logs in cPanel
3. Verify all files uploaded correctly
4. Ensure HTTPS is enabled
5. Test on different device/browser

**Common fixes:**
- Clear browser cache and hard refresh
- Restart Node.js application in cPanel
- Re-upload frontend build folder
- Verify environment variables are set

---

**Remember:** The first load after deployment will still be slow (fetching and caching). Subsequent loads will be **much faster**!
