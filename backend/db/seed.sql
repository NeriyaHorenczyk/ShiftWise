USE shiftwise;

-- ─────────────────────────────────────────
-- Default password for everyone: password
-- Hash: $2b$10$DJg9MnN4TWZ69itNHtodRuvmE18k3JeZc89TuxXz1484CDqxTFm4K
-- ─────────────────────────────────────────

-- Admin
INSERT INTO users (id, username, email, name, role) VALUES
('0001', 'admin', 'admin@shiftwise.com', 'Admin User', 'admin');

INSERT INTO passwords (user_id, password) VALUES
('0001', '$2b$10$DJg9MnN4TWZ69itNHtodRuvmE18k3JeZc89TuxXz1484CDqxTFm4K');

-- ─────────────────────────────────────────
-- Departments
-- ─────────────────────────────────────────

INSERT INTO departments (id, name) VALUES
('0101', 'Department A'),
('0102', 'Department B'),
('0103', 'Department C');

-- ─────────────────────────────────────────
-- Team Leads
-- ─────────────────────────────────────────

INSERT INTO users (id, username, email, name, role, department_id) VALUES
('0002', 'lead_a', 'lead.a@shiftwise.com', 'Lead A', 'lead', '0101'),
('0003', 'lead_b', 'lead.b@shiftwise.com', 'Lead B', 'lead', '0102'),
('0004', 'lead_c', 'lead.c@shiftwise.com', 'Lead C', 'lead', '0103');

INSERT INTO passwords (user_id, password) VALUES
('0002', '$2b$10$DJg9MnN4TWZ69itNHtodRuvmE18k3JeZc89TuxXz1484CDqxTFm4K'),
('0003', '$2b$10$DJg9MnN4TWZ69itNHtodRuvmE18k3JeZc89TuxXz1484CDqxTFm4K'),
('0004', '$2b$10$DJg9MnN4TWZ69itNHtodRuvmE18k3JeZc89TuxXz1484CDqxTFm4K');

-- Assign leads to departments
UPDATE departments SET lead_id = '0002' WHERE id = '0101';
UPDATE departments SET lead_id = '0003' WHERE id = '0102';
UPDATE departments SET lead_id = '0004' WHERE id = '0103';

-- ─────────────────────────────────────────
-- Department A Employees (10)
-- ─────────────────────────────────────────

INSERT INTO users (id, username, email, name, role, department_id) VALUES
('0011', 'emp_a1',  'emp.a1@shiftwise.com',  'Employee A1',  'employee', '0101'),
('0012', 'emp_a2',  'emp.a2@shiftwise.com',  'Employee A2',  'employee', '0101'),
('0013', 'emp_a3',  'emp.a3@shiftwise.com',  'Employee A3',  'employee', '0101'),
('0014', 'emp_a4',  'emp.a4@shiftwise.com',  'Employee A4',  'employee', '0101'),
('0015', 'emp_a5',  'emp.a5@shiftwise.com',  'Employee A5',  'employee', '0101'),
('0016', 'emp_a6',  'emp.a6@shiftwise.com',  'Employee A6',  'employee', '0101'),
('0017', 'emp_a7',  'emp.a7@shiftwise.com',  'Employee A7',  'employee', '0101'),
('0018', 'emp_a8',  'emp.a8@shiftwise.com',  'Employee A8',  'employee', '0101'),
('0019', 'emp_a9',  'emp.a9@shiftwise.com',  'Employee A9',  'employee', '0101'),
('0020', 'emp_a10', 'emp.a10@shiftwise.com', 'Employee A10', 'employee', '0101');

INSERT INTO passwords (user_id, password) VALUES
('0011', '$2b$10$DJg9MnN4TWZ69itNHtodRuvmE18k3JeZc89TuxXz1484CDqxTFm4K'),
('0012', '$2b$10$DJg9MnN4TWZ69itNHtodRuvmE18k3JeZc89TuxXz1484CDqxTFm4K'),
('0013', '$2b$10$DJg9MnN4TWZ69itNHtodRuvmE18k3JeZc89TuxXz1484CDqxTFm4K'),
('0014', '$2b$10$DJg9MnN4TWZ69itNHtodRuvmE18k3JeZc89TuxXz1484CDqxTFm4K'),
('0015', '$2b$10$DJg9MnN4TWZ69itNHtodRuvmE18k3JeZc89TuxXz1484CDqxTFm4K'),
('0016', '$2b$10$DJg9MnN4TWZ69itNHtodRuvmE18k3JeZc89TuxXz1484CDqxTFm4K'),
('0017', '$2b$10$DJg9MnN4TWZ69itNHtodRuvmE18k3JeZc89TuxXz1484CDqxTFm4K'),
('0018', '$2b$10$DJg9MnN4TWZ69itNHtodRuvmE18k3JeZc89TuxXz1484CDqxTFm4K'),
('0019', '$2b$10$DJg9MnN4TWZ69itNHtodRuvmE18k3JeZc89TuxXz1484CDqxTFm4K'),
('0020', '$2b$10$DJg9MnN4TWZ69itNHtodRuvmE18k3JeZc89TuxXz1484CDqxTFm4K');

-- ─────────────────────────────────────────
-- Department B Employees (10)
-- ─────────────────────────────────────────

