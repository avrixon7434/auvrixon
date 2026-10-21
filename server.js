require("dotenv").config();
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";
if (isProduction && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32 || process.env.SESSION_SECRET === "replace-with-a-long-random-secret")) {
  throw new Error("Production requires a unique SESSION_SECRET of at least 32 characters.");
}
if (isProduction && (!process.env.OWNER_EMAIL || !process.env.OWNER_PASSWORD || process.env.OWNER_PASSWORD.length < 14 || process.env.OWNER_PASSWORD === "replace-this-before-launch")) {
  throw new Error("Production requires OWNER_EMAIL and a strong OWNER_PASSWORD before launch.");
}
const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, "aurevix.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 email TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('owner','admin','client','worker')),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS jobs (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 client_id INTEGER NOT NULL REFERENCES users(id),
 title TEXT NOT NULL,
 category TEXT NOT NULL,
 description TEXT NOT NULL,
 budget INTEGER NOT NULL CHECK(budget > 0),
 deadline TEXT,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','submitted','approved','cancelled')),
 worker_id INTEGER REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS submissions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 job_id INTEGER NOT NULL REFERENCES jobs(id),
 worker_id INTEGER NOT NULL REFERENCES users(id),
 note TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS payment_records (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 job_id INTEGER NOT NULL REFERENCES jobs(id),
 amount INTEGER NOT NULL CHECK(amount >= 0),
 currency TEXT NOT NULL DEFAULT 'BDT',
 status TEXT NOT NULL DEFAULT 'manual_review' CHECK(status IN ('manual_review','verified','refunded','paid_out')),
 provider_reference TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS payment_orders (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 job_id INTEGER NOT NULL REFERENCES jobs(id),
 client_id INTEGER NOT NULL REFERENCES users(id),
 provider TEXT NOT NULL DEFAULT 'sslcommerz',
 tran_id TEXT NOT NULL UNIQUE,
 amount INTEGER NOT NULL CHECK(amount > 0),
 currency TEXT NOT NULL DEFAULT 'BDT',
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','failed','cancelled','review')),
 validation_id TEXT,
 gateway_reference TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

app.disable("x-powered-by");
if (isProduction) app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: isProduction ? [] : null
    }
  }
}));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));
app.use(express.json({ limit: "100kb" }));
app.use(session({
  store: new SQLiteStore({ db: "sessions.sqlite", dir: dataDir }),
  secret: process.env.SESSION_SECRET || "local-development-only-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    maxAge: 1000 * 60 * 60 * 8
  }
}));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 180, standardHeaders: "draft-7", legacyHeaders: false }));
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "অনেকবার চেষ্টা করা হয়েছে। ১৫ মিনিট পর আবার চেষ্টা করুন।" } });
app.use(express.static(path.join(__dirname, "public")));

function safeUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status };
}
function currentUser(req) {
  if (!req.session.userId) return null;
  return db.prepare("SELECT id,name,email,role,status FROM users WHERE id=?").get(req.session.userId) || null;
}
function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user || user.status !== "active") return res.status(401).json({ error: "লগইন করুন।" });
  req.user = user;
  next();
}
function requireRole(...roles) {
  return (req, res, next) => {
    const user = currentUser(req);
    if (!user || user.status !== "active") return res.status(401).json({ error: "লগইন করুন।" });
    if (!roles.includes(user.role)) return res.status(403).json({ error: "এই কাজের অনুমতি নেই।" });
    req.user = user;
    next();
  };
}
function clean(value, max = 2000) {
  return String(value ?? "").trim().slice(0, max);
}

app.get("/api/setup-status", (req, res) => {
  const count = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='owner'").get().n;
  res.json({ needsOwnerSetup: count === 0 });
});

