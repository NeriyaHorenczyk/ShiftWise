DROP DATABASE IF EXISTS shiftwise;
CREATE DATABASE shiftwise;
USE shiftwise;

CREATE TABLE departments (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  lead_id CHAR(36),
  created_at DATETIME DEFAULT NOW()
);

CREATE TABLE users (
  id CHAR(36) PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(100),
  role ENUM('admin', 'lead', 'employee') DEFAULT 'employee',
  department_id CHAR(36),
  avatar_url VARCHAR(255),
  created_at DATETIME DEFAULT NOW(),
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
);

CREATE TABLE passwords (
  user_id CHAR(36) NOT NULL PRIMARY KEY,
  password VARCHAR(255) NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

ALTER TABLE departments
  ADD CONSTRAINT fk_dept_lead
  FOREIGN KEY (lead_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE shifts (
  id CHAR(36) PRIMARY KEY,
  department_id CHAR(36) NOT NULL,
  title VARCHAR(100) NOT NULL,
  start_time DATETIME NOT NULL,
  end_time DATETIME NOT NULL,
  required_staff INT DEFAULT 1,
  status ENUM('draft', 'published') DEFAULT 'draft',
  created_by CHAR(36),
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE shift_assignments (
  id CHAR(36) PRIMARY KEY,
  shift_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  UNIQUE (shift_id, user_id),
  FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE availability (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  week_start DATE NOT NULL,
  day_of_week TINYINT NOT NULL,
  slot ENUM('morning', 'afternoon', 'evening') NOT NULL,
  status ENUM('available', 'unavailable', 'preferred') NOT NULL,
  UNIQUE (user_id, week_start, day_of_week, slot),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE swap_requests (
  id CHAR(36) PRIMARY KEY,
  requester_id CHAR(36) NOT NULL,
  target_id CHAR(36) NOT NULL,
  shift_id CHAR(36) NOT NULL,
  status ENUM('pending', 'accepted', 'rejected', 'approved') DEFAULT 'pending',
  lead_comment TEXT,
  created_at DATETIME DEFAULT NOW(),
  FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE
);

CREATE TABLE leave_requests (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  document_url VARCHAR(255),
  status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  reviewed_by CHAR(36),
  lead_comment TEXT,
  created_at DATETIME DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);