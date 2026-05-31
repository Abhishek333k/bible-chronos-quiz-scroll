/**
 * Host Command Center - Admin Logic for Bible Chronos Quiz
 * Handles Quiz Management, Session Generation, Live Operations, and Ledger Management
 */

// ----------------------------------------------------
// 1. Configuration & Supabase Initialization
// ----------------------------------------------------

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
  sessionPinContainer: document.getElementById('session-pin-container'),
  displayPin: document.getElementById('display-pin'),
  btnCopyPin: document.getElementById('btn-copy-pin'),

  // Panel 3: Live Ops
  liveSessionPin: document.getElementById('live-session-pin'),
  btnStartExam: document.getElementById('btn-start-exam'),
  btnEndExam: document.getElementById('btn-end-exam'),

  // Panel 4: Ledger Management
  ledgerQuizList: document.getElementById('ledger-quiz-list'),
  ledgerSelectQuiz: document.getElementById('ledger-select-quiz'),
  ledgerQuestionsList: document.getElementById('ledger-questions-list'),
  editQuestionContainer: document.getElementById('edit-question-container'),
  formEditQuestion: document.getElementById('form-edit-question'),
  editQId: document.getElementById('edit-q-id'),
  editQText: document.getElementById('edit-q-text'),
  editOptA: document.getElementById('edit-opt-a'),
  editOptB: document.getElementById('edit-opt-b'),
  editOptC: document.getElementById('edit-opt-c'),
  editOptD: document.getElementById('edit-opt-d'),
  editQCorrect: document.getElementById('edit-q-correct'),

  // Feedback Toast
  toast: document.getElementById('notification-toast'),
  toastMessage: document.getElementById('toast-message'),
};

// ----------------------------------------------------
// 3. Utility Functions
// ----------------------------------------------------

function showToast(message) {
  el.toastMessage.textContent = message;
  el.toast.classList.add('show');
  setTimeout(() => el.toast.classList.remove('show'), 4000);
}

// ----------------------------------------------------
// 4. Global State Loaders
// ----------------------------------------------------

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
    el.ledgerSelectQuiz.innerHTML = defaultOption;
    el.ledgerQuizList.innerHTML = '';

    quizzes.forEach(quiz => {
      // Add to dropdowns
      [el.selectQuizAdd, el.selectQuizSession, el.ledgerSelectQuiz].forEach(selectEl => {
        const option = document.createElement('option');
        option.value = quiz.id;
        option.textContent = quiz.title;
        selectEl.appendChild(option);
      });

      // Add to Ledger Delete list
      const quizItem = document.createElement('div');
      quizItem.style.display = 'flex';
      quizItem.style.justifyContent = 'space-between';
      quizItem.style.alignItems = 'center';
      quizItem.style.background = 'rgba(0,0,0,0.4)';
      quizItem.style.padding = '0.75rem';
      quizItem.style.borderRadius = '6px';
      quizItem.innerHTML = `
        <span style="font-weight: 600; font-family: var(--font-sans);">${quiz.title}</span>
        <button class="btn-primary" style="background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%); padding: 0.4rem 0.8rem; font-size: 0.8rem;" onclick="deleteQuiz('${quiz.id}', '${quiz.title.replace(/'/g, "\\'")}')">Delete</button>
      `;
      el.ledgerQuizList.appendChild(quizItem);
    });

  } catch (err) {
    console.error("Error loading quizzes:", err);
    showToast("Failed to load quizzes.");
  }
}

// ----------------------------------------------------
// 5. Panel 1: The Scriptorium (Quiz & Question Management)
// ----------------------------------------------------

el.formCreateQuiz.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!supabaseClient) return;

  const title = el.quizTitleInput.value.trim();
  if (!title) return;

  try {
    const { error } = await supabaseClient.from('quizzes').insert([{ title: title }]);
    if (error) throw error;

    showToast(`Quiz "${title}" created!`);
    el.formCreateQuiz.reset();
    await loadQuizzes();
  } catch (err) {
    alert("Failed to create quiz: " + err.message);
  }
});

