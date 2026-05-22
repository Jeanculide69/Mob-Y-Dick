-- Create race_announcements table
CREATE TABLE IF NOT EXISTS race_announcements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES race_sessions(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE race_announcements ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Public read race_announcements" 
ON race_announcements FOR SELECT 
USING (true);

-- Allow authenticated users to insert announcements
CREATE POLICY "Auth insert race_announcements" 
ON race_announcements FOR INSERT TO authenticated 
WITH CHECK (true);

-- Enable real-time for the new table
ALTER PUBLICATION supabase_realtime ADD TABLE race_announcements;
