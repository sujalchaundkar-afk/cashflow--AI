/**
 * CashFlow AI — Backend API
 * ----------------------------------------------------------------------------
 * Smart Accounts-Receivable command center for small merchants & freelancers.
 *
 * Design goals:
 *   1. Works FULLY in "mock mode" with zero configuration (great for demos).
 *   2. Upgrades transparently to real integrations when credentials exist:
 *        - Razorpay Payment Links (create + status sync)
 *        - NVIDIA NIM (OpenAI-compatible) for AI-drafted collection reminders
 *   3. Credentials can be provided per-request via headers (from the UI's
 *      "AI Configurations" tab) OR globally via the .env file. Headers win.
 *
 * Endpoints consumed by the frontend (frontend/src/App.jsx):
 *   GET  /api/payments               -> Payment[]
 *   GET  /api/cashflow-summary       -> { totalOverdue, totalDueNext30Days,
 *                                         riskScore, riskLevel, explanation,
 *                                         averageMonthlyInflow }
 *   POST /api/payments               -> creates a payment link, returns Payment
 *   POST /api/payments/sync          -> { message } (pulls statuses from Razorpay)
 *   GET  /api/generate-reminder/:id  -> { reminderMessage }
 *   POST /api/refine-reminder        -> { refinedMessage }
 *   POST /api/generate-bulk-nudges   -> { summary, recommendations[] }
 * ----------------------------------------------------------------------------
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { getDb } = require('./db');

let Razorpay = null;
try {
  // Loaded lazily-safe: only used when credentials are present.
  Razorpay = require('razorpay');
} catch (_) {
  Razorpay = null;
}

const app = express();
const PORT = process.env.PORT || 5000;

// A stable baseline used for the cash-flow risk calculation. This mirrors the
// "Average Monthly Revenue" figure shown in the UI so the numbers stay coherent.
const AVERAGE_MONTHLY_INFLOW = 100000; // ₹1.0L

const NVIDIA_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';
const DEFAULT_NVIDIA_MODEL = 'meta/llama-3.2-11b-vision-instruct';

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-nvidia-api-key',
    'x-razorpay-key-id',
    'x-razorpay-key-secret',
    'x-nvidia-model',
    'x-smtp-host',
    'x-smtp-port',
    'x-smtp-user',
    'x-smtp-pass',
    'x-smtp-from'
  ]
}));
app.use(express.json());

/* ---------------------------------------------------------------------------
 * Small helpers
 * ------------------------------------------------------------------------- */

// UTC "YYYY-MM-DD" — matches the frontend's `new Date().toISOString().split('T')[0]`.
function todayISO() {
  return new Date().toISOString().split('T')[0];
}

// Positive => overdue by N days. Negative => still N days until due.
function daysPastDue(dueDate) {
  const today = new Date(todayISO() + 'T00:00:00Z');
  const due = new Date(dueDate + 'T00:00:00Z');
  return Math.round((today - due) / 86400000);
}

// Derive the live status. DB only stores 'pending' | 'paid'; "overdue" is computed.
function deriveStatus(row) {
  if (row.status === 'paid') return 'paid';
  if (row.due_date < todayISO()) return 'overdue';
  return 'pending';
}

// Format numbers as Indian currency (falls back gracefully if ICU is limited).
function inr(amount) {
  const n = Number(amount) || 0;
  try {
    return n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  } catch (_) {
    return String(Math.round(n));
  }
}

// Resolve credentials: request headers take precedence over environment vars.
function resolveCreds(req) {
  const h = req.headers || {};
  return {
    nvidiaApiKey: (h['x-nvidia-api-key'] || process.env.NVIDIA_API_KEY || '').trim(),
    nvidiaModel: (h['x-nvidia-model'] || process.env.NVIDIA_MODEL || DEFAULT_NVIDIA_MODEL).trim(),
    razorpayKeyId: (h['x-razorpay-key-id'] || process.env.RAZORPAY_KEY_ID || '').trim(),
    razorpayKeySecret: (h['x-razorpay-key-secret'] || process.env.RAZORPAY_KEY_SECRET || '').trim(),
  };
}

function getRazorpayClient(creds) {
  if (!Razorpay || !creds.razorpayKeyId || !creds.razorpayKeySecret) return null;
  try {
    return new Razorpay({ key_id: creds.razorpayKeyId, key_secret: creds.razorpayKeySecret });
  } catch (_) {
    return null;
  }
}

