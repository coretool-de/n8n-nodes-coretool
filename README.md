# n8n-nodes-coretool

This is an n8n community node. It lets you use the **Coretool E-Invoice API** (https://coretool.de) in your n8n workflows.

Coretool creates and validates German/EU e-invoices: **ZUGFeRD 2.x** (PDF with embedded XML) and **XRechnung** (CII or UBL XML), checks **Leitweg-IDs** for invoices to public authorities and reports the remaining quota of your API key.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

[Installation](#installation)
[Operations](#operations)
[Credentials](#credentials)
[Compatibility](#compatibility)
[Usage](#usage)
[Resources](#resources)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

Package name: `n8n-nodes-coretool`

## Operations

| Operation | What it does | Costs a call? |
| --- | --- | --- |
| **Create an E-Invoice** | Builds a ZUGFeRD PDF or XRechnung XML from invoice data (seller, buyer, line items, payment) and returns it as a binary file plus the calculated totals. | yes |
| **Validate an E-Invoice** | Uploads a PDF or XML (max. 5 MB) and validates it with the official KoSIT validator. Optionally returns the full report. | yes |
| **Check a Leitweg-ID** | Checks the syntax and check digit of a German Leitweg-ID. An invalid ID is a normal result (`valid: false`), not a failure. | yes (empty input is free) |
| **Get Usage** | Returns the plan and remaining calls of the API key. | no |

### Create an E-Invoice – fields

- **Format**: `zugferd` (PDF), `xrechnung_cii` or `xrechnung_ubl` (XML)
- **Invoice Number**, **Invoice Date**, **Delivery Date** (only the date part is used)
- **Seller** / **Buyer**: name, street, ZIP code, city, country (default `DE`), tax number (seller), VAT ID, email, phone
- **Line Items**: enter them as fields or paste a JSON array (`description`, `quantity`, `unit`, `unit_price`, `tax_rate`)
- **Payment**: IBAN (required), BIC, bank name, due in days (max. 365) or due date, terms
- **Additional Fields**: currency, Leitweg-ID, buyer reference, order reference, notes, tax exemption (small business § 19 UStG, reverse charge, intra-community supply, § 4 UStG, rental), PDF template (`classic`, `modern`, `dezent`, `clean`), accent colour and logo (PDF only)

The created file is written to the binary field you choose (default `data`). The JSON output contains `filename`, `mime_type`, `net_total`, `tax_total`, `gross_total`, `amount_due`, `totals`, `validation` and `usage`.

## Credentials

1. Sign in at https://coretool.de and create an API key (menu **API keys**). Keys start with `ct_live_`.
2. In n8n create a **Coretool API** credential and paste the key. The credential test calls `GET /v1/auth/test`, which does not cost a call.

For trying out the node you can also create a test key (`ct_test_…`) in your account, see https://coretool.de/e-rechnung-api#testmodus. New keys include a few free calls; see https://coretool.de/e-rechnung-api#kontingent for plans.

## Compatibility

Built and tested with n8n 2.x (last manual test: n8n 2.44.4, Node.js 22). The node uses only n8n's built-in HTTP helpers and has no runtime dependencies.

## Usage

Example workflows are included in the [`examples`](https://github.com/coretool-de/n8n-nodes-coretool/tree/main/examples) folder of the repository – import them via **Workflows → Import from file**:

- [`create-e-invoice-from-webhook.json`](https://github.com/coretool-de/n8n-nodes-coretool/blob/main/examples/create-e-invoice-from-webhook.json) – Webhook receives invoice data → Create an E-Invoice → send the PDF by e-mail
- [`validate-e-invoice-file.json`](https://github.com/coretool-de/n8n-nodes-coretool/blob/main/examples/validate-e-invoice-file.json) – Read a file from disk → Validate an E-Invoice → IF valid
- [`check-leitweg-id.json`](https://github.com/coretool-de/n8n-nodes-coretool/blob/main/examples/check-leitweg-id.json) – Manual trigger → Check a Leitweg-ID

Quick start without importing:

1. Add a **Manual Trigger** and a **Coretool** node, select your **Coretool API** credential.
2. Choose **Get Usage** and click **Execute workflow** – the output shows your plan and remaining calls.
3. Switch to **Check a Leitweg-ID** and enter e.g. `04011000-1234512345-06` – the output contains `valid: true`.
4. Switch to **Create an E-Invoice**, fill in seller, buyer, one line item and the IBAN – the output contains the e-invoice as binary file `data` plus the totals.

### Error handling

The node translates API responses into readable messages that tell you what to do:

- **401** – API key invalid or revoked: create a new key at coretool.de and update the credential
- **402** – no calls left (free calls used up or plan limit reached)
- **413** – file larger than 5 MB
- **429** – too many requests: the message contains the seconds to wait
- **503** – validation service briefly unavailable: try again in a minute
- **400** – missing or invalid invoice data: the description lists the affected fields

Enable **Continue On Fail** on the node to receive these messages in the `error` field of the output item instead of stopping the workflow.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [Coretool E-Invoice API](https://coretool.de/e-rechnung-api)
- Support: info@coretool.de

## Development

```bash
npm ci
npm run lint
npm run build
CORETOOL_TEST_KEY=ct_test_... npm test   # runs the API tests against api.coretool.de (use a test key)
```

Without `CORETOOL_TEST_KEY` the tests are skipped. By default the tests load a small stub instead of the `n8n-workflow` package; set `CORETOOL_REAL_N8N_WORKFLOW=1` to run them against the installed `n8n-workflow`.

Releases are published to npm exclusively by the GitHub Actions workflow `.github/workflows/publish.yml` (npm trusted publishing with provenance), triggered by a version tag.

## License

[MIT](LICENSE) – © 2026 Coretool (Tim Tüchsen)

## Notes from the API tests (2026-10-20)

- A Leitweg-ID is only accepted for the XRechnung formats (`xrechnung_cii`, `xrechnung_ubl`), not for ZUGFeRD.
- XRechnung requires a seller phone number (`seller.phone`, rule BR-DE-6); the API returns a clear 400 error otherwise.