app.post("/api/setup-owner", authLimiter, async (req, res) => {
  const existing = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='owner'").get().n;
  if (existing > 0) return res.status(403).json({ error: "Owner setup ইতোমধ্যে সম্পন্ন হয়েছে।" });
  const expectedEmail = clean(process.env.OWNER_EMAIL, 254).toLowerCase();
  const expectedPassword = String(process.env.OWNER_PASSWORD || "");
  const email = clean(req.body.email, 254).toLowerCase();
  const password = String(req.body.password || "");
  const name = clean(req.body.name, 100);
  if (!expectedEmail || !expectedPassword || expectedPassword === "replace-this-before-launch") {
    return res.status(503).json({ error: ".env ফাইলে OWNER_EMAIL ও শক্তিশালী OWNER_PASSWORD সেট করুন।" });
  }
  if (email !== expectedEmail || password !== expectedPassword) {
    return res.status(403).json({ error: "Owner setup credentials মিলছে না। .env-এর মান ব্যবহার করুন।" });
  }
  if (name.length < 2 || password.length < 14) return res.status(400).json({ error: "নাম দিন এবং অন্তত ১৪ অক্ষরের Owner password ব্যবহার করুন।" });
  const hash = await bcrypt.hash(password, 12);
  const info = db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'owner')").run(name, email, hash);
  req.session.userId = Number(info.lastInsertRowid);
  res.json({ user: safeUser(currentUser(req)) });
});

app.post("/api/register", authLimiter, async (req, res) => {
  const name = clean(req.body.name, 100);
  const email = clean(req.body.email, 254).toLowerCase();
  const password = String(req.body.password || "");
  const role = ["client", "worker"].includes(req.body.role) ? req.body.role : "worker";
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12) {
    return res.status(400).json({ error: "নাম, বৈধ ইমেইল এবং অন্তত ১২ অক্ষরের পাসওয়ার্ড দিন।" });
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    const info = db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)").run(name, email, hash, role);
    req.session.userId = Number(info.lastInsertRowid);
    res.json({ user: safeUser(currentUser(req)) });
  } catch (e) {
    if (String(e.code).includes("SQLITE_CONSTRAINT")) return res.status(409).json({ error: "এই ইমেইল দিয়ে অ্যাকাউন্ট আছে।" });
    res.status(500).json({ error: "অ্যাকাউন্ট তৈরি করা যায়নি।" });
  }
});

app.post("/api/login", authLimiter, async (req, res) => {
  const email = clean(req.body.email, 254).toLowerCase();
  const password = String(req.body.password || "");
  const user = db.prepare("SELECT * FROM users WHERE email=?").get(email);
  if (!user || user.status !== "active" || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: "ইমেইল বা পাসওয়ার্ড সঠিক নয়।" });
  }
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: "লগইন সেশন তৈরি করা যায়নি।" });
    req.session.userId = user.id;
    res.json({ user: safeUser(user) });
  });
});
app.post("/api/logout", (req, res) => req.session.destroy(() => {
  res.clearCookie("connect.sid", { httpOnly: true, sameSite: "lax", secure: isProduction });
  res.json({ ok: true });
}));
app.get("/api/me", (req, res) => {
  const user = currentUser(req);
  if (!user || user.status !== "active") return res.json({ user: null });
  res.json({ user: safeUser(user) });
});

app.get("/api/jobs", requireAuth, (req, res) => {
  let rows;
  if (["owner", "admin"].includes(req.user.role)) {
    rows = db.prepare(`SELECT j.*, u.name AS client_name, w.name AS worker_name
      FROM jobs j JOIN users u ON u.id=j.client_id LEFT JOIN users w ON w.id=j.worker_id
      ORDER BY j.id DESC LIMIT 200`).all();
  } else if (req.user.role === "client") {
    rows = db.prepare(`SELECT j.*, u.name AS client_name, w.name AS worker_name
      FROM jobs j JOIN users u ON u.id=j.client_id LEFT JOIN users w ON w.id=j.worker_id
      WHERE j.client_id=? ORDER BY j.id DESC LIMIT 200`).all(req.user.id);
  } else {
    rows = db.prepare(`SELECT j.*, u.name AS client_name, w.name AS worker_name
      FROM jobs j JOIN users u ON u.id=j.client_id LEFT JOIN users w ON w.id=j.worker_id
      WHERE j.status='open' OR j.worker_id=? ORDER BY j.id DESC LIMIT 200`).all(req.user.id);
  }
  res.json({ jobs: rows });
});

