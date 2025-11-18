# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly:

1. **Do not** open a public GitHub issue
2. Report privately via [GitHub Security Advisories](https://github.com/[org]/[repo]/security/advisories/new)
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if available)

We will acknowledge receipt within 48 hours and provide an update on our response timeline.

## Security Practices

### Dependency Scanning

- **CI**: Production dependencies are audited on every push/PR via `npm audit --omit=dev`
- **Local**: Run `npm run audit:prod` before committing changes that modify dependencies
- **Frequency**: Review audit results weekly or when adding/updating dependencies

### Runtime Dependencies

This playground has minimal runtime dependencies:
- `react` and `react-dom` (production only)
- All other packages are devDependencies and not included in the deployed bundle

### Browser Security

The playground runs entirely client-side with no backend. All data stays in the browser:
- No data is sent to external servers (except optional Appwrite integration)
- Scenarios and events are stored in `localStorage` only
- No authentication or user data collection

## Security Updates

Security updates are applied promptly when vulnerabilities are discovered in production dependencies. Check the [changelog](docs/enablement/release-notes.md) for security-related updates.
