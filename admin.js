/**
 * Host Command Center - Admin Logic for Bible Chronos Quiz
 * Handles Quiz Management, Session Generation, Live Operations, and Ledger Management
 */

// ----------------------------------------------------
// 1. Configuration & Supabase Initialization
// ----------------------------------------------------

const SUPABASE_URL = "https://ktdvbbouymbphuijkopl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0ZHZiYm91eW1icGh1aWprb3BsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMjA4MzUsImV4cCI6MjA5NTc5NjgzNX0.fFCvVMsonXmaRQOJ2_fwaV4lH-VCMfd9K8kXJ7toycQ";

const customStorageAdapter = {
  getItem: (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) { }
  },
  removeItem: (key) => {
    try {
      window.localStorage.removeItem(key);
    } catch (e) { }
  }
};

// Local Storage Safe Wrappers for Host Pins
function getSavedPins() {
  try {
    const data = localStorage.getItem('chronos_host_pins');
    if (!data) return [];
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn("Storage restricted or JSON parsing failed for host pins. Falling back to empty array.", e);
    return [];
  }
}

function savePins(pins) {
  try {
    localStorage.setItem('chronos_host_pins', JSON.stringify(pins));
  } catch (e) {
    console.warn("Failed to save host pins to local storage.", e);
  }
}

function removeSavedPin(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.warn(`Failed to remove key ${key} from local storage.`, e);
  }
}

let supabaseClient = null;
let currentCandidateTokenToKill = null;
const candidateLastSeen = {};

setInterval(() => {
  const now = Date.now();
  for (const guestId in candidateLastSeen) {
    if (now - candidateLastSeen[guestId] > 60000) {
      const card = document.getElementById(`candidate-card-${guestId}`);
      if (card && !card.classList.contains('status-idle')) {
        card.classList.add('status-idle');
        const progressLabel = card.querySelector('.candidate-progress-label');
        if (progressLabel && !progressLabel.querySelector('.idle-text')) {
          const idleSpan = document.createElement('span');
          idleSpan.className = 'idle-text';
          idleSpan.textContent = ' ⚠️ Offline?';
          progressLabel.appendChild(idleSpan);
        }
      }
    }
  }
}, 10000);