app.post("/api/jobs", requireRole("client", "owner", "admin"), (req, res) => {
  const title = clean(req.body.title, 140);
  const category = clean(req.body.category, 80);
  const description = clean(req.body.description, 4000);
  const budget = Number(req.body.budget);
  const deadline = clean(req.body.deadline, 20) || null;
  if (title.length < 4 || category.length < 2 || description.length < 15 || !Number.isInteger(budget) || budget < 100 || budget > 10000000) {
    return res.status(400).json({ error: "শিরোনাম, ক্যাটাগরি, বিস্তারিত বিবরণ এবং ৳১০০–৳১,০০,০০,০০০-এর মধ্যে পূর্ণসংখ্যার বাজেট দিন।" });
  }
  const info = db.prepare("INSERT INTO jobs(client_id,title,category,description,budget,deadline) VALUES(?,?,?,?,?,?)")
    .run(req.user.id, title, category, description, budget, deadline);
  res.json({ id: Number(info.lastInsertRowid) });
});

app.post("/api/jobs/:id/assign", requireRole("owner", "admin"), (req, res) => {
  const jobId = Number(req.params.id);
  const workerId = Number(req.body.workerId);
  const worker = db.prepare("SELECT id FROM users WHERE id=? AND role='worker' AND status='active'").get(workerId);
  const job = db.prepare("SELECT id,status FROM jobs WHERE id=?").get(jobId);
  if (!worker || !job || !["open", "in_progress"].includes(job.status)) return res.status(400).json({ error: "কাজ বা কর্মীর তথ্য যাচাই করুন।" });
  db.prepare("UPDATE jobs SET worker_id=?, status='in_progress' WHERE id=?").run(workerId, jobId);
  res.json({ ok: true });
});

app.post("/api/jobs/:id/submit", requireRole("worker"), (req, res) => {
  const jobId = Number(req.params.id);
  const note = clean(req.body.note, 3000);
  const job = db.prepare("SELECT * FROM jobs WHERE id=? AND worker_id=? AND status='in_progress'").get(jobId, req.user.id);
  if (!job || note.length < 10) return res.status(400).json({ error: "আপনার বরাদ্দকৃত কাজ এবং অন্তত ১০ অক্ষরের জমা নোট প্রয়োজন।" });
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO submissions(job_id,worker_id,note) VALUES(?,?,?)").run(jobId, req.user.id, note);
    db.prepare("UPDATE jobs SET status='submitted' WHERE id=?").run(jobId);
  });
  tx();
  res.json({ ok: true });
});

app.post("/api/jobs/:id/approve", requireRole("owner", "admin", "client"), (req, res) => {
  const jobId = Number(req.params.id);
  const job = db.prepare("SELECT * FROM jobs WHERE id=?").get(jobId);
  if (!job || job.status !== "submitted") return res.status(400).json({ error: "অনুমোদনের জন্য জমা দেওয়া কাজ পাওয়া যায়নি।" });
  if (req.user.role === "client" && job.client_id !== req.user.id) return res.status(403).json({ error: "এই অর্ডার আপনার নয়।" });
  db.prepare("UPDATE jobs SET status='approved' WHERE id=?").run(jobId);
  res.json({ ok: true, note: "কাজ অনুমোদিত হয়েছে। বাস্তব পেআউট স্বয়ংক্রিয়ভাবে হয়নি; Finance/Admin-কে পেমেন্ট আলাদাভাবে যাচাই করতে হবে।" });
});

