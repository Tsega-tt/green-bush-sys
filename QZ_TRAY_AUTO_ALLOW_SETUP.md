# QZ Tray Auto-Allow Configuration (No Popup)

## Method 1: Remember Decision (Recommended - Simplest)

When the QZ Tray popup appears:
1. ✅ Check "Remember this decision"
2. ✅ Click "Allow"
3. Done! QZ Tray saves this and never asks again for this site

**This is the easiest method and works perfectly for both localhost and deployed sites.**

---

## Method 2: Pre-configure QZ Tray Whitelist (Advanced)

If you want to pre-configure QZ Tray to auto-allow your site without any popup:

### Step 1: Locate QZ Tray Configuration File

**Windows:**
```
C:\Users\[YourUsername]\.qz\qz-tray.properties
```

**Mac:**
```
~/Library/Application Support/QZ Tray/qz-tray.properties
```

**Linux:**
```
~/.qz/qz-tray.properties
```

### Step 2: Add Your Site to Whitelist

Open `qz-tray.properties` and add:

```properties
# Auto-allow localhost (development)
security.whitelist.localhost=true

# Auto-allow your deployed domain (production)
# Replace with your actual domain
security.whitelist.yourdomain.com=true
```

### Step 3: Restart QZ Tray

1. Close QZ Tray (right-click system tray icon → Exit)
2. Start QZ Tray again
3. Your site will now auto-connect without popup

---

## Method 3: Certificate-Based Auto-Trust (Enterprise)

For enterprise deployments where you want zero user interaction:

### Step 1: Install Certificate to QZ Tray

Copy your certificate to QZ Tray's trusted certificates folder:

**Windows:**
```powershell
copy "d:\Hosting files\cafe\certs\qz-site.crt" "%APPDATA%\QZ Industries\QZ Tray\auth\cafe-system.crt"
```

**Mac/Linux:**
```bash
cp "d:/Hosting files/cafe/certs/qz-site.crt" "~/.qz/auth/cafe-system.crt"
```

### Step 2: Configure QZ Tray to Trust Certificate

Edit `qz-tray.properties`:
```properties
# Trust certificates in auth folder
security.certificates.trusted=true
```

### Step 3: Restart QZ Tray

The certificate will now be trusted automatically.

---

## Verification

After configuration, test by:

1. Refresh the cashier dashboard
2. Click "Test Print"
3. **No popup should appear**
4. Print should work immediately

---

## For Your Deployment

Since you're using localhost now, just use **Method 1** (Remember Decision).

When you deploy to cPanel:
1. The popup will appear once on the cashier PC
2. Check "Remember this decision" and Allow
3. It will never appear again for that domain

**The certificate-based authentication we already set up ensures secure communication, the popup is just QZ Tray's first-time permission request.**
