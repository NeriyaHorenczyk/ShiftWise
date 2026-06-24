USE shiftwise;

-- ─────────────────────────────────────────
-- Default password for everyone: password123
-- Hash: $2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW
-- ─────────────────────────────────────────

-- Admin
INSERT INTO users (id, username, email, name, role) VALUES
('00000000-0000-0000-0000-000000000001', 'admin', 'admin@shiftwise.com', 'Admin User', 'admin');

INSERT INTO passwords (user_id, password) VALUES
('00000000-0000-0000-0000-000000000001', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW');

-- ─────────────────────────────────────────
-- Departments
-- ─────────────────────────────────────────

INSERT INTO departments (id, name) VALUES
('00000000-0000-0000-0000-000000000101', 'Department A'),
('00000000-0000-0000-0000-000000000102', 'Department B'),
('00000000-0000-0000-0000-000000000103', 'Department C');

-- ─────────────────────────────────────────
-- Team Leads
-- ─────────────────────────────────────────

INSERT INTO users (id, username, email, name, role, department_id) VALUES
('00000000-0000-0000-0000-000000000002', 'lead_a', 'lead.a@shiftwise.com', 'Lead A', 'lead', '00000000-0000-0000-0000-000000000101'),
('00000000-0000-0000-0000-000000000003', 'lead_b', 'lead.b@shiftwise.com', 'Lead B', 'lead', '00000000-0000-0000-0000-000000000102'),
('00000000-0000-0000-0000-000000000004', 'lead_c', 'lead.c@shiftwise.com', 'Lead C', 'lead', '00000000-0000-0000-0000-000000000103');

INSERT INTO passwords (user_id, password) VALUES
('00000000-0000-0000-0000-000000000002', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW'),
('00000000-0000-0000-0000-000000000003', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW'),
('00000000-0000-0000-0000-000000000004', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW');

-- Assign leads to departments
UPDATE departments SET lead_id = '00000000-0000-0000-0000-000000000002' WHERE id = '00000000-0000-0000-0000-000000000101';
UPDATE departments SET lead_id = '00000000-0000-0000-0000-000000000003' WHERE id = '00000000-0000-0000-0000-000000000102';
UPDATE departments SET lead_id = '00000000-0000-0000-0000-000000000004' WHERE id = '00000000-0000-0000-0000-000000000103';

-- ─────────────────────────────────────────
-- Department A Employees (10)
-- ─────────────────────────────────────────

INSERT INTO users (id, username, email, name, role, department_id) VALUES
('00000000-0000-0000-0000-000000000011', 'emp_a1',  'emp.a1@shiftwise.com',  'Employee A1',  'employee', '00000000-0000-0000-0000-000000000101'),
('00000000-0000-0000-0000-000000000012', 'emp_a2',  'emp.a2@shiftwise.com',  'Employee A2',  'employee', '00000000-0000-0000-0000-000000000101'),
('00000000-0000-0000-0000-000000000013', 'emp_a3',  'emp.a3@shiftwise.com',  'Employee A3',  'employee', '00000000-0000-0000-0000-000000000101'),
('00000000-0000-0000-0000-000000000014', 'emp_a4',  'emp.a4@shiftwise.com',  'Employee A4',  'employee', '00000000-0000-0000-0000-000000000101'),
('00000000-0000-0000-0000-000000000015', 'emp_a5',  'emp.a5@shiftwise.com',  'Employee A5',  'employee', '00000000-0000-0000-0000-000000000101'),
('00000000-0000-0000-0000-000000000016', 'emp_a6',  'emp.a6@shiftwise.com',  'Employee A6',  'employee', '00000000-0000-0000-0000-000000000101'),
('00000000-0000-0000-0000-000000000017', 'emp_a7',  'emp.a7@shiftwise.com',  'Employee A7',  'employee', '00000000-0000-0000-0000-000000000101'),
('00000000-0000-0000-0000-000000000018', 'emp_a8',  'emp.a8@shiftwise.com',  'Employee A8',  'employee', '00000000-0000-0000-0000-000000000101'),
('00000000-0000-0000-0000-000000000019', 'emp_a9',  'emp.a9@shiftwise.com',  'Employee A9',  'employee', '00000000-0000-0000-0000-000000000101'),
('00000000-0000-0000-0000-000000000020', 'emp_a10', 'emp.a10@shiftwise.com', 'Employee A10', 'employee', '00000000-0000-0000-0000-000000000101');

INSERT INTO passwords (user_id, password) VALUES
('00000000-0000-0000-0000-000000000011', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW'),
('00000000-0000-0000-0000-000000000012', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW'),
('00000000-0000-0000-0000-000000000013', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW'),
('00000000-0000-0000-0000-000000000014', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW'),
('00000000-0000-0000-0000-000000000015', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW'),
('00000000-0000-0000-0000-000000000016', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW'),
('00000000-0000-0000-0000-000000000017', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW'),
('00000000-0000-0000-0000-000000000018', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW'),
('00000000-0000-0000-0000-000000000019', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW'),
('00000000-0000-0000-0000-000000000020', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW');

-- ─────────────────────────────────────────
-- Department B Employees (10)
-- ─────────────────────────────────────────

INSERT INTO users (id, username, email, name, role, department_id) VALUES
('00000000-0000-0000-0000-000000000021', 'emp_b1',  'emp.b1@shiftwise.com',  'Employee B1',  'employee', '00000000-0000-0000-0000-000000000102'),
('00000000-0000-0000-0000-000000000022', 'emp_b2',  'emp.b2@shiftwise.com',  'Employee B2',  'employee', '00000000-0000-0000-0000-000000000102'),
('00000000-0000-0000-0000-000000000023', 'emp_b3',  'emp.b3@shiftwise.com',  'Employee B3',  'employee', '00000000-0000-0000-0000-000000000102'),
('00000000-0000-0000-0000-000000000024', 'emp_b4',  'emp.b4@shiftwise.com',  'Employee B4',  'employee', '00000000-0000-0000-0000-000000000102'),
('00000000-0000-0000-0000-000000000025', 'emp_b5',  'emp.b5@shiftwise.com',  'Employee B5',  'employee', '00000000-0000-0000-0000-000000000102'),
('00000000-0000-0000-0000-000000000026', 'emp_b6',  'emp.b6@shiftwise.com',  'Employee B6',  'employee', '00000000-0000-0000-0000-000000000102'),
('00000000-0000-0000-0000-000000000027', 'emp_b7',  'emp.b7@shiftwise.com',  'Employee B7',  'employee', '00000000-0000-0000-0000-000000000102'),
('00000000-0000-0000-0000-000000000028', 'emp_b8',  'emp.b8@shiftwise.com',  'Employee B8',  'employee', '00000000-0000-0000-0000-000000000102'),
('00000000-0000-0000-0000-000000000029', 'emp_b9',  'emp.b9@shiftwise.com',  'Employee B9',  'employee', '00000000-0000-0000-0000-000000000102'),
('00000000-0000-0000-0000-000000000030', 'emp_b10', 'emp.b10@shiftwise.com', 'Employee B10', 'employee', '00000000-0000-0000-0000-000000000102');

INSERT INTO passwords (user_id, password) VALUES
('00000000-0000-0000-0000-000000000021', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW'),
('00000000-0000-0000-0000-000000000022', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW'),
('00000000-0000-0000-0000-000000000023', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW'),
('00000000-0000-0000-0000-000000000024', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW'),
('00000000-0000-0000-0000-000000000025', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW'),
('00000000-0000-0000-0000-000000000026', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW'),
('00000000-0000-0000-0000-000000000027', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW'),
('00000000-0000-0000-0000-000000000028', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW'),
('00000000-0000-0000-0000-000000000029', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW'),
('00000000-0000-0000-0000-000000000030', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW');

-- ─────────────────────────────────────────
-- Department C Employees (10)
-- ─────────────────────────────────────────

INSERT INTO users (id, username, email, name, role, department_id) VALUES
('00000000-0000-0000-0000-000000000031', 'emp_c1',  'emp.c1@shiftwise.com',  'Employee C1',  'employee', '00000000-0000-0000-0000-000000000103'),
('00000000-0000-0000-0000-000000000032', 'emp_c2',  'emp.c2@shiftwise.com',  'Employee C2',  'employee', '00000000-0000-0000-0000-000000000103'),
('00000000-0000-0000-0000-000000000033', 'emp_c3',  'emp.c3@shiftwise.com',  'Employee C3',  'employee', '00000000-0000-0000-0000-000000000103'),
('00000000-0000-0000-0000-000000000034', 'emp_c4',  'emp.c4@shiftwise.com',  'Employee C4',  'employee', '00000000-0000-0000-0000-000000000103'),
('00000000-0000-0000-0000-000000000035', 'emp_c5',  'emp.c5@shiftwise.com',  'Employee C5',  'employee', '00000000-0000-0000-0000-000000000103'),
('00000000-0000-0000-0000-000000000036', 'emp_c6',  'emp.c6@shiftwise.com',  'Employee C6',  'employee', '00000000-0000-0000-0000-000000000103'),
('00000000-0000-0000-0000-000000000037', 'emp_c7',  'emp.c7@shiftwise.com',  'Employee C7',  'employee', '00000000-0000-0000-0000-000000000103'),
('00000000-0000-0000-0000-000000000038', 'emp_c8',  'emp.c8@shiftwise.com',  'Employee C8',  'employee', '00000000-0000-0000-0000-000000000103'),
('00000000-0000-0000-0000-000000000039', 'emp_c9',  'emp.c9@shiftwise.com',  'Employee C9',  'employee', '00000000-0000-0000-0000-000000000103'),
('00000000-0000-0000-0000-000000000040', 'emp_c10', 'emp.c10@shiftwise.com', 'Employee C10', 'employee', '00000000-0000-0000-0000-000000000103');

INSERT INTO passwords (user_id, password) VALUES
('00000000-0000-0000-0000-000000000031', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW'),
('00000000-0000-0000-0000-000000000032', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW'),
('00000000-0000-0000-0000-000000000033', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW'),
('00000000-0000-0000-0000-000000000034', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW'),
('00000000-0000-0000-0000-000000000035', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW'),
('00000000-0000-0000-0000-000000000036', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW'),
('00000000-0000-0000-0000-000000000037', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW'),
('00000000-0000-0000-0000-000000000038', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW'),
('00000000-0000-0000-0000-000000000039', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW'),
('00000000-0000-0000-0000-000000000040', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW');