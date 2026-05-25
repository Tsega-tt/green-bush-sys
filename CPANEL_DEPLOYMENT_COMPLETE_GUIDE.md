# Complete cPanel Deployment Guide - Cafe Bakery Management System

## Prerequisites
- Yegara hosting account with cPanel access
- Node.js app support enabled
- PostgreSQL 13 database access
- phpPgAdmin access
- File Manager access

## Step-by-Step Deployment Process

### 1. Database Setup in cPanel

#### 1.1 Create PostgreSQL Database
1. Log into your cPanel
2. Go to **PostgreSQL Databases**
3. Create a new database (e.g., `cafebakery_db`)
4. Create a database user with full privileges
5. Note down the database credentials:
   - Database name
   - Username
   - Password
   - Host (usually localhost)
   - Port (usually 5432)

#### 1.2 Import Database Schema
1. Access **phpPgAdmin** from cPanel
2. Select your database
3. Go to **SQL** tab
4. Copy and paste the contents of `database_setup_pg13.sql`
5. Execute the script
6. Verify all tables are created successfully

#### 1.3 Import Your Data (Optional)
If you have existing data:
1. Export data from your local database using pgAdmin or command line
2. Use the `database_import_cpanel.sql` template
3. Replace the template data with your actual exported data
4. Execute in phpPgAdmin

### 2. Update Environment Configuration

#### 2.1 Update Production Environment File
1. Open `.env.production` file
2. Update the database credentials:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=your_actual_database_name
DB_USER=your_actual_database_user
DB_PASSWORD=your_actual_database_password
```
3. Update other settings as needed

#### 2.2 Update cPanel Deployment Configuration
1. Open `.cpanel.yml` file
2. Replace `username` with your actual cPanel username
3. Update paths if necessary

### 3. Node.js Application Setup

#### 3.1 Enable Node.js in cPanel
1. Go to **Node.js Selector** in cPanel
2. Create a new Node.js app:
   - **Node.js version**: Latest stable (16.x or 18.x)
   - **Application mode**: Production
   - **Application root**: `cafe-bakery` (or your preferred folder)
   - **Application URL**: Your domain or subdomain
   - **Application startup file**: `startup.js`

#### 3.2 Set Environment Variables
In the Node.js app settings, add these environment variables:
```
NODE_ENV=production
DB_HOST=localhost
DB_PORT=5432
DB_NAME=your_database_name
DB_USER=your_database_user
DB_PASSWORD=your_database_password
PORT=3000
BCRYPT_SALT_ROUNDS=10
```

### 4. File Upload and Deployment

#### 4.1 Upload Project Files
Using **File Manager** in cPanel:

1. Navigate to your Node.js application directory
2. Upload these files and folders:
   - `app.js`
   - `startup.js`
   - `server.js`
   - `package.json`
   - `package-lock.json`
   - `.env.production` (rename to `.env`)
   - `config/` folder
   - `controllers/` folder
   - `middleware/` folder
   - `models/` folder
   - `routes/` folder
   - `scripts/` folder

#### 4.2 Install Dependencies
1. In Node.js app settings, click **Run NPM Install**
2. Or use Terminal if available:
   ```bash
   cd /home/username/cafe-bakery
   npm install --production
   ```

#### 4.3 Build and Deploy Frontend
1. On your local machine, build the React app:
   ```bash
   cd frontend
   npm install
   npm run build
   ```
2. Upload the contents of `frontend/build/` to your `public_html` directory
3. Or use the automated deployment via Git (if available)

### 5. Start the Application

#### 5.1 Start Node.js App
1. In cPanel Node.js Selector
2. Click **Start** button for your application
3. Check the status - it should show "Running"

#### 5.2 Verify Deployment
1. Visit your domain/subdomain
2. Check the health endpoint: `https://yourdomain.com/api/health`
3. Test the login functionality
4. Verify database connectivity

### 6. SSL Certificate Setup (Recommended)

#### 6.1 Enable SSL
1. Go to **SSL/TLS** in cPanel
2. Enable **Let's Encrypt** SSL certificate
3. Force HTTPS redirects

#### 6.2 Update CORS Settings
If needed, update your app to handle HTTPS properly.

### 7. Domain Configuration

#### 7.1 Set Up Domain/Subdomain
1. In cPanel, go to **Subdomains** (if using subdomain)
2. Create subdomain pointing to your application
3. Or configure main domain to point to the application

### 8. Monitoring and Maintenance

#### 8.1 Log Monitoring
1. Check Node.js application logs in cPanel
2. Monitor error logs regularly
3. Set up log rotation if needed

#### 8.2 Database Maintenance
1. Regular backups via cPanel
2. Monitor database performance
3. Update statistics regularly

### 9. Troubleshooting Common Issues

#### 9.1 Database Connection Issues
- Verify database credentials in `.env` file
- Check PostgreSQL service status
- Ensure database user has proper permissions

#### 9.2 Node.js App Won't Start
- Check startup file path in Node.js settings
- Verify all dependencies are installed
- Check application logs for errors

#### 9.3 Frontend Not Loading
- Ensure React build files are in correct directory
- Check file permissions (755 for directories, 644 for files)
- Verify API endpoints are accessible

#### 9.4 CORS Issues
- Update CORS settings in your app
- Check if domain is properly configured
- Verify SSL certificate is working

### 10. Security Considerations

#### 10.1 Environment Variables
- Never commit `.env` files to version control
- Use strong passwords for database
- Regularly rotate secrets

#### 10.2 Database Security
- Use non-default database names
- Implement proper user permissions
- Regular security updates

#### 10.3 Application Security
- Keep Node.js and dependencies updated
- Implement rate limiting
- Use HTTPS everywhere

## Post-Deployment Checklist

- [ ] Database is accessible and populated
- [ ] Node.js application is running
- [ ] Frontend is loading correctly
- [ ] API endpoints are responding
- [ ] SSL certificate is active
- [ ] Domain/subdomain is configured
- [ ] Logs are being generated
- [ ] Backup system is in place
- [ ] Monitoring is set up

## Support and Maintenance

### Regular Tasks
1. **Weekly**: Check application logs and performance
2. **Monthly**: Update dependencies and security patches
3. **Quarterly**: Database maintenance and optimization
4. **Annually**: Review and update security configurations

### Emergency Contacts
- Hosting provider support
- Database administrator
- Application developer

---

## Quick Reference Commands

### Database Commands (phpPgAdmin)
```sql
-- Check database connection
SELECT NOW();

-- View all tables
\dt

-- Check table records
SELECT COUNT(*) FROM users;
```

### Node.js Commands (if terminal access available)
```bash
# Check app status
pm2 status

# View logs
pm2 logs

# Restart app
pm2 restart app

# Install dependencies
npm install --production
```

### File Permissions
```bash
# Set correct permissions
chmod -R 755 /home/username/cafe-bakery
chmod -R 644 /home/username/cafe-bakery/*.js
chmod +x /home/username/cafe-bakery/startup.js
```

---

**Note**: Replace all placeholder values (username, database names, passwords, etc.) with your actual values before deployment.
