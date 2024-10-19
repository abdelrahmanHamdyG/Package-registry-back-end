import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  host: 'localhost',
  database: 'PackageRegDB',
  user: 'postgres',
  password: 'datahead',
  port: 5433,
  // ssl options if needed
});

export default pool;


// Function to perform database operations
// async function initDB() {
//   try {
//     // Execute a query
//     const res = await pool.query('SELECT * FROM package');
//     console.log(res.rows);
//   } catch (err) {
//     console.error('Error in fetching data', err);
//   } finally {
//     // Close the pool when you're done
//     await pool.end();
//     console.log('Database connection closed.');
//   }
// }

// // Invoke the function
// initDB().then(() => {
//   console.log('Program completed.');
// }).catch(err => {
//   console.error('Unhandled error:', err);
// });