el.formAddQuestion.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!supabaseClient) return;

  const quizId = el.selectQuizAdd.value;
  const qText = el.questionText.value.trim();
  const optionA = el.optA.value.trim();
  const optionB = el.optB.value.trim();
  const optionC = el.optC.value.trim();
  const optionD = el.optD.value.trim();
  const correctChoice = el.correctAnswer.value; 

  if (!quizId) return showToast("Select a quiz first.");
  if (!correctChoice) return showToast("Select the correct answer.");

  const optionsArray = [optionA, optionB, optionC, optionD];
  let exactCorrectText = "";
  if (correctChoice === "A") exactCorrectText = optionA;
  else if (correctChoice === "B") exactCorrectText = optionB;
  else if (correctChoice === "C") exactCorrectText = optionC;
  else if (correctChoice === "D") exactCorrectText = optionD;

  try {
    const { error } = await supabaseClient.from('questions').insert([{
      quiz_id: quizId,
      question_text: qText,
      options: optionsArray,
      correct_option: exactCorrectText
    }]);

    if (error) throw error;

    showToast("Question successfully added to quiz!");
    el.questionText.value = '';
    el.optA.value = ''; el.optB.value = ''; el.optC.value = ''; el.optD.value = '';
    el.correctAnswer.value = '';
  } catch (err) {
    alert("Failed to add question: " + err.message);
  }
});

// ----------------------------------------------------
// 6. Panel 2: Session Generator (The Gates)
// ----------------------------------------------------

el.formGenerateSession.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!supabaseClient) return;

  const quizId = el.selectQuizSession.value;
  if (!quizId) return showToast("Select a quiz to generate a session.");

  // Generate 6-Digit Random PIN
  const accessPin = Math.floor(100000 + Math.random() * 900000).toString();

  try {
    const { error } = await supabaseClient
      .from('quiz_sessions')
      .insert([{
        quiz_id: quizId,
        status: 'waiting',
        access_pin: accessPin
      }]);

    if (error) throw error;

    el.displayPin.textContent = accessPin;
    el.sessionPinContainer.style.display = 'block';
    el.liveSessionPin.value = accessPin;
    showToast("New Session Generated!");
  } catch (err) {
    alert("Failed to generate session: " + err.message);
  }
});

el.btnCopyPin.addEventListener('click', () => {
  const pin = el.displayPin.textContent;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(pin).then(() => showToast("PIN copied!"));
  } else {
    showToast("Clipboard API not available.");
  }
});

// ----------------------------------------------------
// 7. Panel 3: Live Operations (The Switch)
// ----------------------------------------------------

async function updateSessionStatus(status) {
  if (!supabaseClient) return;

  const pin = el.liveSessionPin.value.trim();
  if (!/^\d{6}$/.test(pin)) return showToast("Invalid PIN. Must be 6 digits.");

  const payload = { status: status };
  if (status === 'in_progress') payload.started_at = new Date().toISOString();
  else if (status === 'completed') payload.completed_at = new Date().toISOString();

  try {
    const { error } = await supabaseClient
      .from('quiz_sessions')
      .update(payload)
      .eq('access_pin', pin);

    if (error) throw error;

    if (status === 'in_progress') showToast(`▶ EXAM STARTED for PIN ${pin}!`);
    else showToast(`⏹ EXAM ENDED for PIN ${pin}!`);
  } catch (err) {
    alert(`Failed to update status: ` + err.message);
  }
}

el.btnStartExam.addEventListener('click', () => {
  if (confirm("START the exam? This unlocks the quiz for all waiting participants.")) {
    updateSessionStatus('in_progress');
  }
});

el.btnEndExam.addEventListener('click', () => {
  if (confirm("END the exam? This locks screens and displays the leaderboard.")) {
    updateSessionStatus('completed');
  }
});

// ----------------------------------------------------
// 8. Panel 4: Ledger Management (Edit/Delete)
// ----------------------------------------------------

