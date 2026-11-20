const money = (s) => {
  if (!s) return null;
  const normalized = s.replace(/,/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};

export function parseTransaction(sender, message) {
  const text = String(message || "").trim();

  // Exclude security codes and promotional content before extracting money.
  if (/\b(otp|one[- ]time password|verification code|promo code)\b/i.test(text)) {
    return { status: "ignored", reason: "security_or_otp" };
  }
  if (/\b(offer|cashback offer|pre-approved|apply now|limited period)\b/i.test(text) &&
      !/\b(debited|credited|spent|purchase|transaction|payment successful)\b/i.test(text)) {
    return { status: "ignored", reason: "promotion" };
  }

  let transactionType = "unknown";
  if (/\b(failed|declined|unsuccessful)\b/i.test(text)) transactionType = "failed";
  else if (/\b(reversal|reversed|reverted)\b/i.test(text)) transactionType = "reversal";
  else if (/\b(refund|refunded)\b/i.test(text)) transactionType = "refund";
  else if (/\b(credited|received|deposit)\b/i.test(text)) transactionType = "credit";
  else if (/\b(credit card bill|card payment|payment towards card)\b/i.test(text)) transactionType = "card_payment";
  else if (/\b(debited|spent|purchase|paid|withdrawn|transaction of)\b/i.test(text)) transactionType = "debit";

  const amountMatch =
    text.match(/(?:INR|Rs\.?|₹)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i) ||
    text.match(/([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:INR|rupees)/i);
  const amountPaise = amountMatch ? money(amountMatch[1]) : null;
  const last4Match = text.match(/(?:XX|X{2,}|ending\s*(?:with)?\s*|card\s*)?([0-9]{4})\b/i);
  const refMatch = text.match(/(?:UPI Ref(?:erence)?|RRN|UTR|Ref(?:erence)?(?: No)?)[\s:#-]*([A-Z0-9-]{6,})/i);

  let merchant = null;
  const merchantPatterns = [
    /(?:at|to|towards|@)\s+([A-Z0-9][A-Z0-9 &.'_-]{1,48}?)(?:\s+(?:on|dated|ref|upi|using|with)\b|[.,;]|$)/i,
    /(?:merchant|payee)\s*[:\-]\s*([A-Z0-9][A-Z0-9 &.'_-]{1,48})/i
  ];
  for (const pattern of merchantPatterns) {
    const match = text.match(pattern);
    if (match) { merchant = match[1].trim(); break; }
  }

  const provider = String(sender || "").slice(0, 120);
  const reviewRequired = transactionType === "unknown" || !amountPaise ||
    !merchant || ["refund", "reversal", "failed", "card_payment", "credit"].includes(transactionType);

  if (!amountPaise && transactionType === "unknown") {
    return { status: "review", reason: "no_transaction_amount_or_type" };
  }

  return {
    status: reviewRequired ? "review" : "parsed",
    transaction: {
      transactionType,
      amountPaise,
      currency: "INR",
      merchant,
      accountType: /upi/i.test(text) ? "UPI" : /card/i.test(text) ? "card" : "bank",
      instrumentLast4: last4Match?.[1] || null,
      bankOrProvider: provider,
      transactionReference: refMatch?.[1] || null,
      category: "Uncategorised",
      confidence: reviewRequired ? 0.45 : 0.78,
      reviewRequired
    }
  };
}
