# Bakery & Café Management System - Backend API
comprhensive
A comprehensive Node.js backend API for managing bakery and café operations with role-based access control, order management, payment processing, and attendance tracking.

## 🚀 Features

### **User Management**
- Role-based authentication (Admin, Bakery Employee, Café Waiter, Cashier, Kitchen Staff)
- User profile management
- Employee status management

### **Menu Management**
- Separate bakery and café menus
- Category-based organization
- Availability toggle
- Price management

### **Order Management**
- Bakery order workflow (Employee → Cashier → Customer)
- Café order workflow (Waiter → Kitchen → Waiter → Cashier)
- Real-time status tracking
- Order history and status logs

### **Payment Processing**
- Multiple payment methods (Cash, Card, QR Code, Mobile Payment)
- QR code generation for café payments
- Payment confirmation workflow
- Payment history tracking

### **Attendance System**
- Clock in/out functionality
- Daily attendance tracking
- Weekly reports
- Hours calculation

## 🛠️ Technology Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL
- **Authentication**: Session-based (No JWT as requested)
- **Architecture**: MVC Pattern
- **Validation**: Express-validator
- **Security**: Helmet, CORS, Rate limiting
- **Password Hashing**: bcryptjs
- **QR Code Generation**: qrcode
- **Environment**: dotenv

## 📁 Project Structure

```
bakery-cafe-backend/
├── config/
│   └── database.js          # Database configuration
├── controllers/
│   ├── authController.js    # Authentication logic
│   ├── menuController.js    # Menu management
│   ├── orderController.js   # Order processing
│   ├── paymentController.js # Payment handling
│   ├── userController.js    # User management
│   └── attendanceController.js # Attendance tracking
├── middleware/
│   ├── errorHandler.js      # Global error handling
│   ├── roleAuth.js         # Role-based authorization
│   └── rateLimiter.js      # Rate limiting
├── models/
│   ├── User.js             # User model
│   ├── Menu.js             # Menu model
│   ├── Order.js            # Order model
│   ├── Payment.js          # Payment model
│   └── Attendance.js       # Attendance model
├── routes/
│   ├── authRoutes.js       # Authentication routes
│   ├── menuRoutes.js       # Menu routes
│   ├── orderRoutes.js      # Order routes
│   ├── paymentRoutes.js    # Payment routes
│   ├── userRoutes.js       # User routes
│   └── attendanceRoutes.js # Attendance routes
├── scripts/
│   └── initDatabase.js     # Database initialization
├── .env                    # Environment variables
├── package.json           # Dependencies
├── server.js              # Application entry point
└── README.md              # Documentation
```

## 🔧 Installation & Setup