/* ---------------------------------------------------------------------------
 * Collections policy: tone escalation based on how overdue an invoice is.
 * Mirrors the "Collections Policy Levels" panel in the dashboard.
 * ------------------------------------------------------------------------- */
function tierFor(row) {
  const status = deriveStatus(row);
  if (status === 'paid') {
    return { tier: 'Settled', tone: 'settled', daysText: 'Settled', overdueDays: 0 };
  }
  const d = daysPastDue(row.due_date);
  if (d <= 0) {
    return {
      tier: 'Tier 1',
      tone: 'warm, friendly pre-due',
      daysText: `Due in ${Math.abs(d)} day${Math.abs(d) === 1 ? '' : 's'}`,
      overdueDays: 0,
    };
  }
  if (d <= 3) {
    return { tier: 'Tier 1', tone: 'polite and understanding (assume it was a simple oversight)', daysText: `${d} day${d === 1 ? '' : 's'} overdue`, overdueDays: d };
  }
  if (d <= 10) {
    return { tier: 'Tier 2', tone: 'firm but professional', daysText: `${d} days overdue`, overdueDays: d };
  }
  return { tier: 'Tier 3', tone: 'urgent, formal final-notice (mention possible pause of services)', daysText: `${d} days overdue`, overdueDays: d };
}

/* ---------------------------------------------------------------------------
 * Reminder templates — the deterministic fallback used whenever NVIDIA NIM is
 * unavailable (no key / API error). Keeps the whole app usable with zero config.
 * ------------------------------------------------------------------------- */
function templateReminder(row) {
  const name = row.customer_name;
  const amt = inr(row.amount);
  const desc = row.description || 'your invoice';
  const date = row.due_date;
  const url = row.short_url || '(payment link)';
  const info = tierFor(row);

  if (info.tone === 'settled') {
    return `Hi ${name}, thank you! We've received your payment of ₹${amt} for ${desc}. Your account is fully settled. — Team Accounts`;
  }
  if (info.overdueDays === 0) {
    return `Hi ${name}, a friendly reminder that your payment of ₹${amt} for ${desc} is due on ${date}. You can pay quickly and securely here: ${url}. Thank you for your business! — Team Accounts`;
  }
  if (info.tier === 'Tier 1') {
    return `Hi ${name}, just a gentle nudge — your payment of ₹${amt} for ${desc} was due on ${date} and looks to be pending. It may have slipped through the cracks! You can settle it here: ${url}. Thanks so much. — Team Accounts`;
  }
  if (info.tier === 'Tier 2') {
    return `Hi ${name}, our records show that your payment of ₹${amt} for ${desc}, due on ${date}, is now ${info.overdueDays} days overdue. Please arrange payment at your earliest convenience via this link: ${url}. Do reach out if you have any questions. — Team Accounts`;
  }
  return `Hi ${name}, this is an urgent final reminder regarding your outstanding payment of ₹${amt} for ${desc}, which was due on ${date} and is now ${info.overdueDays} days overdue. To avoid any disruption to services, please clear the amount immediately using this link: ${url}. Kindly treat this as a priority. — Team Accounts`;
}

/* ---------------------------------------------------------------------------
 * NVIDIA NIM (OpenAI-compatible) chat completion.
 * Returns the message string, or null if unavailable (caller falls back).
 * ------------------------------------------------------------------------- */
async function nvidiaChat({ apiKey, model, messages, temperature = 0.6, maxTokens = 400 }) {
  if (!apiKey) return null;
  if (typeof fetch === 'undefined') {
    console.warn('[nvidia] global fetch unavailable (Node < 18) — using template fallback');
    return null;
  }
  const resp = await fetch(NVIDIA_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      model: model || DEFAULT_NVIDIA_MODEL,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`NVIDIA API ${resp.status}: ${body.slice(0, 300)}`);
  }
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  return content ? content.trim() : null;
}

