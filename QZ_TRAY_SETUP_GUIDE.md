# QZ Tray Printer Setup & Troubleshooting Guide

## Overview
The cashier dashboard now uses **QZ Tray** for direct thermal printer access from the browser. This allows printing ESC/POS receipts with Amharic text, logos, and proper formatting directly to your USB thermal printer.

## Prerequisites

### 1. Install QZ Tray on Cashier PC
1. Download QZ Tray from: https://qz.io/download/
2. Install the application (Windows/Mac/Linux supported)
3. **Start QZ Tray** - look for the QZ icon in your system tray
4. Keep QZ Tray running while using the cashier dashboard

### 2. Verify Printer Configuration
- Printer Name: `XP-58 (2)` (as configured in `.env`)
- Check this matches exactly in Windows "Devices and Printers"
- If different, update `REACT_APP_QZ_PRINTER_NAME` in `frontend/.env`

## How It Works

1. **Auto-Print Polling**: Dashboard checks for new unprinted orders every 5 seconds
2. **Server-Sent Events (SSE)**: Instant notification when waiters create new orders
3. **QZ Tray Integration**: Browser sends print data directly to thermal printer via QZ Tray
4. **ESC/POS Rendering**: Server generates bitmap images for Amharic text using Nyala font

## Testing the Setup

### Step 1: Check QZ Tray Status
1. Open the cashier dashboard at `http://localhost:5000/dashboard`
2. Look for the status indicator below the dashboard title:
   - **Blue "QZ Tray Connected"** = ✅ Working
   - **Yellow "QZ Tray Waiting..."** = ⏳ Initializing
   - **Red "QZ Tray Error"** = ❌ Problem detected

### Step 2: Run Test Print
1. Click the **"Test Print"** button in the dashboard header
2. Watch for:
   - Browser console logs (F12 → Console tab)
   - Toast notifications
   - Actual printer output

### Step 3: Check Browser Console
Press `F12` and look for these log messages:
```
[QZ Test] Running diagnostics...
[QZ Test] Diagnostics: {connected: true, printers: [...]}
[QZ Print] Attempting to print order #XX
[QZ Print] Payload received, length: XXXX, printer: XP-58 (2)
[QZ Print] Print command sent successfully for order #XX
```

## Common Issues & Solutions

### Issue 1: "QZ Tray is not running"
**Symptoms:**
- Red status indicator
- Toast: "QZ Tray printing failed"
- Console: `QZ_NOT_LOADED` or `QZ_NOT_CONNECTED`

**Solution:**
1. Check if QZ Tray is running (system tray icon)
2. If not running, start QZ Tray application
3. Refresh the browser page
4. Click "Test Print" again

### Issue 2: "QZ Tray printing blocked/unavailable"
**Symptoms:**
- Browser blocks QZ Tray connection
- Console: `QZ_TRAY_NOT_RUNNING_OR_BLOCKED`

**Solution:**
1. QZ Tray will show a security prompt on first use
2. Click **"Allow"** or **"Remember"** when prompted
3. If you accidentally clicked "Block", you need to:
   - Close QZ Tray
   - Delete QZ Tray cache/settings
   - Restart QZ Tray
   - Refresh browser and allow the connection

### Issue 3: Printer not found
**Symptoms:**
- Toast: "Printer not found"
- Console shows available printers list doesn't include your printer

**Solution:**
1. Open Windows "Devices and Printers"
2. Find your thermal printer's exact name
3. Update `frontend/.env`:
   ```
   REACT_APP_QZ_PRINTER_NAME=YourExactPrinterName
   ```
4. Rebuild frontend: `npm run build`
5. Restart server

### Issue 4: Certificate/Signature errors
**Symptoms:**
- Console: `QZ_CERTIFICATE_UNAVAILABLE` or `QZ_SIGNATURE_UNAVAILABLE`

**Solution:**
1. Verify certificate files exist:
   - `d:\Hosting files\cafe\certs\qz-site.crt`
   - `d:\Hosting files\cafe\certs\qz-private.key`
2. Check `.env` configuration:
   ```
   QZ_CERT_PATH=certs/qz-site.crt
   QZ_PRIVATE_KEY_PATH=certs/qz-private.key
   QZ_SIGNATURE_ALGORITHM=SHA256
   ```
