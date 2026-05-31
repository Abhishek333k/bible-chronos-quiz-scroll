/**
 * Bible Chronos Quiz Scroll - Client Application Logic
 * 
 * Features:
 * - State machine for view transitions
 * - Supabase authentication and session joining
 * - Real-time subscriptions for host state updates
 * - Fisher-Yates shuffle for questions and options
 * - High-precision speedrun timer (centisecond display)
 * - Anti-cheat engine (Fullscreen restriction, tabbing/blur detection, violation thresholds)
 * - Leaderboard ranking aggregation
 */

// ----------------------------------------------------
// 1. Configuration & Initialisation
// ----------------------------------------------------

// PLACEHOLDERS: Replace these with your actual Supabase project credentials.
const SUPABASE_URL = "https://ktdvbbouymbphuijkopl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0ZHZiYm91eW1icGh1aWprb3BsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMjA4MzUsImV4cCI6MjA5NTc5NjgzNX0.fFCvVMsonXmaRQOJ2_fwaV4lH-VCMfd9K8kXJ7toycQ";

let supabaseClient = null;

// Initialize Supabase Client if credentials are provided
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
  console.warn("Supabase is not initialized. Please configure SUPABASE_URL and SUPABASE_ANON_KEY in app.js.");
}

// ----------------------------------------------------
// 2. Application State Variables
// ----------------------------------------------------
let state = {
  // Participant Info
  name: "",
  email: "",
  sessionId: "",
  quizId: "",
  quizTitle: "Bible Quiz Scroll",

  // Quiz Content
  questions: [],
  currentQuestionIndex: 0,
  userAnswers: {}, // Format: { questionId: selectedOptionText }
  reviewFlags: {}, // Format: { questionId: boolean }

  // Speedrun Timer State
  startTime: null,
  totalTimeMs: 0,
  timerIntervalId: null,
  isTimerRunning: false,

  // Anti-Cheat Variables
  violationCount: 0,
  maxViolations: 3,
  isDisqualified: false,
  isCheatModalOpen: false,
  isAntiCheatEnabled: true,

  // Navigation / Views State
  currentView: "view-auth",
  realtimeChannel: null,
  
  // Settings
  isJumbled: true,
  displayMode: 'paged'
};

// ----------------------------------------------------
// 3. DOM Elements Cache
// ----------------------------------------------------
const el = {
  // Views
  viewAuth: document.getElementById("view-auth"),
  viewWaiting: document.getElementById("view-waiting"),
  viewGate: document.getElementById("view-gate"), // Keeping reference so showView doesn't break if passed, but it's removed from DOM
  viewQuiz: document.getElementById("view-quiz"),
  viewLock: document.getElementById("view-lock"),
  viewResults: document.getElementById("view-results"),
  viewBooklet: document.getElementById("view-booklet"),

  // Waiting Room specific
  waitingLoaderContainer: document.getElementById("waiting-loader-container"),
  gateContainer: document.getElementById("gate-container"),

  // Auth View
  authForm: document.getElementById("auth-form"),
  inputName: document.getElementById("input-name"),
  inputEmail: document.getElementById("input-email"),
  inputSessionPin: document.getElementById("input-session-pin"),

  // Waiting View
  summaryName: document.getElementById("summary-participant-name"),
  summarySessionId: document.getElementById("summary-session-id"),

  // Gate View
  btnEnterFullscreen: document.getElementById("btn-enter-fullscreen"),

  // Quiz View
  quizTitleText: document.getElementById("quiz-title-text"),
  chronosTimer: document.getElementById("chronos-timer"),
  progressText: document.getElementById("question-progress-text"),
  progressBarFill: document.getElementById("quiz-progress-fill"),
  questionIndexBadge: document.getElementById("question-index-badge"),
  questionContent: document.getElementById("question-content-text"),
  optionsWrapper: document.getElementById("quiz-options-wrapper"),
  btnPrevQuestion: document.getElementById("btn-prev-question"),
  btnNextQuestion: document.getElementById("btn-next-question"),
  btnSubmitScroll: document.getElementById("btn-submit-scroll"),
  quizRightColumn: document.getElementById("quiz-right-column"),
  questionMapGrid: document.getElementById("question-map-grid"),
  btnSubmitMap: document.getElementById("btn-submit-map"),
  quizContentArea: document.getElementById("quiz-content-area"),
  quizFooterActions: document.getElementById("quiz-footer-actions"),
  
  // Sticky Footer
  scrollStickyFooter: document.getElementById("scroll-sticky-footer"),
  footerCounter: document.getElementById("footer-counter"),

  // Lock View
  lockTimeTaken: document.getElementById("lock-time-taken"),

  // Results View
  userFinalScore: document.getElementById("user-final-score"),
  userFinalTime: document.getElementById("user-final-time"),
  userFinalViolations: document.getElementById("user-final-violations"),
  btnReviewAnswers: document.getElementById("btn-review-answers"),
  leaderboardTbody: document.getElementById("leaderboard-tbody"),
  btnRefreshLeaderboard: document.getElementById("btn-refresh-leaderboard"),
  btnExitToMenu: document.getElementById("btn-exit-to-menu"),

  // Booklet View
  bookletContent: document.getElementById("booklet-content"),
  btnBackLeaderboard: document.getElementById("btn-back-leaderboard"),

  // Custom Cheat Modal
  cheatModal: document.getElementById("cheat-modal"),
  modalViolationCount: document.getElementById("modal-violation-count"),
  btnResumeQuiz: document.getElementById("btn-resume-quiz"),

  // Notification Toast
  toast: document.getElementById("notification-toast"),
  toastMessage: document.getElementById("toast-message")
};

