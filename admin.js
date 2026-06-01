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
  if (typeof window !== "undefined" && window.supabase) {
    try {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: false
        }
      });
    } catch (e) {
      console.error("Failed to initialize Supabase client:", e);
    }
  } else {
    console.error("Supabase library not loaded. Check network or ad-blocker settings.");
  }
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
  formImportCsv: document.getElementById('form-import-csv'),
  selectQuizImport: document.getElementById('select-quiz-import'),
  fileImportCsv: document.getElementById('file-import-csv'),

  // Panel 2: Session Generator
  formGenerateSession: document.getElementById('form-generate-session'),
  selectQuizSession: document.getElementById('select-quiz-session'),
  sessionIsJumbled: document.getElementById('session-is-jumbled'),
  sessionDisplayMode: document.getElementById('session-display-mode'),
  sessionAntiCheat: document.getElementById('session-anti-cheat'),
  sessionPinContainer: document.getElementById('session-pin-container'),
  displayPin: document.getElementById('display-pin'),
  btnCopyPin: document.getElementById('btn-copy-pin'),

  // Panel 3: Live Ops
  liveSessionPin: document.getElementById('live-session-pin'),
  btnStartExam: document.getElementById('btn-start-exam'),
  btnHaltExam: document.getElementById('btn-halt-exam'),
  btnPublishResults: document.getElementById('btn-publish-results'),
  btnExportCsv: document.getElementById('btn-export-csv'),
  privateAdminLeaderboard: document.getElementById('private-admin-leaderboard'),
  privateLeaderboardTbody: document.getElementById('private-leaderboard-tbody'),

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
  btnAddQuestionLedger: document.getElementById('btn-add-new-question-ledger'),
  editQuestionTitle: document.getElementById('edit-question-title'),

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
      [el.selectQuizAdd, el.selectQuizImport, el.selectQuizSession, el.ledgerSelectQuiz].forEach(selectEl => {
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
        <span style="font-weight: 600; font-family: var(--font-sans);" class="quiz-title-text"></span>
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn-secondary btn-backup" style="padding: 0.4rem 0.8rem; font-size: 0.8rem; border-color: var(--color-gold); color: var(--color-gold);">💾 Backup</button>
          <button class="btn-primary btn-delete" style="background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%); padding: 0.4rem 0.8rem; font-size: 0.8rem;">Delete</button>
        </div>
      `;
      quizItem.querySelector('.quiz-title-text').textContent = quiz.title;
      quizItem.querySelector('.btn-backup').addEventListener('click', () => backupQuiz(quiz.id, quiz.title));
      quizItem.querySelector('.btn-delete').addEventListener('click', () => deleteQuiz(quiz.id, quiz.title));
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
    showToast("Failed to create quiz: " + err.message);
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
    showToast("Failed to add question: " + err.message);
  }
});

el.formImportCsv.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!supabaseClient) return;

  const quizId = el.selectQuizImport.value;
  const file = el.fileImportCsv.files[0];
  if (!quizId || !file) return showToast("Select quiz and file.");

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const text = event.target.result;
      const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
      if (lines.length < 2) throw new Error("CSV requires a header row and data.");

      const parseCsvLine = (line) => {
        const cols = [];
        let current = '';
        let inQuotes = false;
        for (let j = 0; j < line.length; j++) {
          const char = line[j];
          if (char === '"') {
            if (inQuotes && line[j + 1] === '"') {
              current += '"';
              j++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (char === ',' && !inQuotes) {
            cols.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        cols.push(current.trim());
        return cols;
      };

      const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase());
      
      const qIdx = headers.findIndex(h => h.includes("question"));
      const aIdx = headers.findIndex(h => h === "option a" || h === "a");
      const bIdx = headers.findIndex(h => h === "option b" || h === "b");
      const cIdx = headers.findIndex(h => h === "option c" || h === "c");
      const dIdx = headers.findIndex(h => h === "option d" || h === "d");
      const corrIdx = headers.findIndex(h => h.includes("correct option") || h.includes("correct answer"));
      
      if (qIdx === -1 || aIdx === -1 || bIdx === -1 || cIdx === -1 || dIdx === -1 || corrIdx === -1) {
         throw new Error("Missing required headers in CSV.");
      }

      const questionsToInsert = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        if (cols.length <= Math.max(qIdx, aIdx, bIdx, cIdx, dIdx, corrIdx)) continue;

        questionsToInsert.push({
          quiz_id: quizId,
          question_text: cols[qIdx],
          options: [cols[aIdx], cols[bIdx], cols[cIdx], cols[dIdx]],
          correct_option: cols[corrIdx]
        });
      }

      if (questionsToInsert.length === 0) throw new Error("No valid rows parsed.");

      const { error } = await supabaseClient.from('questions').insert(questionsToInsert);
      if (error) throw error;

      showToast(`Imported ${questionsToInsert.length} questions!`);
      el.formImportCsv.reset();
    } catch (err) {
      showToast("CSV Import Error: " + err.message);
    }
  };
  reader.readAsText(file);
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
    const isJumbled = el.sessionIsJumbled.checked;
    const displayMode = el.sessionDisplayMode.value;

    const { error } = await supabaseClient
      .from('quiz_sessions')
      .insert([{
        quiz_id: quizId,
        status: 'waiting',
        access_pin: accessPin,
        is_jumbled: isJumbled,
        display_mode: displayMode,
        is_anti_cheat_enabled: el.sessionAntiCheat ? el.sessionAntiCheat.checked : true
      }]);

    if (error) throw error;

    el.displayPin.textContent = accessPin;
    el.sessionPinContainer.style.display = 'block';
    el.liveSessionPin.value = accessPin;
    showToast("New Session Generated!");
    syncTelemetrySubscription(accessPin);
  } catch (err) {
    showToast("Failed to generate session: " + err.message);
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
  if (status === 'evaluation') {
    payload.status = 'in_progress';
    payload.completed_at = new Date().toISOString();
  } else if (status === 'in_progress') {
    payload.started_at = new Date().toISOString();
    payload.completed_at = null;
  } else if (status === 'completed') {
    payload.completed_at = new Date().toISOString();
  }

  try {
    const { error } = await supabaseClient
      .from('quiz_sessions')
      .update(payload)
      .eq('access_pin', pin);

    if (error) throw error;

    if (status === 'in_progress') {
      showToast(`▶ EXAM STARTED for PIN ${pin}!`);
      if (el.btnExportCsv) el.btnExportCsv.style.display = 'none';
      if (el.privateAdminLeaderboard) el.privateAdminLeaderboard.style.display = 'none';
      syncTelemetrySubscription(pin);
    } else if (status === 'evaluation') {
      showToast(`⏸ EXAM HALTED for Evaluation (PIN ${pin})!`);
      if (el.privateAdminLeaderboard) el.privateAdminLeaderboard.style.display = 'block';
      generatePrivateLeaderboard(pin);
    } else {
      showToast(`✅ EXAM COMPLETED for PIN ${pin}!`);
      if (el.btnExportCsv) el.btnExportCsv.style.display = 'block';
    }
  } catch (err) {
    showToast(`Failed to update status: ` + err.message);
  }
}

el.btnStartExam.addEventListener('click', async () => {
  if (await showCustomConfirm("START the exam? This unlocks the quiz for all waiting participants.")) {
    updateSessionStatus('in_progress');
  }
});

el.btnHaltExam.addEventListener('click', async () => {
  if (await showCustomConfirm("HALT the exam? This will securely lock all candidate screens for proctor evaluation.")) {
    updateSessionStatus('evaluation');
    el.btnHaltExam.style.display = 'none';
    el.btnPublishResults.style.display = 'block';
  }
});

el.btnPublishResults.addEventListener('click', async () => {
  if (await showCustomConfirm("PUBLISH RESULTS? This will reveal the final leaderboard to all candidates.")) {
    updateSessionStatus('completed');
    el.btnPublishResults.style.display = 'none';
    el.btnHaltExam.style.display = 'block';
  }
});

async function generatePrivateLeaderboard(pin) {
  try {
    const { data: sessionData, error: sessionError } = await supabaseClient
      .from('quiz_sessions')
      .select('id')
      .eq('access_pin', pin)
      .single();
      
    if (sessionError || !sessionData) return;

    const { data: responses, error: respError } = await supabaseClient
      .from('user_responses')
      .select('*')
      .eq('session_id', sessionData.id);

    if (respError || !responses) return;

    const userGroups = {};
    responses.forEach(r => {
      const key = r.participant_guest_id || (r.participant_name + "_" + (r.participant_email || "guest"));
      if (!userGroups[key]) {
        userGroups[key] = {
          name: r.participant_name,
          email: r.participant_email || "Guest",
          correctCount: 0,
          totalCount: 0,
          timeTakenMs: r.time_taken_ms,
          isCheater: false,
          answeredQuestions: new Set()
        };
      }
      
      if (userGroups[key].answeredQuestions.has(r.question_id)) return;
      userGroups[key].answeredQuestions.add(r.question_id);

      if (r.selected_option === "AUTO_SUBMIT_DQ") userGroups[key].isCheater = true;
      if (r.is_correct) userGroups[key].correctCount++;
      userGroups[key].totalCount++;
    });

    const rankings = Object.values(userGroups).sort((a, b) => {
      if (a.isCheater && !b.isCheater) return 1;
      if (!a.isCheater && b.isCheater) return -1;
      if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
      return a.timeTakenMs - b.timeTakenMs;
    });

    el.privateLeaderboardTbody.innerHTML = "";
    if (rankings.length === 0) {
      el.privateLeaderboardTbody.innerHTML = `<tr><td colspan="5" class="text-center">No participants recorded yet.</td></tr>`;
      return;
    }

    rankings.forEach((player, idx) => {
      const tr = document.createElement("tr");
      const status = player.isCheater ? `<span style="color:#ef4444;">DQ (Violations)</span>` : `<span style="color:#10b981;">Active</span>`;
      const timeSec = (player.timeTakenMs / 1000).toFixed(1);
      tr.innerHTML = `
        <td style="padding: 0.5rem;">${idx + 1}</td>
        <td style="padding: 0.5rem;"><strong>${player.name}</strong></td>
        <td style="padding: 0.5rem;">${player.correctCount}/${player.totalCount}</td>
        <td style="padding: 0.5rem; font-family: monospace;">${timeSec}s</td>
        <td style="padding: 0.5rem;">${status}</td>
      `;
      el.privateLeaderboardTbody.appendChild(tr);
    });
  } catch (err) {
    console.error("Private leaderboard error:", err);
  }
}

el.btnExportCsv.addEventListener('click', async () => {
  const pin = el.liveSessionPin.value.trim();
  if (!pin) return showToast("No active session PIN.");

  try {
    const { data: sessionData, error: sessionError } = await supabaseClient
      .from('quiz_sessions')
      .select('id')
      .eq('access_pin', pin)
      .single();
      
    if (sessionError || !sessionData) throw new Error("Could not find session by PIN.");

    const { data: responses, error: respError } = await supabaseClient
      .from('user_responses')
      .select('*')
      .eq('session_id', sessionData.id);

    if (respError) throw respError;

    if (!responses || responses.length === 0) {
      return showToast("No responses found for this session.");
    }

    const userGroups = {};
    responses.forEach(r => {
      const key = r.participant_guest_id || (r.participant_name + "_" + (r.participant_email || "guest"));
      if (!userGroups[key]) {
        userGroups[key] = {
          name: r.participant_name,
          email: r.participant_email || "Guest",
          correctCount: 0,
          totalCount: 0,
          timeTakenMs: r.time_taken_ms,
          isCheater: false,
          answeredQuestions: new Set()
        };
      }
      
      if (userGroups[key].answeredQuestions.has(r.question_id)) return;
      userGroups[key].answeredQuestions.add(r.question_id);

      if (r.selected_option === "AUTO_SUBMIT_DQ") userGroups[key].isCheater = true;
      if (r.is_correct) userGroups[key].correctCount++;
      userGroups[key].totalCount++;
    });

    const rankings = Object.values(userGroups).sort((a, b) => {
      if (a.isCheater && !b.isCheater) return 1;
      if (!a.isCheater && b.isCheater) return -1;
      if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
      return a.timeTakenMs - b.timeTakenMs;
    });

    let csvContent = "Rank,Name,Email,Score,Time (ms),Status\n";
    rankings.forEach((player, idx) => {
      const status = player.isCheater ? "DQ (Violations)" : "Completed";
      csvContent += `${idx + 1},"${player.name}","${player.email}","${player.correctCount} out of ${player.totalCount}",${player.timeTakenMs},"${status}"\n`;
    });

    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Chronos_Scroll_${pin}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

  } catch (err) {
    showToast("Export failed: " + err.message);
  }
});

// ----------------------------------------------------
// 8. Panel 4: Ledger Management (Edit/Delete)
// ----------------------------------------------------

// Exposed globally so the onclick in loadQuizzes() can access it
window.deleteQuiz = async function(quizId, quizTitle) {
  if (await showCustomConfirm(`CRITICAL WARNING: Are you sure you want to delete "${quizTitle}"? This will cascade and delete all associated questions and sessions.`)) {
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
      showToast("Failed to delete quiz: " + err.message);
    }
  }
};

window.backupQuiz = async function(quizId, quizTitle) {
  try {
    const { data: questions, error } = await supabaseClient
      .from('questions')
      .select('*')
      .eq('quiz_id', quizId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    
    if (!questions || questions.length === 0) {
      return showToast("No questions in this quiz to backup.");
    }

    let csvContent = "Question Text,Option A,Option B,Option C,Option D,Correct Option\n";
    questions.forEach(q => {
      const escape = (str) => `"${(str || "").replace(/"/g, '""')}"`;
      const opts = q.options || ["", "", "", ""];
      csvContent += `${escape(q.question_text)},${escape(opts[0])},${escape(opts[1])},${escape(opts[2])},${escape(opts[3])},${escape(q.correct_option)}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${quizTitle.replace(/\s+/g, '_')}_Backup.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Backup of "${quizTitle}" downloaded!`);
  } catch (err) {
    showToast("Backup failed: " + err.message);
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
    } else {
      questions.forEach((q, index) => {
        const qItem = document.createElement('div');
        qItem.className = 'question-list-item';
        qItem.innerHTML = `
          <div class="question-list-content">
            <div style="font-weight: 600; margin-bottom: 0.25rem;" class="q-text-label"></div>
            <div style="font-size: 0.8rem; color: var(--color-text-secondary);" class="q-correct-label"></div>
          </div>
          <div class="question-list-actions">
            <button class="btn-secondary btn-edit" style="font-size: 0.8rem; padding: 0.4rem 0.8rem;">Edit</button>
            <button class="btn-danger btn-delete">Delete</button>
          </div>
        `;
        qItem.querySelector('.q-text-label').textContent = `Q${index + 1}: ${q.question_text}`;
        qItem.querySelector('.q-correct-label').textContent = `Correct: ${q.correct_option}`;
        qItem.querySelector('.btn-edit').addEventListener('click', () => openQuestionEditor(q));
        qItem.querySelector('.btn-delete').addEventListener('click', () => deleteQuestion(q.id));
        el.ledgerQuestionsList.appendChild(qItem);
      });
    }

    el.btnAddQuestionLedger.style.display = 'block';
    
  } catch (err) {
    showToast("Failed to load questions: " + err.message);
  }
});

