/**
 * Host Command Center - Admin Logic for Bible Chronos Quiz
 * Handles Quiz Management, Session Generation, and Live Operations
 */

// ----------------------------------------------------
// 1. Configuration & Supabase Initialization
// ----------------------------------------------------

// PLACEHOLDERS: Replace these with your actual Supabase project credentials.
const SUPABASE_URL = "https://ktdvbbouymbphuijkopl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0ZHZiYm91eW1icGh1aWprb3BsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMjA4MzUsImV4cCI6MjA5NTc5NjgzNX0.fFCvVMsonXmaRQOJ2_fwaV4lH-VCMfd9K8kXJ7toycQ";

let supabaseClient = null;

if (SUPABASE_URL !== "YOUR_SUPABASE_URL" && SUPABASE_ANON_KEY !== "YOUR_SUPABASE_ANON_KEY") {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
  console.warn("Supabase is not initialized. Please configure credentials.");
}

// ----------------------------------------------------
// 2. DOM Elements Cache
// ----------------------------------------------------

const el = {
  // Panel 1: Scriptorium
  formCreateQuiz: document.getElementById('form-create-quiz'),
  quizTitleInput: document.getElementById('quiz-title'),
  
  formAddQuestion: document.getElementById('form-add-question'),
  selectQuizAdd: document.getElementById('select-quiz-add'),
  questionText: document.getElementById('question-text'),
  optA: document.getElementById('opt-a'),
  optB: document.getElementById('opt-b'),
  optC: document.getElementById('opt-c'),
  optD: document.getElementById('opt-d'),
  correctAnswer: document.getElementById('correct-answer'),

  // Panel 2: Session Generator
  formGenerateSession: document.getElementById('form-generate-session'),
  selectQuizSession: document.getElementById('select-quiz-session'),
  sessionUuidContainer: document.getElementById('session-uuid-container'),
  displayUuid: document.getElementById('display-uuid'),
  btnCopyUuid: document.getElementById('btn-copy-uuid'),

  // Panel 3: Live Ops
  liveSessionUuid: document.getElementById('live-session-uuid'),
  btnStartExam: document.getElementById('btn-start-exam'),
  btnEndExam: document.getElementById('btn-end-exam'),

  // Feedback Toast
  toast: document.getElementById('notification-toast'),
  toastMessage: document.getElementById('toast-message'),
};

// ----------------------------------------------------
// 3. Utility Functions
// ----------------------------------------------------

/**
 * Display a custom toast notification for user feedback
 * @param {string} message - The message to display
 */
function showToast(message) {
  el.toastMessage.textContent = message;
  el.toast.classList.add('show');
  setTimeout(() => el.toast.classList.remove('show'), 4000);
}

/**
 * Load existing quizzes from Supabase and populate dropdowns
 */
async function loadQuizzes() {
  if (!supabaseClient) return;

  try {
    const { data: quizzes, error } = await supabaseClient
      .from('quizzes')
      .select('id, title')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Reset dropdowns
    const defaultOption = '<option value="" disabled selected>Select a Quiz...</option>';
    el.selectQuizAdd.innerHTML = defaultOption;
    el.selectQuizSession.innerHTML = defaultOption;

    // Populate dropdowns
    quizzes.forEach(quiz => {
      const optionAdd = document.createElement('option');
      optionAdd.value = quiz.id;
      optionAdd.textContent = quiz.title;
      el.selectQuizAdd.appendChild(optionAdd);

      const optionSession = document.createElement('option');
      optionSession.value = quiz.id;
      optionSession.textContent = quiz.title;
      el.selectQuizSession.appendChild(optionSession);
    });

  } catch (err) {
    console.error("Error loading quizzes:", err);
    showToast("Failed to load quizzes. See console for details.");
  }
}

// ----------------------------------------------------
// 4. Panel 1: The Scriptorium (Quiz & Question Management)
// ----------------------------------------------------

// Create a new Quiz
el.formCreateQuiz.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  if (!supabaseClient) return showToast("Supabase is not configured.");

  const title = el.quizTitleInput.value.trim();
  if (!title) return;

  try {
    const { error } = await supabaseClient
      .from('quizzes')
      .insert([{ title: title }]);

    if (error) throw error;

    showToast(`Quiz "${title}" created successfully!`);
    el.formCreateQuiz.reset();
    
    // Reload dropdowns so the new quiz is available
    await loadQuizzes();
  } catch (err) {
    console.error("Error creating quiz:", err);
    alert("Failed to create quiz: " + err.message);
  }
});

