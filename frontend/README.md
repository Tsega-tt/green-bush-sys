# Bakery & Café Management System - Frontend

A beautiful, responsive React.js frontend for the Bakery & Café Management System with Tailwind CSS styling and complete backend integration.

## 🚀 Features

### **Authentication & Authorization**
- Role-based login system
- Session-based authentication (no JWT as per backend design)
- Protected routes based on user roles
- Quick login buttons for demo accounts

### **Role-Based Dashboards**
- **Admin Dashboard**: Complete system overview with analytics
- **Bakery Employee Dashboard**: Order management and attendance tracking
- **Café Waiter Dashboard**: Table service and order coordination
- **Cashier Dashboard**: Payment processing and QR code generation
- **Kitchen Staff Dashboard**: Food preparation workflow

### **Core Features**
- **Menu Management**: Add, edit, and manage bakery/café items
- **Order Management**: Create and track orders through workflow
- **Payment Processing**: Handle payments with QR code support
- **User Management**: Manage employees and permissions
- **Attendance Tracking**: Clock in/out and time reporting
- **Business Reports**: Analytics and performance insights

### **UI/UX Features**
- Beautiful, modern design with Tailwind CSS
- Fully responsive layout (mobile, tablet, desktop)
- Real-time notifications with react-hot-toast
- Loading states and error handling
- Intuitive navigation and user experience
- Role-specific color schemes and icons

## 🛠️ Technology Stack

- **Frontend Framework**: React.js 18
- **Styling**: Tailwind CSS 3
- **Routing**: React Router DOM 6
- **HTTP Client**: Axios
- **Icons**: React Icons (Feather Icons)
- **Notifications**: React Hot Toast
- **State Management**: React Context API
- **Build Tool**: Create React App

## 📁 Project Structure

```
frontend/
├── public/
│   ├── index.html
│   └── manifest.json
├── src/
│   ├── components/
│   │   ├── common/
│   │   │   └── LoadingSpinner.js
│   │   └── layout/
│   │       └── DashboardLayout.js
│   ├── context/
│   │   └── AuthContext.js
│   ├── pages/
│   │   ├── dashboards/
│   │   │   ├── AdminDashboard.js
│   │   │   ├── BakeryEmployeeDashboard.js
│   │   │   ├── CafeWaiterDashboard.js
│   │   │   ├── CashierDashboard.js
│   │   │   └── KitchenStaffDashboard.js
│   │   ├── AttendanceManagement.js
│   │   ├── LoginPage.js
│   │   ├── MenuManagement.js
│   │   ├── OrderManagement.js
│   │   ├── PaymentManagement.js
│   │   ├── Profile.js
│   │   ├── Reports.js
│   │   └── UserManagement.js
│   ├── services/
│   │   └── api.js
│   ├── App.js
│   ├── index.css
│   └── index.js
├── tailwind.config.js
├── postcss.config.js
└── package.json
```

## 🔧 Installation & Setup

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- Backend server running on port 3000

### 1. Install Dependencies
```bash
cd frontend
npm install
```

### 2. Start Development Server
```bash
npm start
```

The frontend will start on `http://localhost:3001` and proxy API requests to the backend on port 3000.

### 3. Build for Production
```bash
npm run build
```

## 🔐 Demo Accounts

The system includes pre-configured demo accounts for testing:

### **Administrator**
- Username: `admin`
- Password: `admin123`
- Access: Full system control

### **Bakery Employee**
- Username: `baker1`
- Password: `password123`
- Access: Bakery operations

### **Café Waiter**
- Username: `waiter1`
- Password: `password123`
- Access: Table service

### **Cashier**
- Username: `cashier1`
- Password: `password123`
- Access: Payment processing

### **Kitchen Staff**
- Username: `kitchen1`
- Password: `password123`
- Access: Food preparation

## 🎨 Design System

### **Color Palette**
- **Primary**: Orange tones for warmth and appetite appeal
- **Secondary**: Blue tones for trust and professionalism
- **Accent**: Yellow for highlights and calls-to-action
- **Role Colors**: Each user role has a distinct color scheme

### **Typography**
- **Primary Font**: Inter (clean, modern sans-serif)
- **Display Font**: Poppins (friendly, approachable)

### **Components**
- Consistent button styles and states
- Standardized form inputs and validation
- Reusable card layouts
- Status badges and indicators
- Loading spinners and states

## 🔄 API Integration

The frontend communicates with the backend through a comprehensive API service:

### **Authentication**
- Login/logout functionality
- Profile management
- Session handling

### **Data Management**
- CRUD operations for all entities
- Real-time status updates
- Error handling and validation

### **File Structure**
- `services/api.js`: Centralized API client with interceptors
- Automatic error handling and notifications
- Request/response transformation

## 📱 Responsive Design

The application is fully responsive with breakpoints:
- **Mobile**: 320px - 768px
- **Tablet**: 768px - 1024px
- **Desktop**: 1024px+

### **Mobile Features**
- Collapsible sidebar navigation
- Touch-friendly buttons and controls
- Optimized layouts for small screens
- Swipe gestures support

## 🔧 Configuration

### **Environment Variables**
The app uses the proxy configuration in `package.json` to connect to the backend:

```json
{
  "proxy": "http://localhost:3000"
}
```

### **Tailwind Configuration**
Custom theme configuration in `tailwind.config.js`:
- Extended color palette
- Custom fonts
- Animation utilities
- Component classes

## 🧪 Testing

### **Manual Testing Checklist**
- [ ] Login with all user roles
- [ ] Navigate between dashboard sections
- [ ] Create and manage orders
- [ ] Process payments
- [ ] Clock in/out functionality
- [ ] Responsive design on different devices

### **API Integration Testing**
- [ ] All CRUD operations work correctly
- [ ] Error handling displays appropriate messages
- [ ] Loading states show during API calls
- [ ] Real-time updates reflect in UI

## 🚀 Deployment

### **Build Process**
```bash
npm run build
```

### **Deployment Options**
- **Static Hosting**: Netlify, Vercel, GitHub Pages
- **Traditional Hosting**: Apache, Nginx
- **Cloud Platforms**: AWS S3, Google Cloud Storage

### **Production Considerations**
- Ensure backend API is accessible
- Configure proper CORS settings
- Set up environment-specific configurations
- Enable HTTPS for security

## 🔮 Future Enhancements

### **Planned Features**
- Real-time notifications with WebSocket
- Advanced analytics and reporting
- Mobile app version
- Offline functionality
- Multi-language support

### **Technical Improvements**
- Unit and integration tests
- Performance optimization
- Accessibility improvements
- PWA capabilities

## 📞 Support

For technical support or questions about the frontend implementation, please refer to the main project documentation or contact the development team.

---

**Built with ❤️ using React.js and Tailwind CSS**
