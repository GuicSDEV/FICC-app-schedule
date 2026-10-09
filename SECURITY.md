# Security

How FICC App Schedule protects member and guest data, what was audited, and what production must
set up. Report a vulnerability privately to the maintainer (GitHub: @GuicSDEV), not in a public
issue.

## Secrets

- `.env` has never been committed (gitleaks over the full history: 0 leaks). Only `.env.example`,
  with development placeholders, is in the repository.
- Production must set its own values (`openssl rand -base64 32`, one per variable). The API
  refuses to start in production when one is missing, when a secret is still a `.env.example`
  placeholder, or when the JWT and guest-pass secrets are the same:
  - `JWT_ACCESS_SECRET`: signs the 15-minute httpOnly access cookies.
  - `GUEST_PASS_SECRET`: signs guest QR codes. Different from the JWT secret.
  - `DATA_ENCRYPTION_KEY`: 32 bytes, base64. Encrypts guest documents (AES-256-GCM) and keys their
    lookup hash (HMAC-SHA256), both derived with HKDF. **Keep a copy in a password manager or the
    host's secret store: if it is lost, stored guest documents cannot be read again.**
  - `DATABASE_URL` and `REDIS_URL`: production credentials, never the development `ficc:ficc`.
    Redis must require a password (and TLS, `rediss://`, when it is reached over the internet).

## Dependencies

- `pnpm audit` passes. Vulnerable transitive packages are pinned to patched versions in
  `pnpm-workspace.yaml` (`overrides`, each with its advisory); vitest was upgraded to 4.x for the
  tinypool and mocker advisories.
- Two advisories have no patched release upstream and only affect tooling, never the running apps;
  they are listed under `auditConfig.ignoreGhsas` with their path (`braces` via the Next.js ESLint
  plugin, `sprintf-js` via Jest).
- Supply chain (`pnpm-workspace.yaml`): `blockExoticSubdeps` (no git/tarball transitive
  dependencies), `trustPolicy: no-downgrade` (a release without provenance after provenance-signed
  ones is refused; reviewed exceptions in `trustPolicyExclude`) and `minimumReleaseAge: 1440`
  (only releases at least one day old).
- Dependabot (`.github/dependabot.yml`) opens weekly update PRs and immediate security PRs.

## Application controls

- **Guest documents (LGPD):** encrypted at rest; the GCM tag must be the full 16 bytes; screens
  show masked numbers; a nightly job anonymizes them after `guestDataRetentionDays` (default 90).
- **Tenancy:** every club-owned table has `clubId`; the Prisma tenant extension scopes every query
  to the request's club.
- **Access:** role and permission guards on every route; the super admin cannot remove their own
  access; every staff write is in the audit log with passwords and tokens masked.
- **Bookings:** one `SlotOccupancy` row per court + date + slot, created in a serializable
  transaction, so two bookings can never take the same court; booking, court holds and partner
  requests are rate limited.
- **Sessions:** httpOnly, SameSite cookies (Secure in production); passwords hashed with argon2.

## Checks to run

```bash
pnpm audit
gitleaks detect --log-opts="--all --full-history"
semgrep scan --config p/owasp-top-ten --config p/typescript --config p/nodejs
```
