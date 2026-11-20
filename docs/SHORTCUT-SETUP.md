# iPhone Messages → Family Finance

## Trigger caveat
In Shortcuts, create a Personal Automation with the **Message** trigger. Apple exposes sender and message-contains filters. Test whether your iOS version permits an unrestricted sender/content filter combination. If it requires filters, create a small set of automations for the bank sender IDs and common transaction phrases. Do not assume that Shortcuts can scan the historical Messages inbox.

## Actions
1. Add a **Get Contents of URL** action.
2. URL: `https://YOUR-RAILWAY-DOMAIN/api/v1/messages`
3. Method: `POST`
4. Headers:
   - `Content-Type`: `application/json`
   - `Authorization`: `Bearer YOUR_DEVICE_API_TOKEN`
5. Request body: JSON
   - `source`: `iphone_shortcuts`
   - `sender`: Shortcut's `Sender` variable
   - `received_at`: current date/time in ISO 8601 format (use the message date if exposed by the trigger)
   - `message`: Shortcut's `Message` variable
   - `device_id`: a stable label such as `akshay-iphone`
6. Set the automation to run immediately / without asking, if the iOS version presents that option.
7. Test with a non-sensitive sample transaction alert first.

## Security
- Keep the bearer token private. Do not put it in a public shared Shortcut or repository.
- Never forward OTPs, login codes, PINs, CVVs, full card numbers or bank credentials.
- The initial parser is conservative and may send uncertain transactions to review.
- The backend stores the message body for audit/reconciliation. Before production use, decide whether to retain full SMS text or store only extracted fields; consider a short retention period.