el.btnAddQuestionLedger.addEventListener('click', () => {
  el.editQuestionTitle.textContent = "Add New Question";
  el.editQId.value = "NEW";
  el.formEditQuestion.reset();
  el.editQuestionContainer.style.display = "block";
  el.editQuestionContainer.scrollIntoView({ behavior: 'smooth' });
});

window.openQuestionEditor = function(questionData) {
  el.editQuestionTitle.textContent = "Edit Selected Question";
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
  el.editQuestionContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

window.deleteQuestion = async function(questionId) {
  if (!(await showCustomConfirm("Are you sure you want to delete this question? This action cannot be undone."))) return;
  try {
    const { error } = await supabaseClient
      .from('questions')
      .delete()
      .eq('id', questionId);
    if (error) throw error;
    showToast("Question deleted successfully.");
    el.ledgerSelectQuiz.dispatchEvent(new Event('change'));
  } catch (err) {
    showToast("Failed to delete question: " + err.message);
  }
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
    return showToast("The correct answer must exactly match one of the four options.");
  }
  
  try {
    if (qId === "NEW") {
      const quizId = el.ledgerSelectQuiz.value;
      const { error } = await supabaseClient.from('questions').insert([{
        quiz_id: quizId,
        question_text: qText,
        options: optionsArray,
        correct_option: correct
      }]);
      if (error) throw error;
      showToast("Question added successfully!");
    } else {
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
    }
    
    el.editQuestionContainer.style.display = "none";
    
    // Refresh the questions list
    el.ledgerSelectQuiz.dispatchEvent(new Event('change'));
  } catch(err) {
    showToast("Failed to save question: " + err.message);
  }
});

