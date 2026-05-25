# 🚀 Quick Start Guide - Bakery & Café Management System

## ✅ Prerequisites Check

Before starting the frontend, ensure your backend is running:

1. **Backend Status**: Your backend should be running on `http://localhost:3000`
2. **Database**: PostgreSQL database should be initialized with sample data
3. **API Health**: Visit `http://localhost:3000/api/health` to verify backend is working

## 🎯 Start the Frontend

### Step 1: Navigate to Frontend Directory
```bash
cd frontend
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Start Development Server
```bash
npm start
```

The frontend will automatically open at `http://localhost:3001`

## 🔐 Test Login Credentials

Use these demo accounts to test different user roles:

### **👑 Administrator**
- **Username**: `admin`
- **Password**: `admin123`
- **Features**: Full system access, user management, reports

### **🥖 Bakery Employee**
- **Username**: `baker1`
- **Password**: `password123`
- **Features**: Bakery orders, attendance tracking

### **☕ Café Waiter**
- **Username**: `waiter1`
- **Password**: `password123`
- **Features**: Table service, café orders

### **💰 Cashier**
- **Username**: `cashier1`
- **Password**: `password123`
- **Features**: Payment processing, QR codes

### **👨‍🍳 Kitchen Staff**
- **Username**: `kitchen1`
- **Password**: `password123`
- **Features**: Order preparation, kitchen workflow

## 🧪 Testing Workflow

### 1. **Login Test**
- Try logging in with each role
- Verify role-specific dashboards load correctly

### 2. **Navigation Test**
- Check sidebar navigation works
- Verify responsive design on mobile/tablet

### 3. **Feature Test**
- **Admin**: View reports, manage users
- **Baker**: Create orders, clock in/out
- **Waiter**: View café orders, table management
- **Cashier**: Process payments, generate QR codes
- **Kitchen**: Update order status, mark ready

### 4. **API Integration Test**
- Create a new order
- Update order status
- Process a payment
- Check attendance tracking

## 🎨 What You'll See

### **Beautiful Login Page**
- Modern design with role-specific quick login buttons
- Responsive layout with smooth animations

### **Role-Based Dashboards**
- **Admin**: Comprehensive analytics and system overview
- **Employees**: Task-focused interfaces with relevant tools
- **Real-time data**: Live updates from your backend API

### **Key Features**
- ✨ Beautiful, responsive design
- 🔄 Real-time data synchronization
- 📱 Mobile-friendly interface
- 🎯 Role-based access control
- 🔔 Toast notifications for user feedback
- ⚡ Fast, smooth navigation

## 🐛 Troubleshooting

### **Frontend Won't Start**
```bash
# Clear npm cache and reinstall
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
npm start
```

### **API Connection Issues**
- Ensure backend is running on port 3000
- Check `package.json` proxy setting: `"proxy": "http://localhost:3000"`
- Verify CORS is enabled in backend

### **Login Issues**
- Ensure database is initialized with sample users
- Check backend logs for authentication errors
- Verify user credentials are correct

## 🎉 Success Indicators

You'll know everything is working when:

1. ✅ Frontend loads at `http://localhost:3001`
2. ✅ Login page displays with quick login buttons
3. ✅ You can log in with demo accounts
4. ✅ Role-specific dashboards load with real data
5. ✅ Navigation between pages works smoothly
6. ✅ API calls show real data from your backend

## 🔥 Next Steps

Once everything is running:

1. **Explore Each Role**: Log in as different users to see role-specific features
2. **Test Workflows**: Create orders, process payments, track attendance
3. **Check Responsiveness**: Test on different screen sizes
4. **Customize**: Modify colors, add features, or enhance functionality

## 📞 Need Help?

If you encounter any issues:

1. Check that backend is running and accessible
2. Verify all npm dependencies are installed
3. Look at browser console for any JavaScript errors
4. Check network tab to see if API calls are successful

---

**🎊 Congratulations! You now have a fully functional Bakery & Café Management System with beautiful frontend and robust backend integration!**