INSERT INTO users (id, username, email, name, role, department_id) VALUES
('0021', 'emp_b1',  'emp.b1@shiftwise.com',  'Employee B1',  'employee', '0102'),
('0022', 'emp_b2',  'emp.b2@shiftwise.com',  'Employee B2',  'employee', '0102'),
('0023', 'emp_b3',  'emp.b3@shiftwise.com',  'Employee B3',  'employee', '0102'),
('0024', 'emp_b4',  'emp.b4@shiftwise.com',  'Employee B4',  'employee', '0102'),
('0025', 'emp_b5',  'emp.b5@shiftwise.com',  'Employee B5',  'employee', '0102'),
('0026', 'emp_b6',  'emp.b6@shiftwise.com',  'Employee B6',  'employee', '0102'),
('0027', 'emp_b7',  'emp.b7@shiftwise.com',  'Employee B7',  'employee', '0102'),
('0028', 'emp_b8',  'emp.b8@shiftwise.com',  'Employee B8',  'employee', '0102'),
('0029', 'emp_b9',  'emp.b9@shiftwise.com',  'Employee B9',  'employee', '0102'),
('0030', 'emp_b10', 'emp.b10@shiftwise.com', 'Employee B10', 'employee', '0102');

INSERT INTO passwords (user_id, password) VALUES
('0021', '$2b$10$DJg9MnN4TWZ69itNHtodRuvmE18k3JeZc89TuxXz1484CDqxTFm4K'),
('0022', '$2b$10$DJg9MnN4TWZ69itNHtodRuvmE18k3JeZc89TuxXz1484CDqxTFm4K'),
('0023', '$2b$10$DJg9MnN4TWZ69itNHtodRuvmE18k3JeZc89TuxXz1484CDqxTFm4K'),
('0024', '$2b$10$DJg9MnN4TWZ69itNHtodRuvmE18k3JeZc89TuxXz1484CDqxTFm4K'),
('0025', '$2b$10$DJg9MnN4TWZ69itNHtodRuvmE18k3JeZc89TuxXz1484CDqxTFm4K'),
('0026', '$2b$10$DJg9MnN4TWZ69itNHtodRuvmE18k3JeZc89TuxXz1484CDqxTFm4K'),
('0027', '$2b$10$DJg9MnN4TWZ69itNHtodRuvmE18k3JeZc89TuxXz1484CDqxTFm4K'),
('0028', '$2b$10$DJg9MnN4TWZ69itNHtodRuvmE18k3JeZc89TuxXz1484CDqxTFm4K'),
('0029', '$2b$10$DJg9MnN4TWZ69itNHtodRuvmE18k3JeZc89TuxXz1484CDqxTFm4K'),
('0030', '$2b$10$DJg9MnN4TWZ69itNHtodRuvmE18k3JeZc89TuxXz1484CDqxTFm4K');

-- ─────────────────────────────────────────
-- Department C Employees (10)
-- ─────────────────────────────────────────

INSERT INTO users (id, username, email, name, role, department_id) VALUES
('0031', 'emp_c1',  'emp.c1@shiftwise.com',  'Employee C1',  'employee', '0103'),
('0032', 'emp_c2',  'emp.c2@shiftwise.com',  'Employee C2',  'employee', '0103'),
('0033', 'emp_c3',  'emp.c3@shiftwise.com',  'Employee C3',  'employee', '0103'),
('0034', 'emp_c4',  'emp.c4@shiftwise.com',  'Employee C4',  'employee', '0103'),
('0035', 'emp_c5',  'emp.c5@shiftwise.com',  'Employee C5',  'employee', '0103'),
('0036', 'emp_c6',  'emp.c6@shiftwise.com',  'Employee C6',  'employee', '0103'),
('0037', 'emp_c7',  'emp.c7@shiftwise.com',  'Employee C7',  'employee', '0103'),
('0038', 'emp_c8',  'emp.c8@shiftwise.com',  'Employee C8',  'employee', '0103'),
('0039', 'emp_c9',  'emp.c9@shiftwise.com',  'Employee C9',  'employee', '0103'),
('0040', 'emp_c10', 'emp.c10@shiftwise.com', 'Employee C10', 'employee', '0103');

INSERT INTO passwords (user_id, password) VALUES
('0031', '$2b$10$DJg9MnN4TWZ69itNHtodRuvmE18k3JeZc89TuxXz1484CDqxTFm4K'),
('0032', '$2b$10$DJg9MnN4TWZ69itNHtodRuvmE18k3JeZc89TuxXz1484CDqxTFm4K'),
('0033', '$2b$10$DJg9MnN4TWZ69itNHtodRuvmE18k3JeZc89TuxXz1484CDqxTFm4K'),
('0034', '$2b$10$DJg9MnN4TWZ69itNHtodRuvmE18k3JeZc89TuxXz1484CDqxTFm4K'),
('0035', '$2b$10$DJg9MnN4TWZ69itNHtodRuvmE18k3JeZc89TuxXz1484CDqxTFm4K'),
('0036', '$2b$10$DJg9MnN4TWZ69itNHtodRuvmE18k3JeZc89TuxXz1484CDqxTFm4K'),
('0037', '$2b$10$DJg9MnN4TWZ69itNHtodRuvmE18k3JeZc89TuxXz1484CDqxTFm4K'),
('0038', '$2b$10$DJg9MnN4TWZ69itNHtodRuvmE18k3JeZc89TuxXz1484CDqxTFm4K'),
('0039', '$2b$10$DJg9MnN4TWZ69itNHtodRuvmE18k3JeZc89TuxXz1484CDqxTFm4K'),
('0040', '$2b$10$DJg9MnN4TWZ69itNHtodRuvmE18k3JeZc89TuxXz1484CDqxTFm4K');