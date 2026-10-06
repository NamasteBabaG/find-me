The public `supabase-root-ca.crt` is the Supabase Root 2021 CA linked by the
production project's Database Settings, downloaded on 2026-10-06 from:
https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt

It contains no private key or project credentials. Its SHA-256 certificate
fingerprint is pinned by the build audit. Next traces it into server functions.
PostgreSQL builds also trace the credential-free generated schema so Prisma
keeps its source schema directory instead of falling back to the client folder.

Prisma 6's generated PostgreSQL schema lives in `prisma/generated`. Production
requires `sslmode=require&sslaccept=strict&sslcert=../supabase-root-ca.crt`, so
certificate verification uses this trust anchor without disabling hostname or
chain verification. Supabase transaction-pool connections also use
`pgbouncer=true&connection_limit=1`. Migrations use a separate privileged path.

An actual strict-TLS runtime probe and deployed health check are required in
addition to the packaging audit. Before the certificate expires in April 2031,
obtain Supabase's replacement from its authenticated settings and review the
fingerprint change; never substitute a certificate supplied by a failed peer.
