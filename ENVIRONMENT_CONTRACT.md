# PayChad Environment Contract

## Public/browser-safe
- `NEXT_PUBLIC_API_URL`: PayChad API base URL.
- `NEXT_PUBLIC_MONAD_RPC_URL`: browser RPC if required by the wallet stack; do not treat it as a secret.
- `NEXT_PUBLIC_MONAD_EXPLORER_URL`: explorer base URL.
- `NEXT_PUBLIC_MONAD_CHAIN_ID`: validated chain identifier.
- `NEXT_PUBLIC_USDC_ADDRESS`: verified network-specific USDC address.
- `NEXT_PUBLIC_EMPLOYEE_REGISTRY_ADDRESS`: deployed registry address.
- `NEXT_PUBLIC_PAYROLL_MANAGER_ADDRESS`: deployed payroll manager address.

## Server-only
Database URLs, signing keys, admin credentials, private RPC credentials and other secrets must remain server-only and must never use a `NEXT_PUBLIC_` prefix.

Every environment variable must be validated at process startup. Production must fail closed on missing required secrets/configuration rather than silently using development defaults.

Monad addresses must be verified against current official Monad documentation and deployment artifacts before production configuration is committed.
