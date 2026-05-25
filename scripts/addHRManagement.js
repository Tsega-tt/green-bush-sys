require('dotenv').config();
const { Pool } = require('pg');

const requiredEnvVars = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
const missingEnvVars = requiredEnvVars.filter((k) => !process.env[k]);
if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
  process.exit(1);
}

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: String(process.env.DB_PASSWORD),
});

const addHRTables = async () => {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Adding HR Management tables...');

    // Create performance_metrics table
    await client.query(`
      CREATE TABLE IF NOT EXISTS performance_metrics (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        metric_type VARCHAR(50) NOT NULL CHECK (metric_type IN ('punctuality', 'customer_feedback', 'task_completion', 'quality', 'teamwork')),
        score DECIMAL(3, 2) NOT NULL CHECK (score >= 0 AND score <= 5),
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        notes TEXT,
        recorded_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create performance_reviews table
    await client.query(`
      CREATE TABLE IF NOT EXISTS performance_reviews (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        reviewer_id INTEGER REFERENCES users(id),
        review_type VARCHAR(20) NOT NULL CHECK (review_type IN ('weekly', 'monthly', 'quarterly', 'annual')),
        review_date DATE NOT NULL,
        overall_score DECIMAL(3, 2) CHECK (overall_score >= 0 AND overall_score <= 5),
        strengths TEXT,
        areas_for_improvement TEXT,
        goals TEXT,
        action_items TEXT,
        status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'completed', 'approved')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create employee_goals table
    await client.query(`
      CREATE TABLE IF NOT EXISTS employee_goals (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        target_date DATE,
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'overdue')),
        progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
        set_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create employee_salaries table
    await client.query(`
      CREATE TABLE IF NOT EXISTS employee_salaries (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        payment_type VARCHAR(20) NOT NULL CHECK (payment_type IN ('hourly', 'fixed', 'commission', 'bonus')),
        base_amount DECIMAL(10, 2) NOT NULL,
        currency VARCHAR(3) DEFAULT 'USD',
        effective_date DATE NOT NULL,
        end_date DATE,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create payroll_records table
    await client.query(`
      CREATE TABLE IF NOT EXISTS payroll_records (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        pay_period_start DATE NOT NULL,
        pay_period_end DATE NOT NULL,
        regular_hours DECIMAL(5, 2) DEFAULT 0,
        overtime_hours DECIMAL(5, 2) DEFAULT 0,
        regular_pay DECIMAL(10, 2) DEFAULT 0,
        overtime_pay DECIMAL(10, 2) DEFAULT 0,
        bonus_amount DECIMAL(10, 2) DEFAULT 0,
        commission_amount DECIMAL(10, 2) DEFAULT 0,
        deductions DECIMAL(10, 2) DEFAULT 0,
        gross_pay DECIMAL(10, 2) NOT NULL,
        net_pay DECIMAL(10, 2) NOT NULL,
        status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'paid')),
        processed_by INTEGER REFERENCES users(id),
        processed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create employee_benefits table
    await client.query(`
      CREATE TABLE IF NOT EXISTS employee_benefits (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        benefit_type VARCHAR(50) NOT NULL CHECK (benefit_type IN ('health_insurance', 'paid_time_off', 'employee_discount', 'training_allowance', 'performance_bonus')),
        benefit_name VARCHAR(100) NOT NULL,
        description TEXT,
        value DECIMAL(10, 2),
        start_date DATE NOT NULL,
        end_date DATE,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create customer_feedback table
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_feedback (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id),
        employee_id INTEGER REFERENCES users(id),
        rating INTEGER CHECK (rating >= 1 AND rating <= 5),
        feedback_text TEXT,
        feedback_type VARCHAR(20) DEFAULT 'service' CHECK (feedback_type IN ('service', 'food_quality', 'speed', 'overall')),
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create training_records table
    await client.query(`
      CREATE TABLE IF NOT EXISTS training_records (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        training_name VARCHAR(200) NOT NULL,
        training_type VARCHAR(50) NOT NULL,
        completion_date DATE,
        score DECIMAL(5, 2),
        certificate_url TEXT,
        trainer VARCHAR(100),
        status VARCHAR(20) DEFAULT 'enrolled' CHECK (status IN ('enrolled', 'in_progress', 'completed', 'failed')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create hr_analytics_cache table for performance optimization
    await client.query(`
      CREATE TABLE IF NOT EXISTS hr_analytics_cache (
        id SERIAL PRIMARY KEY,
        metric_name VARCHAR(100) NOT NULL,
        metric_value JSONB NOT NULL,
        period_type VARCHAR(20) NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly', 'quarterly', 'annual')),
        period_date DATE NOT NULL,
        calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(metric_name, period_type, period_date)
      )
    `);

    // Create indexes for better performance
    await client.query(`CREATE INDEX IF NOT EXISTS idx_performance_metrics_user_type ON performance_metrics(user_id, metric_type)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_performance_metrics_period ON performance_metrics(period_start, period_end)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_performance_reviews_user_date ON performance_reviews(user_id, review_date)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_performance_reviews_type ON performance_reviews(review_type)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_employee_goals_user_status ON employee_goals(user_id, status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_employee_salaries_user_active ON employee_salaries(user_id, is_active)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_payroll_records_user_period ON payroll_records(user_id, pay_period_start, pay_period_end)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_payroll_records_status ON payroll_records(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_employee_benefits_user_active ON employee_benefits(user_id, is_active)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_customer_feedback_employee ON customer_feedback(employee_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_customer_feedback_rating ON customer_feedback(rating)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_training_records_user_status ON training_records(user_id, status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_hr_analytics_cache_metric_period ON hr_analytics_cache(metric_name, period_type, period_date)`);

    console.log('✅ HR Management tables created successfully!');

  } catch (error) {
    console.error('❌ Error creating HR tables:', error);
    throw error;
  } finally {
    client.release();
  }
};

const seedHRData = async () => {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Seeding HR sample data...');

    // Get existing users
    const usersResult = await client.query('SELECT id, role FROM users WHERE role != $1', ['admin']);
    const users = usersResult.rows;

    if (users.length === 0) {
      console.log('⚠️ No employees found. Please run the main database initialization first.');
      return;
    }

    // Add sample salary records for all employees
    for (const user of users) {
      // Base salaries by role
      const salaryMap = {
        'bakery_employee': { type: 'hourly', amount: 18.50 },
        'cafe_waiter': { type: 'hourly', amount: 15.00 },
        'cashier': { type: 'hourly', amount: 16.00 },
        'kitchen_staff': { type: 'hourly', amount: 19.00 }
      };

      const salary = salaryMap[user.role] || { type: 'hourly', amount: 15.00 };

      await client.query(`
        INSERT INTO employee_salaries (user_id, payment_type, base_amount, effective_date)
        VALUES ($1, $2, $3, CURRENT_DATE - INTERVAL '30 days')
        ON CONFLICT DO NOTHING
      `, [user.id, salary.type, salary.amount]);

      // Add sample benefits
      const benefits = [
        { type: 'health_insurance', name: 'Basic Health Coverage', value: 200.00 },
        { type: 'paid_time_off', name: 'Annual PTO', value: 80.00 },
        { type: 'employee_discount', name: '20% Employee Discount', value: 20.00 },
        { type: 'training_allowance', name: 'Professional Development', value: 500.00 }
      ];

      for (const benefit of benefits) {
        await client.query(`
          INSERT INTO employee_benefits (user_id, benefit_type, benefit_name, value, start_date)
          VALUES ($1, $2, $3, $4, CURRENT_DATE - INTERVAL '30 days')
          ON CONFLICT DO NOTHING
        `, [user.id, benefit.type, benefit.name, benefit.value]);
      }

      // Add sample performance metrics
      const metrics = ['punctuality', 'customer_feedback', 'task_completion', 'quality', 'teamwork'];
      for (const metric of metrics) {
        const score = (Math.random() * 2 + 3).toFixed(2); // Random score between 3.00 and 5.00
        await client.query(`
          INSERT INTO performance_metrics (user_id, metric_type, score, period_start, period_end, recorded_by)
          VALUES ($1, $2, $3, CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE, 1)
          ON CONFLICT DO NOTHING
        `, [user.id, metric, score]);
      }

      // Add sample goals
      const goals = [
        'Improve customer service response time',
        'Complete food safety certification',
        'Increase sales by 10%',
        'Reduce order preparation time'
      ];

      const randomGoal = goals[Math.floor(Math.random() * goals.length)];
      await client.query(`
        INSERT INTO employee_goals (user_id, title, description, target_date, progress, set_by)
        VALUES ($1, $2, $3, CURRENT_DATE + INTERVAL '90 days', $4, 1)
        ON CONFLICT DO NOTHING
      `, [user.id, randomGoal, `Goal to ${randomGoal.toLowerCase()}`, Math.floor(Math.random() * 60)]);
    }

    console.log('✅ HR sample data seeded successfully!');

  } catch (error) {
    console.error('❌ Error seeding HR data:', error);
    throw error;
  } finally {
    client.release();
  }
};

const addHRManagement = async () => {
  try {
    console.log('🚀 Adding HR Management System...');
    
    await addHRTables();
    await seedHRData();
    
    console.log('🎉 HR Management System added successfully!');
    console.log('\n📊 New Features Added:');
    console.log('• Performance Management (metrics, reviews, goals)');
    console.log('• Payroll System (salaries, benefits, payments)');
    console.log('• HR Analytics (staff analytics, reports)');
    console.log('• Customer Feedback tracking');
    console.log('• Training Records management');
    
  } catch (error) {
    console.error('❌ HR Management System setup failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
};

// Run if this file is executed directly
if (require.main === module) {
  addHRManagement();
}

module.exports = { addHRManagement, addHRTables, seedHRData };
