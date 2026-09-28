-- Migration 006: New case fields + sub_claim_type enum + wheels_check_link + vehicle_type

-- Create sub_claim_type enum
CREATE TYPE sub_claim_type AS ENUM (
  'POLICY',
  'THIRD_PARTY',
  'THIRD_PARTY_SETTLEMENT',
  'PRIVATE_REPAIR',
  'SHLOMO_POLICY',
  'SHLOMO_THIRD_PARTY'
);

-- Add new fields to cases table
ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS customer_name     TEXT,
  ADD COLUMN IF NOT EXISTS phone             TEXT,
  ADD COLUMN IF NOT EXISTS insurance_company TEXT,
  ADD COLUMN IF NOT EXISTS appraiser_name    TEXT,
  ADD COLUMN IF NOT EXISTS event_date        DATE,
  ADD COLUMN IF NOT EXISTS wheels_check_link TEXT,
  ADD COLUMN IF NOT EXISTS sub_claim_type    sub_claim_type;

-- Add vehicle_type to cars table
ALTER TABLE cars
  ADD COLUMN IF NOT EXISTS vehicle_type TEXT;
