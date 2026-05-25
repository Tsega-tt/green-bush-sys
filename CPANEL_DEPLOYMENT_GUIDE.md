# Complete cPanel Deployment Guide for Bakery Cafe Management System

## 🚀 Pre-Deployment Checklist

### Requirements
- ✅ cPanel hosting with Node.js support (minimum Node.js 16+)
- ✅ PostgreSQL database access
- ✅ Domain/subdomain configured
- ✅ SSL certificate (REQUIRED for QZ Tray printing)
- ✅ QZ Tray installed on cashier PC (for thermal printing)

## 📋 Step-by-Step Deployment Process

### Step 1: Prepare Your Local Project

1. **Build the React frontend locally:**
   ```bash
   cd frontend
   npm install
   npm run build
   ```

2. **Test your production build locally:**
   ```bash
   # From project root
   npm install
   npm start
   ```

3. **Create your production .env file:**
   - Copy `.env.example` to `.env`
   - Update with your production values

### Step 2: Database Setup in cPanel

1. **Access cPanel Database Section:**
   - Log into your cPanel
   - Navigate to "PostgreSQL Databases" or "Databases"

2. **Create Database:**
   - Create new database: `bakery_cafe_db`
   - Create database user with full privileges
   - Note down: database name, username, password, host

3. **Import Database Schema:**
   - Use phpPgAdmin or cPanel database manager
   - Import the `database_setup.sql` file
   - Or copy-paste the SQL commands manually

4. **Verify Database Connection:**
   - Test connection with provided credentials
   - Ensure all tables are created successfully

### Step 3: File Upload Methods

#### Method A: Git Deployment (Recommended)
1. **Push to Git Repository:**
   ```bash
   git add .
   git commit -m "Production deployment"
   git push origin main
   ```

2. **Setup Git in cPanel:**
   - Go to "Git Version Control" in cPanel
   - Create repository or clone existing
   - Set deployment path to `public_html` or subdirectory

#### Method B: File Manager Upload
1. **Create ZIP Archive:**
   - Compress entire project folder
   - Exclude `node_modules` and `.git` folders

2. **Upload via cPanel File Manager:**
   - Navigate to `public_html` (or subdomain folder)
   - Upload and extract ZIP file
   - Set proper file permissions (755 for directories, 644 for files)

#### Method C: FTP Upload
1. **Use FTP Client (FileZilla, WinSCP):**
   - Connect using cPanel FTP credentials
   - Upload all files to `public_html` or subdomain directory
   - Maintain folder structure

### Step 4: Configure Node.js in cPanel

1. **Access Node.js Selector:**
   - Find "Node.js Selector" or "Node.js" in cPanel
   - If not available, contact hosting provider

2. **Create Node.js App:**
   - Click "Create Application"
   - Set Node.js version (16+ recommended)
   - Set Application Root: `/public_html` (or your domain folder)
   - Set Application URL: your domain
   - Set Application Startup File: `app.js`

3. **Configure Environment Variables:**
   - Add all variables from your `.env` file:
     ```
     # Server
     PORT=3000
     NODE_ENV=production
     
     # Database
     DB_HOST=localhost
     DB_PORT=5432
     DB_NAME=bakery_cafe_db
     DB_USER=your_db_user
     DB_PASSWORD=your_db_password
     DB_SSL=false
     
     # Printer (Windows mode for local cashier PC)
     PRINTER_ENABLED=true
     PRINTER_MODE=windows
     PRINTER_WINDOWS_PORT=USB001
     PRINTER_RENDER_MODE=bitmap
     PRINTER_TICKET_FONT_FAMILY=Nyala
     PRINTER_AUTO_PRINT_ON_ORDER=false
     
     # QZ Tray (IMPORTANT: See QZ Tray section below)
     QZ_CERT_PATH=/path/to/production-cert.crt
     QZ_PRIVATE_KEY_PATH=/path/to/production-key.pem
     QZ_SIGNATURE_ALGORITHM=SHA512
     ```

### Step 5: Install Dependencies and Build

1. **Install Backend Dependencies:**
   - In cPanel Node.js app interface
   - Click "Run NPM Install" or use terminal:
   ```bash
   npm install --production
   ```

2. **Build Frontend:**
   ```bash
   cd frontend
   npm install
   npm run build
   ```

### Step 6: Configure Domain and SSL

