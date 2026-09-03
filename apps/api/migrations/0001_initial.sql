CREATE TABLE companies (
    chain_id BIGINT NOT NULL CHECK (chain_id > 0),
    company_id NUMERIC(78, 0) NOT NULL CHECK (company_id > 0),
    owner_address TEXT NOT NULL CHECK (owner_address ~ '^0x[0-9a-fA-F]{40}$'),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (chain_id, company_id),
    CONSTRAINT companies_owner_unique UNIQUE (chain_id, owner_address)
);

CREATE TABLE employees (
    chain_id BIGINT NOT NULL CHECK (chain_id > 0),
    company_id NUMERIC(78, 0) NOT NULL,
    employee_id BIGINT NOT NULL CHECK (employee_id > 0),
    wallet_address TEXT NOT NULL CHECK (wallet_address ~ '^0x[0-9a-fA-F]{40}$'),
    salary_base_units NUMERIC(78, 0) NOT NULL CHECK (salary_base_units > 0),
    active BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (chain_id, company_id, employee_id),
    CONSTRAINT employees_company_fk
        FOREIGN KEY (chain_id, company_id)
        REFERENCES companies (chain_id, company_id)
        ON DELETE RESTRICT
);

CREATE INDEX employees_company_active_idx
    ON employees (chain_id, company_id, active);

CREATE TABLE blockchain_transactions (
    chain_id BIGINT NOT NULL CHECK (chain_id > 0),
    transaction_hash TEXT NOT NULL CHECK (transaction_hash ~ '^0x[0-9a-fA-F]{64}$'),
    block_number BIGINT NOT NULL CHECK (block_number >= 0),
    block_hash TEXT NOT NULL CHECK (block_hash ~ '^0x[0-9a-fA-F]{64}$'),
    transaction_index BIGINT NOT NULL CHECK (transaction_index >= 0),
    confirmed_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (chain_id, transaction_hash),
    CONSTRAINT blockchain_transactions_position_unique
        UNIQUE (chain_id, block_number, transaction_index)
);

CREATE TABLE indexed_events (
    chain_id BIGINT NOT NULL CHECK (chain_id > 0),
    block_number BIGINT NOT NULL CHECK (block_number >= 0),
    transaction_hash TEXT NOT NULL CHECK (transaction_hash ~ '^0x[0-9a-fA-F]{64}$'),
    log_index BIGINT NOT NULL CHECK (log_index >= 0),
    block_hash TEXT NOT NULL CHECK (block_hash ~ '^0x[0-9a-fA-F]{64}$'),
    contract_address TEXT NOT NULL CHECK (contract_address ~ '^0x[0-9a-fA-F]{40}$'),
    event_name TEXT NOT NULL,
    event_data JSONB NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (chain_id, block_number, transaction_hash, log_index),
    CONSTRAINT indexed_events_transaction_fk
        FOREIGN KEY (chain_id, transaction_hash)
        REFERENCES blockchain_transactions (chain_id, transaction_hash)
        ON DELETE RESTRICT
);

CREATE INDEX indexed_events_contract_block_idx
    ON indexed_events (chain_id, contract_address, block_number);

CREATE TABLE payroll_runs (
    chain_id BIGINT NOT NULL CHECK (chain_id > 0),
    company_id NUMERIC(78, 0) NOT NULL,
    run_id BIGINT NOT NULL CHECK (run_id > 0),
    created_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    total_paid_base_units NUMERIC(78, 0) CHECK (total_paid_base_units > 0),
    employee_count BIGINT CHECK (employee_count > 0),
    PRIMARY KEY (chain_id, company_id, run_id),
    CONSTRAINT payroll_runs_company_fk
        FOREIGN KEY (chain_id, company_id)
        REFERENCES companies (chain_id, company_id)
        ON DELETE RESTRICT,
    CONSTRAINT payroll_runs_completion_consistency
        CHECK (
            (completed_at IS NULL AND total_paid_base_units IS NULL AND employee_count IS NULL)
            OR
            (completed_at IS NOT NULL AND total_paid_base_units IS NOT NULL AND employee_count IS NOT NULL)
        )
);

CREATE INDEX payroll_runs_company_created_idx
    ON payroll_runs (chain_id, company_id, created_at DESC);

CREATE TABLE payroll_payments (
    chain_id BIGINT NOT NULL CHECK (chain_id > 0),
    company_id NUMERIC(78, 0) NOT NULL,
    run_id BIGINT NOT NULL,
    employee_id BIGINT NOT NULL,
    recipient_address TEXT NOT NULL CHECK (recipient_address ~ '^0x[0-9a-fA-F]{40}$'),
    amount_base_units NUMERIC(78, 0) NOT NULL CHECK (amount_base_units > 0),
    block_number BIGINT NOT NULL CHECK (block_number >= 0),
    transaction_hash TEXT NOT NULL CHECK (transaction_hash ~ '^0x[0-9a-fA-F]{64}$'),
    log_index BIGINT NOT NULL CHECK (log_index >= 0),
    paid_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (chain_id, company_id, run_id, employee_id),
    CONSTRAINT payroll_payments_employee_fk
        FOREIGN KEY (chain_id, company_id, employee_id)
        REFERENCES employees (chain_id, company_id, employee_id)
        ON DELETE RESTRICT,
    CONSTRAINT payroll_payments_run_fk
        FOREIGN KEY (chain_id, company_id, run_id)
        REFERENCES payroll_runs (chain_id, company_id, run_id)
        ON DELETE RESTRICT,
    CONSTRAINT payroll_payments_transaction_fk
        FOREIGN KEY (chain_id, transaction_hash)
        REFERENCES blockchain_transactions (chain_id, transaction_hash)
        ON DELETE RESTRICT,
    CONSTRAINT payroll_payments_event_fk
        FOREIGN KEY (chain_id, block_number, transaction_hash, log_index)
        REFERENCES indexed_events (chain_id, block_number, transaction_hash, log_index)
        ON DELETE RESTRICT,
    CONSTRAINT payroll_payments_event_unique
        UNIQUE (chain_id, block_number, transaction_hash, log_index)
);

CREATE INDEX payroll_payments_employee_idx
    ON payroll_payments (chain_id, company_id, employee_id, paid_at DESC);

CREATE TABLE indexer_checkpoints (
    chain_id BIGINT NOT NULL CHECK (chain_id > 0),
    contract_address TEXT NOT NULL CHECK (contract_address ~ '^0x[0-9a-fA-F]{40}$'),
    last_processed_block BIGINT NOT NULL CHECK (last_processed_block >= 0),
    last_processed_block_hash TEXT NOT NULL CHECK (last_processed_block_hash ~ '^0x[0-9a-fA-F]{64}$'),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (chain_id, contract_address)
);

CREATE TABLE idempotency_keys (
    idempotency_key TEXT PRIMARY KEY CHECK (length(idempotency_key) BETWEEN 1 AND 255),
    operation TEXT NOT NULL CHECK (length(operation) BETWEEN 1 AND 100),
    request_hash TEXT NOT NULL CHECK (request_hash ~ '^[0-9a-fA-F]{64}$'),
    status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ
);

CREATE INDEX idempotency_keys_expires_idx
    ON idempotency_keys (expires_at)
    WHERE expires_at IS NOT NULL;
