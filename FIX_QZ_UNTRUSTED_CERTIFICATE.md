# Fix QZ Tray "Untrusted Website" Issue

## Problem
QZ Tray shows "Untrusted website" and the Allow button is disabled because the certificate is self-signed.

## Quick Fix (Do This Now)

### Step 1: Enable QZ Tray Override Mode
1. **Close QZ Tray** (right-click system tray icon → Exit)
2. Find the QZ Tray properties file:
   - Windows: `C:\Users\[YourUsername]\.qz\qz-tray.properties`
   - If file doesn't exist, create it

3. Open `qz-tray.properties` in Notepad and add this line:
   ```properties
   security.override.enabled=true
   ```

4. Save the file
5. **Start QZ Tray** again

### Step 2: Allow Connection
1. Refresh your browser (F5)
2. The popup will appear again
3. Now you should be able to click "Allow" even without checking "Remember"
4. Check "Remember this decision" and click "Allow"

---

## Alternative: Install Certificate as Trusted (Recommended for Production)

### For Windows:

1. **Open the certificate file:**
   - Navigate to: `d:\Hosting files\cafe\certs\qz-site.crt`
   - Double-click the file

2. **Install Certificate:**
   - Click "Install Certificate..."
   - Choose "Current User"
   - Click "Next"
   - Select "Place all certificates in the following store"
   - Click "Browse"
   - Select "Trusted Root Certification Authorities"
   - Click "OK" → "Next" → "Finish"
   - Click "Yes" on the security warning

3. **Restart QZ Tray:**
   - Close QZ Tray
   - Start QZ Tray again
   - Refresh browser

4. **Now the certificate will show as "Trusted"** and Allow button will work

---

## Alternative 2: Use QZ Tray Without Certificate (Simplest)

Disable certificate requirement entirely by modifying the frontend code to not use certificates.

This is less secure but works immediately for local development.

---

## Which Method to Use?

- **Local Development (localhost):** Use Override Mode (Step 1)
- **Production Deployment:** Install Certificate as Trusted
- **Quick Test:** Use Override Mode

After applying any method, the Allow button will become clickable.