// Build a single AI-drafted reminder (NVIDIA if possible, else template).
async function draftReminder(row, creds) {
  const info = tierFor(row);
  const statusText = deriveStatus(row);

  if (!creds.nvidiaApiKey) return templateReminder(row);

  const messages = [
    {
      role: 'system',
      content:
        'You are a professional accounts-receivable assistant for an Indian small business (a freelancer or SMB). ' +
        'Write a single, concise payment reminder of 60-90 words, suitable for WhatsApp or email. ' +
        'Use Indian Rupees (₹). Be specific using the exact details provided. Naturally include the payment link. ' +
        'Do NOT invent details or use placeholders. Do NOT add a subject line or any preamble. ' +
        'Return ONLY the message text. Sign off as "Team Accounts".',
    },
    {
      role: 'user',
      content:
        `Write a ${info.tone} payment reminder.\n` +
        `Customer name: ${row.customer_name}\n` +
        `Amount: ₹${inr(row.amount)}\n` +
        `Invoice for: ${row.description || 'services rendered'}\n` +
        `Due date: ${row.due_date}\n` +
        `Current status: ${statusText}${info.overdueDays ? ` (${info.overdueDays} days overdue)` : ''}\n` +
        `Payment link: ${row.short_url || '(link)'}\n`,
    },
  ];

  try {
    const text = await nvidiaChat({ apiKey: creds.nvidiaApiKey, model: creds.nvidiaModel, messages });
    return text || templateReminder(row);
  } catch (err) {
    console.error('[generate-reminder] NVIDIA error, using template:', err.message);
    return templateReminder(row);
  }
}

// Lightweight, no-AI refinement heuristics (used when NVIDIA is unavailable).
function heuristicRefine(draft, instruction) {
  const text = (draft || '').trim();
  const ins = (instruction || '').toLowerCase();

  if (/short|concise|brief|trim/.test(ins)) {
    const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
    return sentences.slice(0, 2).join(' ').trim();
  }
  if (/polite|gentle|soft|friendly|nice|warm/.test(ins)) {
    return `Hope you're doing well! ${text}`.replace(/urgent final reminder/gi, 'friendly reminder');
  }
  if (/urgent|firm|strong|serious|escalat/.test(ins)) {
    return `${text}\n\nPlease note: this payment is now a priority and requires your immediate attention.`;
  }
  if (/formal|professional/.test(ins)) {
    return text.replace(/^Hi /, 'Dear ').replace(/Thanks so much\.?/gi, 'Thank you for your prompt attention.');
  }
  // Unknown instruction: return the draft unchanged so the UI still shows content.
  return text;
}

/* ===========================================================================
 * ROUTES
 * ========================================================================= */

// Health check.
app.get('/', (req, res) => {
  res.json({
    service: 'CashFlow AI backend',
    status: 'ok',
    time: new Date().toISOString(),
    docs: ['/api/payments', '/api/cashflow-summary', '/api/generate-reminder/:id'],
  });
});
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

/**
 * GET /api/payments
 * Returns every payment with a live-derived status ('pending' | 'overdue' | 'paid').
 */
app.get('/api/payments', async (req, res) => {
  try {
    const db = await getDb();
    const rows = await db.all('SELECT * FROM payments ORDER BY due_date ASC');
    const payments = rows.map((r) => ({ ...r, status: deriveStatus(r) }));
    res.json(payments);
  } catch (err) {
    console.error('[GET /api/payments]', err);
    res.status(500).json({ error: 'Failed to load payments' });
  }
});

/**
 * GET /api/cashflow-summary
 * Aggregates receivables into the headline metrics + a simple risk model.
 */
app.get('/api/cashflow-summary', async (req, res) => {
  try {
    const db = await getDb();
    const rows = await db.all('SELECT * FROM payments');
    const today = todayISO();

    let totalOverdue = 0;
    let totalDueNext30Days = 0;

    const in30 = new Date(today + 'T00:00:00Z');
    in30.setUTCDate(in30.getUTCDate() + 30);
    const in30ISO = in30.toISOString().split('T')[0];

    for (const r of rows) {
      const status = deriveStatus(r);
      if (status === 'overdue') {
        totalOverdue += Number(r.amount) || 0;
      } else if (status === 'pending' && r.due_date >= today && r.due_date <= in30ISO) {
        totalDueNext30Days += Number(r.amount) || 0;
      }
    }

    const averageMonthlyInflow = AVERAGE_MONTHLY_INFLOW;
    const riskScore = Math.min(100, Math.round((totalOverdue / averageMonthlyInflow) * 100));

    let riskLevel = 'LOW';
    if (riskScore >= 50) riskLevel = 'CRITICAL';
    else if (riskScore >= 25) riskLevel = 'HIGH';
    else if (riskScore >= 10) riskLevel = 'MEDIUM';

    const explanation = `Your outstanding overdue payments total ₹${inr(totalOverdue)}. This represents ${riskScore}% of your mock average monthly inflow (₹${inr(averageMonthlyInflow)}).`;

    res.json({ totalOverdue, totalDueNext30Days, riskScore, riskLevel, explanation, averageMonthlyInflow });
  } catch (err) {
    console.error('[GET /api/cashflow-summary]', err);
    res.status(500).json({ error: 'Failed to compute cash-flow summary' });
  }
});

