# Changelog

All notable changes to `n8n-nodes-coretool` are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow [SemVer](https://semver.org/).

## [0.1.1] - 2026-10-21

### Changed
- Example workflows moved from `vorlagen/` to `examples/` with English file names; README links them directly and adds a quick start.
- README: test keys (`ct_test_`) for trying out the node, tested n8n version.
- No changes to the node or credential code.

## [0.1.0] - 2026-10-21

### Added
- Credential **Coretool API** (`X-API-Key` header, connection test via `GET /v1/auth/test`).
- Node **Coretool** with four operations: Create an E-Invoice (ZUGFeRD PDF, XRechnung CII/UBL), Validate an E-Invoice (KoSIT validator, optional report), Check a Leitweg-ID, Get Usage.
- Readable error messages for API status codes 400, 401, 402, 413, 429 and 503; supports *Continue On Fail*.
- Example workflows.
- API test suite (`npm test`, needs `CORETOOL_TEST_KEY`).
