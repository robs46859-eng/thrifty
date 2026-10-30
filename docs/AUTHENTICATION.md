# Sign-in and cloud scan limits

Thrifty supports Google sign-in and passwordless email codes. Cloud scanning requires a verified server session. Local manual shopping tools and fictional samples remain available without signing in.

| Account                      | Cloud scans per UTC day | Cloud scans per rolling 60 seconds |
| ---------------------------- | ----------------------- | ---------------------------------- |
| Free user                    | 10                      | 3                                  |
| Verified `rob@virtuapet.com` | Unlimited               | Unlimited                          |

Paid additional use is not implemented yet. No payment, subscription or purchased-credit balance is implied.

## 1. Set up Google sign-in

A Vision API key does **not** configure sign-in. You need a Google OAuth **web client ID**:

1. Open [Google Cloud Console](https://console.cloud.google.com/) and select the project for Thrifty. Using the Vision project is optional.
2. Configure **Google Auth Platform** branding, audience and contact information. If customers outside your organization should sign in, choose an external audience. While in testing, add the intended test users, including the admin account if applicable. Follow Google's publishing requirements before allowing the general public.
3. Create an OAuth client with application type **Web application**.
4. Add this **Authorized JavaScript origin**, without a path:

   ```text
   https://worklifelm.com
   ```

5. Copy its client ID (ending in `.apps.googleusercontent.com`). In Hostinger → the `worklifelm.com` website → **Environment variables**, add:

   ```dotenv
   GOOGLE_AUTH_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
   ```

6. Apply changes, restart the application, and reload Thrifty. The Sign in dialog should show Google's sign-in button.

This implementation uses a JavaScript popup credential callback. It does not require a client secret or an OAuth redirect URI. For local development, create a separate test client with the exact local origin you use; do not mix production and browser-test fixture clients.

Google's token signature, audience, issuer and expiration are checked with the official Google Auth Library. A single-use nonce binds the verified token to the browser's sign-in challenge. The server requires a verified email. Gmail accounts and matching Google Workspace hosted domains can sign in directly. For other email domains where Google is not authoritative, Thrifty asks the user to verify the actual mailbox with an email code. In particular, `rob@virtuapet.com` must either be a matching verified Workspace identity or complete the email-code flow before receiving the admin exemption.

References: [Google sign-in setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid), [Google token verification and email ownership](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

## 2. Set up email sign-in

Choose an existing mailbox or transactional mail service allowed to send your sign-in emails. For a **Hostinger Email** mailbox, use these settings (Titan Email, Google Workspace and other providers have different settings):

```dotenv
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=your-existing-sending-mailbox
SMTP_PASSWORD=that-mailbox-password
SMTP_FROM=the-same-sending-email-address
```

Replace the placeholders with the full address of a mailbox you actually own. `SMTP_PASSWORD` is that mailbox's password, not your Hostinger account password or Vision API key. Use the same authenticated address for `SMTP_USER` and `SMTP_FROM` unless your provider explicitly authorizes another sender. Configure the sending domain's mail authentication as required by your email provider.

Add these variables individually in Hostinger, preserving all existing values, apply changes and restart the app. Do not commit a populated `.env` file or send passwords in chat. Port 587 is also supported, with required STARTTLS; port 465 uses TLS immediately. Certificate verification is never disabled. See [Hostinger Email configuration](https://www.hostinger.com/support/1575756-how-to-get-email-account-configuration-details-for-hostinger-email/) and [Nodemailer SMTP transport](https://nodemailer.com/smtp).

A user enters their email in Thrifty, requests a six-digit code, and enters it in the same browser. No account password is stored by Thrifty. Codes expire after 10 minutes, are single-use and allow at most five guesses. Resending invalidates the previous code. Delivery failures are reported honestly; the code is not returned to the browser, printed to logs, or substituted with a demo code.

## 3. Verify setup before enabling cloud scans

1. Open `/api/auth/session` in the app's browser. `configured: true` means a sign-in option and private auth storage initialized. `googleClientId` and `emailEnabled` show which methods are available; these fields do not validate an external account or prove mail delivery.
2. Sign in using Google with an authorized test user, then sign out and verify that cloud requests require sign-in again.
3. Request and receive an actual email code, verify it, and confirm reload persistence and sign-out.
4. Sign in as `rob@virtuapet.com` through a verified route. The Account dialog should show **Administrator · unlimited scans**. Merely typing the admin address does not create an admin session.
5. Confirm that a regular account shows **10 scans per day, 3 per minute**.
6. With the Vision API enabled and billing/restrictions configured in its project, set `VISION_PROVIDER=google` and retain `GOOGLE_VISION_API_KEY`. Restart the app. Opt in to cloud analysis on the scanner and verify a controlled image. The sign-in OAuth client and the Vision API key serve different purposes.

Unauthenticated cloud requests return 401 when sign-in is configured. Missing sign-in setup returns 503 with `AUTH_SETUP_REQUIRED`; no provider is called in either case. Missing/invalid CSRF proof returns 403. Scan limits return 429 with `Retry-After` and a distinct minute/day code. Private-store failures fail closed before provider access. Google/Azure image analysis never grants access or decides admin status.

## Storage and account boundary

The server stores verified identities, hashed opaque session tokens, hashed one-time codes, sign-in challenge state and usage counters in SQLite. On production, the default path is:

```text
<hosting account home>/.thrifty/worklifelm.com/auth.sqlite
```

This location is outside `public_html`, deployment builds and static output. A sibling `.key` file holds an automatically generated OTP hashing key. Files are owner-only; newly created private directories are owner-only. `AUTH_DB_PATH` can override the path with another absolute private location; public/build paths and direct file symlinks are rejected. In development the default is the ignored `.thrifty-data/auth.sqlite` under the checkout. Node 22.13+ with `node:sqlite` support is required. If storage cannot initialize, cloud scanning stays locked; the server does not silently use process-local quota counters instead.

The database survives Node process restarts and deployments when the same private location is retained. Back it up consistently with SQLite-aware tooling, protect the backup and keep its sibling key private. Deleting or moving the database resets account identities and usage; do not put it into a release directory or deliberately reset it to bypass quotas.

Sessions expire after 12 hours and are revoked on sign-out. HTTPS cookies are host-only, `Secure`, `HttpOnly` and `SameSite=Strict`; session tokens and Google credentials are not stored in localStorage. Auth and scan mutations require matching-origin requests and CSRF proof. Auth responses are not cached by the app service worker.

Inventory, profiles, goals and listing drafts remain browser-local. Each signed-in account gets a separate workspace key. The existing guest workspace is preserved and is not automatically copied into an account. To migrate guest records, export the guest workspace, sign in, and import that backup. Signing out hides the account workspace in the UI but does not encrypt or erase browser storage; anyone with direct access to the browser's stored files can still inspect it. Sign-in is not cloud inventory sync or encrypted-at-rest client storage. After an offline reload, guest manual tools are available; reopening an account workspace requires online session verification.

## Quota semantics

Free users receive 10 provider attempts per UTC day and 3 per rolling 60-second window. Every reservation is committed atomically in a shared SQLite transaction before calling the provider, so concurrent requests and multiple app workers cannot race past a user's allowance. The counter belongs to the verified account, not a client-supplied email, localStorage value or IP address. Verified Google/email logins for the same mailbox share the account; conflicting Google-subject links are rejected.

A timeout, upstream rejection or manual fallback after a provider request retains its reservation because it may still have incurred provider usage. Manual-only requests, sample items, malformed images and calls when no Vision provider is configured do not consume cloud quota. User agents can continue using manual tools after exhausting their allowance.

Unlimited means exemption from Thrifty’s scan quotas; the AI provider and hosting platform still enforce their own service limits.

The admin address is fixed on the server and compared against the verified identity. It bypasses both scan quotas and the previous IP scan throttle. File format/size validation, request timeouts, session verification, CSRF checks and sign-in abuse protections still apply. Sign-in challenges, code sending and code guessing have separate persistent abuse limits; these are not cloud scan quotas. Behind a reverse proxy, IP-based sign-in limits may aggregate users because arbitrary forwarded-IP headers are not trusted.

## Validation boundary

Tests exercise actual Google-library signature/audience/issuer/expiry checks with locally signed fixtures, email-code lifecycle with a captured local mail transport, HTTP sessions/CSRF, atomic limits, admin exemptions, restart persistence and browser workspace separation. The browser fixture server is loopback-only, refuses production mode and is excluded from the production entry graph. It provides no deployed test-login endpoint. Fixtures are not evidence of live Google consent, real SMTP delivery, or a credentialed Vision call; those require the configuration and acceptance steps above.
