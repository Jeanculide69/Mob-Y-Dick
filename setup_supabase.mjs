// Script to set up Supabase tables via the REST API
const SUPABASE_URL = 'https://jmklarbngqkwakogmsec.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impta2xhcmJuZ3Frd2Frb2dtc2VjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMTYwNTYsImV4cCI6MjA5NDU5MjA1Nn0.jedA_EvScFSRRusfcybLTPmDIOP866zkxoW2J8MjQOY'

const sql = `
-- Create events table
CREATE TABLE IF NOT EXISTS events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  date DATE NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create gallery table
CREATE TABLE IF NOT EXISTS gallery (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'photo',
  url TEXT NOT NULL,
  file_name TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read
CREATE POLICY "Public read events" ON events FOR SELECT USING (true);
CREATE POLICY "Public read gallery" ON gallery FOR SELECT USING (true);

-- Allow authenticated users to do everything
CREATE POLICY "Auth insert events" ON events FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update events" ON events FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth delete events" ON events FOR DELETE TO authenticated USING (true);

CREATE POLICY "Auth insert gallery" ON gallery FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update gallery" ON gallery FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth delete gallery" ON gallery FOR DELETE TO authenticated USING (true);
`

async function run() {
  console.log('Setting up Supabase tables...')
  
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  })

  // We'll use the SQL editor approach instead
  console.log('')
  console.log('=== COPY THE SQL BELOW INTO SUPABASE SQL EDITOR ===')
  console.log('')
  console.log(sql)
  console.log('')
  console.log('=== Go to Supabase Dashboard → SQL Editor → New Query → Paste → Run ===')
}

run()