/**
 * POST /api/payments
 * Creates a new receivable. If Razorpay credentials are present a real Payment
 * Link is generated; otherwise a realistic mock link is produced so the demo
 * still flows end-to-end.
 * body: { amount, customer_name, customer_email, due_date, description }
 */
app.post('/api/payments', async (req, res) => {
  try {
    const { amount, customer_name, customer_email, due_date, description } = req.body || {};

    if (!amount || !customer_name || !customer_email || !due_date) {
      return res.status(400).json({ error: 'amount, customer_name, customer_email and due_date are required' });
    }
    const amt = Number(amount);
    if (!(amt > 0)) return res.status(400).json({ error: 'amount must be a positive number' });

    const creds = resolveCreds(req);
    const rzp = getRazorpayClient(creds);

    let id;
    let shortUrl;
    let razorpayLinkId = null;
    let status = 'pending';

    if (rzp) {
      // Real Razorpay Payment Link.
      const link = await rzp.paymentLink.create({
        amount: Math.round(amt * 100), // paise
        currency: 'INR',
        accept_partial: false,
        description: description || 'Invoice payment',
        customer: { name: customer_name, email: customer_email },
        notify: { email: true, sms: false },
        reminder_enable: true,
        notes: { source: 'CashFlow AI', due_date: String(due_date) },
      });
      id = link.id;
      razorpayLinkId = link.id;
      shortUrl = link.short_url;
      status = link.status === 'paid' ? 'paid' : 'pending';
    } else {
      // Mock link (no credentials configured).
      const hex = crypto.randomBytes(5).toString('hex');
      id = `plink_mock_${hex}`;
      shortUrl = `https://rzp.io/i/${hex}`;
    }

    const created_at = new Date().toISOString();
    const db = await getDb();
    await db.run(
      `INSERT INTO payments
        (id, amount, currency, status, due_date, customer_name, customer_email, description, short_url, razorpay_payment_link_id, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [id, amt, 'INR', status, due_date, customer_name, customer_email, description || '', shortUrl, razorpayLinkId, created_at]
    );

    const row = await db.get('SELECT * FROM payments WHERE id = ?', [id]);
    res.status(201).json({ ...row, status: deriveStatus(row) });
  } catch (err) {
    console.error('[POST /api/payments]', err);
    res.status(500).json({ error: err.error?.description || err.message || 'Failed to create payment link' });
  }
});

/**
 * POST /api/payments/sync
 * Pulls the latest status of each real Razorpay Payment Link and marks paid ones.
 */
app.post('/api/payments/sync', async (req, res) => {
  try {
    const creds = resolveCreds(req);
    const rzp = getRazorpayClient(creds);
    if (!rzp) {
      return res.status(400).json({ error: 'Razorpay Key ID and Secret are required to sync live statuses.' });
    }

    const db = await getDb();
    const rows = await db.all(
      "SELECT * FROM payments WHERE razorpay_payment_link_id IS NOT NULL AND status != 'paid'"
    );

    let checked = 0;
    let newlyPaid = 0;
    for (const r of rows) {
      checked += 1;
      try {
        const link = await rzp.paymentLink.fetch(r.razorpay_payment_link_id);
        if (link && link.status === 'paid') {
          await db.run("UPDATE payments SET status = 'paid' WHERE id = ?", [r.id]);
          newlyPaid += 1;
        }
      } catch (e) {
        console.warn(`[sync] could not fetch ${r.razorpay_payment_link_id}:`, e.message);
      }
    }

    res.json({
      message:
        checked === 0
          ? 'No live Razorpay links to sync yet. Create a link with your keys configured first.'
          : `Synced ${checked} live link${checked === 1 ? '' : 's'}. ${newlyPaid} newly marked as paid.`,
      checked,
      newlyPaid,
    });
  } catch (err) {
    console.error('[POST /api/payments/sync]', err);
    res.status(500).json({ error: err.message || 'Failed to sync statuses' });
  }
});

/**
 * GET /api/generate-reminder/:id
 * Produces an AI-drafted (or templated) reminder for one invoice.
 */
app.get('/api/generate-reminder/:id', async (req, res) => {
  try {
    const db = await getDb();
    const row = await db.get('SELECT * FROM payments WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Payment not found' });

    const creds = resolveCreds(req);
    const reminderMessage = await draftReminder(row, creds);
    res.json({ reminderMessage });
  } catch (err) {
    console.error('[GET /api/generate-reminder]', err);
    res.status(500).json({ error: err.message || 'Failed to generate reminder' });
  }
});

/**
 * POST /api/refine-reminder
 * Iteratively edits an existing draft using a natural-language instruction.
 * body: { paymentId, currentDraft, instruction }
 */
app.post('/api/refine-reminder', async (req, res) => {
  try {
    const { paymentId, currentDraft, instruction } = req.body || {};
    if (!currentDraft || !instruction) {
      return res.status(400).json({ error: 'currentDraft and instruction are required' });
    }

    const creds = resolveCreds(req);

    let context = '';
    if (paymentId) {
      const db = await getDb();
      const row = await db.get('SELECT * FROM payments WHERE id = ?', [paymentId]);
      if (row) {
        context = `\nContext — Customer: ${row.customer_name}, Amount: ₹${inr(row.amount)}, Due: ${row.due_date}, Link: ${row.short_url}.`;
      }
    }

    if (!creds.nvidiaApiKey) {
      return res.json({ refinedMessage: heuristicRefine(currentDraft, instruction) });
    }

    const messages = [
      {
        role: 'system',
        content:
          'You revise payment-reminder messages for an Indian small business. Apply the user\'s instruction to the draft. ' +
          'Keep it concise and professional, keep any payment link intact, use ₹ for amounts, and sign off as "Team Accounts". ' +
          'Return ONLY the revised message text — no preamble, no explanation.',
      },
      {
        role: 'user',
        content: `Current draft:\n"""\n${currentDraft}\n"""\n\nInstruction: ${instruction}${context}`,
      },
    ];

    try {
      const text = await nvidiaChat({ apiKey: creds.nvidiaApiKey, model: creds.nvidiaModel, messages, temperature: 0.5 });
      res.json({ refinedMessage: text || heuristicRefine(currentDraft, instruction) });
    } catch (err) {
      console.error('[refine-reminder] NVIDIA error, using heuristic:', err.message);
      res.json({ refinedMessage: heuristicRefine(currentDraft, instruction) });
    }
  } catch (err) {
    console.error('[POST /api/refine-reminder]', err);
    res.status(500).json({ error: err.message || 'Failed to refine reminder' });
  }
});

/**
 * POST /api/generate-bulk-nudges
 * The "Proactive Collections Agent": scans all open invoices, ranks them by
 * escalation tier and drafts an action for each, plus an executive summary.
 */
app.post('/api/generate-bulk-nudges', async (req, res) => {
  try {
    const creds = resolveCreds(req);
    const db = await getDb();
    const rows = await db.all('SELECT * FROM payments');

    // Only open (unpaid) invoices are actionable.
    const open = rows.filter((r) => deriveStatus(r) !== 'paid');

    // Sort by urgency: Tier 3 first, then 2, then 1; more-overdue first within a tier.
    const rank = { 'Tier 3': 3, 'Tier 2': 2, 'Tier 1': 1, Settled: 0 };
    open.sort((a, b) => {
      const ta = tierFor(a);
      const tb = tierFor(b);
      if (rank[tb.tier] !== rank[ta.tier]) return rank[tb.tier] - rank[ta.tier];
      return tb.overdueDays - ta.overdueDays;
    });

    // Draft an action for each open invoice (AI where possible, else template).
    const recommendations = await Promise.all(
      open.map(async (r) => {
        const info = tierFor(r);
        const actionDraft = await draftReminder(r, creds);
        return { paymentId: r.id, clientName: r.customer_name, tier: info.tier, actionDraft };
      })
    );

    // Executive summary — aggregate stats (accurate & always available).
    const today = todayISO();
    const overdue = open.filter((r) => deriveStatus(r) === 'overdue');
    const overdueTotal = overdue.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const upcomingTotal = open
      .filter((r) => deriveStatus(r) === 'pending')
      .reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const tier3 = open.filter((r) => tierFor(r).tier === 'Tier 3');

    let summary =
      `Scanned ${open.length} open invoice${open.length === 1 ? '' : 's'}. ` +
      `${overdue.length} are overdue totalling ₹${inr(overdueTotal)}, and ₹${inr(upcomingTotal)} is due soon. ` +
      (tier3.length
        ? `${tier3.length} account${tier3.length === 1 ? '' : 's'} (${tier3.map((r) => r.customer_name).join(', ')}) ${tier3.length === 1 ? 'has' : 'have'} crossed 10 days overdue and need an urgent Tier-3 final notice.`
        : 'No accounts have reached the urgent Tier-3 stage yet — a good time for gentle nudges.');

    // If NVIDIA is available, upgrade the summary to a sharper AI narrative.
    if (creds.nvidiaApiKey) {
      const lines = open
        .map((r) => `- ${r.customer_name}: ₹${inr(r.amount)}, due ${r.due_date}, ${tierFor(r).daysText} (${tierFor(r).tier})`)
        .join('\n');
      const messages = [
        {
          role: 'system',
          content:
            'You are a proactive collections analyst for an Indian small business. Given a list of open invoices, ' +
            'write a crisp 2-3 sentence executive summary of the receivables risk and the single most important action to take today. ' +
            'Use ₹ for money. Return ONLY the summary text.',
        },
        { role: 'user', content: `Open invoices:\n${lines}\n\nToday is ${today}.` },
      ];
      try {
        const aiSummary = await nvidiaChat({ apiKey: creds.nvidiaApiKey, model: creds.nvidiaModel, messages, maxTokens: 220 });
        if (aiSummary) summary = aiSummary;
      } catch (err) {
        console.error('[bulk-nudges] NVIDIA summary error, using computed summary:', err.message);
      }
    }

    res.json({ summary, recommendations });
  } catch (err) {
    console.error('[POST /api/generate-bulk-nudges]', err);
    res.status(500).json({ error: err.message || 'Bulk collections analysis failed' });
  }
});

/**
 * POST /api/negotiate-settlement
 * Generates an intelligent Razorpay settlement offer (2% early discount or 50/50 split milestone links)
 * body: { paymentId, strategy: 'discount_2_percent' | 'split_milestone_50_50' }
 */
app.post('/api/negotiate-settlement', async (req, res) => {
  try {
    const { paymentId, strategy, payment: bodyPayment } = req.body || {};
    const creds = resolveCredentials(req);
    const db = await getDb();
    let payment = await db.get('SELECT * FROM payments WHERE id = ?', [paymentId]);
    if (!payment && bodyPayment) {
      payment = bodyPayment;
    } else if (!payment) {
      payment = {
        id: paymentId || 'INV-DEMO',
        amount: (req.body && req.body.amount) || 10000,
        customer_name: (req.body && req.body.customer_name) || 'Client',
        customer_email: (req.body && req.body.customer_email) || 'client@example.com',
        description: (req.body && req.body.description) || 'Services Invoice',
        short_url: (req.body && req.body.short_url) || `https://rzp.io/i/${crypto.randomBytes(4).toString('hex')}`
      };
    }

    const rzp = getRazorpayClient(creds);
    let offerDetails = {};

    if (strategy === 'discount_2_percent') {
      const discountedAmount = Math.round(payment.amount * 0.98);
      let discountedUrl = payment.short_url;
      if (rzp) {
        try {
          const link = await rzp.paymentLink.create({
            amount: discountedAmount * 100,
            currency: payment.currency || 'INR',
            description: `Quick-Settlement (2% Off) for ${payment.id} - ${payment.description || 'Invoice'}`,
            customer: { name: payment.customer_name, email: payment.customer_email }
          });
          discountedUrl = link.short_url || discountedUrl;
        } catch (e) {
          console.error('[Razorpay Link Create Error]', e.message);
        }
      } else {
        discountedUrl = `https://rzp.io/i/disc_${crypto.randomBytes(4).toString('hex')}`;
      }

      offerDetails = {
        strategy: 'discount_2_percent',
        originalAmount: payment.amount,
        offerAmount: discountedAmount,
        discountPercentage: 2,
        savings: payment.amount - discountedAmount,
        paymentUrl: discountedUrl,
        defaultDraft: `Hi ${payment.customer_name.split(' ')[0]}, to help settle invoice ${payment.id} swiftly, we are pleased to offer a 2% early settlement discount (₹${inr(discountedAmount)} instead of ₹${inr(payment.amount)}) if completed within 24 hours. You can pay securely via Razorpay here: ${discountedUrl} — Team Accounts`
      };
    } else if (strategy === 'split_milestone_50_50') {
      const halfAmount = Math.round(payment.amount / 2);
      let link1Url = payment.short_url;
      let link2Url = payment.short_url;

      if (rzp) {
        try {
          const l1 = await rzp.paymentLink.create({
            amount: halfAmount * 100,
            currency: 'INR',
            description: `Milestone 1/2 (50%) for ${payment.id}`,
            customer: { name: payment.customer_name, email: payment.customer_email }
          });
          const l2 = await rzp.paymentLink.create({
            amount: (payment.amount - halfAmount) * 100,
            currency: 'INR',
            description: `Milestone 2/2 (50%) for ${payment.id}`,
            customer: { name: payment.customer_name, email: payment.customer_email }
          });
          link1Url = l1.short_url || link1Url;
          link2Url = l2.short_url || link2Url;
        } catch (e) {
          console.error('[Razorpay Milestone Links Create Error]', e.message);
        }
      } else {
        link1Url = `https://rzp.io/i/ms1_${crypto.randomBytes(4).toString('hex')}`;
        link2Url = `https://rzp.io/i/ms2_${crypto.randomBytes(4).toString('hex')}`;
      }

      offerDetails = {
        strategy: 'split_milestone_50_50',
        originalAmount: payment.amount,
        milestone1: halfAmount,
        milestone2: payment.amount - halfAmount,
        link1: link1Url,
        link2: link2Url,
        defaultDraft: `Hi ${payment.customer_name.split(' ')[0]}, we understand cash-flow flexibility is important. We can split your pending balance of ₹${inr(payment.amount)} into two equal 50% milestones. You can clear Milestone 1 (₹${inr(halfAmount)}) today here: ${link1Url}, and Milestone 2 (₹${inr(payment.amount - halfAmount)}) within 14 days here: ${link2Url}. Thank you! — Team Accounts`
      };
    }

    // Optional LLM Polish if NVIDIA API Key is present
    if (creds.nvidiaApiKey) {
      const messages = [
        {
          role: 'system',
          content: 'You are an intelligent Accounts Receivable AI agent for Razorpay merchants. ' +
            'Write a warm, concise, professional message offering this settlement proposal to the client. ' +
            'Include the exact amounts, savings/milestones, and the provided payment link(s). ' +
            'Return ONLY the ready-to-send text.'
        },
        {
          role: 'user',
          content: `Client: ${payment.customer_name}\nInvoice: ${payment.id}\nOriginal Amount: ₹${inr(payment.amount)}\nStrategy: ${strategy}\nDetails: ${JSON.stringify(offerDetails)}`
        }
      ];
      try {
        const aiMessage = await nvidiaChat({ apiKey: creds.nvidiaApiKey, model: creds.nvidiaModel, messages, maxTokens: 250 });
        if (aiMessage) offerDetails.defaultDraft = aiMessage;
      } catch (err) {
        console.error('[negotiate-settlement NVIDIA error]', err.message);
      }
    }

    res.json({ success: true, offer: offerDetails });
  } catch (err) {
    console.error('[POST /api/negotiate-settlement]', err);
    res.status(500).json({ error: err.message || 'Failed to generate settlement offer' });
  }
});