// Add a new Question
el.formAddQuestion.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!supabaseClient) return showToast("Supabase is not configured.");

  const quizId = el.selectQuizAdd.value;
  const qText = el.questionText.value.trim();
  const optionA = el.optA.value.trim();
  const optionB = el.optB.value.trim();
  const optionC = el.optC.value.trim();
  const optionD = el.optD.value.trim();
  const correctChoice = el.correctAnswer.value; // A, B, C, or D

  if (!quizId) return showToast("Please select a quiz first.");
  if (!correctChoice) return showToast("Please select which option is the correct answer.");

  // Package options into an array (which maps to JSONB in Supabase)
  const optionsArray = [optionA, optionB, optionC, optionD];

  // Map the letter choice (A,B,C,D) to the actual exact text of the correct option
  let exactCorrectText = "";
  if (correctChoice === "A") exactCorrectText = optionA;
  else if (correctChoice === "B") exactCorrectText = optionB;
  else if (correctChoice === "C") exactCorrectText = optionC;
  else if (correctChoice === "D") exactCorrectText = optionD;

  try {
    const { error } = await supabaseClient
      .from('questions')
      .insert([{
        quiz_id: quizId,
        question_text: qText,
        options: optionsArray,
        correct_option: exactCorrectText
      }]);

    if (error) throw error;

    showToast("Question successfully added to quiz!");
    
    // Reset inputs, keep the selected quiz
    el.questionText.value = '';
    el.optA.value = '';
    el.optB.value = '';
    el.optC.value = '';
    el.optD.value = '';
    el.correctAnswer.value = '';
  } catch (err) {
    console.error("Error adding question:", err);
    alert("Failed to add question: " + err.message);
  }
});

// ----------------------------------------------------
// 5. Panel 2: Session Generator (The Gates)
// ----------------------------------------------------

el.formGenerateSession.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!supabaseClient) return showToast("Supabase is not configured.");

  const quizId = el.selectQuizSession.value;
  if (!quizId) return showToast("Please select a quiz to generate a session for.");

  try {
    // Insert new session with status 'waiting'
    // .select().single() ensures we get the created row back (including generated UUID)
    const { data: session, error } = await supabaseClient
      .from('quiz_sessions')
      .insert([{
        quiz_id: quizId,
        status: 'waiting'
      }])
      .select()
      .single();

    if (error) throw error;

    // Display the UUID
    el.displayUuid.textContent = session.id;
    el.sessionUuidContainer.style.display = 'block';
    
    // Automatically populate the Live Ops input field for convenience
    el.liveSessionUuid.value = session.id;

    showToast("New Session Generated!");
  } catch (err) {
    console.error("Error generating session:", err);
    alert("Failed to generate session: " + err.message);
  }
});

// Copy UUID to clipboard
el.btnCopyUuid.addEventListener('click', () => {
  const uuid = el.displayUuid.textContent;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(uuid).then(() => {
      showToast("UUID copied to clipboard!");
    }).catch(err => {
      console.error("Clipboard API failed:", err);
    });
  } else {
    // Fallback
    showToast("Clipboard API not available. Please copy manually.");
  }
});

// ----------------------------------------------------
// 6. Panel 3: Live Operations (The Switch)
// ----------------------------------------------------

/**
 * Updates the session status in Supabase
 * @param {string} status 'in_progress' or 'completed'
 */
async function updateSessionStatus(status) {
  if (!supabaseClient) return showToast("Supabase is not configured.");

  const sessionId = el.liveSessionUuid.value.trim();
  
  if (!sessionId) {
    return showToast("Please paste an active Session UUID.");
  }
  
  // Basic validation that it looks like a UUID
  const uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/gi;
  if (!uuidRegex.test(sessionId)) {
    return showToast("Invalid UUID format.");
  }

  const payload = { status: status };
  
  // Also log timestamps for tracking
  if (status === 'in_progress') {
    payload.started_at = new Date().toISOString();
  } else if (status === 'completed') {
    payload.completed_at = new Date().toISOString();
  }

  try {
    const { error } = await supabaseClient
      .from('quiz_sessions')
      .update(payload)
      .eq('id', sessionId);

    if (error) throw error;

    if (status === 'in_progress') {
      showToast(`▶ EXAM STARTED! Signals sent to participants for session ${sessionId.substring(0,8)}...`);
    } else {
      showToast(`⏹ EXAM ENDED! Results published for session ${sessionId.substring(0,8)}...`);
    }
  } catch (err) {
    console.error(`Error updating session status to ${status}:`, err);
    alert(`Failed to update status to ${status}: ` + err.message);
  }
}

el.btnStartExam.addEventListener('click', () => {
  if (confirm("Are you sure you want to START the exam? This will unlock the quiz for all waiting participants instantly.")) {
    updateSessionStatus('in_progress');
  }
});

el.btnEndExam.addEventListener('click', () => {
  if (confirm("Are you sure you want to END the exam? This will lock all participant screens and display the leaderboard.")) {
    updateSessionStatus('completed');
  }
});

// ----------------------------------------------------
// Initialization
// ----------------------------------------------------
// Load dropdowns on page load
document.addEventListener("DOMContentLoaded", () => {
  loadQuizzes();
});
