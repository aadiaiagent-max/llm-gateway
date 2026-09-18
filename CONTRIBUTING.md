# Contributing

## Setup

```bash
npm install
```

## Checks

```bash
npm test
npm run typecheck
npm run build
```

## Notes

- Tests use Vitest (`vitest run`).
- Rate-limit errors expose `toHeaders()` (`Retry-After`, `X-RateLimit-*`) for HTTP adapters.
- Failed providers are skipped for `unhealthyCooldownMs` so failover does not hammer a down upstream.
