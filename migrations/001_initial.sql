CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL DEFAULT 'iPhone',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS message_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID REFERENCES devices(id),
  fingerprint CHAR(64) NOT NULL UNIQUE,
  sender TEXT,
  received_at TIMESTAMPTZ,
  message_text TEXT NOT NULL,
  processing_status TEXT NOT NULL DEFAULT 'received'
    CHECK (processing_status IN ('received','parsed','ignored','review','error')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inbox_id UUID UNIQUE REFERENCES message_inbox(id),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN
    ('debit','credit','refund','reversal','failed','card_payment','unknown')),
  amount_paise BIGINT,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  merchant TEXT,
  account_type TEXT,
  instrument_last4 CHAR(4),
  bank_or_provider TEXT,
  transaction_reference TEXT,
  category TEXT NOT NULL DEFAULT 'Uncategorised',
  transaction_at TIMESTAMPTZ,
  raw_description TEXT,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0,
  review_required BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_transaction_at
  ON transactions(transaction_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_category
  ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_inbox_created_at
  ON message_inbox(created_at DESC);

CREATE TABLE IF NOT EXISTS credit_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer TEXT NOT NULL,
  nickname TEXT,
  last4 CHAR(4) NOT NULL,
  credit_limit_paise BIGINT,
  outstanding_paise BIGINT,
  due_date DATE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(issuer, last4)
);

CREATE TABLE IF NOT EXISTS budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month DATE NOT NULL,
  category TEXT NOT NULL,
  limit_paise BIGINT NOT NULL CHECK (limit_paise >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(month, category)
);
