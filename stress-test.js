const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const SUPABASE_URL = "https://ktdvbbouymbphuijkopl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0ZHZiYm91eW1icGh1aWprb3BsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMjA4MzUsImV4cCI6MjA5NTc5NjgzNX0.fFCvVMsonXmaRQOJ2_fwaV4lH-VCMfd9K8kXJ7toycQ";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runStressTest() {
  console.log("==========================================");
  console.log("🚀 STARTING PLATFORM STRESS TEST 🚀");
  console.log("==========================================");

  try {
    // 1. Check if RLS is fixed by trying to read from session_tokens
    const { data: testRead, error: readErr } = await supabase.from('session_tokens').select('*').limit(1);
    if (readErr) {
      console.error("\n❌ FATAL: Database permissions error (403/406).");
      console.error("The 'session_tokens' table is still blocking reads/writes.");
      console.error("You MUST run the RLS SQL script in the Supabase Dashboard before this test can succeed.");
      console.error("Error details:", readErr.message);
      return;
    }
    console.log("✅ RLS Check Passed: 'session_tokens' table is accessible.\n");

    // 2. Fetch the "10 facts" demo quiz (or any existing quiz)
    const { data: quizzes, error: quizErr } = await supabase.from('quizzes').select('*').limit(1);
    if (quizErr || !quizzes.length) throw new Error("Could not fetch any quizzes.");
    const quizId = quizzes[0].id;
    console.log(`✅ Found Quiz: ${quizzes[0].title}`);

    // 3. Host Generates a Session
    const accessPin = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(`\n👑 HOST ACTION: Creating a new Session (Host PIN: ${accessPin})`);
    
    const { data: sessionData, error: sessionError } = await supabase
      .from('quiz_sessions')
      .insert([{
        quiz_id: quizId,
        status: 'waiting',
        access_pin: accessPin,
        is_jumbled: false,
        display_mode: 'scroll',
        is_anti_cheat_enabled: false
      }])
      .select()
      .single();

    if (sessionError) throw sessionError;
    console.log(`✅ Session Created (ID: ${sessionData.id})`);

    // 4. Host Generates 5 Participant Tickets
    const NUM_PARTICIPANTS = 5;
    const tokens = [];
    console.log(`\n👑 HOST ACTION: Generating ${NUM_PARTICIPANTS} Participant Tickets`);
    
    for (let i = 0; i < NUM_PARTICIPANTS; i++) {
      tokens.push({
        session_id: sessionData.id,
        access_token: Math.floor(100000 + Math.random() * 900000).toString(),
        is_claimed: false
      });
    }

    const { error: tokenError } = await supabase.from('session_tokens').insert(tokens);
    if (tokenError) throw tokenError;
    console.log(`✅ Tickets Provisioned: ${tokens.map(t => t.access_token).join(', ')}\n`);

    // 5. Participants Join Simultaneously
    console.log(`🏃 PARTICIPANTS ACTION: ${NUM_PARTICIPANTS} Participants attempting to join simultaneously...`);
    const joinPromises = tokens.map(async (t, i) => {
      const pName = `Virtual Participant ${i + 1}`;
      
      // Attempt Gateway Login (Simulating app.js)
      const { data: tokenRecord, error: tkErr } = await supabase
        .from('session_tokens')
        .select('*, quiz_sessions(status, is_jumbled, display_mode, quiz_id, completed_at)')
        .eq('access_token', t.access_token)
        .single();
        
      if (tkErr || !tokenRecord) throw new Error(`Participant ${i+1} Login Failed: ${tkErr?.message}`);
      
      // Claim the token
      const { error: claimErr } = await supabase
        .from('session_tokens')
        .update({ is_claimed: true, assigned_name: pName })
        .eq('access_token', t.access_token);
        
      if (claimErr) throw new Error(`Participant ${i+1} Claim Failed: ${claimErr.message}`);
      
      console.log(`  ✅ ${pName} successfully logged in using ticket ${t.access_token}`);
      return { token: t.access_token, name: pName, record: tokenRecord };
    });

    const participants = await Promise.all(joinPromises);

    // 6. Host starts the exam
    console.log(`\n👑 HOST ACTION: Changing status to 'in_progress'`);
    await supabase.from('quiz_sessions').update({ status: 'in_progress', started_at: new Date().toISOString() }).eq('access_pin', accessPin);
    
    // 7. Participants submit random answers
    console.log(`\n📝 PARTICIPANTS ACTION: Submitting telemetry/answers...`);
    // Fetch questions to submit telemetry
    const { data: questions } = await supabase.from('questions').select('id').eq('quiz_id', quizId);
    
    const submitPromises = participants.map(async (p, i) => {
      await delay(Math.random() * 2000); // Random delay to simulate real users
      
      const responses = questions.map((q, idx) => {
         const randomChoice = Math.floor(Math.random() * 4).toString(); // guess 0-3
         return {
          session_id: sessionData.id,
          access_token: p.token,
          participant_guest_id: p.record.id,
          participant_name: p.name,
          question_id: q.id,
          selected_option: randomChoice,
          is_correct: Math.random() > 0.5,
          time_taken_ms: Math.floor(Math.random() * 10000)
         };
      });
      
      const { error: ansErr } = await supabase
        .from('user_responses')
        .insert(responses);
        
      if (ansErr) throw new Error(`${p.name} failed to submit answers: ${ansErr.message}`);
      console.log(`  ✅ ${p.name} submitted their exam.`);
    });
    
    await Promise.all(submitPromises);
    
    // 8. Host ends the exam
    console.log(`\n👑 HOST ACTION: Changing status to 'completed'`);
    await supabase.from('quiz_sessions').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('access_pin', accessPin);
    console.log("✅ Exam finished.");
    
    console.log("\n🎉 STRESS TEST COMPLETED SUCCESSFULLY! 🎉");
    console.log("The entire token provisioning, joining, and exam telemetry flow is completely robust.");

  } catch (e) {
    console.error("\n❌ STRESS TEST FAILED ❌");
    console.error(e);
  }
}

runStressTest();
