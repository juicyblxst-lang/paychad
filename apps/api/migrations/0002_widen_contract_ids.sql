ALTER TABLE employees
    ALTER COLUMN employee_id TYPE NUMERIC(78, 0) USING employee_id::NUMERIC(78, 0);

ALTER TABLE payroll_runs
    ALTER COLUMN run_id TYPE NUMERIC(78, 0) USING run_id::NUMERIC(78, 0),
    ALTER COLUMN employee_count TYPE NUMERIC(78, 0) USING employee_count::NUMERIC(78, 0);

ALTER TABLE payroll_payments
    ALTER COLUMN run_id TYPE NUMERIC(78, 0) USING run_id::NUMERIC(78, 0),
    ALTER COLUMN employee_id TYPE NUMERIC(78, 0) USING employee_id::NUMERIC(78, 0);