// Hosted checkout integration. Keep all gateway credentials on the server.
function sslBase() {
  return process.env.SSLCOMMERZ_MODE === "live"
    ? "https://securepay.sslcommerz.com"
    : "https://sandbox.sslcommerz.com";
}
function sslReady() {
  return Boolean(process.env.SSLCOMMERZ_STORE_ID && process.env.SSLCOMMERZ_STORE_PASSWORD && process.env.APP_BASE_URL);
}
function publicBase(req) {
  const configured = String(process.env.APP_BASE_URL || "").trim().replace(/\/$/, "");
  if (configured) return configured;
  return `${req.protocol}://${req.get("host")}`;
}
async function validateSslPayment(valId) {
  const endpoint = new URL("/validator/api/validationserverAPI.php", sslBase());
  endpoint.searchParams.set("val_id", valId);
  endpoint.searchParams.set("store_id", process.env.SSLCOMMERZ_STORE_ID);
  endpoint.searchParams.set("store_passwd", process.env.SSLCOMMERZ_STORE_PASSWORD);
  endpoint.searchParams.set("format", "json");
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error("Gateway validation request failed");
  return response.json();
}
function finalizeValidatedPayment(validation, expectedTranId) {
  const order = db.prepare("SELECT * FROM payment_orders WHERE tran_id=?").get(expectedTranId);
  if (!order || order.status === "paid") return Boolean(order && order.status === "paid");
  const valid = validation && validation.status === "VALID" &&
    String(validation.tran_id) === order.tran_id &&
    Math.round(Number(validation.amount) * 100) === order.amount * 100 &&
    String(validation.currency || "").toUpperCase() === order.currency;
  if (!valid) {
    db.prepare("UPDATE payment_orders SET status='review', updated_at=CURRENT_TIMESTAMP WHERE tran_id=? AND status='pending'").run(expectedTranId);
    return false;
  }
  const tx = db.transaction(() => {
    db.prepare("UPDATE payment_orders SET status='paid', validation_id=?, gateway_reference=?, updated_at=CURRENT_TIMESTAMP WHERE tran_id=? AND status='pending'")
      .run(String(validation.val_id || ""), String(validation.bank_tran_id || validation.tran_id || ""), expectedTranId);
    const exists = db.prepare("SELECT id FROM payment_records WHERE provider_reference=?").get(expectedTranId);
    if (!exists) db.prepare("INSERT INTO payment_records(job_id,amount,currency,status,provider_reference) VALUES(?,?,?,'verified',?)")
      .run(order.job_id, order.amount, order.currency, expectedTranId);
  });
  tx();
  return true;
}

app.get("/api/payments/config", (req, res) => {
  res.json({ provider: "sslcommerz", configured: sslReady(), mode: process.env.SSLCOMMERZ_MODE === "live" ? "live" : "sandbox", currency: "BDT", internationalCards: "subject to gateway merchant approval" });
});

