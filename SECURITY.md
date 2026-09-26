# Security Policy

## Reporting a Vulnerability

Please do not report security vulnerabilities through public GitHub issues.

If you discover a security vulnerability in LexFlow, please use GitHub's private vulnerability reporting feature:

**Repository → Security → Advisories → Report a vulnerability**

This allows the report to be shared privately with the repository maintainers.

If private vulnerability reporting is unavailable, please contact the repository maintainers privately before disclosing the vulnerability publicly.

## What to Include

Please include as much of the following information as possible:

- Affected endpoint, file, or component
- Steps to reproduce the issue
- Expected behavior
- Actual behavior
- Potential security impact
- Relevant logs, screenshots, or proof-of-concept details
- Any suggested mitigation, if available

Please avoid including real user data, credentials, API keys, tokens, or other sensitive information in the report.

## What to Expect

We will acknowledge a valid security report as soon as reasonably possible and will investigate the issue privately.

The project does not currently provide a guaranteed response or remediation SLA.

Security issues will be assessed based on their impact and urgency. When appropriate, we will coordinate with the reporter on a fix before public disclosure.

## Supported Versions

This project is under active development.

| Version / Branch | Security Support |
| --- | --- |
| `develop` | Supported |
| `main` | Supported |
| Older branches | Not supported |

## Scope

Security reports concerning the LexFlow application and its authentication, authorization, case-data access, input validation, payment verification, e-signature verification, and related application functionality are in scope.

The following are out of scope:

- Demo data in `seed.sql`
- Example values in `.env.example`
- Localhost-only development behavior
- Issues that require access to secrets that are not intended to be publicly available
- Vulnerabilities that only affect an intentionally modified local development environment