// ----------------------------------------------------
// 9. Tab Navigation UI (Initialized in DOM Load)
// ----------------------------------------------------


// ----------------------------------------------------
// 10. Fleet Monitor Logic
// ----------------------------------------------------
let activeSessionItems = {}; // { sessionId: { element, intervalId } }

async function loadActiveSessions() {
  if (!supabaseClient) return;
  const listEl = document.getElementById('active-sessions-list');
  if (!listEl) return;

  try {
    const { data: sessions, error } = await supabaseClient
      .from('quiz_sessions')
      .select('id, access_pin, started_at, quizzes(title)')
      .eq('status', 'in_progress')
      .order('started_at', { ascending: false });

    if (error) throw error;

    if (!sessions || sessions.length === 0) {
      // Clear all existing timers
      Object.keys(activeSessionItems).forEach(id => {
        if (activeSessionItems[id].intervalId) clearInterval(activeSessionItems[id].intervalId);
        activeSessionItems[id].element.remove();
      });
      activeSessionItems = {};
      listEl.innerHTML = '<span style="color:var(--color-text-secondary);font-size:0.9rem;">No active sessions currently running.</span>';
      return;
    }

    // Remove placeholder if present
    const placeholder = listEl.querySelector('span');
    if (placeholder && placeholder.textContent.includes("No active sessions")) {
      listEl.innerHTML = '';
    }

    const currentSessionIds = new Set(sessions.map(s => s.id));

    // Remove stale sessions
    Object.keys(activeSessionItems).forEach(id => {
      if (!currentSessionIds.has(id)) {
        if (activeSessionItems[id].intervalId) clearInterval(activeSessionItems[id].intervalId);
        activeSessionItems[id].element.remove();
        delete activeSessionItems[id];
      }
    });

    // Add or update sessions
    sessions.forEach(session => {
      if (activeSessionItems[session.id]) {
        // Already exists, let the interval run smoothly
        return;
      }

      const quizTitle = session.quizzes ? session.quizzes.title : 'Unknown Quiz';
      
      const sessionItem = document.createElement('div');
      sessionItem.style.background = 'rgba(0,0,0,0.4)';
      sessionItem.style.padding = '0.75rem 1rem';
      sessionItem.style.borderRadius = '6px';
      sessionItem.style.borderLeft = '3px solid #10b981';
      sessionItem.style.display = 'flex';
      sessionItem.style.justifyContent = 'space-between';
      sessionItem.style.alignItems = 'center';
      sessionItem.style.marginBottom = '0.75rem';
      
      sessionItem.innerHTML = `
        <div>
          <div style="font-weight: 600; color: var(--color-text-primary); margin-bottom: 0.2rem;" class="quiz-title-label"></div>
          <div style="font-family: monospace; font-size: 1.1rem; color: var(--color-gold-bright); letter-spacing: 2px;">PIN: ${session.access_pin}</div>
        </div>
        <div style="display: flex; gap: 1rem; align-items: center;">
          <div style="text-align: right;">
            <div style="font-size: 0.7rem; color: var(--color-text-secondary); text-transform: uppercase;">Elapsed Time</div>
            <div id="monitor-timer-${session.id}" style="font-family: monospace; font-size: 1.3rem; font-weight: bold; color: #10b981; text-shadow: 0 0 8px rgba(16,185,129,0.4);">00:00</div>
          </div>
          <button class="btn-secondary btn-monitor" style="padding: 0.5rem 1rem; font-size: 0.85rem; border-color: var(--color-gold); color: var(--color-gold);">👁️ Monitor</button>
        </div>
      `;
      
      sessionItem.querySelector('.quiz-title-label').textContent = quizTitle;
      sessionItem.querySelector('.btn-monitor').addEventListener('click', () => openTelemetryModal(session.access_pin, quizTitle));
      
      listEl.appendChild(sessionItem);

      // Start local ticking
      let intervalId = null;
      if (session.started_at) {
        const startTime = new Date(session.started_at).getTime();
        const elTimer = sessionItem.querySelector(`#monitor-timer-${session.id}`);
        
        const tick = () => {
          const deltaMs = Date.now() - startTime;
          if (deltaMs < 0) return;
          const totalSeconds = Math.floor(deltaMs / 1000);
          const mins = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
          const secs = String(totalSeconds % 60).padStart(2, '0');
          if (elTimer) elTimer.textContent = `${mins}:${secs}`;
        };
        tick();
        intervalId = setInterval(tick, 1000);
      }

      activeSessionItems[session.id] = {
        element: sessionItem,
        intervalId: intervalId
      };
    });

  } catch (err) {
    console.warn("Monitor Error:", err.message);
  }
}

