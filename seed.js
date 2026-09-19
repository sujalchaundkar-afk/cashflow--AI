/**
 * CashFlow AI — Database seeder
 * ----------------------------------------------------------------------------
 * Populates the SQLite database with a realistic set of demo receivables for a
 * small design/freelance studio. Due dates are computed RELATIVE to the day you
 * run the seed, so the dashboard always shows a fresh mix of:
 *     • 4 overdue invoices (~₹42,000  -> risk score lands at HIGH)
 *     • 4 upcoming invoices due within the next 30 days
 *     • 2 already-settled invoices
 *
 * Run with:  npm run seed
 * ----------------------------------------------------------------------------
 */

const crypto = require('crypto');
const { getDb } = require('./db');

// Returns a "YYYY-MM-DD" string offset from today (UTC, matching server logic).
function isoOffset(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

function mockUrl() {
  return `https://rzp.io/i/${crypto.randomBytes(5).toString('hex')}`;
}

// dueOffset: negative = past (overdue), positive = future (upcoming)
const SEED = [
  // --- Overdue (pending, due date in the past) -> total ₹42,000 ---
  { id: 'INV-1001', amount: 6500,  dueOffset: -22, status: 'pending', customer_name: 'Kavya Iyer',      customer_email: 'sidakmahi99@gmail.com',    description: 'SEO audit & 3-month growth report' },
  { id: 'INV-1002', amount: 12500, dueOffset: -17, status: 'pending', customer_name: 'Aarav Sharma',    customer_email: 'sidakmahi99@gmail.com',    description: 'Website redesign — Milestone 2' },
  { id: 'INV-1003', amount: 8000,  dueOffset: -7,  status: 'pending', customer_name: 'Priya Nair',      customer_email: 'sidakmahi99@gmail.com',    description: 'Social media retainer — August' },
  { id: 'INV-1004', amount: 15000, dueOffset: -2,  status: 'pending', customer_name: 'Rohan Mehta',     customer_email: 'sidakmahi99@gmail.com',    description: 'Logo & brand identity package' },

  // --- Upcoming (pending, due within 30 days) ---
  { id: 'INV-1005', amount: 20000, dueOffset: 9,   status: 'pending', customer_name: 'Vikram Singh',    customer_email: 'sidakmahi99@gmail.com',    description: 'Mobile app UI/UX — Sprint 1' },
  { id: 'INV-1006', amount: 9500,  dueOffset: 16,  status: 'pending', customer_name: 'Ananya Reddy',    customer_email: 'sidakmahi99@gmail.com',    description: 'Content writing — 10 articles' },
  { id: 'INV-1007', amount: 13000, dueOffset: 24,  status: 'pending', customer_name: 'Karan Malhotra',  customer_email: 'sidakmahi99@gmail.com',    description: 'Video editing — product promo reel' },
  { id: 'INV-1008', amount: 5000,  dueOffset: 29,  status: 'pending', customer_name: 'Ishaan Gupta',    customer_email: 'sidakmahi99@gmail.com',    description: 'Advisory consultation — 5 hours' },

  // --- Settled (already paid) ---
  { id: 'INV-1009', amount: 11000, dueOffset: -26, status: 'paid',    customer_name: 'Meera Joshi',     customer_email: 'sidakmahi99@gmail.com',    description: 'WordPress maintenance — July' },
  { id: 'INV-1010', amount: 18000, dueOffset: -30, status: 'paid',    customer_name: 'Aditya Verma',    customer_email: 'sidakmahi99@gmail.com',    description: 'E-commerce store setup & launch' },
];

async function seed() {
  const db = await getDb();

  console.log('Clearing existing payments...');
  await db.run('DELETE FROM payments');

  const now = new Date();
  let inserted = 0;

  for (let i = 0; i < SEED.length; i++) {
    const s = SEED[i];
    const due_date = isoOffset(s.dueOffset);
    // Stagger created_at a little so ordering looks natural.
    const created = new Date(now.getTime() - (SEED.length - i) * 36e5).toISOString();

    await db.run(
      `INSERT INTO payments
        (id, amount, currency, status, due_date, customer_name, customer_email, description, short_url, razorpay_payment_link_id, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [s.id, s.amount, 'INR', s.status, due_date, s.customer_name, s.customer_email, s.description, mockUrl(), null, created]
    );
    inserted += 1;
  }

  const overdue = SEED.filter((s) => s.status === 'pending' && s.dueOffset < 0);
  const overdueTotal = overdue.reduce((t, s) => t + s.amount, 0);

  console.log(`Seeded ${inserted} payments:`);
  console.log(`  • ${overdue.length} overdue  (₹${overdueTotal.toLocaleString('en-IN')} outstanding)`);
  console.log(`  • ${SEED.filter((s) => s.status === 'pending' && s.dueOffset >= 0).length} upcoming (within 30 days)`);
  console.log(`  • ${SEED.filter((s) => s.status === 'paid').length} settled`);
  console.log('\nDone. Start the API with:  npm start');

  await db.close();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
