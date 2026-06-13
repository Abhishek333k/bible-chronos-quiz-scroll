const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = "https://ktdvbbouymbphuijkopl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0ZHZiYm91eW1icGh1aWprb3BsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMjA4MzUsImV4cCI6MjA5NTc5NjgzNX0.fFCvVMsonXmaRQOJ2_fwaV4lH-VCMfd9K8kXJ7toycQ";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function getSelectedOptionIndex(q, answer) {
  if (answer === undefined || answer === null || answer === '') return -1;
  const originalOptions = Array.isArray(q.options) ? q.options : JSON.parse(q.options || "[]");
  
  const isDigitsOnly = /^\d+$/.test(String(answer).trim());
  if (isDigitsOnly || typeof answer === 'number') {
    const index = parseInt(answer, 10);
    if (index >= 0 && index < originalOptions.length) {
      return index;
    }
  }
  
  const text = String(answer).trim().toLowerCase();
  return originalOptions.findIndex(opt => opt && opt.trim().toLowerCase() === text);
}

function getSelectedOptionText(q, answer) {
  if (answer === undefined || answer === null || answer === '') return null;
  const originalOptions = Array.isArray(q.options) ? q.options : JSON.parse(q.options || "[]");
  
  const isDigitsOnly = /^\d+$/.test(String(answer).trim());
  if (isDigitsOnly || typeof answer === 'number') {
    const index = parseInt(answer, 10);
    if (index >= 0 && index < originalOptions.length) {
      return originalOptions[index];
    }
  }
  return String(answer);
}

function getCorrectOptionIndex(q) {
  if (q.correct_index !== null && q.correct_index !== undefined && q.correct_index !== '') {
    return parseInt(q.correct_index, 10);
  }
  if (q.correct_option) {
    const originalOptions = Array.isArray(q.options) ? q.options : JSON.parse(q.options || "[]");
    const text = String(q.correct_option).trim().toLowerCase();
    return originalOptions.findIndex(opt => opt && opt.trim().toLowerCase() === text);
  }
  return -1;
}

function getCorrectOptionText(q) {
  const originalOptions = Array.isArray(q.options) ? q.options : JSON.parse(q.options || "[]");
  const idx = getCorrectOptionIndex(q);
  if (idx !== -1) {
    return originalOptions[idx];
  }
  return q.correct_option || null;
}

async function simulate() {
  console.log("Starting simulation...");
  
  // 1. Get an active session to link against
  const { data: sessions, error: sessErr } = await supabase.from('quiz_sessions').select('*').limit(1);
  if (sessErr || !sessions.length) {
    console.error("No active quiz sessions found in DB to link responses to!");
    return;
  }
  const sessionRecord = sessions[0];
  const fakeSessionId = sessionRecord.id;
  const quizIdToUse = sessionRecord.quiz_id;

  // 1b. Get the quiz related to the session
  const { data: quizzes, error: qzErr } = await supabase.from('quizzes').select('*').eq('id', quizIdToUse).limit(1);
  if (qzErr || !quizzes.length) {
    console.error("No quizzes found!");
    return;
  }
  const quiz = quizzes[0];
  console.log("Simulating for quiz:", quiz.title);
  
  // 2. Create a fake guest ID
  const crypto = require('crypto');
  const fakeGuestId = crypto.randomUUID();
  
  // For the simulation, we'll just insert into session_tokens (if needed, but usually user_responses is enough to test saving)
  
  // 3. Get questions
  const { data: questions, error: qErr } = await supabase.from('questions').select('*').eq('quiz_id', quiz.id);
  if (qErr || !questions.length) {
    console.error("No questions found for quiz!");
    return;
  }
  console.log(`Found ${questions.length} questions.`);
  
  // 4. Generate fake answers
  const responsesToInsert = [];
  let score = 0;
  
  for (const q of questions) {
    const originalOptions = Array.isArray(q.options) ? q.options : JSON.parse(q.options || "[]");
    
    // Pick a random index as the answer
    const pickedIdx = Math.floor(Math.random() * originalOptions.length);
    
    // Simulate what the frontend does (it stores the origIdx)
    const userStateAnswer = pickedIdx; 
    
    // Process exactly like submitQuiz
    const selectedIndex = getSelectedOptionIndex(q, userStateAnswer);
    const selectedText = getSelectedOptionText(q, userStateAnswer);
    const correctChoiceIndex = getCorrectOptionIndex(q);
    const correctChoiceText = getCorrectOptionText(q);
    
    let selectedOptionToSave = (selectedIndex !== -1) ? selectedIndex.toString() : (selectedText || "NO_RESPONSE");
    let isCorrectValue = false;
    
    if (selectedIndex !== -1 && correctChoiceIndex !== -1) {
      isCorrectValue = (selectedIndex === correctChoiceIndex);
    } else if (selectedText && correctChoiceText) {
      isCorrectValue = (selectedText.trim().toLowerCase() === correctChoiceText.trim().toLowerCase());
    }
    
    if (isCorrectValue) score++;
    
    responsesToInsert.push({
      session_id: fakeSessionId,
      participant_name: "Simulated Candidate",
      participant_email: "sim@example.com",
      participant_guest_id: fakeGuestId,
      question_id: q.id,
      selected_option: selectedOptionToSave,
      is_correct: isCorrectValue,
      time_taken_ms: Math.floor(Math.random() * 5000) + 1000
    });
  }
  
  // 5. Insert answers
  console.log("Inserting fake responses...");
  const { error: insErr } = await supabase.from('user_responses').insert(responsesToInsert);
  if (insErr) {
    console.error("Failed to insert:", insErr);
    return;
  }
  console.log("Inserted successfully!");
  
  // 6. Verify they were saved properly (simulate renderBooklet logic)
  console.log("Verifying responses...");
  const { data: savedResponses, error: fetchErr } = await supabase
    .from('user_responses')
    .select('*')
    .eq('session_id', fakeSessionId)
    .eq('participant_guest_id', fakeGuestId);
    
  if (fetchErr) {
    console.error("Failed to fetch saved responses:", fetchErr);
    return;
  }
  
  let verified = true;
  savedResponses.forEach(r => {
    const q = questions.find(qu => qu.id === r.question_id);
    const originalOptions = Array.isArray(q.options) ? q.options : JSON.parse(q.options || "[]");
    
    let displayUserText = "";
    const isDigitsOnly = /^\d+$/.test(String(r.selected_option).trim());
    if (isDigitsOnly) {
      const parsedVal = parseInt(r.selected_option, 10);
      if (parsedVal >= 0 && parsedVal < originalOptions.length) {
        displayUserText = originalOptions[parsedVal];
      } else {
        displayUserText = r.selected_option;
      }
    } else {
      displayUserText = r.selected_option;
    }
    
    const sentResponse = responsesToInsert.find(resp => resp.question_id === r.question_id);
    console.log(`Q: ${q.question_text}`);
    console.log(` - Saved as: ${r.selected_option}`);
    console.log(` - Booklet Will Display: ${displayUserText}`);
    console.log(` - Marked Correct: ${r.is_correct}\n`);
    
    if (sentResponse.selected_option !== r.selected_option) {
      verified = false;
    }
  });
  
  if (verified) {
    console.log(`✅ Simulation Complete: ${responsesToInsert.length} answers perfectly saved and verified.`);
  } else {
    console.log("❌ Simulation Failed: Data mismatch.");
  }
}

simulate();
