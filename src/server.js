import express from "express";
import helmet from "helmet";
import cors from "cors";
import pg from "pg";
import crypto from "node:crypto";
import { z } from "zod";
import { parseTransaction } from "./parser.js";

const { Pool } = pg;
const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "32kb" }));
if (process.env.CORS_ORIGIN) {
  app.use(cors({ origin: process.env.CORS_ORIGIN.split(",").map(x => x.trim()) }));
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

const token = process.env.FAMILY_FINANCE_API_TOKEN;
if (!token || token.length < 32) {
  console.error("FAMILY_FINANCE_API_TOKEN must be set to a random secret of at least 32 characters.");
  process.exit(1);
}

function auth(req, res, next) {
  const supplied = req.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const a = Buffer.from(supplied);
  const b = Buffer.from(token);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

const messageSchema = z.object({
  source: z.literal("iphone_shortcuts"),
  sender: z.string().max(120).optional().default("unknown"),
  received_at: z.string().datetime({ offset: true }).optional(),
  message: z.string().min(1).max(4000),
  device_id: z.string().min(1).max(80).default("akshay-iphone")
});

app.get("/api/v1/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch {
    res.status(503).json({ status: "unavailable", database: "disconnected" });
  }
});

app.post("/api/v1/messages", auth, async (req, res) => {
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });

  const body = parsed.data;
  const normalized = `${body.sender.toLowerCase()}|${body.message.replace(/\s+/g, " ").trim().toLowerCase()}|${body.received_at || ""}`;
  const fingerprint = crypto.createHash("sha256").update(normalized).digest("hex");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const device = await client.query(
      `INSERT INTO devices(device_key,label,last_seen_at) VALUES($1,$2,now())
       ON CONFLICT(device_key) DO UPDATE SET last_seen_at=now()
       RETURNING id`,
      [body.device_id, "iPhone"]
    );
    const inbox = await client.query(
      `INSERT INTO message_inbox(device_id,fingerprint,sender,received_at,message_text)
       VALUES($1,$2,$3,$4,$5)
       ON CONFLICT(fingerprint) DO NOTHING RETURNING id`,
      [device.rows[0].id, fingerprint, body.sender, body.received_at || null, body.message]
    );
    if (!inbox.rowCount) {
      await client.query("ROLLBACK");
      return res.status(200).json({ status: "duplicate", fingerprint });
    }

    const result = parseTransaction(body.sender, body.message);
    await client.query(
      `UPDATE message_inbox SET processing_status=$1, reason=$2 WHERE id=$3`,
      [result.status, result.reason || null, inbox.rows[0].id]
    );

    if (result.transaction) {
      const t = result.transaction;
      await client.query(
        `INSERT INTO transactions
        (inbox_id,transaction_type,amount_paise,currency,merchant,account_type,
         instrument_last4,bank_or_provider,transaction_reference,category,
         transaction_at,raw_description,confidence,review_required)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [inbox.rows[0].id, t.transactionType, t.amountPaise, t.currency,
         t.merchant, t.accountType, t.instrumentLast4, t.bankOrProvider,
         t.transactionReference, t.category, body.received_at || null,
         body.message, t.confidence, t.reviewRequired]
      );
    }
    await client.query("COMMIT");
    res.status(201).json({ status: result.status, reason: result.reason || null, fingerprint });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("message_ingestion_failed", error.message);
    res.status(500).json({ error: "ingestion_failed" });
  } finally {
    client.release();
  }
});

app.get("/api/v1/transactions", auth, async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const result = await pool.query(
    `SELECT id,transaction_type,amount_paise,currency,merchant,account_type,
      instrument_last4,bank_or_provider,category,transaction_at,confidence,
      review_required,created_at
     FROM transactions ORDER BY COALESCE(transaction_at,created_at) DESC LIMIT $1`,
    [limit]
  );
  res.json({ transactions: result.rows });
});

app.get("/api/v1/summary/monthly", auth, async (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(String(req.query.month || ""))
    ? `${req.query.month}-01` : new Date().toISOString().slice(0,7) + "-01";
  const result = await pool.query(
    `SELECT category,
      SUM(CASE WHEN transaction_type='debit' THEN amount_paise ELSE 0 END)::bigint AS debit_paise,
      SUM(CASE WHEN transaction_type IN ('refund','reversal','credit') THEN amount_paise ELSE 0 END)::bigint AS credit_paise,
      COUNT(*)::int AS transaction_count
     FROM transactions
     WHERE date_trunc('month',COALESCE(transaction_at,created_at))=date_trunc('month',$1::date)
       AND review_required=false
     GROUP BY category ORDER BY category`,
    [month]
  );
  res.json({ month: month.slice(0,7), categories: result.rows });
});

app.use((err, _req, res, _next) => {
  console.error("unhandled_error", err.message);
  res.status(500).json({ error: "internal_server_error" });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, "0.0.0.0", () => console.log(`Family Finance API listening on ${port}`));
