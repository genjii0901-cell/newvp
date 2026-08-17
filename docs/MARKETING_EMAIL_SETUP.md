# Marketing email setup

The app only sends to Free users who have explicitly enabled marketing email.
It never sends promotional email to every existing account automatically.

## One-time Supabase setup

Run `docs/migrations/add-marketing-email.sql` in Supabase SQL Editor.

## One-time Vercel setup

Add these Production environment variables. Mark both as Sensitive.

```text
RESEND_API_KEY=<Resend API key>
RESEND_FROM_EMAIL=Vocab Print Pro <info@your-verified-domain>
```

`RESEND_FROM_EMAIL` must use a domain verified in Resend. Do not use the
Supabase SMTP credentials here. After saving the variables, redeploy once.

Optional but recommended:

```text
MARKETING_EMAIL_UNSUBSCRIBE_SECRET=<long random secret>
```

Without the optional secret, the existing admin session secret is used to sign
unsubscribe URLs. Rotating that secret invalidates old unsubscribe URLs, so a
dedicated long random value is preferable.

## Sending

1. Open `/admin` and choose `メール配信`.
2. Check the recipient count. Only opted-in Free accounts are eligible.
3. Send a test email to yourself and check its unsubscribe link.
4. Enter `SEND` and confirm the final dialog.

Resend shows delivery events in its Emails dashboard. This app records the
campaign and queued recipient IDs in Supabase for an audit trail.
