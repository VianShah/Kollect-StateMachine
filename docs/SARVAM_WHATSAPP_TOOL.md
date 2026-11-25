# Sarvam agent tool: send a WhatsApp message from the call

The voice agent calls `POST /api/tools/send-whatsapp` mid-call; the server sends
the dashboard-selected approved template through Meta (Vobiz is the fallback).
Source of the Sarvam side: https://docs.sarvam.ai/voice-agents/build/tools/https-tool.md

## 1. Render environment
| Variable | Value |
|---|---|
| `SARVAM_TOOL_SECRET` | a long random string (never commit it) |
| `WHATSAPP_PAYMENT_LINK` | the real payment link (optional; see below) |

## 2. Create the tool in the Sarvam dashboard (Real integration)
- **Name:** `send_whatsapp_link` (snake_case). **Runs:** `run` (callable mid-call).
- **Description:** "Send the borrower the payment details on WhatsApp. Call only after the borrower has asked for it or agreed to receive it."
- **Method / URL:** `POST https://kollect-statemachine.onrender.com/api/tools/send-whatsapp`
- **Auth:** bearer token, secret = `SARVAM_TOOL_SECRET` (enter it in Settings -> Secrets).
- **Headers:** `Content-Type: application/json`
- **Body** (insert the `@` variables with the editor; do NOT let the model fill `phone`):
```json
{
  "phone": "@user_phone",
  "name": "@customer_name",
  "interaction_id": "@interaction_id",
  "templateKey": "paymentReminder"
}
```
- **Max wait:** 10 to 15 s. **On error say:** "I am unable to send it right now, you will get it shortly."
- In the agent instructions: "When the borrower asks for the link on WhatsApp, say you are sending it, then `call tool:send_whatsapp_link`."

## 3. How it is protected
- Shared secret, constant-time compared.
- The number must belong to a Sarvam call this server placed in the last 30 minutes.
- Only `paymentReminder` and `followup` can be sent, never the human-agent escalation.
- One send per number and template every 2 minutes.
- Respects the dashboard mock/live toggle.

## VERIFY (not documented by Sarvam)
- The exact request Sarvam sends, and whether `@user_phone` resolves (it is sent as an agent variable by the call code; the agent must declare `user_phone`). Use Sarvam's Mock tool against postman-echo.com to see the real body.
- Whether `@interaction_id` matches our call id (we only log it).
- Whether a bearer secret is sent as `Authorization: Bearer ...` (the server also accepts `X-Tool-Secret`).
- Sarvam IPs to allow if you add a firewall: 4.213.167.70, 35.154.84.150.
