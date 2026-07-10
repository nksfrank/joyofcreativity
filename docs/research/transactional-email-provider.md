# Transactional email provider for order-confirmation emails

Scope: choosing a provider to send order-confirmation emails from our single Astro app on the
Cloudflare adapter (Workers/SSR), called from Astro Actions / `src/server/`, bindings via
`Astro.locals.runtime.env`. Sweden-first, EU roadmap. Date: 2026-07-10.

## Constraints this decision must satisfy

- **No monthly subscription** — free / usage-based tiers only, at tens–hundreds of emails/month
  initially. A provider whose only real option is a fixed monthly fee fails.
- **EU data residency / GDPR** — Sweden-first; email content + metadata should ideally stay in the EU.
- **Cloudflare-native** — prefer platform rails; our DNS zone is (likely) on Cloudflare already.
- **Thin, boring, low-lock-in** — a future migration to an off-the-shelf commerce platform is
  possible; don't couple us to a provider-specific model.

## Comparison

| Axis | Cloudflare Email Sending | Resend | Amazon SES | MailerSend | Postmark |
|------|--------------------------|--------|------------|------------|----------|
| **Workers integration** | Native `send_email` binding (`env.EMAIL.send()`), no API keys; runs in-runtime, no Node built-ins needed | Node SDK (thin `fetch` wrapper) or REST; documented Workers guide | REST/SMTP; SigV4 signing (use `aws4fetch`, not the heavy AWS SDK) on Workers; no native binding | REST API (`fetch`) or SDK; no native binding | REST API (`fetch`) or SDK; no native binding |
| **SPF/DKIM/DMARC** | Auto-configured on onboard (SPF TXT + DKIM); DMARC recommended, add manually | SPF (TXT + MX for feedback), DKIM (TXT); DMARC optional | You add domain-verification DKIM CNAMEs (+ optional custom MAIL FROM SPF/MX); DMARC on you | SPF, DKIM, DMARC records provided in dashboard | SPF, DKIM (+ optional custom Return-Path) |
| **Cost (no-subscription fit)** | 3,000 emails/mo free, then $0.35/1k. **Sending to arbitrary recipients requires Workers Paid ($5/mo)** | Free 3,000/mo (100/day cap, 1 domain); next tier $20/mo | Pure pay-as-you-go **$0.10/1k, no subscription** (intro free tier is time-limited) | Free 500/mo; paid tiers start $5.60/mo | Free = 100/mo (test only); cheapest real plan $15/mo. **Fails** |
| **EU data residency** | Cloudflare GDPR/DPA, EEA + US data centers; **no email-service-specific EU-only guarantee found** (Beta) | Can send from `eu-west-1` (Ireland), but **all account data/metadata/logs stored in US** | Full region choice incl. **`eu-north-1` Stockholm**, `eu-west-1`, `eu-central-1` — genuine EU residency | **EU data residency by default** (EU data centers, DPA) | US-based; no EU residency by default |
| **DNS / Cloudflare synergy** | **One-click record insertion** because the zone is on Cloudflare; strongest synergy | Manual records (or Cloudflare API) | Manual CNAME/TXT records | Manual records | Manual records |
| **Lock-in** | Lowest — a binding call over standard email semantics; swap for HTTP in minutes | Low (thin REST) | Low-ish (SigV4 + region config) | Low (REST) | Low (REST) |

## Per-provider notes

### Cloudflare Email Sending (+ Email Routing)

Authoritative source: the local `cloudflare-email-service` skill, corroborated by developers.cloudflare.com.