3. Restart the server

### Issue 5: Print shows "sent to printer" but nothing prints
**Symptoms:**
- Green toast: "Order #XX printed successfully"
- No actual printer output

**Possible Causes:**
1. **Wrong printer selected**: Check printer name matches exactly
2. **Printer offline**: Check printer power and USB connection
3. **Printer driver issue**: Reinstall thermal printer driver
4. **Paper out**: Check if printer has paper
5. **Printer error state**: Check printer LED indicators

**Debug Steps:**
1. Click "Test Print" and watch console logs
2. Check if payload length > 0
3. Verify printer name in logs matches your actual printer
4. Try printing a test page from Windows to verify printer works
5. Check QZ Tray logs (QZ Tray → View → Logs)

## Environment Variables Reference

### Backend (.env)
```bash
# Printer Configuration
PRINTER_ENABLED=true
PRINTER_MODE=windows
PRINTER_WINDOWS_PORT=USB001
PRINTER_RENDER_MODE=bitmap
PRINTER_AUTO_PRINT_ON_ORDER=false  # Server-side auto-print (usually false)

# QZ Tray Security
QZ_CERT_PATH=certs/qz-site.crt
QZ_PRIVATE_KEY_PATH=certs/qz-private.key
QZ_SIGNATURE_ALGORITHM=SHA256

# Ticket Rendering
PRINTER_TICKET_BITMAP_MAX_WIDTH=576
PRINTER_TICKET_FONT_FAMILY=Nyala
```

### Frontend (frontend/.env)
```bash
# API Configuration
REACT_APP_API_BASE_URL=http://localhost:5000/api

# QZ Tray Printer
REACT_APP_QZ_PRINTER_NAME=XP-58 (2)
```

## Deployment to cPanel

1. **Build frontend with production settings:**
   ```bash
   npm run build
   ```

2. **Update frontend/.env.production:**
   ```bash
   REACT_APP_API_URL=/api
   REACT_APP_QZ_PRINTER_NAME=XP-58 (2)
   ```

3. **Upload files to cPanel:**
   - Upload `frontend/build/*` to public_html
   - Upload backend files to server directory
   - Upload `.env` file with production settings

4. **On Cashier PC:**
   - Install QZ Tray
   - Start QZ Tray
   - Open browser to your deployed URL
   - Allow QZ Tray connection when prompted
   - Test print functionality

## Monitoring & Logs

### Browser Console (F12)
- `[QZ Print]` prefix = Auto-print polling logs
- `[QZ Test]` prefix = Test print button logs
- Look for error messages with stack traces

### Server Logs
- Check terminal/console where server is running
- Look for printer-related errors
- Check QZ Tray endpoint access logs

### QZ Tray Logs
- Open QZ Tray application
- View → Logs
- Check for connection attempts and errors

## Support Checklist

If printing still doesn't work after trying all solutions:

1. ✅ QZ Tray is installed and running
2. ✅ Browser allowed QZ Tray connection
3. ✅ Printer name matches exactly in .env
4. ✅ Printer is powered on and connected via USB
5. ✅ Printer works (test page from Windows)
6. ✅ Certificate files exist and are configured
7. ✅ Server is running and accessible
8. ✅ Browser console shows no errors
9. ✅ Test Print button shows success message
10. ✅ QZ Tray logs show print job received

## Quick Diagnostic Command

Run this in browser console (F12) on cashier dashboard:
```javascript
// Check QZ Tray status
console.log('QZ Loaded:', typeof window.qz !== 'undefined');
console.log('QZ Version:', window.qz?.version);
console.log('QZ Connected:', window.qz?.websocket?.isActive?.());

// List available printers
window.qz.printers.find().then(printers => {
  console.log('Available Printers:', printers);
});
```

## Success Indicators

When everything is working correctly, you should see:
1. ✅ Blue "QZ Tray Connected" status in dashboard
2. ✅ Console logs showing successful print commands
3. ✅ Toast: "Order #XX printed successfully"
4. ✅ Physical receipt prints from thermal printer
5. ✅ Receipt shows Amharic text, logo, and proper formatting
6. ✅ Multiple tickets for cafe/restaurant/barista orders