// ----------------------------------------------------
// 4. State Machine Navigation
// ----------------------------------------------------
function showView(viewId) {
  state.currentView = viewId;
  
  // Hide all views
  const views = [
    el.viewAuth,
    el.viewWaiting,
    el.viewQuiz,
    el.viewLock,
    el.viewResults,
    el.viewBooklet
  ];
  
  views.forEach(v => {
    if (v) v.classList.remove("active");
  });

  // Show active view
  const activeView = document.getElementById(viewId);
  if (activeView) {
    activeView.classList.add("active");
  }

  // Adjust header visibility
  const header = document.getElementById("main-header");
  if (viewId === "view-quiz" || viewId === "view-results") {
    header.style.display = "none";
  } else {
    header.style.display = "block";
  }
}

// ----------------------------------------------------
// 15. The Booklet View (Evaluated Scroll)
// ----------------------------------------------------
async function loadQuestionsIfNeeded() {
  if (state.questions && state.questions.length > 0) return;
  try {
    const { data: questions } = await supabaseClient.from("questions").select("*").eq("quiz_id", state.quizId);
    if (questions) state.questions = questions;
  } catch(e) { console.error(e); }
}

async function loadUserAnswersIfNeeded() {
  if (Object.keys(state.userAnswers).length > 0) return;
  try {
    const { data: responses } = await supabaseClient.from("user_responses").select("question_id, selected_option").eq("session_id", state.sessionId).eq("participant_guest_id", state.guestId);
    if (responses) {
      responses.forEach(r => {
        state.userAnswers[r.question_id] = r.selected_option;
      });
    }
  } catch(e) { console.error(e); }
}

el.btnReviewAnswers.addEventListener('click', async () => {
  const originalText = el.btnReviewAnswers.textContent;
  el.btnReviewAnswers.textContent = "Loading Booklet...";
  el.btnReviewAnswers.disabled = true;
  
  await loadQuestionsIfNeeded();
  await loadUserAnswersIfNeeded();
  
  renderBooklet();
  showView("view-booklet");
  
  el.btnReviewAnswers.textContent = originalText;
  el.btnReviewAnswers.disabled = false;
});

el.btnBackLeaderboard.addEventListener('click', () => {
  showView("view-results");
});

function renderBooklet() {
  el.bookletContent.innerHTML = '';
  
  if (!state.questions || state.questions.length === 0) return;
  
  state.questions.forEach((q, idx) => {
    const userChoice = state.userAnswers[q.id] || "No Answer Selected";
    const correctChoice = q.correct_option;
    const isCorrect = userChoice === correctChoice;
    
    const block = document.createElement('div');
    block.className = 'booklet-card card glassmorphism';
    
    let answerHtml = '';
    
    if (isCorrect) {
      answerHtml = `
        <div class="booklet-answer-box">
          <span class="booklet-label">Your Answer:</span>
          <span class="answer-correct">${userChoice}</span>
        </div>
      `;
    } else {
      answerHtml = `
        <div class="booklet-answer-box">
          <span class="booklet-label">Your Answer:</span>
          <span class="answer-wrong">${userChoice}</span>
        </div>
        <div class="booklet-answer-box" style="margin-top: 0.5rem;">
          <span class="booklet-label">Correct Answer:</span>
          <span class="answer-correct">${correctChoice}</span>
        </div>
      `;
    }
    
    block.innerHTML = `
      <h4 class="booklet-question-text">Q${idx + 1}. ${q.question_text}</h4>
      <div class="booklet-answers">
        ${answerHtml}
      </div>
    `;
    
    el.bookletContent.appendChild(block);
  });
}

// ----------------------------------------------------
// 5. Utility Functions
// ----------------------------------------------------

// Shuffles an array in place using the Fisher-Yates algorithm
function fisherYatesShuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Formats milliseconds to speedrun centisecond display: mm:ss.cc
function formatTime(totalMs) {
  if (isNaN(totalMs) || totalMs < 0) return "00:00.00";
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const centiseconds = Math.floor((totalMs % 1000) / 10);

  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  const cc = String(centiseconds).padStart(2, '0');

  return `${mm}:${ss}.${cc}`;
}

// Display lightweight notification toast
function showToast(message) {
  el.toastMessage.textContent = message;
  el.toast.classList.add("show");
  setTimeout(() => {
    el.toast.classList.remove("show");
  }, 4000);
}

// Check if string is a valid 6-digit PIN
function isValidPIN(str) {
  const regexExp = /^\d{6}$/;
  return regexExp.test(str);
}


