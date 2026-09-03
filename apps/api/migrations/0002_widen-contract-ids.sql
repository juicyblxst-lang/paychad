ALTER TABLE payroll_payments
    DROP CONSTRAINT payroll_payments_employee_fk,
    DROP CONSTRAINT payroll_payments_run_fk;

ALTER TABLE employees
    ALTER COLUMN employee_id TYPE NUMERIC(78, 0) USING employee_id::NUMERIC(78, 0);

ALTER TABLE payroll_runs
    ALTER COLUMN run_id TYPE NUMERIC(78, 0) USING run_id::NUMERIC(78, 0),
    ALTER COLUMN employee_count TYPE NUMERIC(78, 0) USING employee_count::NUMERIC(78, 0);

ALTER TABLE payroll_payments
    ALTER COLUMN run_id TYPE NUMERIC(78, 0) USING run_id::NUMERIC(78, 0),
    ALTER COLUMN employee_id TYPE NUMERIC(78, 0) USING employee_id::NUMERIC(78, 0);

ALTER TABLE payroll_payments
    ADD CONSTRAINT payroll_payments_employee_fk
        FOREIGN KEY (chain_id, company_id, employee_id)
        REFERENCES employees (chain_id, company_id, employee_id)
        ON DELETE RESTRICT,
    ADD CONSTRAINT payroll_payments_run_fk
        FOREIGN KEY (chain_id, company_id, run_id)
        REFERENCES payroll_runs (chain_id, company_id, run_id)
        ON DELETE RESTRICT;