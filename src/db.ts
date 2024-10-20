import pkg from 'pg';
import dotenv from 'dotenv';
const { Pool } = pkg;

dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432', 10),  // Parse the port from a string
  ssl: {
    rejectUnauthorized: false,  // RDS typically uses self-signed certificates, so you can ignore verification
  },
});

export default pool;
