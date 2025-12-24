# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Panelyt, please report it privately rather than opening a public issue.

**Email:** Send details to the maintainer's email (available in git commit history).

**What to include:**
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We aim to acknowledge reports within 48 hours and provide a fix timeline within 7 days.

## Supported Versions

Only the latest version on the `master` branch receives security updates.

## Security Considerations

When deploying Panelyt:
- Use strong, unique values for `TELEGRAM_API_SECRET`
- Keep database credentials secure and rotated
- Run behind HTTPS in production
- Restrict CORS origins to your actual domains
