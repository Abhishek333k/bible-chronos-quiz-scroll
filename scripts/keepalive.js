const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// These will be securely passed via environment variables in the GitHub Action
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function runKeepalive() {
  console.log(`[${new Date().toISOString()}] Starting Keepalive Ping...`);
  
  try {
    const pingId = crypto.randomUUID();
    
    // 1. Insert a new record (No .select() to bypass any strict RLS Read rules)
    const { error: insertError } = await supabase
      .from('keepalive_pings')
      .insert([{ id: pingId, pinged_at: new Date().toISOString() }]);

    if (insertError) throw insertError;
    console.log(`✅ Successfully inserted keepalive record with ID: ${pingId}`);

    // 2. Delete the record we just created
    const { error: deleteError } = await supabase
      .from('keepalive_pings')
      .delete()
      .eq('id', pingId);

    if (deleteError) throw deleteError;
    console.log(`🗑️ Successfully deleted keepalive record with ID: ${pingId}`);
    
    console.log("✅ Keepalive pipeline completed successfully! Project is marked as active.");
  } catch (error) {
    console.error("❌ Keepalive pipeline failed:", error);
    process.exit(1);
  }
}

runKeepalive();