/**
 * POST /api/webhooks/simulate-payment
 * Simulates an incoming Razorpay webhook event (payment_link.paid / payment.captured)
 * Reconciles the invoice in SQLite and returns updated summary
 */
app.post('/api/webhooks/simulate-payment', async (req, res) => {
  try {
    const { paymentId, event = 'payment_link.paid', payment: bodyPayment } = req.body || {};
    if (!paymentId) {
      return res.status(400).json({ error: 'paymentId is required' });
    }

    const db = await getDb();
    let payment = await db.get('SELECT * FROM payments WHERE id = ?', [paymentId]);
    if (payment) {
      await db.run("UPDATE payments SET status = 'paid' WHERE id = ?", [paymentId]);
    } else {
      payment = bodyPayment || { id: paymentId, amount: 10000, status: 'paid' };
    }

    const updatedPayment = await db.get('SELECT * FROM payments WHERE id = ?', [paymentId]);
    
    // Compute fresh summary
    const today = todayISO();
    const overdueRow = await db.get(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE status = 'pending' AND due_date < ?",
      [today]
    );
    const totalOverdue = overdueRow ? overdueRow.total : 0;
    const riskScore = Math.min(100, Math.round((totalOverdue / AVERAGE_MONTHLY_INFLOW) * 100));

    res.json({
      success: true,
      event,
      message: `Razorpay Webhook: ${event} captured for ${paymentId}! ₹${inr(payment.amount)} settled instantly into ledger.`,
      payment: updatedPayment,
      totalOverdue,
      riskScore
    });
  } catch (err) {
    console.error('[POST /api/webhooks/simulate-payment]', err);
    res.status(500).json({ error: err.message || 'Webhook simulation failed' });
  }
});