// ----------------------------------------------------
// 6. View 1: Join Session & Auth Gate
// ----------------------------------------------------
el.authForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!supabaseClient) {
    showToast("Supabase is not configured yet! Please update SUPABASE_URL & ANON_KEY.");
    return;
  }

  const name = el.inputName.value.trim();
  const email = el.inputEmail.value.trim();
  const rawSessionPin = el.inputSessionPin.value.trim();

  if (!isValidPIN(rawSessionPin)) {
    showToast("Please enter a valid 6-Digit Access PIN.");
    return;
  }

  // Disable join button while connecting
  const submitBtn = document.getElementById("btn-join-session");
  submitBtn.disabled = true;
  submitBtn.textContent = "Connecting...";

  try {
    // 1. Fetch the Session details from database using the access PIN
    const { data: session, error: sessionError } = await supabaseClient
      .from("quiz_sessions")
      .select("*")
      .eq("access_pin", rawSessionPin)
      .single();

    if (sessionError || !session) {
      showToast("Access ID not found. Verify with your session host.");
      submitBtn.disabled = false;
      submitBtn.textContent = "Join Session";
      return;
    }

    // 2. Fetch Quiz Title details
    const { data: quiz, error: quizError } = await supabaseClient
      .from("quizzes")
      .select("title")
      .eq("id", session.quiz_id)
      .single();

    // Ensure Guest ID exists
    let guestId = sessionStorage.getItem("guest_id");
    if (!guestId) {
      guestId = window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : 'guest-' + Date.now() + Math.floor(Math.random()*1000);
      sessionStorage.setItem("guest_id", guestId);
    }

    // Store details in state
    state.name = name;
    state.email = email;
    state.guestId = guestId;
    state.sessionId = session.id; // Store the actual UUID for backend operations
    state.quizId = session.quiz_id;
    state.quizTitle = quiz ? quiz.title : "Sacred Scroll Exam";
    state.isJumbled = session.is_jumbled === false ? false : true;
    state.displayMode = session.display_mode || 'paged';
    state.isAntiCheatEnabled = session.is_anti_cheat_enabled !== false;

    // Setup UI summary
    el.summaryName.textContent = name;
    el.summarySessionId.textContent = rawSessionPin;
    el.quizTitleText.textContent = state.quizTitle;

    // Connect to real-time subscription for host state
    subscribeToSession();

    // Evaluate initial view based on session status
    evaluateSessionStatus(session.status);

  } catch (err) {
    console.error("Connection error:", err);
    showToast("Error connecting to Supabase: " + err.message);
    submitBtn.disabled = false;
    submitBtn.textContent = "Join Session";
  }
});

