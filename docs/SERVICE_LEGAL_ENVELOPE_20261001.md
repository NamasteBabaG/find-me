# Service and public policies — 1 October 2026

## Scope and approved business facts

This release adds the adult service envelope only. It does not alter art, world selection, generation models, judgement, retry policy, prices, provider credentials or payment integration. The third world remains outside this work.

The owner supplied the business name, registration number, postal address, active product support mailbox and phone for publication on the website. Their values live in ignored local configuration / the QA deployment environment, not in this public repository. The corporate and other-product mailboxes are not displayed here. No opening hours, response-time SLA, accessibility certification, or provider zero-retention setting is invented.

Public details are configured through `src/lib/business-profile.ts` from LEGAL_BUSINESS_NAME, LEGAL_BUSINESS_NUMBER, LEGAL_BUSINESS_ADDRESS, SUPPORT_EMAIL, SUPPORT_PHONE and optional SUPPORT_HOURS. Missing fields show a prelaunch notice; an invalid email is not rendered as an actionable address. Do not use an unverified forwarding address. These values are public website facts but may include identifiers that should not be replicated into source control.

The owner delegated selection of a fair cancellation policy. The commercial promise chosen is a full refund requested within 14 days of purchase or game delivery, whichever is later, including delivered personalised games and without a cancellation fee. A repair is optional, never a condition of that refund. Statutory protections and more favourable rights remain unaffected. Refund handling is manual through the existing order/payment workflow, not executed by the public form. This is an ongoing commercial commitment.

## Public routes and integration

- `/support`: anonymous service, cancellation, privacy and accessibility notices.
- `/privacy`: purpose, voluntariness, children/parental permission, providers/overseas processing, sharing, browser storage, retention and access/correction/deletion requests.
- `/terms`: adult purchase, selected worlds, one-time payment, AI illustration limits, authorised photos, personal/family use, service and mandatory rights.
- `/cancellation`: full policy and a form preselected to cancellation.
- `/accessibility`: implemented features, known visual-game limitations and assistance route. No false AA compliance claim.

All routes are Hebrew/English using the visitor's locale, with metadata, a section index, existing site typography, responsive layout and the operator's real contact details. The footer links them, including a distinct cancellation link on the homepage. Create steps also show the footer. Photo upload includes a layered AI/privacy notice before parental permission; checkout discloses the commercial refund promise and requires current-version terms acceptance on both client and server. `checkout:terms-accepted` records the policy version, locale, order, price and currency before contacting a payment provider. No marketing consent is bundled in.

## Durable service workflow

The form posts to `/api/support`. It does not require account authentication, an order number, a cancellation reason, a child photo, an ID document or payment details. It requires a reply email, supports optional order information and message, and discourages sensitive uploads.

Only a committed DB record returns success. Its unguessable reference and original server receipt time are printable. The client preserves the idempotency key for the same failed submission; retries after a lost response return the original receipt. Reusing the key for different content fails. The response has no-store headers and contains no account information.

The endpoint checks QA access where applicable, same-origin JSON requests, bounded streamed request size, field validation, a honeypot and the existing per-process rate limiter. The limiter is not a distributed spam defence; revisit it if traffic requires that. Runtime error output excludes submitted messages and email addresses. No request triggers generation, a refund or external email.

`/admin/support` requires an administrator at page and server-action boundaries. It shows received notices, receipt times, reply emails, topics and optional order/message details, with pagination and open/resolved views. Resolving records an admin event; it does not send a reply, execute a refund, or cancel a game. There are no anonymous ticket-read endpoints.

Staff must check this inbox, answer through the product mailbox, verify the purchase where necessary, and execute eligible refunds promptly enough to meet the published 14-day promise. Use the existing order/refund workflow and verify game access changes; do not treat the receipt screen or the resolved marker as proof of a refund. Privacy requests require proportionate ownership/guardian verification, not collection of an ID document by default.

The existing hourly retention maintenance redacts submitted support personal content after one calendar year while retaining receipt identifiers/times and resolution audit records. It does not redact order records or game audit events. The retention statement separates live deletion from backups and provider retention. Operational ownership of the inbox is still necessary; no email alert or customer acknowledgement email is claimed.

## Sources and legal review boundary

Research used official guidance, not a competitor's copied policy:

- Privacy Protection Authority, [duty to inform, updated for Amendment 13](https://www.gov.il/BlobFolder/legalinfo/duty_to_notify/he/notify13.pdf): layered disclosure of purposes, voluntary provision/consequences, recipients, controller contact and access/correction rights, including AI processing.
- Consumer Protection Authority, [consumer guide](https://www.gov.il/BlobFolder/generalpage/general_tuota/he/HB_Brushur_SITE.PDF) and [distance purchase information](https://www.gov.il/BlobFolder/generalpage/information-olim-consumerism/he/smart-consumerism-he.pdf). Personalised digital content classification is not used as a blanket denial of cancellation. The clearer voluntary refund policy avoids making that unresolved classification a customer-facing refusal rule.
- Commission for Equal Rights of Persons with Disabilities, [accessibility statement guidance](https://www.gov.il/he/pages/declaration_website_accessibility?chapterIndex=1): describe actual arrangements, limitations and contact, without claiming an unaudited standard.
- OpenAI, [API data controls](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint): service-side deletion is distinct from provider retention/account settings. No unverified account-level training or zero-retention guarantee is published.

Official gov.il full-page/PDF fetches returned 403 in this environment; their indexed official excerpts were accessible. No statutory text was copied verbatim. This implementation and research are not a legal opinion or a certification of compliance.

Before public production launch, obtain a focused review of the actual service and these documents: business identity/address suitability, digital personalised product classification and transaction disclosure, any special statutory cancellation periods, children/AI processing, supplier agreements and international transfer arrangements, any controller registration/notification or DPO obligation, and accessibility applicability/audit. Verify records security, backups and actual retention execution. Financial invoice issuance and a durable purchase-confirmation/disclosure document belong with the real payment implementation; a terms-acceptance audit event is not a tax invoice or a complete purchase document.

## Validation and release status

Focused tests cover real isolated SQLite persistence, duplicate retries, key conflicts, resolution records, pagination and redaction; endpoint origin, payload, input, rate and storage-failure gates; and missing/stale checkout acceptance. All fixtures are synthetic, with no customer DB or paid provider calls.

Validation: the full suite passed 294 files / 3,769 tests, with 2 expected failures and 55 skips; type checking passed. A subsequent local browser test found Next's internal localhost URL differed from the public request origin. The support endpoint now accepts only configured APP_URL / Vercel deployment origins, not arbitrary Host headers; the expanded nine-case endpoint suite passed. The production build and the private-asset packaging audit passed with no leaks or packaging problems. Local HTTP checks returned 200 for all five service pages. Browser verification covered English privacy, Hebrew cancellation and a real synthetic form submission through the local server/database. A mobile 390×844 check found no horizontal overflow and showed the persisted receipt. No customer cancellation or email was sent. The receipt screenshot is local ignored evidence.

Do not replace the active QA deployment during the owner's real-game evaluation without checking its state. No production deployment, unpause, real refund, child upload, mail send or provider request is authorised by this service-page implementation itself.
