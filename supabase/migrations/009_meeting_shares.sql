-- ============================================
-- MEETING SHARES TABLE
-- Enables secure public sharing of meeting details
-- ============================================

-- Create the meeting_shares table
CREATE TABLE IF NOT EXISTS meeting_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  share_token TEXT NOT NULL UNIQUE,
  password_hash TEXT, -- NULL means no password required, bcrypt hash otherwise
  is_active BOOLEAN DEFAULT true,
  view_count INTEGER DEFAULT 0,
  last_viewed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ, -- NULL means no expiration
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

-- Fast lookup by share token (used by public access)
CREATE UNIQUE INDEX IF NOT EXISTS idx_meeting_shares_token ON meeting_shares(share_token);

-- Find shares for a specific meeting
CREATE INDEX IF NOT EXISTS idx_meeting_shares_meeting_id ON meeting_shares(meeting_id);

-- Filter active shares
CREATE INDEX IF NOT EXISTS idx_meeting_shares_active ON meeting_shares(is_active) WHERE is_active = true;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE meeting_shares ENABLE ROW LEVEL SECURITY;

-- Users can view their own meeting shares (via meeting ownership)
CREATE POLICY "Users can view own meeting shares" ON meeting_shares
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM meetings 
      WHERE meetings.id = meeting_id 
      AND meetings.user_id = auth.uid()
    )
  );

-- Users can create shares for their own meetings
CREATE POLICY "Users can create own meeting shares" ON meeting_shares
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM meetings 
      WHERE meetings.id = meeting_id 
      AND meetings.user_id = auth.uid()
    )
  );

-- Users can update their own meeting shares
CREATE POLICY "Users can update own meeting shares" ON meeting_shares
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM meetings 
      WHERE meetings.id = meeting_id 
      AND meetings.user_id = auth.uid()
    )
  );

-- Users can delete their own meeting shares
CREATE POLICY "Users can delete own meeting shares" ON meeting_shares
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM meetings 
      WHERE meetings.id = meeting_id 
      AND meetings.user_id = auth.uid()
    )
  );

-- Service role has full access (for Edge Functions)
CREATE POLICY "Service role full access to meeting shares" ON meeting_shares
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- PUBLIC ACCESS POLICY (for shared-meeting Edge Function)
-- ============================================

-- Allow anonymous/public SELECT when accessing via valid share token
-- This policy allows the Edge Function to fetch share details
-- Note: The actual data access is controlled by the Edge Function
CREATE POLICY "Public can view active shares by token" ON meeting_shares
  FOR SELECT USING (
    is_active = true 
    AND (expires_at IS NULL OR expires_at > NOW())
  );

-- ============================================
-- TRIGGER: Auto-update updated_at
-- ============================================

CREATE TRIGGER meeting_shares_updated_at
  BEFORE UPDATE ON meeting_shares
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- FUNCTION: Increment view count
-- ============================================

CREATE OR REPLACE FUNCTION increment_share_view_count(p_share_token TEXT)
RETURNS void AS $$
BEGIN
  UPDATE meeting_shares
  SET 
    view_count = view_count + 1,
    last_viewed_at = NOW()
  WHERE share_token = p_share_token
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- STORAGE POLICY FOR SHARED AUDIO ACCESS
-- ============================================

-- Allow public read access to audio files when accessed via valid share token
-- This uses a signed URL approach instead - the Edge Function generates
-- time-limited signed URLs for audio access, so no additional storage
-- policy is needed. The service role in the Edge Function handles this.