if (SUPABASE_URL !== "YOUR_SUPABASE_URL" && SUPABASE_ANON_KEY !== "YOUR_SUPABASE_ANON_KEY") {
  if (typeof window !== "undefined" && window.supabase) {
    try {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          storage: customStorageAdapter,
          persistSession: true
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
// 1.5. Security Helpers
// ----------------------------------------------------
function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

async function compressToWebP(file, maxWidth = 1024, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          resolve(blob);
        }, 'image/webp', quality);
      };
      img.onerror = (err) => reject(err);
      img.src = e.target.result;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
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
  const correctChoice = parseInt(el.correctAnswer.value, 10);
  const imageInput = document.getElementById('q-image');

  if (!quizId) return showToast("Select a quiz first.");
  if (isNaN(correctChoice)) return showToast("Select the correct answer.");

  const optionsArray = [optionA, optionB, optionC, optionD];
  let imageUrl = null;

  try {
    if (imageInput && imageInput.files.length > 0) {
      const file = imageInput.files[0];
      const telemetry = document.getElementById('add-upload-telemetry');

      if (telemetry) {
        telemetry.style.display = 'block';
        telemetry.querySelector('.upload-progress-text').textContent = "1/2: Compressing media to WebP...";
      }

      const webpBlob = await compressToWebP(file);

      if (telemetry) {
        telemetry.querySelector('.upload-progress-text').textContent = "2/2: Transmitting to Cloud...";
        telemetry.querySelector('.upload-progress-fill').classList.add('animating');
      }

      const fileName = `q_${Date.now()}_${Math.random().toString(36).substring(7)}.webp`;
      const { data: uploadData, error: uploadError } = await supabaseClient.storage
        .from('quiz-media')
        .upload(fileName, webpBlob, { contentType: 'image/webp' });

      if (telemetry) telemetry.style.display = 'none';

      if (uploadError) throw new Error("Image upload failed: " + uploadError.message);
      const { data: publicUrlData } = supabaseClient.storage.from('quiz-media').getPublicUrl(fileName);
      imageUrl = publicUrlData.publicUrl;
    }

    const { error } = await supabaseClient.from('questions').insert([{
      quiz_id: quizId,
      question_text: qText,
      options: optionsArray,
      correct_index: correctChoice,
      correct_option: optionsArray[correctChoice],
      image_url: imageUrl
    }]);

    if (error) throw error;

    showToast("Question successfully added to quiz!");
    el.questionText.value = '';
    el.optA.value = ''; el.optB.value = ''; el.optC.value = ''; el.optD.value = '';
    el.correctAnswer.value = '';
    document.getElementById('add-preview-wrapper').classList.add('hidden');
    document.getElementById('add-preview-img').src = '';
    document.getElementById('q-image').value = '';
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

        const correctText = cols[corrIdx].trim();
        const optionsArr = [cols[aIdx], cols[bIdx], cols[cIdx], cols[dIdx]];
        let correctIndex = optionsArr.findIndex(o => o.trim().toLowerCase() === correctText.toLowerCase());

        if (correctIndex === -1) {
          const norm = correctText.toUpperCase();
          if (norm === "A" || norm === "OPTION A") correctIndex = 0;
          else if (norm === "B" || norm === "OPTION B") correctIndex = 1;
          else if (norm === "C" || norm === "OPTION C") correctIndex = 2;
          else if (norm === "D" || norm === "OPTION D") correctIndex = 3;
          else correctIndex = 0; // Fallback to option A if unmatchable
        }

        questionsToInsert.push({
          quiz_id: quizId,
          question_text: cols[qIdx],
          options: optionsArr,
          correct_index: Number(correctIndex),
          correct_option: optionsArr[correctIndex],
          sort_order: i  // 1-based index preserving CSV file order
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
  const numTickets = parseInt(document.getElementById('new-session-tickets').value, 10);

  if (!quizId || isNaN(numTickets)) {
    return showToast("Please select a quiz and specify the number of tickets.");
  }

  // Generate a primary session PIN for general reference (optional but kept for backwards compatibility)
  const accessPin = Math.floor(100000 + Math.random() * 900000).toString();

  try {
    const isJumbled = el.sessionIsJumbled.checked;
    const displayMode = el.sessionDisplayMode.value;

    // 1. Create the session
    const { data: sessionData, error: sessionError } = await supabaseClient
      .from('quiz_sessions')
      .insert([{
        quiz_id: quizId,
        status: 'waiting',
        access_pin: accessPin,
        is_jumbled: isJumbled,
        display_mode: displayMode,
        is_anti_cheat_enabled: el.sessionAntiCheat ? el.sessionAntiCheat.checked : true
      }])
      .select()
      .single();

    if (sessionError) throw sessionError;

    // 2. Generate N unique 6-digit tokens
    const tokens = [];
    const usedPins = new Set();
    while (tokens.length < numTickets) {
      const pin = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
      if (!usedPins.has(pin)) {
        usedPins.add(pin);
        tokens.push({
          session_id: sessionData.id,
          access_token: pin,
          is_claimed: false
        });
      }
    }

    // 3. Bulk insert tokens into the ledger
    const { error: tokenError } = await supabaseClient
      .from('session_tokens')
      .insert(tokens);

    if (tokenError) throw tokenError;

    el.displayPin.textContent = accessPin;
    const displayTicketsArea = document.getElementById('display-tickets');
    if (displayTicketsArea) {
      displayTicketsArea.innerHTML = tokens.map(t => `<span class="ticket-chip" onclick="copyIndividualTicket('${t.access_token}')" style="cursor: pointer;" title="Click to copy">${t.access_token}</span>`).join('');
    }
    el.sessionPinContainer.style.display = 'block';
    el.liveSessionPin.value = accessPin;

    // Save to multi-pin recovery
    let savedPins = getSavedPins();
    if (!savedPins.includes(accessPin)) {
      savedPins.push(accessPin);
      if (savedPins.length > 5) savedPins.shift(); // Keep last 5
      savePins(savedPins);
    }
    renderRecentPins();

    showToast(`Session created successfully with ${numTickets} access tickets!`);
    syncTelemetrySubscription(accessPin);
  } catch (err) {
    showToast("Failed to generate session: " + err.message);
  }
});

window.copyIndividualTicket = function (token) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(token).then(() => showToast(`Ticket ${token} copied to clipboard!`));
  } else {
    showToast("Clipboard API not available.");
  }
};

const btnCopyTickets = document.getElementById('btn-copy-tickets');
if (btnCopyTickets) {
  btnCopyTickets.addEventListener('click', () => {
    const chips = document.querySelectorAll('.ticket-chip');
    if (chips.length === 0) return showToast("No tickets to copy.");
    const ticketsText = Array.from(chips).map((chip, i) => `Ticket ${i + 1}: ${chip.textContent}`).join('\n');
    if (navigator.clipboard) {
      navigator.clipboard.writeText(ticketsText).then(() => showToast("✅ Tickets copied to clipboard"));
    } else {
      showToast("Clipboard API not available.");
    }
  });
}

// ----------------------------------------------------
// 7. Panel 3: Live Operations (The Switch)
// ----------------------------------------------------

function syncAdminPanelButtons(status) {
  el.btnStartExam.style.display = 'none';
  el.btnHaltExam.style.display = 'none';
  el.btnPublishResults.style.display = 'none';

  if (status === 'waiting') {
    el.btnStartExam.style.display = 'block';
  } else if (status === 'in_progress') {
    el.btnHaltExam.style.display = 'block';
  } else if (status === 'evaluation') {
    el.btnPublishResults.style.display = 'block';
  }
}

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

    syncAdminPanelButtons(status);
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
  }
});

el.btnPublishResults.addEventListener('click', async () => {
  if (await showCustomConfirm("PUBLISH RESULTS? This will reveal the final leaderboard to all candidates.")) {
    updateSessionStatus('completed');
    removeSavedPin('chronos_host_pin');
  }
});

