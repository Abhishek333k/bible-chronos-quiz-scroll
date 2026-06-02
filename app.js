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
    } catch (e) {}
  },
  removeItem: (key) => {
    try {
      window.localStorage.removeItem(key);
    } catch (e) {}
  }
};

let supabaseClient = null;

// Initialize Supabase Client if credentials are provided
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
  console.warn("Supabase is not initialized. Please configure SUPABASE_URL and SUPABASE_ANON_KEY in app.js.");
}

// ----------------------------------------------------
// 1.5. Dynamic Viewport Resizer
// ----------------------------------------------------
function setDynamicViewportHeight() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}
window.addEventListener('resize', setDynamicViewportHeight);
window.addEventListener('orientationchange', setDynamicViewportHeight);
setDynamicViewportHeight();

// ----------------------------------------------------
// 1.6. Security Helpers
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
// 1.7. Grading and State Helpers
// ----------------------------------------------------
function getSelectedOptionIndex(q, answer) {
  if (answer === undefined || answer === null || answer === '') return -1;
  const originalOptions = Array.isArray(q.options) ? q.options : JSON.parse(q.options || "[]");
  const index = parseInt(answer, 10);
  if (!isNaN(index) && index >= 0 && index < originalOptions.length) {
    return index;
  }
  const text = String(answer).trim().toLowerCase();
  return originalOptions.findIndex(opt => opt && opt.trim().toLowerCase() === text);
}