function startLiveMonitor() {
  loadActiveSessions();
  setInterval(loadActiveSessions, 5000);
}

// ----------------------------------------------------
// 11. Live Telemetry Subscription
// ----------------------------------------------------
let currentTelemetryChannel = null;

async function syncTelemetrySubscription(pin, gridId = "live-telemetry-grid") {
  if (currentTelemetryChannel) {
    console.log("Unsubscribing from telemetry channel...");
    await currentTelemetryChannel.unsubscribe();
    currentTelemetryChannel = null;
  }
  
  const grid = document.getElementById(gridId);
  if (!pin || !/^\d{6}$/.test(pin)) {
    if (grid) {
      grid.innerHTML = '<span style="color:var(--color-text-secondary);font-size:0.9rem;grid-column:1/-1;text-align:center;">Enter a valid 6-digit PIN to monitor candidate progress.</span>';
    }
    return;
  }

  if (grid) {
    grid.innerHTML = '<span style="color:var(--color-text-secondary);font-size:0.9rem;grid-column:1/-1;text-align:center;">Waiting for candidate telemetry broadcasts...</span>';
  }

  try {
    const { data: session, error } = await supabaseClient
      .from('quiz_sessions')
      .select('id')
      .eq('access_pin', pin)
      .single();

    if (error || !session) {
      console.warn("Could not find session for PIN:", pin);
      if (grid) {
        grid.innerHTML = '<span style="color:var(--color-text-secondary);font-size:0.9rem;grid-column:1/-1;text-align:center;">Session not found for PIN. Check the PIN and try again.</span>';
      }
      return;
    }

    console.log("Subscribing to telemetry for session:", session.id);
    currentTelemetryChannel = supabaseClient
      .channel(`quiz-session-${session.id}`)
      .on(
        'broadcast',
        { event: 'telemetry' },
        (payload) => {
          console.log("Telemetry event received:", payload);
          if (payload && payload.payload) {
            updateTelemetryCard(payload.payload, gridId);
          }
        }
      )
      .subscribe((status) => {
        console.log(`Telemetry channel status: ${status}`);
      });
  } catch (err) {
    console.error("Telemetry subscription error:", err);
  }
}

