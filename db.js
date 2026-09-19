const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
let dbInstance = null;

async function getDb() {
  if (dbInstance) return dbInstance;
  
  dbInstance = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });
  
  // Create payments table
  await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'INR',
      status TEXT NOT NULL, -- 'pending', 'paid'
      due_date TEXT NOT NULL, -- YYYY-MM-DD format
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      description TEXT,
      short_url TEXT,
      razorpay_payment_link_id TEXT,
      created_at TEXT NOT NULL
    )
  `);
  
  return dbInstance;
}

module.exports = { getDb };