// Exposed globally so the onclick in loadQuizzes() can access it
window.deleteQuiz = async function(quizId, quizTitle) {
  if (confirm(`CRITICAL WARNING: Are you sure you want to delete "${quizTitle}"? This will cascade and delete all associated questions and sessions.`)) {
    try {
      const { error } = await supabaseClient.from('quizzes').delete().eq('id', quizId);
      if (error) throw error;
      showToast(`Quiz "${quizTitle}" deleted successfully.`);
      
      // If we were editing this quiz, close the edit window
      if (el.ledgerSelectQuiz.value === quizId) {
        el.ledgerSelectQuiz.value = "";
        el.ledgerQuestionsList.innerHTML = "";
        el.editQuestionContainer.style.display = "none";
      }
      
      await loadQuizzes();
    } catch (err) {
      alert("Failed to delete quiz: " + err.message);
    }
  }
};

el.ledgerSelectQuiz.addEventListener('change', async () => {
  const quizId = el.ledgerSelectQuiz.value;
  if (!quizId) return;
  
  el.editQuestionContainer.style.display = "none";
  el.ledgerQuestionsList.innerHTML = '<span style="color:var(--color-text-secondary);">Loading questions...</span>';
  
  try {
    const { data: questions, error } = await supabaseClient
      .from('questions')
      .select('*')
      .eq('quiz_id', quizId)
      .order('created_at', { ascending: true });
      
    if (error) throw error;
    
    el.ledgerQuestionsList.innerHTML = '';
    if (questions.length === 0) {
      el.ledgerQuestionsList.innerHTML = '<span style="color:var(--color-text-secondary);">No questions exist yet.</span>';
      return;
    }
    
    questions.forEach((q, index) => {
      const qItem = document.createElement('div');
      qItem.style.background = 'rgba(0,0,0,0.4)';
      qItem.style.padding = '0.75rem';
      qItem.style.borderRadius = '6px';
      qItem.style.borderLeft = '3px solid var(--color-gold)';
      qItem.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 0.5rem;">Q${index + 1}: ${q.question_text}</div>
        <button class="btn-secondary" style="font-size: 0.8rem; padding: 0.4rem 0.8rem;" onclick='openQuestionEditor(${JSON.stringify(q).replace(/'/g, "&apos;")})'>Edit</button>
      `;
      el.ledgerQuestionsList.appendChild(qItem);
    });
    
  } catch (err) {
    alert("Failed to load questions: " + err.message);
  }
});

window.openQuestionEditor = function(questionData) {
  el.editQId.value = questionData.id;
  el.editQText.value = questionData.question_text;
  
  // Populate options
  const opts = questionData.options || ["", "", "", ""];
  el.editOptA.value = opts[0] || "";
  el.editOptB.value = opts[1] || "";
  el.editOptC.value = opts[2] || "";
  el.editOptD.value = opts[3] || "";
  
  el.editQCorrect.value = questionData.correct_option;
  el.editQuestionContainer.style.display = "block";
  el.editQuestionContainer.scrollIntoView({ behavior: 'smooth' });
};

el.formEditQuestion.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const qId = el.editQId.value;
  const qText = el.editQText.value.trim();
  const optA = el.editOptA.value.trim();
  const optB = el.editOptB.value.trim();
  const optC = el.editOptC.value.trim();
  const optD = el.editOptD.value.trim();
  const correct = el.editQCorrect.value.trim();
  
  const optionsArray = [optA, optB, optC, optD];
  
  if (!optionsArray.includes(correct)) {
    return alert("The correct answer must exactly match one of the four options.");
  }
  
  try {
    const { error } = await supabaseClient
      .from('questions')
      .update({
        question_text: qText,
        options: optionsArray,
        correct_option: correct
      })
      .eq('id', qId);
      
    if (error) throw error;
    
    showToast("Question updated successfully!");
    el.editQuestionContainer.style.display = "none";
    
    // Refresh the questions list
    el.ledgerSelectQuiz.dispatchEvent(new Event('change'));
  } catch(err) {
    alert("Failed to update question: " + err.message);
  }
});

// ----------------------------------------------------
// Initialization
// ----------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  loadQuizzes();
});