async function generatePrivateLeaderboard(pin) {
  try {
    const { data: sessionData, error: sessionError } = await supabaseClient
      .from('quiz_sessions')
      .select('id, started_at')
      .eq('access_pin', pin)
      .single();

    if (sessionError || !sessionData) return;

    let responses = [];
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const to = from + pageSize - 1;
      const { data, error: respError } = await supabaseClient
        .from('user_responses')
        .select('*')
        .eq('session_id', sessionData.id)
        .range(from, to);

      if (respError) return;

      if (data && data.length > 0) {
        responses = responses.concat(data);
        if (data.length < pageSize) {
          hasMore = false;
        } else {
          from += pageSize;
        }
      } else {
        hasMore = false;
      }
    }

    const userGroups = {};
    responses.forEach(r => {
      const key = r.access_token || r.participant_guest_id || (r.participant_name + "_" + (r.participant_email || "guest"));
      if (!userGroups[key]) {
        userGroups[key] = {
          access_token: r.access_token,
          name: r.participant_name,
          email: r.participant_email || "Guest",
          correctCount: 0,
          totalCount: 0,
          timeTakenMs: 0,
          isCheater: false,
          answeredQuestions: new Set()
        };
      }

      if (userGroups[key].answeredQuestions.has(r.question_id)) return;
      userGroups[key].answeredQuestions.add(r.question_id);

      const serverTimeMs = new Date(r.created_at).getTime() - new Date(sessionData.started_at).getTime();
      userGroups[key].timeTakenMs = Math.max(userGroups[key].timeTakenMs, serverTimeMs);

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
      const tokenDisplay = player.access_token ? `<span class="candidate-flagged">${player.access_token}</span>` : 'N/A';
      tr.innerHTML = `
        <td style="padding: 0.5rem;">${tokenDisplay}</td>
        <td style="padding: 0.5rem;">${idx + 1}</td>
        <td style="padding: 0.5rem;"><strong class="player-name-val"></strong></td>
        <td style="padding: 0.5rem;">${player.correctCount}/${player.totalCount}</td>
        <td style="padding: 0.5rem; font-family: monospace;">${timeSec}s</td>
        <td style="padding: 0.5rem;">${status}</td>
        <td style="padding: 0.5rem;"><button class="btn-danger btn-kill-token" data-token="${player.access_token || ''}">Terminate</button></td>
      `;
      tr.querySelector('.player-name-val').textContent = player.name;
      el.privateLeaderboardTbody.appendChild(tr);
    });
  } catch (err) {
    console.error("Private leaderboard error:", err);
  }
}

el.privateLeaderboardTbody.addEventListener('click', async (e) => {
  if (e.target.classList.contains('btn-kill-token')) {
    const token = e.target.getAttribute('data-token');
    if (!token) return showToast('No token found to terminate.');
    if (await showCustomConfirm(`Terminate participant with ticket ${token}?`)) {
      try {
        const { error } = await supabaseClient.from('session_tokens').update({ is_void: true }).eq('access_token', token);
        if (error) throw error;
        showToast("Token Terminated.");
      } catch (err) {
        showToast("Failed to terminate token: " + err.message);
      }
    }
  }
});

el.btnExportCsv.addEventListener('click', async () => {
  const pin = el.liveSessionPin.value.trim();
  if (!pin) return showToast("No active session PIN.");

  try {
    const { data: sessionData, error: sessionError } = await supabaseClient
      .from('quiz_sessions')
      .select('id, started_at')
      .eq('access_pin', pin)
      .single();

    if (sessionError || !sessionData) throw new Error("Could not find session by PIN.");

    let responses = [];
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const to = from + pageSize - 1;
      const { data, error: respError } = await supabaseClient
        .from('user_responses')
        .select('*')
        .eq('session_id', sessionData.id)
        .range(from, to);

      if (respError) throw respError;

      if (data && data.length > 0) {
        responses = responses.concat(data);
        if (data.length < pageSize) {
          hasMore = false;
        } else {
          from += pageSize;
        }
      } else {
        hasMore = false;
      }
    }

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
          timeTakenMs: 0,
          isCheater: false,
          answeredQuestions: new Set()
        };
      }

      if (userGroups[key].answeredQuestions.has(r.question_id)) return;
      userGroups[key].answeredQuestions.add(r.question_id);

      const serverTimeMs = new Date(r.created_at).getTime() - new Date(sessionData.started_at).getTime();
      userGroups[key].timeTakenMs = Math.max(userGroups[key].timeTakenMs, serverTimeMs);

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
window.deleteQuiz = async function (quizId, quizTitle) {
  if (await showCustomConfirm(`CRITICAL WARNING: Are you sure you want to delete "${quizTitle}"? This will cascade and delete all associated questions and sessions.`)) {
    try {
      const { error } = await supabaseClient.from('quizzes').delete().eq('id', quizId);
      if (error) throw error;
      showToast(`Quiz "${quizTitle}" deleted successfully.`);

      // If we were editing this quiz, close the edit window
      if (el.ledgerSelectQuiz.value === quizId) {
        el.ledgerSelectQuiz.value = "";
        el.ledgerQuestionsList.innerHTML = "";
        el.editQuestionContainer.classList.add("hidden");
      }

      await loadQuizzes();
    } catch (err) {
      showToast("Failed to delete quiz: " + err.message);
    }
  }
};