// ----------------------------------------------------
// 7. Supabase Realtime Subscription Integration
// ----------------------------------------------------
function subscribeToSession() {
  if (state.realtimeChannel) {
    state.realtimeChannel.unsubscribe();
  }

  // Subscribe to changes in the current quiz session
  state.realtimeChannel = supabaseClient
    .channel(`quiz-session-${state.sessionId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'quiz_sessions',
        filter: `id=eq.${state.sessionId}`
      },
      (payload) => {
        console.log("Realtime Session Update received:", payload.new);
        evaluateSessionStatus(payload.new.status);
      }
    )
    .subscribe();
}

function evaluateSessionStatus(status) {
  if (status === 'waiting') {
    showView("view-waiting");
    el.waitingLoaderContainer.style.display = 'block';
    el.gateContainer.style.display = 'none';
  } else if (status === 'in_progress') {
    // Only transition if we haven't already completed/locked or started
    if (state.currentView === 'view-auth' || state.currentView === 'view-waiting') {
      showView("view-waiting");
      el.waitingLoaderContainer.style.display = 'none';
      el.gateContainer.style.display = 'block';
      
      // Play a gentle professional chime sound
      const chimeUrl = "data:audio/wav;base64,UklGRmYBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YUMBAACAgICAgICAf3p2cW1pZmJgXVtYV1RTUVBOTUxLSUhGRURCQUA/Pjw7OTg3NTQzMjEwLy4tLCsqKSgnJiUkIyIhIB8eHRwbGhkYFxYVFBMSERAPDgwLCgkIBwYFBQQDAgEAAICAgICAgIB/enZxbWlmYmBdW1hXVFNQUE5NTEtJSEZFREJBQD8+PDs5ODc1NDMyMTAvLi0sKyopKCcms";
      try {
        const audio = new Audio(chimeUrl);
        audio.play().catch(e => console.warn("Audio playback prevented:", e));
      } catch(e) {}
    }
  } else if (status === 'completed') {
    // If the exam status changes to completed, pull the final leaderboard
    loadLeaderboardData();
    showView("view-results");
    
    // Stop timers and clean up exit flags
    stopTimer();
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }
}

// ----------------------------------------------------
// 8. View 3: The Exam Gate (Fullscreen Initiation)
// ----------------------------------------------------
el.btnEnterFullscreen.addEventListener("click", async () => {
  try {
    // Attempt to enter fullscreen (required anti-cheat trigger)
    const docEl = document.documentElement;
    if (docEl.requestFullscreen) {
      await docEl.requestFullscreen();
    } else if (docEl.webkitRequestFullscreen) {
      await docEl.webkitRequestFullscreen();
    } else if (docEl.msRequestFullscreen) {
      await docEl.msRequestFullscreen();
    }
  } catch (err) {
    console.warn("Fullscreen request rejected or not supported. Proceeding anyway...", err);
    showToast("Warning: Fullscreen tracking may be limited on this browser.");
  }

  // Load questions and start the speedrun
  await loadAndInitializeQuiz();
});

// ----------------------------------------------------
// 9. View 4: Shuffling & Active Quiz Loop
// ----------------------------------------------------
async function loadAndInitializeQuiz() {
  try {
    // Fetch all questions for this quiz
    const { data: questions, error } = await supabaseClient
      .from("questions")
      .select("*")
      .eq("quiz_id", state.quizId);

    if (error || !questions || questions.length === 0) {
      showToast("No questions found for this quiz. Exiting fullscreen...");
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
      showView("view-waiting");
      return;
    }

    // Shuffle questions with Fisher-Yates if jumbled
    state.questions = state.isJumbled ? fisherYatesShuffle(questions) : questions;
    state.currentQuestionIndex = 0;
    state.userAnswers = {};
    state.reviewFlags = {};
    state.violationCount = 0;
    state.isDisqualified = false;

    // Transition to the Quiz View
    showView("view-quiz");

    // Initialize & Start Speedrun Timer
    startTimer();

    // Render first question layout
    initializeQuizUI();

  } catch (err) {
    console.error("Quiz initialization error:", err);
    showToast("Failed to initialize quiz: " + err.message);
  }
}

function updateFooterCounter() {
  if (state.displayMode === 'scroll') {
    const answeredCount = Object.keys(state.userAnswers).length;
    const totalCount = state.questions.length;
    if (el.footerCounter) {
      el.footerCounter.textContent = `Answered: ${answeredCount} / ${totalCount}`;
    }
  }
}

function saveDisasterRecovery() {
  sessionStorage.setItem("inProgressQuiz", JSON.stringify({
    userAnswers: state.userAnswers,
    reviewFlags: state.reviewFlags,
    currentQuestionIndex: state.currentQuestionIndex,
    guestId: state.guestId,
    sessionId: state.sessionId,
    quizId: state.quizId,
    name: state.name,
    email: state.email,
    questions: state.questions,
    isJumbled: state.isJumbled,
    displayMode: state.displayMode,
    isAntiCheatEnabled: state.isAntiCheatEnabled,
    savedTimeMs: state.isTimerRunning ? Math.round(performance.now() - state.startTime) : state.totalTimeMs
  }));
}

function sendTelemetry() {
  if (state.realtimeChannel) {
    state.realtimeChannel.send({
      type: 'broadcast',
      event: 'telemetry',
      payload: {
        guestId: state.guestId,
        name: state.name,
        answered: Object.keys(state.userAnswers).length,
        total: state.questions.length,
        flagged: Object.keys(state.reviewFlags).length
      }
    });
  }
}

function initializeQuizUI() {
  if (state.displayMode === 'scroll') {
    el.quizRightColumn.style.display = 'none';
    el.quizFooterActions.style.display = 'none';
    el.quizContentArea.innerHTML = '';
    
    state.questions.forEach((q, index) => {
      const qBlock = document.createElement('div');
      qBlock.id = 'scroll-q-' + index;
      qBlock.className = 'scroll-question-block card glassmorphism paged-card';
      qBlock.innerHTML = `
        <div class="question-header">
          <span class="question-number-badge">Q${index + 1}</span>
          <h3 class="question-text">${q.question_text}</h3>
        </div>
        <div class="options-container" id="scroll-opts-${q.id}"></div>
        <div class="question-actions">
          <button class="btn-secondary btn-clear-response">🧹 Clear Response</button>
          <button class="btn-secondary btn-mark-review">🚩 Mark for Review</button>
        </div>
      `;
      el.quizContentArea.appendChild(qBlock);
      
      const optContainer = document.getElementById(`scroll-opts-${q.id}`);
      let originalOptions = Array.isArray(q.options) ? q.options : JSON.parse(q.options || "[]");
      // Use pre-shuffled options if they exist
      if (!q._shuffledOpts) {
        q._shuffledOpts = state.isJumbled ? fisherYatesShuffle([...originalOptions]) : [...originalOptions];
      }
      
      q._shuffledOpts.forEach((optText, optIdx) => {
        const letter = String.fromCharCode(65 + optIdx);
        const btn = document.createElement('button');
        btn.className = "option-btn";
        btn.innerHTML = `<span class="option-letter">${letter}.</span> <span class="option-text-content"></span>`;
        btn.querySelector(".option-text-content").textContent = optText;
        
        if (state.userAnswers[q.id] === optText) {
          btn.classList.add("selected");
        }
        
        btn.addEventListener('click', () => {
          optContainer.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          state.userAnswers[q.id] = optText;
          saveDisasterRecovery();
          updateFooterCounter();
          updateQuestionMap();
          sendTelemetry();
        });
        optContainer.appendChild(btn);
      });

      // Bind actions for this scroll question
      const btnClear = qBlock.querySelector('.btn-clear-response');
      const btnMark = qBlock.querySelector('.btn-mark-review');
      if (btnClear) {
        btnClear.addEventListener('click', () => {
          delete state.userAnswers[q.id];
          optContainer.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
          saveDisasterRecovery();
          updateFooterCounter();
          updateQuestionMap();
          sendTelemetry();
        });
      }
      if (btnMark) {
        if (state.reviewFlags[q.id]) {
          btnMark.classList.add('active-review');
        }
        btnMark.addEventListener('click', () => {
          if (state.reviewFlags[q.id]) {
            delete state.reviewFlags[q.id];
            btnMark.classList.remove('active-review');
          } else {
            state.reviewFlags[q.id] = true;
            btnMark.classList.add('active-review');
          }
          saveDisasterRecovery();
          updateQuestionMap();
          sendTelemetry();
        });
      }
    });
    
    const bottomMapContainer = document.createElement('div');
    bottomMapContainer.className = 'scroll-bottom-map card glassmorphism';
    bottomMapContainer.style.marginTop = '2rem';
    bottomMapContainer.innerHTML = `
      <h3 style="text-align:center; color:var(--color-gold); margin-bottom:1rem; font-family:var(--font-serif);">Scroll Wayfinder</h3>
      <div class="question-map-grid" id="scroll-bottom-map-grid"></div>
    `;
    el.quizContentArea.appendChild(bottomMapContainer);
    updateQuestionMap();
    
    // Toggle layout padding
    document.getElementById('quiz-main-layout').classList.add('scroll-mode-padding');
    
    if (el.scrollStickyFooter) el.scrollStickyFooter.style.display = 'flex';
    
    updateFooterCounter();
    
    el.progressText.textContent = `ALL`;
    el.progressBarFill.style.width = `100%`;
    sendTelemetry();
    
  } else {
    // Paged Mode
    document.getElementById('quiz-main-layout').classList.remove('scroll-mode-padding');
    el.quizRightColumn.style.display = 'block';
    el.quizFooterActions.style.display = 'flex';
    if (el.btnSubmitScroll) el.btnSubmitScroll.style.display = 'none';
    if (el.scrollStickyFooter) el.scrollStickyFooter.style.display = 'none';
    
    el.quizContentArea.innerHTML = `
      <div class="card glassmorphism quiz-card paged-card">
        <div class="question-header">
          <span class="question-number-badge" id="question-index-badge"></span>
          <h3 class="question-text" id="question-content-text"></h3>
        </div>
        <div class="options-container" id="quiz-options-wrapper"></div>
        <div class="question-actions">
          <button class="btn-secondary btn-clear-response">🧹 Clear Response</button>
          <button class="btn-secondary btn-mark-review">🚩 Mark for Review</button>
        </div>
      </div>
    `;
    
    el.questionIndexBadge = document.getElementById("question-index-badge");
    el.questionContent = document.getElementById("question-content-text");
    el.optionsWrapper = document.getElementById("quiz-options-wrapper");
    
    renderQuestionPaged();
  }
}

function updateQuestionMap() {
  const grids = [el.questionMapGrid];
  const scrollGrid = document.getElementById('scroll-bottom-map-grid');
  if (scrollGrid) grids.push(scrollGrid);

  grids.forEach(grid => {
    grid.innerHTML = '';
    state.questions.forEach((q, idx) => {
      const mapBtn = document.createElement('button');
      mapBtn.className = 'map-btn';
      mapBtn.textContent = idx + 1;
      
      const answered = !!state.userAnswers[q.id];
      const flagged = !!state.reviewFlags[q.id];
      
      if (flagged) {
        if (answered) {
          mapBtn.classList.add('map-review-answered');
        } else {
          mapBtn.classList.add('map-review-unanswered');
        }
      } else {
        if (answered) {
          mapBtn.classList.add('answered');
        } else {
          mapBtn.classList.add('unanswered');
        }
      }
      
      if (state.displayMode === 'scroll') {
        mapBtn.addEventListener('click', () => {
          const target = document.getElementById('scroll-q-' + idx);
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      } else {
        if (idx === state.currentQuestionIndex) mapBtn.classList.add('current');
        mapBtn.addEventListener('click', () => {
          state.currentQuestionIndex = idx;
          renderQuestionPaged();
        });
      }
      grid.appendChild(mapBtn);
    });
  });
}

function renderQuestionPaged() {
  const currentQuestion = state.questions[state.currentQuestionIndex];
  const totalQuestions = state.questions.length;
  
  el.progressText.textContent = `${state.currentQuestionIndex + 1}/${totalQuestions}`;
  el.progressBarFill.style.width = `${((state.currentQuestionIndex + 1) / totalQuestions) * 100}%`;
  
  el.questionIndexBadge.textContent = `Q${state.currentQuestionIndex + 1}`;
  el.questionContent.textContent = currentQuestion.question_text;
  
  el.optionsWrapper.innerHTML = "";
  
  // Navigation Buttons State
  el.btnPrevQuestion.style.display = state.currentQuestionIndex > 0 ? 'inline-block' : 'none';
  if (state.currentQuestionIndex === totalQuestions - 1) {
    el.btnNextQuestion.textContent = "Submit Exam";
    // Allow clicking submit even if not answered in this mode, or keep logic same
    el.btnNextQuestion.disabled = false;
  } else {
    el.btnNextQuestion.textContent = "Next Question";
    el.btnNextQuestion.disabled = false; // Always allow navigation in paged mode
  }
  
  updateQuestionMap();
  
  let originalOptions = Array.isArray(currentQuestion.options) ? currentQuestion.options : JSON.parse(currentQuestion.options || "[]");
  
  // If we want consistency, we should pre-shuffle options and store them, or re-seed.
  // For simplicity, we just use the original options array or shuffle it on every render,
  // but shuffling on every render changes the order.
  // Better to attach shuffled options to the question object during initialization!
  if (!currentQuestion._shuffledOpts) {
    currentQuestion._shuffledOpts = state.isJumbled ? fisherYatesShuffle([...originalOptions]) : [...originalOptions];
  }
  
  currentQuestion._shuffledOpts.forEach((optText, index) => {
    const letter = String.fromCharCode(65 + index);
    const button = document.createElement("button");
    button.className = "option-btn";
    button.innerHTML = `<span class="option-letter">${letter}.</span> <span class="option-text-content"></span>`;
    button.querySelector(".option-text-content").textContent = optText;
    
    if (state.userAnswers[currentQuestion.id] === optText) {
      button.classList.add("selected");
    }
    
    button.addEventListener("click", () => {
      document.querySelectorAll(".option-btn").forEach(btn => btn.classList.remove("selected"));
      button.classList.add("selected");
      state.userAnswers[currentQuestion.id] = optText;
      saveDisasterRecovery();
      updateQuestionMap(); // Update grid style
      sendTelemetry();
    });
    
    el.optionsWrapper.appendChild(button);
  });

  // Bind actions for paged mode
  const btnClear = el.quizContentArea.querySelector('.btn-clear-response');
  const btnMark = el.quizContentArea.querySelector('.btn-mark-review');
  if (btnClear) {
    btnClear.onclick = () => {
      delete state.userAnswers[currentQuestion.id];
      el.optionsWrapper.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
      saveDisasterRecovery();
      updateQuestionMap();
      sendTelemetry();
    };
  }
  if (btnMark) {
    if (state.reviewFlags[currentQuestion.id]) {
      btnMark.classList.add('active-review');
    } else {
      btnMark.classList.remove('active-review');
    }
    btnMark.onclick = () => {
      if (state.reviewFlags[currentQuestion.id]) {
        delete state.reviewFlags[currentQuestion.id];
        btnMark.classList.remove('active-review');
      } else {
        state.reviewFlags[currentQuestion.id] = true;
        btnMark.classList.add('active-review');
      }
      saveDisasterRecovery();
      updateQuestionMap();
      sendTelemetry();
    };
  }
  sendTelemetry();
}

// Next/Submit Button Click Listener
el.btnNextQuestion.addEventListener("click", () => {
  const totalQuestions = state.questions.length;
  if (state.currentQuestionIndex < totalQuestions - 1) {
    state.currentQuestionIndex++;
    renderQuestionPaged();
  } else {
    // Submit Quiz normally
    submitQuiz(false);
  }
});

el.btnPrevQuestion.addEventListener("click", () => {
  if (state.currentQuestionIndex > 0) {
    state.currentQuestionIndex--;
    renderQuestionPaged();
  }
});

el.btnSubmitScroll.addEventListener("click", () => {
  if (confirm("Are you sure you want to submit the exam?")) {
    submitQuiz(false);
  }
});

// Also attach event to the sticky footer submit button if it exists separately, but we can reuse btnSubmitScroll. 
// Assuming btn-submit-scroll is moved to the sticky footer in HTML.

el.btnSubmitMap.addEventListener("click", () => {
  if (confirm("Are you sure you want to submit the exam?")) {
    submitQuiz(false);
  }
});

// ----------------------------------------------------
// 10. Speedrun Timer Mechanism
// ----------------------------------------------------
function startTimer(offsetMs = 0) {
  state.startTime = performance.now() - offsetMs;
  state.isTimerRunning = true;
  
  function updateClock() {
    if (!state.isTimerRunning) return;
    const now = performance.now();
    const delta = now - state.startTime;
    el.chronosTimer.textContent = formatTime(delta);
    requestAnimationFrame(updateClock);
  }

  requestAnimationFrame(updateClock);
}

// Stops timer and calculates final speedrun elapsed time
function stopTimer() {
  if (state.isTimerRunning) {
    state.isTimerRunning = false;
    state.totalTimeMs = Math.round(performance.now() - state.startTime);
  }
}

// ----------------------------------------------------
// 11. Security Engine (Anti-Cheat Scripting)
// ----------------------------------------------------

function handleViolation(reason) {
  // If we are not actively in the quiz view or already DQ'd, ignore
  // Also ignore if Anti-Cheat is disabled for this session
  if (!state.isAntiCheatEnabled || state.currentView !== "view-quiz" || state.isDisqualified) return;

  state.violationCount++;
  console.warn(`Anti-Cheat Triggered. Reason: ${reason}. Violation count: ${state.violationCount}`);

  if (state.violationCount >= state.maxViolations) {
    // Flag as Disqualified and immediately submit
    state.isDisqualified = true;
    closeCheatModal();
    submitQuiz(true); // true = forced auto-submit due to cheating
  } else {
    // Show warn modal overlay
    openCheatModal();
  }
}

function openCheatModal() {
  state.isCheatModalOpen = true;
  el.modalViolationCount.textContent = state.violationCount;
  el.cheatModal.classList.add("active");
}

function closeCheatModal() {
  state.isCheatModalOpen = false;
  el.cheatModal.classList.remove("active");
}

// Resume quiz button triggers re-entering fullscreen
el.btnResumeQuiz.addEventListener("click", async () => {
  closeCheatModal();
  try {
    const docEl = document.documentElement;
    if (!document.fullscreenElement) {
      if (docEl.requestFullscreen) {
        await docEl.requestFullscreen();
      } else if (docEl.webkitRequestFullscreen) {
        await docEl.webkitRequestFullscreen();
      }
    }
  } catch (err) {
    console.warn("Could not re-enter fullscreen:", err);
  }
});

// Event Listeners for Anti-Cheat Monitoring
document.addEventListener("fullscreenchange", () => {
  // If the user left fullscreen and they are actively taking a quiz
  if (!document.fullscreenElement && state.currentView === "view-quiz" && !state.isCheatModalOpen) {
    handleViolation("Exited fullscreen mode");
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && state.currentView === "view-quiz") {
    handleViolation("Switched tab/minimized window");
  }
});

window.addEventListener("blur", () => {
  if (state.currentView === "view-quiz") {
    handleViolation("Focus lost from quiz window");
  }
});

// ----------------------------------------------------
// 12. View 5 & 6: Submission Ledger & Leaderboard
// ----------------------------------------------------
async function submitQuiz(isForcedCheater = false) {
  stopTimer();
  
  // Exit Fullscreen mode cleanly
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }

  // Switch to submission lock screen immediately
  showView("view-lock");
  el.lockTimeTaken.textContent = formatTime(state.totalTimeMs);

  if (isForcedCheater) {
    showToast("⚠️ SECURITY EXCLUSION: Exam submitted automatically due to tabbing/cheat violations.");
  }

  try {
    const responsesToInsert = state.questions.map(q => {
      const selected = state.userAnswers[q.id];
      
      // If cheater and did not answer this question yet, or if they tabbed out completely
      let selectedOptionToSave = selected || "NO_RESPONSE";
      let isCorrectValue = false;

      if (isForcedCheater) {
        // Flag remaining answers with a special DQ string
        if (!selected) {
          selectedOptionToSave = "AUTO_SUBMIT_DQ";
        }
        isCorrectValue = false;
      } else {
        isCorrectValue = (selected === q.correct_option);
      }

      return {
        session_id: state.sessionId,
        question_id: q.id,
        selected_option: selectedOptionToSave,
        is_correct: isCorrectValue,
        participant_name: state.name,
        participant_email: state.email || null,
        participant_guest_id: state.guestId,
        time_taken_ms: state.totalTimeMs
      };
    });

    // Write all responses in one bulk insert operation to the database ledger
    const { error } = await supabaseClient
      .from("user_responses")
      .insert(responsesToInsert);

    if (error) {
      throw error;
    }

    sessionStorage.removeItem("inProgressQuiz");
    showToast("Exam results successfully certified on the scroll ledger.");

  } catch (err) {
    console.error("Submission error:", err);
    showToast("Ledger insertion failed. Please contact your host. Details: " + err.message);
  }
}

async function loadLeaderboardData() {
  try {
    // 1. Fetch all user responses recorded for this specific session
    const { data: responses, error } = await supabaseClient
      .from("user_responses")
      .select("participant_name, participant_email, is_correct, time_taken_ms, selected_option")
      .eq("session_id", state.sessionId);

    if (error) throw error;

    // 2. Aggregate metrics on client-side
    // Group records by email (unique ID)
    const userGroups = {};

    responses.forEach(r => {
      const key = r.participant_email;
      if (!userGroups[key]) {
        userGroups[key] = {
          name: r.participant_name,
          email: r.participant_email,
          correctCount: 0,
          totalCount: 0,
          timeTakenMs: r.time_taken_ms,
          isCheater: false
        };
      }

      // Check if flagged with DQ
      if (r.selected_option === "AUTO_SUBMIT_DQ") {
        userGroups[key].isCheater = true;
      }

      if (r.is_correct) {
        userGroups[key].correctCount++;
      }
      userGroups[key].totalCount++;
    });

    // Convert grouping object to sorted array
    const rankings = Object.values(userGroups).sort((a, b) => {
      // Cheaters/DQ always ranked at bottom
      if (a.isCheater && !b.isCheater) return 1;
      if (!a.isCheater && b.isCheater) return -1;

      // Higher correct count comes first
      if (b.correctCount !== a.correctCount) {
        return b.correctCount - a.correctCount;
      }
      
      // Speedrun time: lower time comes first (faster)
      return a.timeTakenMs - b.timeTakenMs;
    });

    // 3. Render Personal metrics
    const currentUserKey = state.email;
    const currentUserData = userGroups[currentUserKey];

    if (currentUserData) {
      el.userFinalScore.textContent = `${currentUserData.correctCount}/${currentUserData.totalCount}`;
      el.userFinalTime.textContent = formatTime(currentUserData.timeTakenMs);
      el.userFinalViolations.textContent = state.violationCount + (state.isDisqualified ? " (Disqualified)" : "");
    }

    // 4. Render Table HTML
    el.leaderboardTbody.innerHTML = "";

    if (rankings.length === 0) {
      el.leaderboardTbody.innerHTML = `<tr><td colspan="5" class="text-center">No participants recorded yet.</td></tr>`;
      return;
    }

    rankings.forEach((player, idx) => {
      const tr = document.createElement("tr");
      
      // Highlight current user
      if (player.email === state.email) {
        tr.className = "user-row";
      }

      // Rank Badges
      let rankText = `<span class="rank-badge other">${idx + 1}</span>`;
      if (idx === 0) rankText = `<span class="rank-badge first">1</span>`;
      else if (idx === 1) rankText = `<span class="rank-badge second">2</span>`;
      else if (idx === 2) rankText = `<span class="rank-badge third">3</span>`;

      // Status text
      let statusString = "Completed";
      if (player.isCheater) {
        statusString = `<span class="status-check dq">DQ (Violations)</span>`;
      } else {
        statusString = `<span class="status-check">Active</span>`;
      }

      tr.innerHTML = `
        <td class="text-center">${rankText}</td>
        <td><strong>${player.name}</strong> ${player.email === state.email ? "(You)" : ""}</td>
        <td class="text-center">${player.correctCount}/${player.totalCount}</td>
        <td class="text-center font-mono">${formatTime(player.timeTakenMs)}</td>
        <td>${statusString}</td>
      `;

      el.leaderboardTbody.appendChild(tr);
    });

  } catch (err) {
    console.error("Leaderboard loading error:", err);
    showToast("Failed to load rankings: " + err.message);
  }
}

// Event Bindings for final view actions
el.btnRefreshLeaderboard.addEventListener("click", () => {
  loadLeaderboardData();
  showToast("Leaderboard standings refreshed.");
});

el.btnExitToMenu.addEventListener("click", () => {
  // Clear local session state and clean up Realtime subscriptions
  sessionStorage.removeItem("inProgressQuiz");
  if (state.realtimeChannel) {
    state.realtimeChannel.unsubscribe();
    state.realtimeChannel = null;
  }
  
  state.name = "";
  state.email = "";
  state.guestId = "";
  state.sessionId = "";
  state.quizId = "";
  state.questions = [];
  state.currentQuestionIndex = 0;
  state.userAnswers = {};
  state.reviewFlags = {};
  state.violationCount = 0;
  state.isDisqualified = false;

  if (el.inputSessionPin) el.inputSessionPin.value = "";
  
  const submitBtn = document.getElementById("btn-join-session");
  submitBtn.disabled = false;
  submitBtn.textContent = "Join Session";

  showView("view-auth");
});

// ----------------------------------------------------
// 13. Disaster Recovery (Auto-Save Restore)
// ----------------------------------------------------
function restoreSavedSession() {
  const recoveryData = sessionStorage.getItem("inProgressQuiz");
  if (recoveryData) {
    try {
      const saved = JSON.parse(recoveryData);
      // Restore state
      state.userAnswers = saved.userAnswers || {};
      state.reviewFlags = saved.reviewFlags || {};
      state.currentQuestionIndex = saved.currentQuestionIndex;
      state.guestId = saved.guestId;
      state.sessionId = saved.sessionId;
      state.quizId = saved.quizId;
      state.name = saved.name;
      state.email = saved.email;
      state.questions = saved.questions;
      state.isJumbled = saved.isJumbled !== undefined ? saved.isJumbled : true;
      state.displayMode = saved.displayMode || 'paged';
      state.isAntiCheatEnabled = saved.isAntiCheatEnabled !== false;
      
      // Update UI summary
      el.summaryName.textContent = state.name;
      
      // Resubscribe to realtime
      subscribeToSession();
      
      // Restore to quiz view immediately
      showView("view-quiz");
      initializeQuizUI();
      startTimer(saved.savedTimeMs || 0); // Resume clock exactly where it was left off
      
      // Trigger anti-cheat for reloading
      handleViolation("Page Reload / Disaster Recovery Triggered");
      
    } catch (e) {
      console.warn("Failed to parse recovery data", e);
    }
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", restoreSavedSession);
} else {
  restoreSavedSession();
}