- **Integration is the strongest fit.** Add `"send_email": [{ "name": "EMAIL" }]` to `wrangler.jsonc`
  and call `env.EMAIL.send({ to, from, subject, html, text })` — no API keys, no SDK, runs in the
  Workers runtime our app already targets. This is a platform rail, not an added dependency.
  ([sending.md]; [Email Service docs](https://developers.cloudflare.com/email-service/))
- **DNS + zone synergy.** Onboarding a domain (`wrangler email sending enable <domain>`, or Dashboard)
  auto-adds SPF (TXT) and DKIM records; because our DNS is on Cloudflare this is effectively
  one-click. Cloudflare also manages IP reputation, soft-bounce retries, suppression lists, and
  feedback loops. Add a DMARC record manually (`v=DMARC1; p=quarantine; ...`).
  ([cli-and-mcp.md]; [deliverability.md]; [deliverability docs](https://developers.cloudflare.com/email-service/concepts/deliverability/))
- **Cost.** 3,000 emails/month included, then **$0.35 per 1,000**. The catch for our constraint:
  sending to *arbitrary* recipients (i.e. customers) requires the **Workers Paid plan ($5/mo)** —
  only sends to verified destination addresses are free on all plans.
  ([pricing](https://developers.cloudflare.com/email-service/platform/pricing/))
- **Limits.** New accounts start with a conservative daily quota that scales with reputation; 50
  recipients/email combined; 5 MiB message size (25 MiB to verified destinations); 998-char subject.
  ([limits](https://developers.cloudflare.com/email-service/platform/limits/))
- **EU residency caveat.** Cloudflare is GDPR-committed with a DPA and EEA data centers, and offers
  the Data Localization Suite for metadata boundaries — but I found **no Email-Service-specific
  statement guaranteeing email content/metadata stays in the EU**, and the product is **Beta**. Treat
  EU residency as "general Cloudflare GDPR posture," not a hard email-level guarantee.
  ([Cloudflare GDPR](https://www.cloudflare.com/trust-hub/gdpr/); [Data Localization Suite](https://developers.cloudflare.com/data-localization/))
- **Transactional-only** by policy — which is exactly our use case (order confirmations).

### Resend

- **Integration** is clean on Workers: the `resend` Node SDK is a thin `fetch` wrapper and Resend
  documents a Cloudflare Workers guide; or call the REST API directly.
  ([Workers guide](https://resend.com/docs/send-with-cloudflare-workers))
- **Cost** fits at our volume: free tier is **3,000/month but capped at 100/day, 1 domain**; the next
  step is a **$20/mo** Pro plan (50k/mo). Fine now; the day-cap and single-domain limit are the
  ceiling. ([pricing](https://resend.com/pricing))
- **EU residency is the disqualifier for the roadmap.** You can pick the `eu-west-1` (Ireland) sending
  region, but Resend states region selection "controls where your emails are routed and sent from. It
  does not control where customer data is stored" — **all account data, email metadata, logs, and API
  records are stored in the US.** ([regions](https://resend.com/docs/dashboard/domains/regions))

### Amazon SES

- **Cost is the best fit for the hard constraint:** pure pay-as-you-go at **$0.10 per 1,000 emails**,
  **no monthly subscription ever**. (The intro free tier — 3,000 message-charges/month — is
  time-limited to the first months, but post-expiry cost at hundreds/month is cents.)
  ([SES pricing](https://aws.amazon.com/ses/pricing/))
- **EU residency is genuine and Sweden-friendly:** SES runs in **`eu-north-1` (Stockholm)**, plus
  `eu-west-1` (Ireland), `eu-central-1` (Frankfurt), etc. — email is processed and sent in-region.
  ([SES endpoints](https://docs.aws.amazon.com/general/latest/gr/ses.html))
- **Integration cost is higher.** No native Cloudflare binding; requests need SigV4 signing. Use a
  lightweight signer (`aws4fetch`) rather than the heavyweight AWS SDK to stay Workers-friendly. New
  accounts start in a **sandbox** (200 emails/24h, 1/sec, verified recipients only) until you request
  production access. ([SES endpoints/quotas](https://docs.aws.amazon.com/general/latest/gr/ses.html))
- DNS: DKIM CNAMEs for domain verification, optional custom MAIL FROM (SPF/MX); DMARC on us.

### MailerSend

- **EU residency by default** (EU data centers, DPA) — a real differentiator over Resend/Postmark for
  an EU-first shop. ([GDPR](https://www.mailersend.com/legal/how-mailersend-stays-gdpr-compliant);
  [DPA](https://www.mailersend.com/legal/data-processing-addendum))
- **Cost:** free **500 emails/month** (covers our initial volume with no subscription); paid tiers
  start at **$5.60/mo** (Hobby, 5k/mo). ([pricing](https://www.mailersend.com/pricing))
- **Integration:** REST API over `fetch` (or SDK); Workers-compatible, no native binding.

### Postmark — fails the cost constraint

- Free tier is **100 emails/month for testing only, no overages**; the cheapest production plan is
  **$15/mo** (10k emails) and Postmark is a **monthly-subscription** model. That is a fixed monthly
  fee for email alone, which the effort explicitly rules out. Excellent deliverability reputation, but
  it does not fit "free/usage-based only." ([pricing](https://postmarkapp.com/pricing))

## Recommendation

**Primary: Cloudflare Email Sending via the Workers binding. Fallback: Amazon SES in `eu-north-1`
(Stockholm) if strict EU residency for email content/metadata becomes a hard requirement.**

Rationale, tied to the constraints:

- **Platform rail + lowest lock-in (decisive).** Cloudflare Email Sending is a binding on the runtime
  we already deploy to — `env.EMAIL.send()`, no SDK, no API-key handling. It is the thinnest, most
  boring option and the easiest to walk away from (the call site is trivially swappable for an HTTP
  call to any other provider if we migrate to an off-the-shelf commerce platform). This directly
  serves "prefer platform rails" and "low-lock-in."
- **Cost is usage-based**, not an email subscription: 3,000/mo free then $0.35/1k. The one asterisk is
  that sending to customers requires the **Workers Paid plan ($5/mo)** — but that is the platform
  baseline for a production Cloudflare storefront regardless of email, and it is a far cry from
  Postmark's $15/mo email-only fee. If we are (or will be) on Workers Paid anyway, email adds ~$0 at
  our volume.
- **Cloudflare zone synergy**: one-click SPF/DKIM, managed reputation/suppressions/bounces.

The honest gap is **EU data residency**: Cloudflare gives a strong general GDPR/DPA posture but no
email-specific EU-only guarantee, and the product is Beta. If, as the EU roadmap firms up, we need a
provable EU-residency story for order data in emails, switch the (thin) send call to **Amazon SES in
`eu-north-1`** — pure pay-as-you-go, no subscription, genuine Stockholm residency. **MailerSend** is
the secondary fallback if we want managed EU residency without taking on AWS/SigV4 (free 500/mo, EU by
default, plain REST).

Resend and Postmark are not recommended: Resend stores all metadata in the US (fails the residency
roadmap), and Postmark fails the no-subscription constraint.

## How it wires into our stack

Recommended (Cloudflare Email Sending, Workers binding):

- **Binding.** Add to `wrangler.jsonc`:
  ```jsonc
  { "send_email": [{ "name": "EMAIL", "allowed_sender_addresses": ["orders@<domain>"] }] }
  ```
  Run `npx wrangler types` so `Env` gains the `EMAIL` binding type.
- **Call site.** Order-confirmation send lives in the Astro Action / `src/server/` surface, reached
  via `Astro.locals.runtime.env.EMAIL.send({ to, from: { email: "orders@<domain>", name: "..." },
  subject, html, text })`. Always include both `html` and `text`. No secret needed — the binding
  authorizes the send; no API key in `env`.
- **DNS.** `npx wrangler email sending enable <domain>` (one-click on Cloudflare-hosted zone) adds
  SPF (TXT) + DKIM. Add DMARC manually: `v=DMARC1; p=quarantine; rua=mailto:dmarc@<domain>`.
- **Local dev.** Add `"remote": true` to the binding to proxy real sends; use test addresses.

Fallback (Amazon SES), for comparison of the wiring delta:

- No binding — call `email.<region>.amazonaws.com` (e.g. `email.eu-north-1.amazonaws.com`) with
  SigV4-signed `fetch` via `aws4fetch`.
- Secrets via `wrangler secret put`: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (read in
  `src/server/` from `locals.runtime.env`). Region pinned to `eu-north-1`.
- DNS: DKIM CNAMEs from SES domain verification; request production access to leave the sandbox.

## Sources

- Cloudflare Email Service docs: https://developers.cloudflare.com/email-service/
- Cloudflare Email Sending pricing: https://developers.cloudflare.com/email-service/platform/pricing/
- Cloudflare Email Sending limits: https://developers.cloudflare.com/email-service/platform/limits/
- Cloudflare Email deliverability: https://developers.cloudflare.com/email-service/concepts/deliverability/
- Local `cloudflare-email-service` skill references: `sending.md`, `cli-and-mcp.md`, `deliverability.md`, `rest-api.md`
- Cloudflare GDPR / Trust Hub: https://www.cloudflare.com/trust-hub/gdpr/
- Cloudflare Data Localization Suite: https://developers.cloudflare.com/data-localization/
- Resend pricing: https://resend.com/pricing
- Resend regions / data storage: https://resend.com/docs/dashboard/domains/regions
- Resend Cloudflare Workers guide: https://resend.com/docs/send-with-cloudflare-workers
- Amazon SES pricing: https://aws.amazon.com/ses/pricing/
- Amazon SES endpoints, regions & quotas: https://docs.aws.amazon.com/general/latest/gr/ses.html
- MailerSend pricing: https://www.mailersend.com/pricing
- MailerSend GDPR: https://www.mailersend.com/legal/how-mailersend-stays-gdpr-compliant
- MailerSend DPA: https://www.mailersend.com/legal/data-processing-addendum
- Postmark pricing: https://postmarkapp.com/pricing

[sending.md]: /Users/niklas.frank/.claude/skills/cloudflare-email-service/references/sending.md
[cli-and-mcp.md]: /Users/niklas.frank/.claude/skills/cloudflare-email-service/references/cli-and-mcp.md
[deliverability.md]: /Users/niklas.frank/.claude/skills/cloudflare-email-service/references/deliverability.md