/**
 * POST /api/send-email
 * Sends a reminder email via nodemailer.
 * If SMTP credentials are not configured, it simulates the dispatch.
 * body: { to, subject, text, paymentId }
 */
app.post('/api/send-email', async (req, res) => {
  try {
    const { to, subject, text, paymentId } = req.body || {};
    if (!to || !subject || !text) {
      return res.status(400).json({ error: 'to, subject, and text are required' });
    }

    // Resolve SMTP settings (from body, env, or headers)
    const h = req.headers || {};
    const b = req.body || {};
    const smtpHost = h['x-smtp-host'] || b.smtpHost || process.env.SMTP_HOST;
    const smtpPort = h['x-smtp-port'] || b.smtpPort || process.env.SMTP_PORT;
    const smtpUser = h['x-smtp-user'] || b.smtpUser || process.env.SMTP_USER;
    const smtpPass = h['x-smtp-pass'] || b.smtpPass || process.env.SMTP_PASS;
    const smtpFrom = h['x-smtp-from'] || b.smtpFrom || process.env.SMTP_FROM || smtpUser || 'no-reply@cashflow.ai';

    if ((smtpHost && smtpPort && smtpUser && smtpPass) || (smtpUser && smtpPass)) {
      // Send real email via nodemailer
      const nodemailer = require('nodemailer');
      const transporterOptions = (smtpHost && smtpPort) 
        ? {
            host: smtpHost,
            port: parseInt(smtpPort, 10),
            secure: parseInt(smtpPort, 10) === 465,
            auth: {
              user: smtpUser,
              pass: smtpPass
            }
          }
        : {
            service: 'gmail',
            auth: {
              user: smtpUser,
              pass: smtpPass
            }
          };

      const transporter = nodemailer.createTransport(transporterOptions);

      await transporter.sendMail({
        from: `CashFlow AI <${smtpFrom}>`,
        to,
        subject,
        text
      });

      console.log(`[SMTP] Successfully sent real email to ${to} (Subject: "${subject}")`);
      return res.json({ success: true, message: `Real email successfully sent to ${to}!` });
    } else {
      // Simulation mode
      console.log('\n--------------------------------------------');
      console.log('[SIMULATION EMAIL DISPATCH]');
      console.log(`To: ${to}`);
      console.log(`From: ${smtpFrom}`);
      console.log(`Subject: ${subject}`);
      console.log(`Body:\n${text}`);
      console.log('--------------------------------------------\n');

      return res.json({
        success: true,
        simulated: true,
        message: `Simulated email send to ${to}. Check backend terminal logs!`
      });
    }
  } catch (err) {
    console.error('[POST /api/send-email]', err);
    res.status(500).json({ error: err.message || 'Failed to send email' });
  }
});

/* ------------------------------------------------------------------------- */

app.listen(PORT, () => {
  const creds = {
    razorpay: !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
    nvidia: !!process.env.NVIDIA_API_KEY,
  };
  console.log(`\n  CashFlow AI backend running on http://localhost:${PORT}`);
  console.log(`  Razorpay (env): ${creds.razorpay ? 'configured' : 'mock mode — add keys in the UI or .env'}`);
  console.log(`  NVIDIA NIM (env): ${creds.nvidia ? 'configured' : 'template mode — add a key in the UI or .env'}`);
  console.log(`  Tip: credentials can also be supplied per-request from the "AI Configurations" tab.\n`);
});
