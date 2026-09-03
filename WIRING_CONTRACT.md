# PayChad Wiring Contract

Every user-visible action must have a real destination.

For each feature, trace:

`UI -> handler -> validation -> wallet/API -> contract/database -> result/event -> indexer/backend -> database -> UI refresh`

Only include layers that belong to the feature, but never leave a meaningful action without a real state transition or an explicit unavailable state.

## Blockchain writes
Every write exposes lifecycle state: idle, validating, wallet confirmation, submitted, pending, confirmed, indexed/settled, and failure. Wallet rejection, wrong network, insufficient funds/allowance, contract revert, RPC failure and indexing delay must remain distinguishable.

## Backend writes
Retryable mutations require idempotency. Blockchain event records require unique event identity. Scheduled payroll must have a durable execution key and must not execute twice after a worker restart.
