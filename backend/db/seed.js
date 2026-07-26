import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
  });

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const seed = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');

  console.log('Resetting database schema...');
  await connection.query(schema);

  console.log('Seeding fresh test data...');
  await connection.query(seed);

  await connection.end();
  console.log('Database reset and seeded successfully.');
}

run().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
