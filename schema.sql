-- DELIMa Monitor Database Schema
-- Separate D1 database for DELIMa with Google OAuth + Admin Role

-- Users table (for Google OAuth login)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  picture TEXT,
  school_name TEXT,
  role TEXT DEFAULT 'user',  -- 'admin' or 'user'
  login_count INTEGER DEFAULT 1,
  first_login DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Student logins table
CREATE TABLE IF NOT EXISTS delima_logins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_name TEXT NOT NULL,
  student_email TEXT NOT NULL,
  school_name TEXT,
  login_count INTEGER DEFAULT 1,
  first_login DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_student_email ON delima_logins(student_email);
CREATE INDEX IF NOT EXISTS idx_school_name ON delima_logins(school_name);
CREATE INDEX IF NOT EXISTS idx_login_count ON delima_logins(login_count DESC);
CREATE INDEX IF NOT EXISTS idx_last_login ON delima_logins(last_login DESC);

-- Insert first admin user will be done automatically on first login
