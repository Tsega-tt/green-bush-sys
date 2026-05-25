# Quick Deployment Guide - Latest Changes

## 🚀 What Changed in Latest Version

### Performance Optimizations
- ✅ Gzip compression enabled for faster loading
- ✅ Static asset caching (long-lived cache headers)
- ✅ API response caching for menu/tables/payments
- ✅ Reduced verbose logging in production
- ✅ Optimized cashier dashboard API calls

### QZ Tray Printing Fixes
- ✅ Fixed "Untrusted Website" popup issue
- ✅ Switched to SHA512 signature algorithm
- ✅ Proper certificate/key configuration
- ✅ Auto-printing without popups when configured correctly

---

## 📦 Deploy Latest Changes to cPanel

### Step 1: Build Frontend Locally (REQUIRED)
```bash
cd d:\Hosting files\cafe\frontend
npm install
npm run build
```
**Result:** Creates optimized production build in `frontend/build/`

---

### Step 2: Upload Files to cPanel

**Option A: Via File Manager (Easiest)**
1. Log into cPanel
2. Go to **File Manager**
3. Navigate to your domain folder (e.g., `public_html/`)
4. Upload these files/folders:
   - `app.js` (updated)
   - `server.js` (updated)
   - `frontend/build/` (entire folder - DELETE old build first!)
   - `.env` (if changed)
   - `package.json` (if dependencies changed)

**Option B: Via FTP (FileZilla/WinSCP)**
1. Connect to your cPanel FTP
2. Navigate to domain folder
3. Upload same files as above
4. Ensure permissions: 644 for files, 755 for folders

**Option C: Via Git**
```bash
# On local machine
git add .
git commit -m "Performance optimizations and QZ Tray fixes"
git push origin main

# Then in cPanel Git interface
# Pull latest changes
```

---

### Step 3: Update Environment Variables in cPanel

1. Go to **Node.js Selector** in cPanel
2. Click on your application
3. Add/Update these variables:

```
NODE_ENV=production
QZ_SIGNATURE_ALGORITHM=SHA512
```

**IMPORTANT:** If you haven't set up QZ Tray certificates yet, see full guide below.

---

### Step 4: Restart Node.js Application

1. In cPanel **Node.js Selector**
2. Click **"Restart"** button
3. Wait 10-15 seconds
4. Check status shows "Running"

---

### Step 5: Test Your Deployment

1. **Test site loads:**
   - Visit: `https://yourdomain.com`
   - Should load in under 2 seconds (not 5+ seconds anymore!)

2. **Test API:**
   - Visit: `https://yourdomain.com/api/health`
   - Should return: `{"status":"success"}`

3. **Test QZ Tray (if using printing):**
   - Visit: `https://yourdomain.com/api/qz/certificate`
   - Should return certificate JSON

4. **Test login and dashboard:**
   - Log in as cashier/admin
   - Dashboard should load quickly
   - No more 5-second delays!

---

## 🖨️ QZ Tray Setup for Production (If Not Done Yet)

### Quick Setup for Printing

**On Production Server (One-time setup):**

1. **Generate Production Certificate:**
   - You need to generate a certificate that your server will use
   - Two options:
     - **Option A:** Generate on cashier PC, upload to server
     - **Option B:** Use your existing demo cert for testing

2. **For Testing (Use Existing Demo Cert):**
   ```bash
   # Upload your local demo cert to server
   # Via FTP/File Manager, upload:
   # C:\Users\natiy\Desktop\QZ Tray Demo Cert\digital-certificate.txt
   # → /home/username/public_html/certs/qz-cert.crt
   
   # C:\Users\natiy\Desktop\QZ Tray Demo Cert\private-key.pem
   # → /home/username/public_html/certs/qz-key.pem
   ```

3. **Update cPanel Environment Variables:**
   ```
   QZ_CERT_PATH=/home/username/public_html/certs/qz-cert.crt
   QZ_PRIVATE_KEY_PATH=/home/username/public_html/certs/qz-key.pem
   QZ_SIGNATURE_ALGORITHM=SHA512
   ```

4. **On Cashier PC:**
   - Copy `digital-certificate.txt` to: `C:\Program Files\QZ Tray\override.crt`
   - Restart QZ Tray
   - Open your deployed site
   - QZ Tray should connect without "Untrusted" popup

---

## ✅ Verification Checklist

After deployment, verify:

- [ ] Site loads in under 2 seconds (performance fix working)
- [ ] No more 5-second loading delays
- [ ] Login works correctly
- [ ] Dashboard displays properly
- [ ] Menu items load quickly
- [ ] QZ Tray shows "Connected" (green) on cashier PC
- [ ] Test print works without popup
- [ ] Orders auto-print on thermal printer

---

## 🐛 Troubleshooting

### Site Still Loads Slowly
- Check `NODE_ENV=production` is set in cPanel
- Verify you uploaded the new `app.js` and `server.js`
- Clear browser cache (Ctrl+F5)
- Check cPanel error logs

### QZ Tray Shows "Untrusted"
- Ensure site uses HTTPS (not HTTP)
- Verify `override.crt` is in `C:\Program Files\QZ Tray\`
- Certificate must match what server serves
- Restart QZ Tray after installing certificate

### Printer Not Working
- Check QZ Tray is running on cashier PC
- Verify printer name in frontend `.env.production`
- Test with "Test Print" button in dashboard
- Check `/api/qz/certificate` endpoint returns cert

### Changes Not Showing
- Did you rebuild frontend? (`npm run build`)
- Did you upload the new `frontend/build/` folder?
- Did you restart Node.js app in cPanel?
- Clear browser cache

---

## 📝 Files Changed in This Update

### Backend Files:
- `server.js` - Performance optimizations, QZ signature SHA512
- `app.js` - Performance optimizations, QZ signature SHA512

### Frontend Files:
- `frontend/src/utils/qzTray.js` - SHA512 algorithm, removed localhost override
- `frontend/.env` - Added `REACT_APP_QZ_SIGNATURE_ALGORITHM=SHA512`
- `frontend/.env.production` - Fixed API URL, added signature algorithm

### Config Files:
- `.env` - Updated QZ cert paths to demo cert

---

## 🎯 Summary

**What you need to do:**
1. Build frontend locally: `npm run build`
2. Upload `frontend/build/` folder to cPanel (replace old one)
3. Upload updated `app.js` and `server.js`
4. Set `NODE_ENV=production` in cPanel
5. Restart Node.js app
6. Test site - should be fast now!

**For QZ Tray printing:**
- Upload demo cert to server
- Update environment variables
- Copy `override.crt` to cashier PC
- Restart QZ Tray

---

For complete detailed instructions, see: **CPANEL_DEPLOYMENT_GUIDE.md**