function getSelectedOptionText(q, answer) {
  if (answer === undefined || answer === null || answer === '') return null;
  const originalOptions = Array.isArray(q.options) ? q.options : JSON.parse(q.options || "[]");
  const index = parseInt(answer, 10);
  if (!isNaN(index) && index >= 0 && index < originalOptions.length) {
    return originalOptions[index];
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
  if (q.correct_index !== null && q.correct_index !== undefined && q.correct_index !== '') {
    const idx = parseInt(q.correct_index, 10);
    if (idx >= 0 && idx < originalOptions.length) {
      return originalOptions[idx];
    }
  }
  return q.correct_option || null;
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
  textScale: 1,

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
  btnTextDecrease: document.getElementById("btn-text-decrease"),
  btnTextReset: document.getElementById("btn-text-reset"),
  btnTextIncrease: document.getElementById("btn-text-increase"),
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

// Hardened Certified Booklet Hydration Pipeline
async function renderBooklet() {
  const container = document.getElementById('booklet-content');
  if (!container) return;
  container.innerHTML = '';

  await loadQuestionsIfNeeded();
  
  // Forcibly hydrate states straight from the certified database ledger 
  // This shields the UI against browser refreshes or local state purges
  const { data: serverRecords, error } = await supabaseClient
    .from("user_responses")
    .select("question_id, selected_option, is_correct")
    .eq("session_id", state.sessionId)
    .eq("participant_guest_id", state.guestId); // Querying by specific candidate

  if (error || !serverRecords) {
    container.textContent = "Error synchronizing historic records.";
    return;
  }

  state.questions.forEach((q, idx) => {
    const historicalRow = serverRecords.find(r => r.question_id === q.id);
    const originalOptions = Array.isArray(q.options) ? q.options : JSON.parse(q.options || "[]");
    
    let userText = "No Response Provided";
    if (historicalRow && historicalRow.selected_option !== "NO_RESPONSE" && historicalRow.selected_option !== "AUTO_SUBMIT_DQ") {
      const parsedVal = parseInt(historicalRow.selected_option, 10);
      if (!isNaN(parsedVal) && parsedVal >= 0 && parsedVal < originalOptions.length) {
        userText = originalOptions[parsedVal];
      } else {
        // Fallback for legacy records stored as direct text
        userText = historicalRow.selected_option;
      }
    }
    
    const correctText = originalOptions[q.correct_index] || "Unspecified Correct Answer";
    const isMarkedCorrect = historicalRow ? historicalRow.is_correct : false;

    const block = document.createElement('div');
    block.className = 'booklet-card card glassmorphism';
    
    // Hardened XSS Protection Layer via native element construction
    const title = document.createElement('h4');
    title.className = 'booklet-question-text scale-text';
    title.textContent = `Q${idx + 1}. ${q.question_text}`;
    block.appendChild(title);

    const box = document.createElement('div');
    box.className = 'booklet-answers scale-text';
    box.innerHTML = isMarkedCorrect ? 
      `<div class="booklet-answer-box booklet-correct"><span class="booklet-label">Your Answer:</span> <span class="answer-val"></span></div>` :
      `<div class="booklet-answer-box booklet-incorrect"><span class="booklet-label">Your Answer:</span> <span class="answer-val error-text"></span></div>
       <div class="booklet-answer-box booklet-actual-correct" style="margin-top:0.5rem;"><span class="booklet-label">Correct Target:</span> <span class="answer-target"></span></div>`;
    
    if (isMarkedCorrect) {
      box.querySelector('.answer-val').textContent = userText;
    } else {
      box.querySelector('.answer-val').textContent = userText;
      box.querySelector('.answer-target').textContent = correctText;
    }
    
    block.appendChild(box);
    container.appendChild(block);
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
  const token = el.inputSessionPin.value.trim();

  if (!name || token.length !== 6) {
    showToast("Please provide your name and a valid 6-digit token.");
    return;
  }

  const submitBtn = document.getElementById("btn-join-session");
  submitBtn.disabled = true;
  submitBtn.textContent = "Connecting...";

  try {
    // 1. Verify token against the ledger
    const { data: tokenRecord, error: tokenError } = await supabaseClient
      .from('session_tokens')
      .select('*, quiz_sessions(status, is_jumbled, display_mode, quiz_id, completed_at, quizzes(title))')
      .eq('access_token', token)
      .single();

    if (tokenError || !tokenRecord) {
      throw new Error("Invalid or unrecognized token.");
    }
    
    const sessionRecord = tokenRecord.quiz_sessions;
    if (!sessionRecord) throw new Error("Linked session not found.");

    // 2. Collision / Crash-Recovery Protocol
    if (tokenRecord.is_claimed) {
      // Allow re-entry if local memory signature matches, indicating a browser crash or refresh
      const localGuestId = sessionStorage.getItem("guest_id");
      if (tokenRecord.assigned_name !== name && tokenRecord.id !== localGuestId) {
         throw new Error("This token has already been claimed by another participant.");
      }
      console.warn("Recovering previous state from token...");
    } else {
      // 3. Claim the token for this specific participant
      const { error: claimError } = await supabaseClient
        .from('session_tokens')
        .update({ is_claimed: true, assigned_name: name })
        .eq('access_token', token);
        
      if (claimError) throw claimError;
    }

    // Assign operational variables
    state.sessionId = tokenRecord.session_id;
    state.guestId = tokenRecord.id; // Using the token UUID as the guest identity
    state.participantName = name;
    state.name = name;
    state.accessToken = token;
    state.quizId = sessionRecord.quiz_id;
    state.isJumbled = sessionRecord.is_jumbled === false ? false : true;
    state.displayMode = sessionRecord.display_mode || 'paged';
    state.isAntiCheatEnabled = false; // TEMPORARILY DISABLED FOR TESTING
    
    sessionStorage.setItem("guest_id", state.guestId);
    sessionStorage.setItem("participantName", name);
    sessionStorage.setItem("accessToken", token);
    
    // Extract Quiz Title directly from the joined record to avoid secondary query failures
    state.quizTitle = (sessionRecord.quizzes && sessionRecord.quizzes.title) ? sessionRecord.quizzes.title : "Sacred Scroll Exam";

    // Setup UI summary
    el.summaryName.textContent = name;
    el.summarySessionId.textContent = token;
    
    // Also set top-bar profile
    const topName = document.getElementById("top-candidate-name");
    const topId = document.getElementById("top-candidate-id");
    if (topName) topName.textContent = name;
    if (topId) topId.textContent = "#" + token;

    if (el.quizTitleText) el.quizTitleText.textContent = state.quizTitle;

    // Determine Status
    let initialStatus = sessionRecord.status;
    if (initialStatus === 'in_progress' && sessionRecord.completed_at) {
      initialStatus = 'evaluation';
    }

    if (initialStatus === 'completed' || initialStatus === 'evaluation') {
      // Since they have the token, they must be the original owner if we got past the claim check
      subscribeToSession();
      if (initialStatus === 'completed') {
        await loadLeaderboardData();
        showView("view-results");
      } else {
        // evaluation status
        showView("view-lock");
        const lockTitle = el.viewLock.querySelector('.card-title');
        const lockDesc = el.viewLock.querySelector('.card-description');
        if (lockTitle) lockTitle.textContent = "Exam Halted for Evaluation";
        if (lockDesc) lockDesc.textContent = "Exam Halted. Proctors are currently evaluating the results. Please wait.";
      }
      return;
    }

    // Invoke gateway transition
    subscribeToSession();
    evaluateSessionStatus(initialStatus);
    
  } catch (err) {
    console.error("Gateway Authorization Failed:", err);
    showToast(err.message);
  } finally {
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
  if (state.tokenRealtimeChannel) {
    state.tokenRealtimeChannel.unsubscribe();
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
        let effectiveStatus = payload.new.status;
        if (effectiveStatus === 'in_progress' && payload.new.completed_at) {
          effectiveStatus = 'evaluation';
        }
        evaluateSessionStatus(effectiveStatus);
      }
    )
    .subscribe((status) => {
      console.log(`Session realtime status: ${status}`);
      if (status === "SUBSCRIBED") {
        sendTelemetry();
      }
    });

  // Secondary channel: Targeted Token Guillotine (Kill-Switch)
  state.tokenRealtimeChannel = supabaseClient
    .channel(`token-monitor-${state.accessToken}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'session_tokens',
        filter: `access_token=eq.${state.accessToken}`
      },
      (payload) => {
        if (payload.new.is_void === true) {
          sessionStorage.clear();
          alert("Your session has been terminated by the administrator.");
          window.location.reload();
        }
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
      
      // Audio chime removed to prevent NotSupportedError from truncated base64 string
      console.log("Gate is open!");
    }
  } else if (status === 'evaluation') {
    // Exam halted by admin
    if (state.currentView === 'view-quiz') {
      submitQuiz(false); // Force submit if they are taking the quiz
    } else if (state.currentView !== 'view-results') {
      showView("view-lock");
    }
    
    // Update the lock screen message
    const lockTitle = el.viewLock.querySelector('.card-title');
    const lockDesc = el.viewLock.querySelector('.card-description');
    if (lockTitle) lockTitle.textContent = "Exam Halted for Evaluation";
    if (lockDesc) lockDesc.textContent = "Exam Halted. Proctors are currently evaluating the results. Please wait.";
    
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
    if (state.isAntiCheatEnabled) {
      // Attempt to enter fullscreen (required anti-cheat trigger)
      const docEl = document.documentElement;
      if (docEl.requestFullscreen) {
        await docEl.requestFullscreen();
      } else if (docEl.webkitRequestFullscreen) {
        await docEl.webkitRequestFullscreen();
      } else if (docEl.msRequestFullscreen) {
        await docEl.msRequestFullscreen();
      }
    }
  } catch (err) {
    console.warn("Fullscreen request rejected or not supported. Proceeding anyway...", err);
    showToast("Warning: Fullscreen tracking may be limited on this browser.");
  }

  // Recalculate viewport height once fullscreen transition starts
  setTimeout(setDynamicViewportHeight, 200);
  setTimeout(setDynamicViewportHeight, 600); // Safari fallback

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
      .eq("quiz_id", state.quizId)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

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
  try {
    sessionStorage.setItem("inProgressQuiz", JSON.stringify({
      userAnswers: state.userAnswers,
      reviewFlags: state.reviewFlags,
      currentQuestionIndex: state.currentQuestionIndex,
      guestId: state.guestId,
      sessionId: state.sessionId,
      quizId: state.quizId,
      quizTitle: state.quizTitle,
      name: state.name,
      email: state.email,
      accessToken: state.accessToken,
      questions: state.questions,
      isJumbled: state.isJumbled,
      displayMode: state.displayMode,
      isAntiCheatEnabled: state.isAntiCheatEnabled,
      savedTimeMs: state.isTimerRunning ? Math.round(performance.now() - state.startTime) : state.totalTimeMs
    }));
  } catch (e) {
    console.warn("Storage restricted");
  }
}

function sendTelemetry() {
  if (state.realtimeChannel) {
    let currentScore = 0;
    Object.keys(state.userAnswers).forEach(qId => {
      const q = state.questions.find(x => x.id === qId);
      if (q) {
        const selectedVal = state.userAnswers[qId];
        const selectedIndex = getSelectedOptionIndex(q, selectedVal);
        const selectedText = getSelectedOptionText(q, selectedVal);
        const correctChoiceIndex = getCorrectOptionIndex(q);
        const correctChoiceText = getCorrectOptionText(q);
        
        let isCorrectValue = false;
        if (correctChoiceIndex !== -1) {
          isCorrectValue = (selectedIndex === correctChoiceIndex);
        } else if (correctChoiceText) {
          isCorrectValue = (selectedText && selectedText.trim().toLowerCase() === correctChoiceText.trim().toLowerCase());
        }

        if (isCorrectValue) {
          currentScore++;
        }
      }
    });

    state.realtimeChannel.send({
      type: 'broadcast',
      event: 'telemetry',
      payload: {
        guestId: state.guestId,
        name: state.name,
        accessToken: state.accessToken,
        answered: Object.keys(state.userAnswers).length,
        total: state.questions.length,
        flagged: Object.keys(state.reviewFlags).length,
        currentScore: currentScore,
        violationCount: state.violationCount,
        isDisqualified: state.isDisqualified
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
      const imageHtml = q.image_url ? `<img class="question-media" src="${q.image_url}" alt="Question Image" style="display: block;">` : `<img class="question-media" src="" alt="Question Image" style="display: none;">`;
      qBlock.innerHTML = `
        <div class="question-header">
          <span class="question-number-badge">Q${index + 1}</span>
          <h3 class="question-text"></h3>
        </div>
        ${imageHtml}
        <div class="options-container" id="scroll-opts-${q.id}"></div>
        <div class="question-actions">
          <button class="btn-secondary btn-clear-response">🧹 Clear Response</button>
          <button class="btn-secondary btn-mark-review">🚩 Mark for Review</button>
        </div>
      `;
      qBlock.querySelector('.question-text').textContent = q.question_text;
      el.quizContentArea.appendChild(qBlock);
      
      const optContainer = document.getElementById(`scroll-opts-${q.id}`);
      let originalOptions = Array.isArray(q.options) ? q.options : JSON.parse(q.options || "[]");
      // Shuffle indices [0, 1, 2, 3] instead of raw text
      if (!q._shuffledIndices) {
        const indices = [0, 1, 2, 3].slice(0, originalOptions.length);
        q._shuffledIndices = state.isJumbled ? fisherYatesShuffle(indices) : indices;
      }
      
      q._shuffledIndices.forEach((origIdx, displayIdx) => {
        const optText = originalOptions[origIdx];
        const letter = String.fromCharCode(65 + displayIdx);
        const btn = document.createElement('button');
        btn.className = "option-btn";
        btn.innerHTML = `<span class="option-letter">${letter}.</span> <span class="option-text-content"></span>`;
        btn.querySelector(".option-text-content").textContent = optText;
        
        if (getSelectedOptionIndex(q, state.userAnswers[q.id]) === origIdx) {
          btn.classList.add("selected");
        }
        
        btn.addEventListener('click', () => {
          optContainer.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          state.userAnswers[q.id] = origIdx;
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
    
    // Remove previous if exists
    const oldFab = document.getElementById('wayfinder-fab');
    if (oldFab) oldFab.remove();
    const oldModal = document.getElementById('wayfinder-modal');
    if (oldModal) oldModal.remove();

    // Create FAB
    const fab = document.createElement('div');
    fab.id = 'wayfinder-fab';
    fab.innerHTML = '🧭';
    fab.className = 'wayfinder-fab glassmorphism';
    document.body.appendChild(fab);

    // Create Modal
    const bottomMapContainer = document.createElement('div');
    bottomMapContainer.id = 'wayfinder-modal';
    bottomMapContainer.className = 'scroll-bottom-map card glassmorphism wayfinder-modal hidden';
    bottomMapContainer.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <h3 style="color:var(--color-gold); margin: 0; font-family:var(--font-serif);">Scroll Wayfinder</h3>
        <button id="close-wayfinder" style="background: transparent; border: none; color: var(--color-text-secondary); font-size: 1.5rem; cursor: pointer;">✕</button>
      </div>
      <div class="question-map-grid" id="scroll-bottom-map-grid"></div>
      <div style="margin-top: 2rem;">
        <button id="btn-final-submit" class="btn-primary btn-block">Confirm Submission</button>
      </div>
    `;
    document.body.appendChild(bottomMapContainer);
    
    updateQuestionMap();
    
    // Toggle Modal & Draggable Logic
    let isDragging = false;
    let dragStartX, dragStartY;
    let initialX, initialY;
    let currentX = 0, currentY = 0;
    let minX = 0, maxX = 0, minY = 0, maxY = 0;

    function setTranslate(xPos, yPos, el) {
      el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
    }

    function dragStart(e) {
      isDragging = false;
      bottomMapContainer.classList.add('hidden'); // Close modal if they start dragging the bubble
      
      const rect = fab.getBoundingClientRect();
      const originX = rect.left - currentX;
      const originY = rect.top - currentY;
      
      // Calculate boundaries based on screen size (padding of 10px)
      minX = -(originX - 10);
      maxX = window.innerWidth - rect.width - originX - 10;
      minY = -(originY - 10);
      maxY = window.innerHeight - rect.height - originY - 10;

      const clientX = e.type === "touchstart" ? e.touches[0].clientX : e.clientX;
      const clientY = e.type === "touchstart" ? e.touches[0].clientY : e.clientY;
      initialX = clientX - currentX;
      initialY = clientY - currentY;
      dragStartX = clientX;
      dragStartY = clientY;
      
      fab.style.transition = 'none'; // Disable transition for instant finger follow
    }

    function drag(e) {
      const clientX = e.type === "touchmove" ? e.touches[0].clientX : e.clientX;
      const clientY = e.type === "touchmove" ? e.touches[0].clientY : e.clientY;
      
      // Threshold to detect actual drag instead of a sloppy tap
      if (Math.abs(clientX - dragStartX) > 8 || Math.abs(clientY - dragStartY) > 8) {
        isDragging = true;
      }
      
      if (isDragging) {
        if(e.cancelable) e.preventDefault(); // Prevent scrolling while dragging
        
        let targetX = clientX - initialX;
        let targetY = clientY - initialY;
        
        // Clamp to screen boundaries
        currentX = Math.max(minX, Math.min(maxX, targetX));
        currentY = Math.max(minY, Math.min(maxY, targetY));
        
        setTranslate(currentX, currentY, fab);
      }
    }

    function dragEnd(e) {
      if (!isDragging) {
        // It was a click
        if (bottomMapContainer.classList.contains('hidden')) {
          const rect = fab.getBoundingClientRect();
          const modalWidth = Math.min(320, window.innerWidth - 20);
          
          bottomMapContainer.style.width = modalWidth + 'px';
          bottomMapContainer.style.maxWidth = 'none'; // Override CSS max-width
          bottomMapContainer.style.bottom = 'auto';
          bottomMapContainer.style.top = 'auto';
          bottomMapContainer.style.left = 'auto';
          bottomMapContainer.style.right = 'auto';
          
          // Anchor horizontally with overflow protection
          if (rect.left > window.innerWidth / 2) {
            let rightPos = window.innerWidth - rect.right;
            rightPos = Math.max(10, rightPos);
            if (rightPos + modalWidth > window.innerWidth - 10) {
              rightPos = window.innerWidth - modalWidth - 10;
            }
            bottomMapContainer.style.right = rightPos + 'px';
          } else {
            let leftPos = rect.left;
            leftPos = Math.max(10, leftPos);
            if (leftPos + modalWidth > window.innerWidth - 10) {
              leftPos = window.innerWidth - modalWidth - 10;
            }
            bottomMapContainer.style.left = leftPos + 'px';
          }
          
          // Anchor vertically with overflow protection
          if (rect.top > window.innerHeight / 2) {
            bottomMapContainer.style.bottom = Math.max(10, window.innerHeight - rect.top + 10) + 'px';
          } else {
            bottomMapContainer.style.top = Math.max(10, rect.bottom + 10) + 'px';
          }
        }
        bottomMapContainer.classList.remove('hidden');
      } else {
        // Snap to nearest edge
        fab.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)';
        const rect = fab.getBoundingClientRect();
        const absoluteCenterX = rect.left + (rect.width / 2);
        
        if (absoluteCenterX < window.innerWidth / 2) {
          currentX = minX; // Snap to Left Edge
        } else {
          currentX = maxX; // Snap to Right Edge
        }
        setTranslate(currentX, currentY, fab);
      }
      isDragging = false;
    }

    fab.addEventListener('touchstart', dragStart, { passive: true });
    fab.addEventListener('touchend', dragEnd, { passive: true });
    fab.addEventListener('touchmove', drag, { passive: false });

    fab.addEventListener('mousedown', (e) => {
      dragStart(e);
      document.addEventListener('mousemove', drag);
      document.addEventListener('mouseup', function mouseUpListener(ev) {
        document.removeEventListener('mousemove', drag);
        document.removeEventListener('mouseup', mouseUpListener);
        dragEnd(ev);
      });
    });
    
    document.getElementById('close-wayfinder').addEventListener('click', () => {
      bottomMapContainer.classList.add('hidden');
    });
    
    document.getElementById('btn-final-submit').addEventListener('click', async () => {
      bottomMapContainer.classList.add('hidden');
      if (await showCustomConfirm("Are you sure you want to submit the exam?")) {
        submitQuiz(false);
      }
    });
    
    // Toggle layout padding (no longer need extra padding at bottom)
    document.getElementById('quiz-main-layout').classList.remove('scroll-mode-padding');
    
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
      
      const answered = state.userAnswers[q.id] !== undefined;
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
  
  const imgElement = document.getElementById("question-image");
  if (imgElement) {
    if (currentQuestion.image_url) {
      imgElement.src = currentQuestion.image_url;
      imgElement.style.display = "block";
    } else {
      imgElement.style.display = "none";
    }
  }
  
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
  if (!currentQuestion._shuffledIndices) {
    const indices = [0, 1, 2, 3].slice(0, originalOptions.length);
    currentQuestion._shuffledIndices = state.isJumbled ? fisherYatesShuffle(indices) : indices;
  }
  
  currentQuestion._shuffledIndices.forEach((origIdx, displayIdx) => {
    const optText = originalOptions[origIdx];
    const letter = String.fromCharCode(65 + displayIdx);
    const button = document.createElement("button");
    button.className = "option-btn";
    button.innerHTML = `<span class="option-letter">${letter}.</span> <span class="option-text-content"></span>`;
    button.querySelector(".option-text-content").textContent = optText;
    
    if (getSelectedOptionIndex(currentQuestion, state.userAnswers[currentQuestion.id]) === origIdx) {
      button.classList.add("selected");
    }
    
    button.addEventListener("click", () => {
      document.querySelectorAll(".option-btn").forEach(btn => btn.classList.remove("selected"));
      button.classList.add("selected");
      state.userAnswers[currentQuestion.id] = origIdx;
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
  const bottomMapContainer = document.getElementById('wayfinder-modal');
  if (bottomMapContainer) {
    bottomMapContainer.classList.remove('hidden');
  }
});

// Also attach event to the sticky footer submit button if it exists separately, but we can reuse btnSubmitScroll. 
// Assuming btn-submit-scroll is moved to the sticky footer in HTML.

el.btnSubmitMap.addEventListener("click", async () => {
  if (await showCustomConfirm("Are you sure you want to submit the exam?")) {
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
    if (state.isAntiCheatEnabled) {
      const docEl = document.documentElement;
      if (!document.fullscreenElement) {
        if (docEl.requestFullscreen) {
          await docEl.requestFullscreen();
        } else if (docEl.webkitRequestFullscreen) {
          await docEl.webkitRequestFullscreen();
        }
      }
    }
  } catch (err) {
    console.warn("Could not re-enter fullscreen:", err);
  }
});

// Event Listeners for Anti-Cheat Monitoring
document.addEventListener("fullscreenchange", () => {
  if (state.isAntiCheatEnabled === true) {
    // If the user left fullscreen and they are actively taking a quiz
    if (!document.fullscreenElement && state.currentView === "view-quiz" && !state.isCheatModalOpen) {
      handleViolation("Exited fullscreen mode");
    }
  }
});

document.addEventListener("visibilitychange", () => {
  if (state.isAntiCheatEnabled === true) {
    if (document.hidden && state.currentView === "view-quiz") {
      handleViolation("Switched tab/minimized window");
    }
  }
});

window.addEventListener("blur", () => {
  if (state.isAntiCheatEnabled === true) {
    if (state.currentView === "view-quiz") {
      handleViolation("Focus lost from quiz window");
    }
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
      const selectedVal = state.userAnswers[q.id];
      const selectedIndex = getSelectedOptionIndex(q, selectedVal);
      const selectedText = getSelectedOptionText(q, selectedVal);
      const correctChoiceIndex = getCorrectOptionIndex(q);
      const correctChoiceText = getCorrectOptionText(q);
      
      // If cheater and did not answer this question yet, or if they tabbed out completely
      let selectedOptionToSave = (selectedIndex !== -1) ? selectedIndex.toString() : (selectedText || "NO_RESPONSE");
      let isCorrectValue = false;

      if (isForcedCheater) {
        // Flag remaining answers with a special DQ string
        if (selectedVal === undefined) {
          selectedOptionToSave = "AUTO_SUBMIT_DQ";
        }
        isCorrectValue = false;
      } else {
        if (correctChoiceIndex !== -1) {
          isCorrectValue = (selectedIndex === correctChoiceIndex);
        } else if (correctChoiceText) {
          isCorrectValue = (selectedText && selectedText.trim().toLowerCase() === correctChoiceText.trim().toLowerCase());
        }
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

async function fetchSessionResponses(sessionId) {
  let responses = [];
  let from = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const to = from + pageSize - 1;
    const { data, error } = await supabaseClient
      .from("user_responses")
      .select("participant_name, participant_email, participant_guest_id, is_correct, time_taken_ms, selected_option, question_id")
      .eq("session_id", sessionId)
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

async function loadLeaderboardData() {
  try {
    // 1. Fetch all user responses recorded for this specific session using pagination
    const responses = await fetchSessionResponses(state.sessionId);

    // 2. Aggregate metrics on client-side
    // Group records by unique guest ID or name+email combo
    const userGroups = {};

    responses.forEach(r => {
      const key = r.participant_guest_id || (r.participant_name + "_" + (r.participant_email || "guest"));
      if (!userGroups[key]) {
        userGroups[key] = {
          name: r.participant_name,
          email: r.participant_email,
          guestId: r.participant_guest_id,
          correctCount: 0,
          totalCount: 0,
          timeTakenMs: r.time_taken_ms,
          isCheater: false,
          answeredQuestions: new Set()
        };
      }

      // Deduplicate marks to ensure strictly 1 mark per question
      if (userGroups[key].answeredQuestions.has(r.question_id)) {
        return;
      }
      userGroups[key].answeredQuestions.add(r.question_id);

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
    const currentUserKey = state.guestId || state.email || (state.name + "_" + (state.email || "guest"));
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
      const isMe = (player.guestId && player.guestId === state.guestId) || 
                   (!player.guestId && player.name === state.name && player.email === state.email);
      if (isMe) {
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
        <td><strong>${escapeHTML(player.name)}</strong> ${isMe ? "(You)" : ""}</td>
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
  let recoveryData = null;
  try {
    recoveryData = sessionStorage.getItem("inProgressQuiz");
  } catch (e) {
    console.warn("Storage restricted");
  }
  
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
      state.quizTitle = saved.quizTitle || "Sacred Scroll Exam";
      state.name = saved.name;
      state.email = saved.email;
      state.accessToken = saved.accessToken || sessionStorage.getItem("accessToken");
      state.questions = saved.questions;
      state.isJumbled = saved.isJumbled !== undefined ? saved.isJumbled : true;
      state.displayMode = saved.displayMode || 'paged';
      state.isAntiCheatEnabled = false; // TEMPORARILY DISABLED FOR TESTING
      
      // Update UI summary
      el.summaryName.textContent = state.name;
      
      // Also set top-bar profile
      const topName = document.getElementById("top-candidate-name");
      const topId = document.getElementById("top-candidate-id");
      if (topName) topName.textContent = state.name;
      if (topId) topId.textContent = "#" + state.accessToken;
      
      if (el.quizTitleText) el.quizTitleText.textContent = state.quizTitle;

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

// ----------------------------------------------------
// 21. Accessibility: WCAG Text Scaling Engine
// ----------------------------------------------------
function updateTextScale(modifier) {
  if (modifier === 0) {
    state.textScale = 1;
  } else {
    state.textScale += modifier;
    // Clamp the scale multiplier between 0.8 (min) and 1.6 (max)
    if (state.textScale < 0.8) state.textScale = 0.8;
    if (state.textScale > 1.6) state.textScale = 1.6;
  }
  // Apply globally via CSS variable injection
  document.documentElement.style.setProperty('--text-scale', state.textScale);
}

if (el.btnTextDecrease) el.btnTextDecrease.addEventListener('click', () => updateTextScale(-0.1));
if (el.btnTextReset) el.btnTextReset.addEventListener('click', () => updateTextScale(0));
if (el.btnTextIncrease) el.btnTextIncrease.addEventListener('click', () => updateTextScale(0.1));