### Prerequisites
- Node.js (v16 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

### 1. Clone and Install Dependencies
```bash
cd bakery-cafe-backend
npm install
```

### 2. Environment Configuration
Update the `.env` file with your database credentials:
```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=bakery_cafe_db
DB_USER=your_username
DB_PASSWORD=your_password

# Server Configuration
PORT=3000
NODE_ENV=development

# Application Settings
BCRYPT_SALT_ROUNDS=10
```

### 3. Database Setup
```bash
# Create PostgreSQL database
createdb bakery_cafe_db

# Initialize database tables and seed data
npm run init-db
```

### 4. Start the Server
```bash
# Development mode
npm run dev

# Production mode
npm start
```

## 📚 API Documentation

### Base URL
```
http://localhost:3000/api
```

### Authentication Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/login` | User login |
| POST | `/auth/register` | User registration |
| POST | `/auth/logout` | User logout |
| GET | `/auth/profile/:userId` | Get user profile |
| PUT | `/auth/profile/:userId` | Update user profile |

### Menu Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/menu` | Get all menu items |
| GET | `/menu/bakery` | Get bakery menu |
| GET | `/menu/cafe` | Get café menu |
| POST | `/menu` | Create menu item |
| GET | `/menu/:id` | Get specific menu item |
| PUT | `/menu/:id` | Update menu item |
| DELETE | `/menu/:id` | Delete menu item |
| PATCH | `/menu/:id/toggle-availability` | Toggle item availability |

### Order Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/orders` | Get all orders |
| POST | `/orders` | Create new order |
| POST | `/orders/bakery` | Create bakery order |
| POST | `/orders/cafe` | Create café order |
| GET | `/orders/pending` | Get pending orders |
| GET | `/orders/ready` | Get ready orders |
| GET | `/orders/kitchen/orders` | Get kitchen orders |
| GET | `/orders/:id` | Get specific order |
| PUT | `/orders/:id/status` | Update order status |
| PATCH | `/orders/:id/ready` | Mark order as ready |
| PATCH | `/orders/:id/complete` | Complete order |
| GET | `/orders/:id/status-history` | Get order status history |

### Payment Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/payments/pending` | Get pending payments |
| GET | `/payments/history` | Get payment history |
| POST | `/payments` | Create payment |
| POST | `/payments/with-qr` | Create payment with QR code |
| GET | `/payments/:id` | Get specific payment |
| GET | `/payments/order/:orderId` | Get payments for order |
| POST | `/payments/:id/generate-qr` | Generate QR code |
| POST | `/payments/:id/confirm` | Confirm payment |
| PUT | `/payments/:id/status` | Update payment status |
| POST | `/payments/qr/verify` | Verify QR payment |

### User Management Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/users` | Get all users |
| POST | `/users` | Create new user |
| GET | `/users/employees` | Get bakery employees |
| GET | `/users/waiters` | Get café waiters |
| GET | `/users/kitchen-staff` | Get kitchen staff |
| GET | `/users/cashiers` | Get cashiers |
| GET | `/users/role/:role` | Get users by role |
| GET | `/users/:id` | Get specific user |
| PUT | `/users/:id` | Update user |
| DELETE | `/users/:id` | Delete user |
| PATCH | `/users/:id/toggle-status` | Toggle user status |

### Attendance Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/attendance/clock-in` | Clock in |
| POST | `/attendance/clock-out` | Clock out |
| GET | `/attendance` | Get all attendance records |
| GET | `/attendance/today` | Get today's attendance |
| GET | `/attendance/weekly-report` | Get weekly report |
| GET | `/attendance/summary` | Get attendance summary |
| GET | `/attendance/user/:userId` | Get user attendance |
| GET | `/attendance/user/:userId/status` | Get user current status |

## 👥 User Roles & Permissions

### **Admin**
- Full system access
- User management
- Menu management
- System reports

### **Bakery Employee**
- View bakery menu
- Create bakery orders
- Mark orders as completed
- Clock in/out

### **Café Waiter**
- View café menu
- Create café orders
- Serve orders to customers
- Clock in/out

### **Cashier**
- Process payments
- Generate QR codes
- Handle payment confirmations
- Clock in/out

### **Kitchen Staff**
- View café orders
- Update order status (preparing → ready)
- Clock in/out

## 🔒 Security Features

- Input validation with express-validator
- SQL injection prevention
- Rate limiting
- CORS protection
- Helmet security headers
- Password hashing with bcrypt
- Role-based access control

## 📊 Database Schema

### Tables
- **users**: User accounts and roles
- **menu_items**: Bakery and café menu items
- **orders**: Customer orders
- **order_items**: Order line items
- **order_status_logs**: Order status change history
- **payments**: Payment records
- **attendance**: Employee attendance records

## 🚦 Error Handling

The API uses consistent error response format:
```json
{
  "status": "error",
  "message": "Error description",
  "details": ["Validation errors if any"]
}
```

## 🧪 Default Credentials

After running the database initialization:

**Admin Account:**
- Username: `admin`
- Password: `admin123`

**Sample Employees:**
- Username: `baker1`, `waiter1`, `cashier1`, `kitchen1`
- Password: `password123`

## 🔄 Workflow Examples

### Bakery Order Flow
1. Employee creates order → `POST /api/orders/bakery`
2. Order sent to cashier → Status: `pending`
3. Cashier processes payment → `POST /api/payments`
4. Payment confirmed → Status: `paid`
5. Employee marks ready → `PATCH /api/orders/:id/ready`
6. Customer collects → `PATCH /api/orders/:id/complete`

### Café Order Flow
1. Waiter selects table → Creates order
2. Order sent to kitchen → `POST /api/orders/cafe`
3. Kitchen prepares → Status: `preparing`
4. Kitchen marks ready → `PATCH /api/orders/:id/ready`
5. Waiter serves customer
6. Customer pays at cashier → `POST /api/payments/with-qr`
7. Order completed → Status: `completed`

## 🚀 Next Steps

This backend is ready for React.js frontend integration with:
- Clean RESTful API endpoints
- Consistent response formats
- Comprehensive error handling
- Role-based access control
- Real-time order tracking capabilities

Ready for production deployment with proper environment configuration and database setup.
