-- db/008_allow_null_policyholder_policy.sql
-- Allow policy_id to be nullable in policyholder_profile so registration does not require selecting a policy upfront

ALTER TABLE policyholder_profile ALTER COLUMN policy_id DROP NOT NULL;
