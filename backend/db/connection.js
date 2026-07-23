import mysql from 'mysql2/promise';
import 'dotenv/config';

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  // DATE columns have no time component, but mysql2 still builds them as JS
  // Date objects at local midnight — serializing that to JSON (toISOString)
  // converts to UTC and rolls the date back a day in any timezone ahead of
  // UTC (e.g. Israel, UTC+3). Returning them as plain 'YYYY-MM-DD' strings
  // instead sidesteps the conversion entirely. DATETIME columns (shift
  // times, created_at, etc.) are unaffected and stay as Date objects.
  dateStrings: ['DATE'],
});

export default pool;