function updateTelemetryCard(data, gridId = "live-telemetry-grid") {
  const grid = document.getElementById(gridId);
  if (!grid || !data || !data.guestId) return;

  // Clear placeholder if it's currently showing
  const firstChild = grid.firstElementChild;
  if (firstChild && firstChild.tagName === "SPAN") {
    grid.innerHTML = "";
  }

  let card = document.getElementById(`candidate-card-${data.guestId}`);
  if (!card) {
    card = document.createElement("div");
    card.id = `candidate-card-${data.guestId}`;
    card.className = "candidate-card glassmorphism";
    grid.appendChild(card);
  }

  const answered = data.answered || 0;
  const total = data.total || 0;
  const flagged = data.flagged || 0;
  const currentScore = data.currentScore || 0;
  const progressPercent = total > 0 ? Math.round((answered / total) * 100) : 0;

  card.innerHTML = `
    <div class="candidate-header">
      <span class="candidate-name" title="${data.name || 'Anonymous'}">${data.name || 'Anonymous'}</span>
      <span class="candidate-flagged">🚩 ${flagged}</span>
    </div>
    <div class="candidate-progress-label">
      <span>Progress</span>
      <span>${answered}/${total}</span>
    </div>
    <div class="candidate-progress-bar-container">
      <div class="candidate-progress-bar-fill" style="width: ${progressPercent}%"></div>
    </div>
    <div class="candidate-live-score">Score: ${currentScore} / ${total}</div>
  `;
}

