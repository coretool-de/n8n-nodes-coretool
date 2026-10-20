# Changelog

All notable changes to `n8n-nodes-coretool` are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow [SemVer](https://semver.org/).

## [0.1.0] - unreleased

### Added
- Credential **Coretool API** (`X-API-Key` header, connection test via `GET /v1/auth/test`).
- Node **Coretool** with four operations: Create an E-Invoice (ZUGFeRD PDF, XRechnung CII/UBL), Validate an E-Invoice (KoSIT validator, optional report), Check a Leitweg-ID, Get Usage.
- Readable error messages for API status codes 400, 401, 402, 413, 429 and 503; supports *Continue On Fail*.
- Example workflows in `vorlagen/`.
- API test suite (`npm test`, needs `CORETOOL_TEST_KEY`).