1. **Domain Configuration:**
   - Ensure domain points to your hosting
   - Configure subdomain if needed
   - Update DNS records if necessary

2. **SSL Certificate:**
   - Enable SSL in cPanel (Let's Encrypt recommended)
   - Force HTTPS redirects
   - Update FRONTEND_URL in environment variables

### Step 7: QZ Tray Certificate Setup (CRITICAL FOR PRINTING)

**Option A: Production Certificate (Recommended for deployed sites)**

1. **Generate Production Certificate:**
   - On your **production server**, install QZ Tray
   - Open QZ Tray → Advanced → Site Manager
   - Click "+" → Create New
   - Follow prompts to generate certificate
   - Certificate will be saved to Desktop in "QZ Tray Demo Cert" folder

2. **Upload Certificate to Server:**
   ```bash
   # Create certs directory on server
   mkdir -p /home/username/public_html/certs
   
   # Upload these files via FTP/File Manager:
   # - digital-certificate.txt → /home/username/public_html/certs/qz-prod.crt
   # - private-key.pem → /home/username/public_html/certs/qz-prod.key
   ```

3. **Update Environment Variables:**
   ```
   QZ_CERT_PATH=/home/username/public_html/certs/qz-prod.crt
   QZ_PRIVATE_KEY_PATH=/home/username/public_html/certs/qz-prod.key
   QZ_SIGNATURE_ALGORITHM=SHA512
   ```

4. **Install Certificate on Cashier PC:**
   - Copy `digital-certificate.txt` to: `C:\Program Files\QZ Tray\override.crt`
   - Restart QZ Tray
   - This makes your site trusted by QZ Tray

**Option B: Use CA-Signed Certificate (Enterprise)**
- Purchase SSL certificate from CA
- Configure as per QZ Tray documentation
- More complex but no per-machine setup needed

### Step 8: Cashier PC Setup (For Printing)

1. **Install QZ Tray on Cashier PC:**
   - Download from: https://qz.io/download/
   - Install and run QZ Tray
   - Ensure it starts with Windows

2. **Install Production Certificate:**
   - Copy `override.crt` (from Step 7) to `C:\Program Files\QZ Tray\`
   - Restart QZ Tray

3. **Configure Printer:**
   - Ensure thermal printer is connected via USB
   - Note printer name from Windows (e.g., "XP-58 (2)")
   - Update `REACT_APP_QZ_PRINTER_NAME` in frontend `.env.production`

4. **Test QZ Tray Connection:**
   - Open your deployed site on cashier PC
   - Check QZ Tray status indicator in dashboard header
   - Click "Test Print" button to verify

### Step 9: Start and Test Application

1. **Start Node.js Application:**
   - In cPanel Node.js interface, click "Start"
   - Monitor for any startup errors

2. **Test Endpoints:**
   - Visit: `https://yourdomain.com/api/health`
   - Should return JSON with status: success
   - Test frontend: `https://yourdomain.com`
   - **Test QZ endpoints:**
     - `https://yourdomain.com/api/qz/certificate` (should return cert)
     - POST to `https://yourdomain.com/api/qz/sign` with `{"toSign":"test"}` (should return signature)

3. **Initialize Database:**
   - Run database initialization scripts if needed:
   ```bash
   npm run init-db
   npm run add-menu
   ```

4. **Test Printing:**
   - Create a test order from waiter dashboard
   - On cashier PC, verify QZ Tray connects (green indicator)
   - Order should auto-print on thermal printer
   - If popup appears, click "Allow" and "Remember this decision"

## 🔧 Configuration Files Created

### `.cpanel.yml` - Automatic Deployment
```yaml
deployment:
  tasks:
    - export DEPLOYPATH=/home/username/public_html/
    - /bin/cp -R * $DEPLOYPATH
    - cd $DEPLOYPATH
    - npm install --production
    - cd frontend && npm install && npm run build
```

### `app.js` - Production Entry Point
- Serves React build files
- Handles API routes
- Configured for production environment

### Database Schema
- Complete PostgreSQL schema in `database_setup.sql`
- All required tables and relationships
- Default admin user and sample data

## 🚨 Troubleshooting Common Issues

### Issue 1: Node.js App Won't Start
**Solutions:**
- Check Node.js version compatibility
- Verify startup file path (`app.js`)
- Check environment variables
- Review error logs in cPanel

### Issue 2: Database Connection Failed
**Solutions:**
- Verify database credentials
- Check database host (usually `localhost`)
- Ensure PostgreSQL is enabled
- Test connection manually

### Issue 3: Frontend Not Loading
**Solutions:**
- Ensure React build completed successfully
- Check `frontend/build` directory exists
- Verify static file serving in `app.js`
- Clear browser cache

### Issue 4: API Routes Not Working
**Solutions:**
- Check route definitions in `app.js`
- Verify middleware order
- Test individual endpoints
- Check CORS configuration

### Issue 5: Environment Variables Not Loading
**Solutions:**
- Verify `.env` file in root directory
- Check cPanel environment variable settings
- Ensure `dotenv` package is installed
- Restart Node.js application

### Issue 6: QZ Tray "Untrusted Website" Popup
**Solutions:**
- Ensure HTTPS is enabled (QZ Tray requires SSL)
- Verify `override.crt` is in `C:\Program Files\QZ Tray\`
- Certificate must match what server is serving
- Restart QZ Tray after installing certificate
- Check signature algorithm matches (SHA512)

### Issue 7: Printer Not Triggering
**Solutions:**
- Verify QZ Tray is running on cashier PC
- Check printer name matches `REACT_APP_QZ_PRINTER_NAME`
- Test with "Test Print" button in dashboard
- Check browser console for QZ errors
- Verify `/api/qz/certificate` and `/api/qz/sign` endpoints work

### Issue 8: Slow Loading (5+ seconds)
**Solutions:**
- Verify `NODE_ENV=production` is set
- Check gzip compression is enabled
- Verify static assets have cache headers
- Reduce API polling intervals if needed
- Check database query performance
- Monitor server resources (CPU, RAM)

## 📊 Post-Deployment Tasks

### 1. Security Hardening
- Change default admin password
- Update JWT secrets
- Configure rate limiting
- Enable HTTPS only

### 2. Performance Optimization
- Enable gzip compression
- Configure caching headers
- Optimize database queries
- Monitor resource usage

### 3. Monitoring Setup
- Set up error logging
- Configure uptime monitoring
- Monitor database performance
- Set up backup schedules

### 4. Testing
- Test all user flows
- Verify payment processing
- Test mobile responsiveness
- Check cross-browser compatibility

## 🔄 Updating Your Application

### For Code Updates:
1. **Build frontend locally first:**
   ```bash
   cd frontend
   npm run build
   ```

2. **Upload changes:**
   - Via Git: Push and pull in cPanel
   - Via FTP: Upload changed files
   - **Important:** Upload the entire `frontend/build` folder

3. **Update dependencies if needed:**
   ```bash
   npm install --production
   ```

4. **Restart Node.js application:**
   - In cPanel Node.js interface, click "Restart"
   - Monitor logs for errors

### For QZ Tray Certificate Updates:
1. Generate new certificate on production server
2. Upload to server certs directory
3. Update environment variables
4. Copy `override.crt` to all cashier PCs
5. Restart QZ Tray on all cashier PCs
6. Restart Node.js application

### For Database Updates:
1. Create migration scripts
2. Backup existing database
3. Run migration scripts
4. Test thoroughly

## 📞 Support Resources

- **cPanel Documentation**: Check your hosting provider's docs
- **Node.js Logs**: Available in cPanel Node.js interface
- **Database Logs**: Check PostgreSQL logs in cPanel
- **Error Logs**: Monitor application error logs

## 🎉 Success Indicators

Your deployment is successful when:
- ✅ `https://yourdomain.com` loads the React frontend
- ✅ `https://yourdomain.com/api/health` returns success status
- ✅ `https://yourdomain.com/api/qz/certificate` returns certificate
- ✅ User registration/login works
- ✅ Menu items display correctly
- ✅ Order creation functions properly
- ✅ QZ Tray status shows "Connected" (green) on cashier PC
- ✅ Test print button successfully prints receipt
- ✅ Orders auto-print on thermal printer without popups
- ✅ Page loads in under 2 seconds (not 5+ seconds)
- ✅ All API endpoints respond correctly

---

**Important Notes:**
- Always backup your database before major updates
- Test thoroughly in a staging environment first
- Monitor application performance after deployment
- Keep your dependencies updated for security
