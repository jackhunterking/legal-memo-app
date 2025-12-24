-- ============================================
-- BILLABLE MEETINGS FEATURE
-- Migration for billing/time tracking support
-- ============================================

-- ============================================
-- ADD BILLING FIELDS TO PROFILES TABLE
-- ============================================

-- User's default hourly rate for billing
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(10,2) DEFAULT NULL;

-- User's preferred currency symbol (e.g., $, €, £, ¥)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS currency_symbol TEXT DEFAULT '$';

-- ============================================
-- ADD BILLING FIELDS TO MEETINGS TABLE
-- ============================================

-- Whether the meeting is billable
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS is_billable BOOLEAN DEFAULT false;

-- Hours to bill (can differ from actual duration, editable)
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS billable_hours DECIMAL(10,2) DEFAULT NULL;

-- Calculated or manually entered billing amount
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS billable_amount DECIMAL(10,2) DEFAULT NULL;

-- Flag to indicate if amount was manually set (prevents auto-recalculation)
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS billable_amount_manual BOOLEAN DEFAULT false;

-- ============================================
-- INDEXES FOR BILLING QUERIES
-- ============================================

-- Index for filtering billable meetings
CREATE INDEX IF NOT EXISTS idx_meetings_is_billable ON meetings(is_billable) WHERE is_billable = true;

-- Composite index for contact billing summaries
CREATE INDEX IF NOT EXISTS idx_meetings_contact_billable ON meetings(contact_id, is_billable) WHERE contact_id IS NOT NULL AND is_billable = true;

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON COLUMN profiles.hourly_rate IS 'User''s default hourly rate for billing calculations';
COMMENT ON COLUMN profiles.currency_symbol IS 'User''s preferred currency symbol for display (e.g., $, €, £)';
COMMENT ON COLUMN meetings.is_billable IS 'Whether this meeting should be included in billing';
COMMENT ON COLUMN meetings.billable_hours IS 'Hours to bill (defaults to meeting duration, but can be manually adjusted)';
COMMENT ON COLUMN meetings.billable_amount IS 'Total billing amount (auto-calculated from hours × rate, or manually set)';
COMMENT ON COLUMN meetings.billable_amount_manual IS 'True if billable_amount was manually set, preventing auto-recalculation';