app.post("/api/payments/checkout", requireRole("client", "owner", "admin"), authLimiter, async (req, res) => {
  if (!sslReady()) return res.status(503).json({ error: "পেমেন্ট চালুর আগে Render-এর Environment-এ SSLCOMMERZ credentials ও APP_BASE_URL সেট করতে হবে।" });
  if (process.env.NODE_ENV === "production" && !String(process.env.APP_BASE_URL).startsWith("https://")) {
    return res.status(503).json({ error: "Production APP_BASE_URL অবশ্যই HTTPS হতে হবে।" });
  }
  const jobId = Number(req.body.jobId);
  const phone = clean(req.body.phone, 30);
  const address = clean(req.body.address, 120) || "Bangladesh";
  const job = db.prepare("SELECT * FROM jobs WHERE id=?").get(jobId);
  if (!job || (req.user.role === "client" && job.client_id !== req.user.id)) return res.status(404).json({ error: "আপনার কাজটি পাওয়া যায়নি।" });
  if (!["open", "in_progress"].includes(job.status)) return res.status(400).json({ error: "এই কাজের জন্য এখন পেমেন্ট নেওয়া যাচ্ছে না।" });
  if (!/^\+?[0-9 ()-]{8,20}$/.test(phone)) return res.status(400).json({ error: "পেমেন্টের জন্য বৈধ ফোন নম্বর দিন।" });
  const alreadyPaid = db.prepare("SELECT id FROM payment_orders WHERE job_id=? AND status='paid'").get(jobId);
  if (alreadyPaid) return res.status(409).json({ error: "এই কাজের পেমেন্ট ইতোমধ্যে যাচাই করা হয়েছে।" });
  const amount = Number(job.budget);
  if (!Number.isSafeInteger(amount) || amount < 10 || amount > 500000) return res.status(400).json({ error: "এই gateway-তে পেমেন্টের পরিমাণ ১০ থেকে ৫,০০,০০০ BDT-এর মধ্যে হতে হবে।" });
  const tranId = `AVX${Date.now()}${require("crypto").randomBytes(4).toString("hex")}`.slice(0, 30);
  db.prepare("INSERT INTO payment_orders(job_id,client_id,tran_id,amount,currency) VALUES(?,?,?,?, 'BDT')")
    .run(jobId, req.user.id, tranId, amount);
  const base = publicBase(req);
  const form = new URLSearchParams({
    store_id: process.env.SSLCOMMERZ_STORE_ID,
    store_passwd: process.env.SSLCOMMERZ_STORE_PASSWORD,
    total_amount: amount.toFixed(2), currency: "BDT", tran_id: tranId,
    product_category: "Digital services", product_name: `AUREVIX job #${jobId}`,
    success_url: `${base}/api/payments/sslcommerz/success`,
    fail_url: `${base}/api/payments/sslcommerz/fail`,
    cancel_url: `${base}/api/payments/sslcommerz/cancel`,
    ipn_url: `${base}/api/payments/sslcommerz/ipn`,
    cus_name: req.user.name, cus_email: req.user.email, cus_phone: phone,
    cus_add1: address, cus_city: "Dhaka", cus_postcode: "1000", cus_country: "Bangladesh",
    shipping_method: "NO", num_of_item: "1", product_profile: "non-physical-goods"
  });
  try {
    const response = await fetch(`${sslBase()}/gwprocess/v4/api.php`, {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form,
      signal: AbortSignal.timeout(15000)
    });
    const result = await response.json();
    if (!response.ok || result.status !== "SUCCESS" || !result.GatewayPageURL) {
      db.prepare("UPDATE payment_orders SET status='failed', updated_at=CURRENT_TIMESTAMP WHERE tran_id=? AND status='pending'").run(tranId);
      return res.status(502).json({ error: "পেমেন্ট গেটওয়ে checkout তৈরি করতে পারেনি। Sandbox credentials ও merchant setup যাচাই করুন।" });
    }
    res.json({ checkoutUrl: result.GatewayPageURL, tranId });
  } catch (error) {
    db.prepare("UPDATE payment_orders SET status='review', updated_at=CURRENT_TIMESTAMP WHERE tran_id=? AND status='pending'").run(tranId);
    res.status(502).json({ error: "গেটওয়ের সঙ্গে সংযোগ হয়নি। Admin-কে transaction reference দিয়ে যাচাই করতে হবে।", tranId });
  }
});