window.backupQuiz = async function (quizId, quizTitle) {
  try {
    const { data: questions, error } = await supabaseClient
      .from('questions')
      .select('*')
      .eq('quiz_id', quizId)
      .order('sort_order', { ascending: true, nullsFirst: false })
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

  el.editQuestionContainer.classList.add("hidden");
  el.ledgerQuestionsList.innerHTML = '<span style="color:var(--color-text-secondary);">Loading questions...</span>';

  try {
    const { data: questions, error } = await supabaseClient
      .from('questions')
      .select('*')
      .eq('quiz_id', quizId)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    if (error) throw error;

    const questionMap = document.getElementById('ledger-question-map');
    if (questionMap) {
      questionMap.innerHTML = '';
      questionMap.style.display = questions.length > 0 ? 'grid' : 'none';
    }

    el.ledgerQuestionsList.innerHTML = '';
    if (questions.length === 0) {
      el.ledgerQuestionsList.innerHTML = '<span style="color:var(--color-text-secondary);">No questions exist yet.</span>';
    } else {
      questions.forEach((q, index) => {
        if (questionMap) {
          const mapBtn = document.createElement('button');
          mapBtn.className = 'map-btn';
          mapBtn.textContent = index + 1;
          mapBtn.addEventListener('click', () => {
            const target = document.getElementById('ledger-q-' + q.id);
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          });
          questionMap.appendChild(mapBtn);
        }

        const qItem = document.createElement('div');
        qItem.className = 'question-list-item';
        qItem.id = 'ledger-q-' + q.id;
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
  el.editQuestionContainer.classList.remove("hidden");
  el.editQuestionContainer.scrollIntoView({ behavior: 'smooth' });
});

window.openQuestionEditor = function (questionData) {
  el.editQuestionTitle.textContent = "Edit Selected Question";
  el.editQId.value = questionData.id;
  el.editQText.value = questionData.question_text;

  // Populate options
  const opts = questionData.options || ["", "", "", ""];
  el.editOptA.value = opts[0] || "";
  el.editOptB.value = opts[1] || "";
  el.editOptC.value = opts[2] || "";
  el.editOptD.value = opts[3] || "";

  let selectIndex = "";
  if (questionData.correct_index !== null && questionData.correct_index !== undefined && questionData.correct_index !== "") {
    selectIndex = String(questionData.correct_index);
  } else if (questionData.correct_option) {
    const text = String(questionData.correct_option).trim().toLowerCase();
    const idx = opts.findIndex(opt => opt && opt.trim().toLowerCase() === text);
    if (idx !== -1) {
      selectIndex = String(idx);
    }
  }
  el.editQCorrect.value = selectIndex;

  // Edit Modal Hydration for Image Preview
  const editPreviewWrapper = document.getElementById('edit-preview-wrapper');
  const editPreviewImg = document.getElementById('edit-preview-img');
  const editImageInput = document.getElementById('edit-q-image');

  if (questionData.image_url) {
    editPreviewImg.src = questionData.image_url;
    if (editPreviewImg.dataset.objectUrl) {
      URL.revokeObjectURL(editPreviewImg.dataset.objectUrl);
      delete editPreviewImg.dataset.objectUrl;
    }
    editPreviewWrapper.classList.remove("hidden");
  } else {
    editPreviewImg.src = "";
    editPreviewWrapper.classList.add("hidden");
  }
  if (editImageInput) editImageInput.value = ""; // clear the file input so system knows they keep the old image

  el.editQuestionContainer.classList.remove("hidden");
  el.editQuestionContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

window.deleteQuestion = async function (questionId) {
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
  const correctChoice = parseInt(el.editQCorrect.value, 10);
  const imageInput = document.getElementById('edit-q-image');
  const optionsArray = [optA, optB, optC, optD];

  if (isNaN(correctChoice)) {
    return showToast("Please select the correct answer index.");
  }

  try {
    let imageUrl = undefined;
    if (imageInput && imageInput.files.length > 0) {
      const file = imageInput.files[0];
      const telemetry = document.getElementById('edit-upload-telemetry');

      if (telemetry) {
        telemetry.style.display = 'block';
        telemetry.querySelector('.upload-progress-text').textContent = "1/2: Compressing media to WebP...";
      }

      const webpBlob = await compressToWebP(file);

      if (telemetry) {
        telemetry.querySelector('.upload-progress-text').textContent = "2/2: Transmitting to Cloud...";
        telemetry.querySelector('.upload-progress-fill').classList.add('animating');
      }

      const fileName = `q_${Date.now()}_${Math.random().toString(36).substring(7)}.webp`;
      const { error: uploadError } = await supabaseClient.storage.from('quiz-media').upload(fileName, webpBlob, { contentType: 'image/webp' });

      if (telemetry) telemetry.style.display = 'none';
      if (uploadError) throw new Error("Image upload failed: " + uploadError.message);

      const { data: publicUrlData } = supabaseClient.storage.from('quiz-media').getPublicUrl(fileName);
      imageUrl = publicUrlData.publicUrl;
    }

    if (qId === "NEW") {
      const quizId = el.ledgerSelectQuiz.value;
      const insertPayload = {
        quiz_id: quizId,
        question_text: qText,
        options: optionsArray,
        correct_index: correctChoice,
        correct_option: optionsArray[correctChoice]
      };
      if (imageUrl !== undefined) insertPayload.image_url = imageUrl;

      const { error } = await supabaseClient.from('questions').insert([insertPayload]);
      if (error) throw error;
      showToast("Question added successfully!");
    } else {
      const updatePayload = {
        question_text: qText,
        options: optionsArray,
        correct_index: correctChoice,
        correct_option: optionsArray[correctChoice]
      };
      if (imageUrl !== undefined) updatePayload.image_url = imageUrl;

      const { error } = await supabaseClient
        .from('questions')
        .update(updatePayload)
        .eq('id', qId);
      if (error) throw error;
      showToast("Question updated successfully!");
    }

    el.editQuestionContainer.classList.add("hidden");
    document.getElementById('edit-preview-wrapper').classList.add('hidden');
    document.getElementById('edit-preview-img').src = '';
    document.getElementById('edit-q-image').value = '';

    // Refresh the questions list
    el.ledgerSelectQuiz.dispatchEvent(new Event('change'));
  } catch (err) {
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
let currentLiveQuestionsLookup = {};

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
      .select('id, status, quiz_id')
      .eq('access_pin', pin)
      .single();

    if (error || !session) {
      console.warn("Could not find session for PIN:", pin);
      if (grid) {
        grid.innerHTML = '<span style="color:var(--color-text-secondary);font-size:0.9rem;grid-column:1/-1;text-align:center;">Session not found for PIN. Check the PIN and try again.</span>';
      }
      return;
    }

    // Load Session Tokens for Recovery
    const recoveryContainer = document.getElementById('recovery-tickets-container');
    const recoveryList = document.getElementById('recovery-tickets-list');
    if (recoveryContainer && recoveryList) {
      const { data: tokensData, error: tokensError } = await supabaseClient
        .from('session_tokens')
        .select('access_token, is_claimed, is_void')
        .eq('session_id', session.id);

      if (!tokensError && tokensData && tokensData.length > 0) {
        recoveryList.innerHTML = tokensData.map(t => {
          let style = "cursor: pointer;";
          if (t.is_void) style += " text-decoration: line-through; opacity: 0.5; border-color: red;";
          else if (t.is_claimed) style += " opacity: 0.6; border-style: dashed;";

          return `<span class="ticket-chip" onclick="copyIndividualTicket('${t.access_token}')" style="${style}" title="${t.is_void ? 'Terminated' : (t.is_claimed ? 'Claimed - Click to copy anyway' : 'Available - Click to copy')}">${t.access_token}</span>`;
        }).join('');
        recoveryContainer.style.display = 'block';
      } else {
        recoveryContainer.style.display = 'none';
      }
    }

    if (session.quiz_id) {
      const { data: qData } = await supabaseClient.from('questions').select('id, correct_index, correct_option, options').eq('quiz_id', session.quiz_id);
      currentLiveQuestionsLookup = {};
      if (qData) {
        qData.forEach(q => currentLiveQuestionsLookup[q.id] = q);
      }
    }

    // strictly clamp the Admin UI buttons to the database state
    syncAdminPanelButtons(session.status);

    console.log("Subscribing to telemetry for session:", session.id);
    currentTelemetryChannel = supabaseClient
      .channel(`quiz-session-${session.id}`)
      .on(
        'broadcast',
        { event: 'telemetry' },
        (payload) => {
          console.log("Telemetry event received:", payload);
          if (payload && payload.payload) {
            candidateLastSeen[payload.payload.guestId] = Date.now();
            
            if (payload.payload.userAnswers && currentLiveQuestionsLookup) {
               let liveScore = 0;
               Object.keys(payload.payload.userAnswers).forEach(qId => {
                 const selectedVal = payload.payload.userAnswers[qId];
                 const q = currentLiveQuestionsLookup[qId];
                 if (q) {
                    let isCorrect = false;
                    const correctIdx = q.correct_index;
                    
                    if (correctIdx !== null && correctIdx !== undefined && parseInt(correctIdx, 10) >= 0) {
                      const cIdxInt = parseInt(correctIdx, 10);
                      if (String(selectedVal).match(/^\d+$/) && parseInt(selectedVal, 10) === cIdxInt) {
                        isCorrect = true;
                      } else if (q.options && Array.isArray(q.options) && q.options[cIdxInt]) {
                        if (String(q.options[cIdxInt]).toLowerCase().trim() === String(selectedVal).toLowerCase().trim()) {
                          isCorrect = true;
                        }
                      } else if (typeof q.options === 'string') {
                         try {
                           const parsed = JSON.parse(q.options);
                           if (parsed[cIdxInt] && String(parsed[cIdxInt]).toLowerCase().trim() === String(selectedVal).toLowerCase().trim()) {
                              isCorrect = true;
                           }
                         } catch(e) {}
                      }
                    } else if (q.correct_option) {
                      let selectedText = String(selectedVal);
                      if (String(selectedVal).match(/^\d+$/)) {
                         const sIdx = parseInt(selectedVal, 10);
                         if (q.options && Array.isArray(q.options)) {
                            selectedText = String(q.options[sIdx] || selectedVal);
                         } else if (typeof q.options === 'string') {
                            try {
                               const parsed = JSON.parse(q.options);
                               selectedText = String(parsed[sIdx] || selectedVal);
                            } catch(e) {}
                         }
                      }
                      if (String(q.correct_option).toLowerCase().trim() === selectedText.toLowerCase().trim()) {
                        isCorrect = true;
                      }
                    }
                    if (isCorrect) liveScore++;
                 }
               });
               payload.payload.currentScore = liveScore;
            } else if (!payload.payload.userAnswers) {
               console.warn("Client did not send userAnswers payload. Candidate window likely needs a hard refresh.");
               showToast("Candidate telemetry sync error: User answers missing. Candidate should refresh their page.");
            }

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
  }

  // Ensure card is in the correct active grid container (moves it between main page and modal if needed)
  if (card.parentElement !== grid) {
    grid.appendChild(card);
  }

  // Remove idle status if they were idle
  card.classList.remove('status-idle');
  const idleText = card.querySelector('.idle-text');
  if (idleText) idleText.remove();

  const answered = data.answered || 0;
  const total = data.total || 0;
  const flagged = data.flagged || 0;
  const currentScore = data.currentScore || 0;
  const progressPercent = total > 0 ? Math.round((answered / total) * 100) : 0;
  const violationCount = data.violationCount || 0;
  const isDisqualified = data.isDisqualified || false;

  let statusBadge = '';
  if (isDisqualified) {
    statusBadge = `<span class="candidate-status-badge dq">DQ</span>`;
  } else if (violationCount > 0) {
    statusBadge = `<span class="candidate-status-badge warn">${violationCount} Violations</span>`;
  } else {
    statusBadge = `<span class="candidate-status-badge ok">Active</span>`;
  }

  const escapedName = escapeHTML(data.name || 'Anonymous');

  card.innerHTML = `
    <div class="candidate-header">
      <span class="candidate-name" title="${escapedName}">${escapedName}</span>
      <div class="candidate-badges">
        ${statusBadge}
        <span class="candidate-flagged">🚩 ${flagged}</span>
      </div>
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

  // Bind Candidate Profile Modal
  card.onclick = () => {
    currentCandidateTokenToKill = data.token || data.accessToken || data.guestId;
    openCandidateModal(data, progressPercent);
  };
}

function openCandidateModal(data, progressPercent) {
  const modal = document.getElementById('candidate-profile-modal');
  if (!modal) return;

  document.getElementById('modal-candidate-name').textContent = data.name || 'Anonymous';
  document.getElementById('modal-candidate-ticket').textContent = currentCandidateTokenToKill || 'N/A';
  document.getElementById('modal-candidate-score').textContent = `${data.currentScore || 0} / ${data.total || 0}`;
  document.getElementById('modal-candidate-flagged').textContent = data.flagged || 0;
  document.getElementById('modal-candidate-violations').textContent = data.violationCount || 0;
  document.getElementById('modal-candidate-progress').style.width = `${progressPercent}%`;

  modal.style.display = 'flex';
  modal.classList.remove('hidden');
}

const btnCloseModal = document.getElementById('btn-close-candidate-modal');
if (btnCloseModal) {
  btnCloseModal.onclick = () => {
    const modal = document.getElementById('candidate-profile-modal');
    modal.style.display = 'none';
    modal.classList.add('hidden');
    currentCandidateTokenToKill = null;
  };
}

window.openTelemetryModal = function (pin, title) {
  const modal = document.getElementById("telemetry-modal");
  const titleEl = document.getElementById("telemetry-modal-title");

  if (titleEl) titleEl.textContent = "Monitoring: " + title + " (PIN: " + pin + ")";
  if (modal) modal.classList.add("active");

  syncTelemetrySubscription(pin, "modal-telemetry-grid");
};

// ----------------------------------------------------
// Initialization
// ----------------------------------------------------
async function renderRecentPins() {
  const container = document.getElementById('recent-pins-container');
  if (!container || !supabaseClient) return;

  try {
    const { data: sessions, error } = await supabaseClient
      .from('quiz_sessions')
      .select('access_pin, status')
      .neq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(8);

    if (error || !sessions) return;

    container.innerHTML = sessions.map(s => {
      let statusColor = 'var(--color-gold)';
      if (s.status === 'in_progress') statusColor = '#10b981';
      if (s.status === 'evaluation') statusColor = '#f59e0b';
      return `<button class="recent-pin-btn" style="border-color: ${statusColor}; color: ${statusColor};" onclick="document.getElementById('live-session-pin').value='${s.access_pin}'; document.getElementById('live-session-pin').dispatchEvent(new Event('change'));" title="Status: ${s.status}">📌 ${s.access_pin}</button>`;
    }).join('');
  } catch (e) {
    console.warn("Failed to load active sessions for pins.", e);
  }
}

function initializeAdminUI() {
  const btnModalKill = document.getElementById('btn-modal-kill');
  if (btnModalKill) {
    btnModalKill.onclick = async () => {
      if (!currentCandidateTokenToKill) return showToast('No token found for this candidate.');
      const confirmed = await showCustomConfirm("Are you sure you want to irreversibly terminate this candidate's exam?");
      if (confirmed) {
        try {
          const { error } = await supabaseClient.from('session_tokens').update({ is_void: true }).eq('access_token', currentCandidateTokenToKill);
          if (error) throw error;
          showToast("Token Terminated Successfully.");
          const modal = document.getElementById('candidate-profile-modal');
          modal.style.display = 'none';
          modal.classList.add('hidden');
        } catch (err) {
          showToast("Failed to terminate token: " + err.message);
        }
      }
    };
  }

  const loginForm = document.getElementById('form-admin-login');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('admin-email').value.trim();
      const password = document.getElementById('admin-password').value;
      try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;

        showToast("Authentication successful.");
        document.getElementById('admin-login-container').style.display = 'none';
        document.getElementById('secure-dashboard-wrapper').style.display = 'block';

        loadQuizzes();
        startLiveMonitor();
      } catch (err) {
        showToast("Login failed: " + err.message);
      }
    });
  }

  supabaseClient.auth.getSession().then(({ data: { session } }) => {
    if (session) {
      const loginContainer = document.getElementById('admin-login-container');
      const secureWrapper = document.getElementById('secure-dashboard-wrapper');
      if (loginContainer) loginContainer.style.display = 'none';
      if (secureWrapper) secureWrapper.style.display = 'block';
      loadQuizzes();
      startLiveMonitor();

      // Recover Host Codes
      renderRecentPins();
      const savedPins = getSavedPins();
      if (savedPins.length > 0 && el.liveSessionPin && !el.liveSessionPin.value) {
        const mostRecentPin = savedPins[savedPins.length - 1];
        el.liveSessionPin.value = mostRecentPin;
        syncTelemetrySubscription(mostRecentPin, "live-telemetry-grid");
      }
    }
  });

  if (el.liveSessionPin) {
    el.liveSessionPin.addEventListener('change', (e) => {
      const pin = e.target.value.trim();
      if (pin.length === 6) {
        let savedPins = getSavedPins();
        if (!savedPins.includes(pin)) {
          savedPins.push(pin);
          if (savedPins.length > 5) savedPins.shift();
          savePins(savedPins);
          renderRecentPins();
        }
        syncTelemetrySubscription(pin, "live-telemetry-grid");
      }
    });
  }

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
        if (targetId === 'tab-history') {
          loadHistorySessions();
        }
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

  // Logout Button Event Listener
  const btnLogout = document.getElementById("btn-admin-logout");
  if (btnLogout) {
    btnLogout.addEventListener("click", async () => {
      try {
        await supabaseClient.auth.signOut();
        removeSavedPin('chronos_host_pin');

        // Hide secure dashboard wrapper
        const secureWrapper = document.getElementById('secure-dashboard-wrapper');
        if (secureWrapper) secureWrapper.style.display = 'none';

        // Show login container
        const loginContainer = document.getElementById('admin-login-container');
        if (loginContainer) loginContainer.style.display = 'block';

        // Clear login form inputs
        const emailInput = document.getElementById('admin-email');
        const passwordInput = document.getElementById('admin-password');
        if (emailInput) emailInput.value = '';
        if (passwordInput) passwordInput.value = '';

        showToast("Logged out successfully.");
      } catch (err) {
        showToast("Logout failed: " + err.message);
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
// History / Leaderboard Review
// ----------------------------------------------------
async function loadHistorySessions() {
  const listEl = document.getElementById('history-sessions-list');
  if (!listEl) return;
  listEl.innerHTML = '<p style="color: var(--color-text-secondary); font-size: 0.9rem;">Fetching past deployed sessions...</p>';

  try {
    const { data: sessions, error } = await supabaseClient
      .from('quiz_sessions')
      .select('id, access_pin, created_at, status, is_jumbled, display_mode, quizzes (title)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!sessions || sessions.length === 0) {
      listEl.innerHTML = '<p style="color: var(--color-text-secondary); font-size: 0.9rem;">No historical sessions found.</p>';
      return;
    }

    listEl.innerHTML = '';
    sessions.forEach(session => {
      const quizTitle = session.quizzes ? session.quizzes.title : 'Unknown Quiz';
      const date = new Date(session.created_at).toLocaleString();
      const isCompleted = session.status === 'completed';
      const statusBadge = isCompleted
        ? '<span style="color: #10b981; font-size: 0.8rem; border: 1px solid #10b981; padding: 2px 6px; border-radius: 4px;">Completed</span>'
        : `<span style="color: #fbbf24; font-size: 0.8rem; border: 1px solid #fbbf24; padding: 2px 6px; border-radius: 4px;">${session.status}</span>`;

      const div = document.createElement('div');
      div.className = 'history-session-item glassmorphism';
      div.style.padding = '1rem';
      div.style.cursor = 'pointer';
      div.style.transition = 'var(--transition-smooth)';
      div.style.display = 'flex';
      div.style.flexDirection = 'column';
      div.style.gap = '0.5rem';

      div.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong style="color: var(--color-gold-bright); font-size: 1.1rem;">PIN: ${session.access_pin || session.id.substring(0, 8)}</strong>
          ${statusBadge}
        </div>
        <div style="color: var(--color-text-primary); font-size: 0.95rem;">${quizTitle}</div>
        <div style="color: var(--color-text-secondary); font-size: 0.85rem;">${date}</div>
      `;

      div.onmouseover = () => { div.style.background = 'rgba(255, 215, 0, 0.1)'; };
      div.onmouseout = () => { div.style.background = ''; };
      div.onclick = () => {
        document.querySelectorAll('.history-session-item').forEach(el => el.style.border = '1px solid var(--border-gold)');
        div.style.border = '1px solid var(--color-gold-bright)';
        div.style.background = 'rgba(255, 215, 0, 0.15)';
        viewHistorySession(session.id, session.access_pin || session.id.substring(0, 8), quizTitle, date, session.status);
      };

      listEl.appendChild(div);
    });

  } catch (err) {
    console.error(err);
    listEl.innerHTML = `<p style="color: var(--color-error); font-size: 0.9rem;">Error loading history: ${err.message}</p>`;
  }
}

async function fetchHistorySessionResponses(sessionId) {
  let responses = [];
  let from = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const to = from + pageSize - 1;
    const { data, error } = await supabaseClient
      .from('user_responses')
      .select('participant_name, participant_guest_id, participant_email, is_correct, time_taken_ms, created_at, question_id, selected_option')
      .eq('session_id', sessionId)
      .range(from, to);

    if (error) throw error;

    if (data && data.length > 0) {
      responses = responses.concat(data);
      if (data.length < pageSize) {
        hasMore = false;
      } else {
        from += pageSize;
      }
    } else {
      hasMore = false;
    }
  }
  return responses;
}

async function viewHistorySession(sessionId, accessPin, quizTitle, dateString, status) {
  document.getElementById('history-detail-title').textContent = `Leaderboard for PIN: ${accessPin}`;
  document.getElementById('history-detail-meta').textContent = `${quizTitle} | ${dateString} | Status: ${status}`;

  const tbody = document.getElementById('history-leaderboard-body');
  const table = document.getElementById('history-leaderboard-table');
  const emptyState = document.getElementById('history-empty-state');

  if (!tbody || !table || !emptyState) return;

  tbody.innerHTML = '';
  table.style.display = 'none';
  emptyState.style.display = 'block';
  emptyState.textContent = 'Loading participant data...';

  try {
    const responses = await fetchHistorySessionResponses(sessionId);

    if (!responses || responses.length === 0) {
      emptyState.textContent = 'No participants submitted data for this session yet.';
      return;
    }

    const scoresMap = {};
    responses.forEach(r => {
      const key = r.participant_guest_id || (r.participant_name + "_" + (r.participant_email || "guest"));
      if (!scoresMap[key]) {
        scoresMap[key] = {
          name: r.participant_name,
          score: 0,
          timeMs: r.time_taken_ms || 0,
          answeredQuestions: new Set()
        };
      }

      // Deduplicate question_ids to strictly enforce 1 mark per question
      if (!scoresMap[key].answeredQuestions.has(r.question_id)) {
        scoresMap[key].answeredQuestions.add(r.question_id);
        if (r.is_correct) {
          scoresMap[key].score += 1;
        }
      }

      if (r.time_taken_ms > scoresMap[key].timeMs) {
        scoresMap[key].timeMs = r.time_taken_ms;
      }
    });

    const candidates = Object.values(scoresMap);
    candidates.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.timeMs - b.timeMs;
    });

    emptyState.style.display = 'none';
    table.style.display = 'table';

    candidates.forEach((c, idx) => {
      const tr = document.createElement('tr');

      let rankClass = '';
      if (idx === 0) rankClass = 'rank-1';
      else if (idx === 1) rankClass = 'rank-2';
      else if (idx === 2) rankClass = 'rank-3';

      tr.className = rankClass;

      const formatT = (ms) => {
        if (!ms) return 'N/A';
        const mins = Math.floor(ms / 60000);
        const secs = Math.floor((ms % 60000) / 1000);
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      };

      tr.innerHTML = `
        <td>#${idx + 1}</td>
        <td style="font-weight: 500;">${escapeHTML(c.name)}</td>
        <td style="color: var(--color-gold-bright); font-weight: 700;">${c.score}</td>
        <td>${formatT(c.timeMs)}</td>
      `;

      tbody.appendChild(tr);
    });

  } catch (err) {
    console.error(err);
    emptyState.textContent = 'Error loading session data: ' + err.message;
  }
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

// Image Preview Handling
function setupImagePreview(inputId, wrapperId, imgId, btnId) {
  const input = document.getElementById(inputId);
  const wrapper = document.getElementById(wrapperId);
  const img = document.getElementById(imgId);
  const btn = document.getElementById(btnId);

  if (!input || !wrapper || !img || !btn) return;

  input.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const objectUrl = URL.createObjectURL(file);
      img.src = objectUrl;
      wrapper.classList.remove("hidden");
      if (img.dataset.objectUrl) {
        URL.revokeObjectURL(img.dataset.objectUrl);
      }
      img.dataset.objectUrl = objectUrl;
    }
  });

  btn.addEventListener('click', () => {
    input.value = "";
    if (img.dataset.objectUrl) {
      URL.revokeObjectURL(img.dataset.objectUrl);
      delete img.dataset.objectUrl;
    }
    img.src = "";
    wrapper.classList.add("hidden");
  });
}

setupImagePreview('q-image', 'add-preview-wrapper', 'add-preview-img', 'add-btn-remove');
setupImagePreview('edit-q-image', 'edit-preview-wrapper', 'edit-preview-img', 'edit-btn-remove');


// Cancel Edit Mode Handler
const btnCancelEdit = document.getElementById('btn-cancel-edit');
if (btnCancelEdit) {
  btnCancelEdit.addEventListener('click', () => {
    document.getElementById('edit-question-container').classList.add('hidden');
    document.getElementById('form-edit-question').reset();
  });
}
