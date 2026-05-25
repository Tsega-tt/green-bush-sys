# Fix Amharic Text Rendering on Deployed Printer

## 🐛 Problem
Amharic text renders as boxes/squares on the deployed thermal printer, but works fine locally.

## ✅ Solution Applied

### Changes Made:

1. **Updated Font Configuration** (`assets/fonts/fonts.conf`)
   - Added Noto Sans Ethiopic font mapping
   - Configured QZEmbedded font fallback
   - Both Nyala and Noto Sans Ethiopic fonts now available

2. **Updated Environment Variables** (`.env`)
   - Changed `PRINTER_TICKET_FONT_FAMILY` to use Noto Sans Ethiopic
   - Kept `PRINTER_EMBED_FONT_PATH=assets/fonts/NotoSansEthiopic-Regular.ttf`

3. **Added Font Embedding Logging** (`server.js`)
   - Server now logs when font is successfully embedded
   - Shows font size and any errors

---

## 📦 Deploy Font Fix to cPanel

### Step 1: Upload Font Files

**Upload the entire `assets` folder to your cPanel:**

```
Local: d:\Hosting files\cafe\assets\
Server: /home/username/public_html/assets/
```

**Files to upload:**
- `assets/fonts/NotoSansEthiopic-Regular.ttf` ✅
- `assets/fonts/Nyala.ttf` ✅
- `assets/fonts/fonts.conf` ✅ (UPDATED)
- `assets/logo.png` ✅

**Via File Manager:**
1. Log into cPanel
2. Go to File Manager
3. Navigate to your domain folder (e.g., `public_html/`)
4. Upload the entire `assets` folder (or replace existing)
5. Ensure permissions: 755 for folders, 644 for files

### Step 2: Update Environment Variables in cPanel

Go to **Node.js Selector** → Your App → Environment Variables:

**Add/Update these:**
```
PRINTER_TICKET_FONT_FAMILY="Noto Sans Ethiopic", Nyala, "Abyssinica SIL", sans-serif
PRINTER_EMBED_FONT_PATH=assets/fonts/NotoSansEthiopic-Regular.ttf
```

**Keep existing:**
```
PRINTER_ENABLED=true
PRINTER_MODE=windows
PRINTER_RENDER_MODE=bitmap
PRINTER_TICKET_BITMAP_MAX_WIDTH=576
PRINTER_TICKET_BODY_FONT_SIZE=26
NODE_ENV=production
```

### Step 3: Upload Updated Server File

Upload the updated `server.js` file:
- Local: `d:\Hosting files\cafe\server.js`
- Server: `/home/username/public_html/server.js`

This file now includes font embedding logging to help debug issues.

### Step 4: Restart Node.js Application

1. In cPanel **Node.js Selector**
2. Click **"Restart"**
3. Wait 10-15 seconds
4. Check logs for font loading message

### Step 5: Verify Font Loading

**Check server logs for:**
```
✅ Embedded font loaded: NotoSansEthiopic-Regular.ttf (XXX KB)
📝 Fontconfig set to bundled fonts: /home/username/public_html/assets/fonts
```

**If you see errors:**
```
❌ Font file not found: /path/to/font
```
- Check that `assets/fonts/NotoSansEthiopic-Regular.ttf` exists on server
- Verify file permissions (644)
- Check `PRINTER_EMBED_FONT_PATH` environment variable

### Step 6: Test Printing

1. Create a test order with Amharic text
2. Print from cashier dashboard
3. Verify Amharic text renders correctly (not as boxes)

---

## 🔍 Troubleshooting

### Amharic Still Shows as Boxes

**Check 1: Font file exists on server**
```bash
# Via SSH or File Manager
ls -la /home/username/public_html/assets/fonts/
```
Should show:
- `NotoSansEthiopic-Regular.ttf` (around 100-200 KB)
- `Nyala.ttf`
- `fonts.conf`

**Check 2: Environment variable is set**
- Go to cPanel → Node.js Selector → Your App
- Verify `PRINTER_EMBED_FONT_PATH=assets/fonts/NotoSansEthiopic-Regular.ttf`
- Verify `PRINTER_TICKET_FONT_FAMILY` includes "Noto Sans Ethiopic"

**Check 3: Server logs**
- Check Node.js logs in cPanel
- Look for "✅ Embedded font loaded" message
- If missing, font isn't being embedded

**Check 4: Restart after changes**
- Always restart Node.js app after changing environment variables
- Clear browser cache on cashier PC

### Font File Too Large (Slow Loading)

If the embedded font causes slow printing:
1. Use system font instead (requires font installed on server)
2. Or use a smaller font file
3. Current NotoSansEthiopic is ~150KB (acceptable)

### English Text Also Has Issues

If English text also renders poorly:
- Check `PRINTER_RENDER_MODE=bitmap` is set
- Verify `PRINTER_TICKET_BITMAP_MAX_WIDTH=576`
- Check printer DPI settings

---

## 📋 Quick Checklist

Before deploying:
- [ ] Upload `assets/fonts/` folder to server
- [ ] Upload updated `server.js`
- [ ] Set `PRINTER_EMBED_FONT_PATH` environment variable
- [ ] Set `PRINTER_TICKET_FONT_FAMILY` environment variable
- [ ] Restart Node.js application
- [ ] Check server logs for font loading message
- [ ] Test print with Amharic text

---

## 🎯 Why This Works

**The Problem:**
- Production server doesn't have Nyala font installed
- `sharp` (image rendering library) can't find the font
- Falls back to default font without Amharic support
- Result: boxes/squares instead of Amharic characters

**The Solution:**
1. **Embed font in SVG** - Font is base64-encoded and embedded directly in the SVG
2. **Bundle font files** - Fonts are included in the project (`assets/fonts/`)
3. **Configure fontconfig** - Tells `sharp`/`librsvg` where to find fonts
4. **Use Noto Sans Ethiopic** - Better Amharic support than Nyala

**Font Embedding Process:**
1. Server reads `NotoSansEthiopic-Regular.ttf` from `assets/fonts/`
2. Converts font to base64 data URL
3. Embeds as `@font-face` in SVG `<style>` tag
4. SVG uses "QZEmbedded" font family (which is the embedded font)
5. `sharp` renders SVG to bitmap with embedded font
6. Amharic text renders correctly!

---

## 📝 Files Changed

### Modified Files:
1. `assets/fonts/fonts.conf` - Added Noto Sans Ethiopic mapping
2. `.env` - Updated font family and embed path
3. `server.js` - Added font embedding logging

### Files to Upload:
1. `assets/fonts/NotoSansEthiopic-Regular.ttf` (already exists)
2. `assets/fonts/Nyala.ttf` (already exists)
3. `assets/fonts/fonts.conf` (UPDATED)
4. `server.js` (UPDATED)

---

## ✅ Expected Result

**Before Fix:**
```
የምግብ ትዕዛዝ → ▯▯▯▯ ▯▯▯▯
```

**After Fix:**
```
የምግብ ትዕዛዝ → የምግብ ትዕዛዝ ✓
```

All Amharic text should render correctly with proper characters, not boxes or squares.

---

**Need Help?**
- Check server logs for font loading errors
- Verify all files uploaded correctly
- Ensure environment variables are set
- Restart Node.js app after any changes