async function sslCallback(req, res, outcome) {
  const data = { ...(req.query || {}), ...(req.body || {}) };
  const tranId = clean(data.tran_id, 30);
  const order = tranId ? db.prepare("SELECT * FROM payment_orders WHERE tran_id=?").get(tranId) : null;
  if (!order) return res.status(400).send("Unknown AUREVIX transaction");
  if (outcome === "success") {
    const valId = clean(data.val_id, 100);
    if (!valId) return res.status(400).send("Missing validation reference");
    try {
      const validation = await validateSslPayment(valId);
      const paid = finalizeValidatedPayment(validation, tranId);
      if (!paid) return res.status(400).send("Payment could not be verified. Please contact AUREVIX support with transaction ID: " + tranId);
      return res.redirect("/?payment=success&tran=" + encodeURIComponent(tranId));
    } catch (_) {
      db.prepare("UPDATE payment_orders SET status='review', updated_at=CURRENT_TIMESTAMP WHERE tran_id=? AND status='pending'").run(tranId);
      return res.status(503).send("Payment is awaiting verification. Keep transaction ID: " + tranId);
    }
  }
  if (outcome === "ipn") {
    if (data.status === "VALID" && data.val_id) {
      try {
        const validation = await validateSslPayment(clean(data.val_id, 100));
        finalizeValidatedPayment(validation, tranId);
      } catch (_) {
        db.prepare("UPDATE payment_orders SET status='review', updated_at=CURRENT_TIMESTAMP WHERE tran_id=? AND status='pending'").run(tranId);
      }
    } else if (data.status === "FAILED") {
      db.prepare("UPDATE payment_orders SET status='failed', updated_at=CURRENT_TIMESTAMP WHERE tran_id=? AND status='pending'").run(tranId);
    }
    return res.status(200).send("OK");
  }
  if (outcome === "fail" || outcome === "cancel") {
    const status = outcome === "fail" ? "failed" : "cancelled";
    db.prepare("UPDATE payment_orders SET status=?, updated_at=CURRENT_TIMESTAMP WHERE tran_id=? AND status='pending'").run(status, tranId);
    return res.redirect("/?payment=" + status + "&tran=" + encodeURIComponent(tranId));
  }
  res.status(400).send("Invalid callback");
}
app.all("/api/payments/sslcommerz/success", (req, res) => sslCallback(req, res, "success"));
app.all("/api/payments/sslcommerz/fail", (req, res) => sslCallback(req, res, "fail"));
app.all("/api/payments/sslcommerz/cancel", (req, res) => sslCallback(req, res, "cancel"));
app.all("/api/payments/sslcommerz/ipn", (req, res) => sslCallback(req, res, "ipn"));

app.post("/api/payments/manual-record", requireRole("owner", "admin"), (req, res) => {
  const jobId = Number(req.body.jobId);
  const amount = Number(req.body.amount);
  const reference = clean(req.body.reference, 160) || null;
  const job = db.prepare("SELECT id,status FROM jobs WHERE id=?").get(jobId);
  if (!job || !Number.isInteger(amount) || amount < 0 || amount > 10000000) return res.status(400).json({ error: "কাজ ও অর্থের পরিমাণ যাচাই করুন।" });
  const info = db.prepare("INSERT INTO payment_records(job_id,amount,provider_reference,status) VALUES(?,?,?,'manual_review')").run(jobId, amount, reference);
  res.json({ id: Number(info.lastInsertRowid), status: "manual_review", note: "এটি শুধু রেকর্ড; গেটওয়ে যাচাই বা টাকা স্থানান্তর নয়।" });
});

app.get("/api/admin/summary", requireRole("owner", "admin"), (req, res) => {
  const users = db.prepare("SELECT role, COUNT(*) AS count FROM users GROUP BY role").all();
  const jobs = db.prepare("SELECT status, COUNT(*) AS count FROM jobs GROUP BY status").all();
  const payments = db.prepare("SELECT status, COUNT(*) AS count, COALESCE(SUM(amount),0) AS amount FROM payment_records GROUP BY status").all();
  res.json({ users, jobs, payments });
});
app.get("/api/admin/users", requireRole("owner", "admin"), (req, res) => {
  res.json({ users: db.prepare("SELECT id,name,email,role,status,created_at FROM users ORDER BY id DESC LIMIT 300").all() });
});
app.post("/api/admin/users/:id/status", requireRole("owner"), (req, res) => {
  const id = Number(req.params.id);
  const status = req.body.status === "suspended" ? "suspended" : "active";
  if (id === req.user.id) return res.status(400).json({ error: "নিজের Owner account এখান থেকে suspend করা যাবে না।" });
  const target = db.prepare("SELECT id,role FROM users WHERE id=?").get(id);
  if (!target || target.role === "owner") return res.status(400).json({ error: "এই অ্যাকাউন্ট পরিবর্তন করা যাবে না।" });
  db.prepare("UPDATE users SET status=? WHERE id=?").run(status, id);
  res.json({ ok: true });
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => {
  console.log(`AUREVIX MVP running at http://localhost:${PORT}`);
});