window.openTelemetryModal = function(pin, title) {
  const modal = document.getElementById("telemetry-modal");
  const titleEl = document.getElementById("telemetry-modal-title");
  
  if (titleEl) titleEl.textContent = "Monitoring: " + title + " (PIN: " + pin + ")";
  if (modal) modal.classList.add("active");

  syncTelemetrySubscription(pin, "modal-telemetry-grid");
};

// ----------------------------------------------------
// Initialization
// ----------------------------------------------------
function initializeAdminUI() {
  loadQuizzes();
  startLiveMonitor();

  // Initialize Tab Navigation
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      
      const targetId = btn.getAttribute('data-target');
      const targetContent = document.getElementById(targetId);
      if (targetContent) {
        targetContent.classList.add('active');
      }
    });
  });

  // Set initial telemetry grid status message
  const grid = document.getElementById("live-telemetry-grid");
  if (grid && (!el.liveSessionPin || !el.liveSessionPin.value.trim())) {
    grid.innerHTML = '<span style="color:var(--color-text-secondary);font-size:0.9rem;grid-column:1/-1;text-align:center;">Enter a valid 6-digit PIN to monitor candidate progress.</span>';
  }

  // Initialize telemetry subscription if PIN is already present
  if (el.liveSessionPin) {
    const pin = el.liveSessionPin.value.trim();
    if (pin) syncTelemetrySubscription(pin);

    // Event listener for user manually typing / changing the session PIN
    el.liveSessionPin.addEventListener('input', () => {
      const p = el.liveSessionPin.value.trim();
      syncTelemetrySubscription(p);
    });
  }

  const btnCloseModal = document.getElementById("btn-close-telemetry-modal");
  if (btnCloseModal) {
    btnCloseModal.addEventListener("click", async () => {
      const modal = document.getElementById("telemetry-modal");
      if (modal) modal.classList.remove("active");
      
      if (currentTelemetryChannel) {
        await currentTelemetryChannel.unsubscribe();
        currentTelemetryChannel = null;
      }
      
      // Resubscribe to the main grid if a PIN is entered there
      if (el.liveSessionPin && el.liveSessionPin.value.trim()) {
        syncTelemetrySubscription(el.liveSessionPin.value.trim());
      }
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeAdminUI);
} else {
  initializeAdminUI();
}

// ----------------------------------------------------
// Custom Premium Dialogs
// ----------------------------------------------------
function showCustomConfirm(message) {
  return new Promise((resolve) => {
    const modal = document.getElementById('custom-confirm-modal');
    if (!modal) {
        console.error("custom-confirm-modal element missing from DOM");
        return resolve(false);
    }
    const msgEl = document.getElementById('custom-confirm-msg');
    const btnYes = document.getElementById('custom-confirm-yes');
    const btnNo = document.getElementById('custom-confirm-no');
    
    msgEl.textContent = message;
    modal.classList.add('active');
    
    const cleanup = () => {
      btnYes.removeEventListener('click', onYes);
      btnNo.removeEventListener('click', onNo);
      modal.classList.remove('active');
    };
    
    const onYes = () => { cleanup(); resolve(true); };
    const onNo = () => { cleanup(); resolve(false); };
    
    btnYes.addEventListener('click', onYes);
    btnNo.addEventListener('click', onNo);
  });
}
