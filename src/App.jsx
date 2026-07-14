import { useState, useEffect, useRef, useCallback, useContext, createContext } from "react";

// ─── PERSISTENT STORAGE LAYER (real localStorage — for production deployment) ──
// Note: when testing inside Claude's artifact preview, localStorage isn't
// available there, so an in-memory fallback is used automatically. Once this
// runs on a real deployed site (GitHub Pages / Vercel / Netlify / your own
// server), it will use real localStorage and data will persist across reloads.
const _memoryStore = {};
const _hasRealLocalStorage = (() => {
  try { const k = "__dp_test__"; window.localStorage.setItem(k, "1"); window.localStorage.removeItem(k); return true; }
  catch { return false; }
})();
const DB = {
  get: (key) => {
    try {
      if (_hasRealLocalStorage) { const raw = window.localStorage.getItem(key); return raw === null ? null : JSON.parse(raw); }
      const v = _memoryStore[key]; return v === undefined ? null : JSON.parse(JSON.stringify(v));
    } catch { return null; }
  },
  set: (key, val) => {
    try {
      if (_hasRealLocalStorage) { window.localStorage.setItem(key, JSON.stringify(val)); return true; }
      _memoryStore[key] = JSON.parse(JSON.stringify(val)); return true;
    } catch { return false; }
  },
  del: (key) => {
    try {
      if (_hasRealLocalStorage) { window.localStorage.removeItem(key); return; }
      delete _memoryStore[key];
    } catch {}
  },
};

const initDB = () => {
  if (!DB.get("dp_initialized")) {
    DB.set("dp_users", [
      { id: "admin", name: "Admin", phone: "9000000000", password: "admin123",
        diamonds: 0, referralCode: "ADMIN00", referredBy: null, totalDeposited: 0,
        totalWithdrawn: 0, gamesPlayed: 0, joinedAt: new Date().toISOString(), isAdmin: true, email: "admin@diamondplay.in",
        isAgent: false, commissionPaid: 0, customCommissionPercent: null,
        isDepositOperator: false,
        frozen: false, frozenReason: null, bonusDiamonds: 0, cashbackDiamonds: 0 }
    ]);
    DB.set("dp_transactions", []);
    DB.set("dp_notifications_admin", []);
    DB.set("dp_agent_requests", []);
    DB.set("dp_gateway_logs", []);
    DB.set("dp_wallet_adjustments", []);
    DB.set("dp_chat_threads", []);
    DB.set("dp_platform_config", {
      siteName: "DiamondPlay",
      upiId: "diamondplay@upi",
      upiName: "DiamondPlay Gaming",
      minDeposit: 100,
      minWithdraw: 200,
      withdrawFeePercent: 5,
      welcomeBonus: 50,
      dailyReward: 25,
      bannerText: "🎉 Deposit ₹1000+ get 20% bonus diamonds!",
      maintenanceMode: false,
      gameCost: 5,
      scratchCost: 10,
      agentCommissionPercent: 10,
      diceWinRate: 17,
      numberWinRate: 10,
      scratchWinRate: 33,
      tournamentEnabled: true,
      gameTournaments: { color: true, dice: true, number: true, scratch: true },
      tournamentPrizes: [
        { rank: 1, label: "🥇 1st Place", prize: 5000, color: "#ffd700", active: true },
        { rank: 2, label: "🥈 2nd Place", prize: 2500, color: "#c0c0c0", active: true },
        { rank: 3, label: "🥉 3rd Place", prize: 1000, color: "#cd7f32", active: true },
        { rank: 4, label: "4th–5th",      prize: 500,  color: "#00d4ff", active: true },
        { rank: 6, label: "6th–10th",     prize: 200,  color: "#b537f2", active: true },
      ],
    });
    DB.set("dp_diamond_packs", [
      { id: "p1", diamonds: 100, price: 100, bonus: 0, popular: false, label: "Starter" },
      { id: "p2", diamonds: 500, price: 490, bonus: 10, popular: false, label: "Basic" },
      { id: "p3", diamonds: 1000, price: 950, bonus: 50, popular: true, label: "Popular" },
      { id: "p4", diamonds: 2500, price: 2300, bonus: 200, popular: false, label: "Pro" },
      { id: "p5", diamonds: 5000, price: 4500, bonus: 500, popular: false, label: "Elite" },
      { id: "p6", diamonds: 10000, price: 8500, bonus: 1500, popular: false, label: "VIP" },
    ]);
    DB.set("dp_support_tickets", [
      { id: "tk1", userId: "admin", userName: "Rahul Sharma", phone: "9876543210", subject: "Deposit not credited", message: "I sent ₹500 via GPay but diamonds not added yet, UTR 402918837465.", channel: "ticket", priority: "high", status: "open", createdAt: new Date(Date.now()-3*3600000).toISOString(), replies: [] },
      { id: "tk2", userId: "admin", userName: "Priya Singh", phone: "9123456780", subject: "Withdrawal delay", message: "Requested withdrawal 2 days ago, still pending. Please check.", channel: "whatsapp", priority: "medium", status: "in_progress", createdAt: new Date(Date.now()-26*3600000).toISOString(), replies: [{ from: "admin", text: "Checking with the payments team, will update you shortly.", at: new Date(Date.now()-20*3600000).toISOString() }] },
      { id: "tk3", userId: "admin", userName: "Amit Verma", phone: "9988776655", subject: "Account login issue", message: "Unable to login, OTP screen stuck.", channel: "email", priority: "low", status: "resolved", createdAt: new Date(Date.now()-90*3600000).toISOString(), replies: [{ from: "admin", text: "Cache issue on your end — resolved after reinstall. Closing ticket.", at: new Date(Date.now()-85*3600000).toISOString() }] },
      { id: "tk4", userId: "admin", userName: "Sneha Patel", phone: "9871234560", subject: "Game not loading", message: "Color game screen goes blank after I place a bet.", channel: "chat", priority: "medium", status: "open", createdAt: new Date(Date.now()-1*3600000).toISOString(), replies: [] },
    ]);
    DB.set("dp_complaints", [
      { id: "cp1", userId: "admin", userName: "Vikram Rao", phone: "9090909090", category: "Payment", message: "Charged twice for the same deposit pack.", status: "investigating", createdAt: new Date(Date.now()-10*3600000).toISOString() },
      { id: "cp2", userId: "admin", userName: "Anjali Mehta", phone: "9012345678", category: "Fair Play", message: "Suspect the color game odds changed after I won twice.", status: "open", createdAt: new Date(Date.now()-40*3600000).toISOString() },
      { id: "cp3", userId: "admin", userName: "Karan Joshi", phone: "9345678901", category: "Referral", message: "My referral bonus was never credited to my agent wallet.", status: "resolved", createdAt: new Date(Date.now()-120*3600000).toISOString() },
    ]);
    DB.set("dp_initialized", true);
  }
};

// ─── REAL-TIME ADMIN ALERTS ───────────────────────────────────────────────────
const pushAdminAlert = (type, data) => {
  const alerts = DB.get("dp_notifications_admin") || [];
  const alert = { id: `a_${Date.now()}`, type, data, time: new Date().toISOString(), read: false };
  DB.set("dp_notifications_admin", [alert, ...alerts].slice(0, 100));
};

// ─── LIVE CHAT (user ↔ admin) ─────────────────────────────────────────────────
// One thread per user, stored in dp_chat_threads. Each thread carries the full
// back-and-forth so both sides see a real conversation, not just a one-shot ticket.
const getOrCreateChatThread = (user) => {
  const threads = DB.get("dp_chat_threads") || [];
  let thread = threads.find(t => t.userId === user.id);
  if (!thread) {
    thread = {
      id: `chat_${user.id}`,
      userId: user.id,
      userName: user.name,
      phone: user.phone,
      status: "open",
      messages: [],
      lastSeenByUser: new Date().toISOString(),
      lastSeenByAdmin: null,
      updatedAt: new Date().toISOString(),
    };
    DB.set("dp_chat_threads", [thread, ...threads]);
  }
  return thread;
};

const sendChatMessage = (userLike, from, text) => {
  const threads = DB.get("dp_chat_threads") || [];
  let thread = threads.find(t => t.userId === userLike.id);
  if (!thread) thread = getOrCreateChatThread(userLike);
  const freshThreads = DB.get("dp_chat_threads") || [];
  const msg = { id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, from, text, at: new Date().toISOString() };
  const updated = freshThreads.map(t =>
    t.id === thread.id
      ? { ...t, messages: [...t.messages, msg], status: from === "user" ? "open" : t.status, updatedAt: msg.at }
      : t
  );
  DB.set("dp_chat_threads", updated);
  if (from === "user") {
    pushAdminAlert("chat_message", { userName: userLike.name, phone: userLike.phone, text, threadId: thread.id, time: msg.at });
  }
  return msg;
};

// ─── UTILS ────────────────────────────────────────────────────────────────────
const fmt = (n) => n?.toLocaleString("en-IN") ?? "0";
const fmtINR = (n) => `₹${n?.toLocaleString("en-IN") ?? "0"}`;
const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const uid = () => `u_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const tid = () => `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const timeAgo = (iso) => {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

// ─── STYLES ───────────────────────────────────────────────────────────────────
const S = {
  app: { minHeight: "100vh", maxWidth: 430, margin: "0 auto", background: "#0a0a1a", color: "#fff", fontFamily: "'Inter',-apple-system,sans-serif", position: "relative" },
  page: { paddingBottom: 90, minHeight: "100vh" },
  neonBlue: "#00d4ff", neonPurple: "#b537f2", neonGold: "#ffd700",
  neonGreen: "#00ff88", neonPink: "#ff3d9a", neonOrange: "#ff6b35",
  bg1: "#0a0a1a", bg2: "#0f0f2e",
  glass: "rgba(255,255,255,0.07)",
  gradBlue: "linear-gradient(135deg,#00d4ff,#b537f2)",
  gradGold: "linear-gradient(135deg,#ffd700,#ff6b35)",
  gradGreen: "linear-gradient(135deg,#00ff88,#00d4ff)",
  gradPink: "linear-gradient(135deg,#ff3d9a,#b537f2)",
  gradDark: "linear-gradient(180deg,#0f0f2e,#0a0a1a)",
};

// ─── LANGUAGE / i18n ──────────────────────────────────────────────────────────
const LANGUAGES = [
  { code: "en", label: "English", native: "English" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
  { code: "mr", label: "Marathi", native: "मराठी" },
  { code: "ta", label: "Tamil", native: "தமிழ்" },
];

const TRANSLATIONS = {
  en: {
    // Bottom nav
    nav_home: "Home", nav_games: "Games", nav_wallet: "Wallet", nav_top: "Top", nav_profile: "Profile",
    // Landing
    landing_tagline: "India's most exciting Diamond gaming platform. Real rewards every day!",
    landing_start: "💎 Start Playing Free",
    landing_login: "Already have account? Login",
    landing_terms: "By continuing you agree to our Terms & Privacy Policy",
    // Auth
    auth_create_account: "Create Account 🚀", auth_welcome_back: "Welcome Back 👋",
    auth_verify_human: "Verify You're Human 🤖", auth_almost_done: "Almost Done! 🎉",
    auth_register_sub: "Register with your mobile number", auth_login_sub: "Login with your mobile number",
    auth_captcha_sub: "Type the code shown below to continue",
    auth_name_sub: "Enter your name to complete registration",
    auth_mobile_placeholder: "Mobile Number", auth_continue: "Continue →",
    auth_verifying: "Verifying…", auth_verified_redirect: "Verified! Redirecting…",
    auth_new_code: "🔄 Get a new code", auth_verify_continue: "Verify & Continue →",
    auth_verify_verifying: "Verifying...", auth_verified: "Verified ✓",
    auth_full_name: "Full Name", auth_full_name_ph: "Your full name",
    auth_referral: "Referral Code (optional)", auth_referral_ph: "Friend's code for 50💎 bonus",
    auth_creating: "Creating...", auth_start_playing: "🎉 Start Playing!",
    auth_welcome_bonus: "🎁 Welcome Bonus!",
    auth_welcome_bonus_sub: "Get {n} FREE Diamonds on signup",
    // Home
    home_welcome: "Welcome back 👋",
    home_balance: "Your Diamond Balance",
    home_cashout: "≈ {v} cashout value",
    home_buy: "+ Buy", home_wallet: "💳 Wallet", home_withdraw: "↗ Withdraw",
    home_stats_games: "Games", home_stats_txns: "Transactions", home_stats_rank: "Rank",
    home_mini_games: "🎮 Mini Games", home_see_all: "See all →",
    home_to_play: "to play",
    home_tournament: "Weekly Tournament",
    home_tournament_sub: "Play more games • Climb the leaderboard • Win big!",
    home_ends_in: "ENDS IN",
    home_live_standings: "LIVE STANDINGS",
    home_your_rank: "Your rank",
    home_rank_move_up: "play more to move up!",
    home_be_first: "Be the first to play and top the leaderboard! 🚀",
    home_view_leaderboard: "View full leaderboard →",
    // Games hub
    games_lobby: "🎮 Game Lobby",
    // Wallet
    wallet_title: "💼 Wallet",
    wallet_tab_buy: "💎 Buy", wallet_tab_withdraw: "⬆️ Withdraw", wallet_tab_history: "📜 History",
    wallet_how_it_works: "💳 How it works",
    wallet_choose_pack: "Choose a Diamond Pack",
    wallet_available_balance: "Available Balance",
    wallet_after_fee: "≈ {v} after {p}% fee",
    wallet_diamonds_to_withdraw: "Diamonds to Withdraw",
    wallet_min_diamonds: "Min {n} Diamonds",
    wallet_your_upi: "Your UPI ID",
    wallet_fee: "Fee: 💎{n} ({p}%)",
    wallet_you_receive: "You receive: {v}",
    wallet_request_withdrawal: "⬆️ Request Withdrawal",
    wallet_submitting: "Submitting...",
    wallet_withdraw_note: "Withdrawal processed within 24 hours after admin approval",
    wallet_no_txns: "No transactions yet",
    wallet_total_deposited: "Total Deposited",
    wallet_total_withdrawn: "Total Withdrawn",
    wallet_deposit_history: "Deposit History",
    wallet_withdraw_history: "Withdrawal History",
    wallet_pay_via_upi: "Pay via UPI",
    wallet_youre_buying: "You're buying",
    wallet_send_payment_to: "📲 Send payment to",
    wallet_ive_paid: "✅ I've Paid — Enter UTR Number →",
    wallet_credited_note: "Diamonds credited within 30 minutes after verification",
    wallet_submit_proof: "Submit Payment Proof",
    wallet_pack: "Pack", wallet_amount_paid: "Amount Paid",
    wallet_utr_label: "🔢 UTR / Transaction ID",
    wallet_utr_hint: "Find this in your GPay / PhonePe receipt (12-digit number)",
    wallet_submit_deposit: "📤 Submit Deposit Request",
    wallet_after_verify_note: "Your diamonds will be credited after admin verification (≤30 min)",
    // Profile
    profile_total_balance: "Total balance",
    profile_enter_wallet: "Enter wallet",
    profile_ar_wallet: "AR Wallet", profile_deposit: "Deposit", profile_withdraw: "Withdraw", profile_vip: "VIP",
    profile_game_history: "Game History", profile_game_history_sub: "My game history",
    profile_transaction: "Transaction", profile_transaction_sub: "My transaction history",
    profile_deposit_sub: "My deposit history",
    profile_withdraw_sub: "My withdraw history",
    profile_notification: "Notification", profile_gifts: "Gifts", profile_game_stats: "Game statistics",
    profile_language: "Language",
    profile_settings: "Settings", profile_feedback: "Feedback", profile_announcement: "Announcement",
    profile_customer_service: "Customer Service", profile_beginners_guide: "Beginner's Guide", profile_about: "About us",
    profile_logout: "Logout",
    profile_choose_language: "Choose Language",
    profile_language_updated: "Language updated!",
    // Leaderboard
    leaderboard_title: "🏆 Leaderboard",
    leaderboard_no_players: "No players yet",
    leaderboard_games_played: "games played",
    leaderboard_you: "You",
  },
  hi: {
    nav_home: "होम", nav_games: "गेम्स", nav_wallet: "वॉलेट", nav_top: "टॉप", nav_profile: "प्रोफाइल",
    landing_tagline: "भारत का सबसे रोमांचक डायमंड गेमिंग प्लेटफॉर्म। हर दिन असली इनाम!",
    landing_start: "💎 फ्री खेलना शुरू करें",
    landing_login: "पहले से अकाउंट है? लॉगिन करें",
    landing_terms: "जारी रखने पर आप हमारी शर्तों और गोपनीयता नीति से सहमत होते हैं",
    auth_create_account: "अकाउंट बनाएं 🚀", auth_welcome_back: "वापसी पर स्वागत है 👋",
    auth_verify_human: "इंसान होने की पुष्टि करें 🤖", auth_almost_done: "लगभग पूरा हो गया! 🎉",
    auth_register_sub: "अपने मोबाइल नंबर से रजिस्टर करें", auth_login_sub: "अपने मोबाइल नंबर से लॉगिन करें",
    auth_captcha_sub: "जारी रखने के लिए नीचे दिखाया कोड टाइप करें",
    auth_name_sub: "रजिस्ट्रेशन पूरा करने के लिए अपना नाम दर्ज करें",
    auth_mobile_placeholder: "मोबाइल नंबर", auth_continue: "जारी रखें →",
    auth_verifying: "जांच हो रही है…", auth_verified_redirect: "सत्यापित! भेजा जा रहा है…",
    auth_new_code: "🔄 नया कोड लें", auth_verify_continue: "सत्यापित करें और जारी रखें →",
    auth_verify_verifying: "जांच हो रही है...", auth_verified: "सत्यापित ✓",
    auth_full_name: "पूरा नाम", auth_full_name_ph: "आपका पूरा नाम",
    auth_referral: "रेफरल कोड (वैकल्पिक)", auth_referral_ph: "दोस्त का कोड, 50💎 बोनस पाएं",
    auth_creating: "बनाया जा रहा है...", auth_start_playing: "🎉 खेलना शुरू करें!",
    auth_welcome_bonus: "🎁 स्वागत बोनस!",
    auth_welcome_bonus_sub: "साइनअप पर {n} फ्री डायमंड्स पाएं",
    home_welcome: "वापसी पर स्वागत है 👋",
    home_balance: "आपका डायमंड बैलेंस",
    home_cashout: "≈ {v} कैशआउट वैल्यू",
    home_buy: "+ खरीदें", home_wallet: "💳 वॉलेट", home_withdraw: "↗ निकालें",
    home_stats_games: "गेम्स", home_stats_txns: "लेनदेन", home_stats_rank: "रैंक",
    home_mini_games: "🎮 मिनी गेम्स", home_see_all: "सभी देखें →",
    home_to_play: "खेलने के लिए",
    home_tournament: "साप्ताहिक टूर्नामेंट",
    home_tournament_sub: "ज़्यादा गेम खेलें • लीडरबोर्ड में ऊपर बढ़ें • बड़ा इनाम जीतें!",
    home_ends_in: "समाप्त होगा",
    home_live_standings: "लाइव स्टैंडिंग",
    home_your_rank: "आपकी रैंक",
    home_rank_move_up: "ऊपर बढ़ने के लिए और खेलें!",
    home_be_first: "सबसे पहले खेलें और लीडरबोर्ड में टॉप करें! 🚀",
    home_view_leaderboard: "पूरा लीडरबोर्ड देखें →",
    games_lobby: "🎮 गेम लॉबी",
    wallet_title: "💼 वॉलेट",
    wallet_tab_buy: "💎 खरीदें", wallet_tab_withdraw: "⬆️ निकालें", wallet_tab_history: "📜 इतिहास",
    wallet_how_it_works: "💳 यह कैसे काम करता है",
    wallet_choose_pack: "डायमंड पैक चुनें",
    wallet_available_balance: "उपलब्ध बैलेंस",
    wallet_after_fee: "≈ {v}, {p}% फीस के बाद",
    wallet_diamonds_to_withdraw: "निकालने के लिए डायमंड्स",
    wallet_min_diamonds: "न्यूनतम {n} डायमंड्स",
    wallet_your_upi: "आपकी UPI आईडी",
    wallet_fee: "फीस: 💎{n} ({p}%)",
    wallet_you_receive: "आपको मिलेगा: {v}",
    wallet_request_withdrawal: "⬆️ निकासी का अनुरोध करें",
    wallet_submitting: "भेजा जा रहा है...",
    wallet_withdraw_note: "एडमिन की मंजूरी के बाद 24 घंटे में निकासी प्रोसेस होगी",
    wallet_no_txns: "अभी कोई लेनदेन नहीं",
    wallet_total_deposited: "कुल जमा राशि",
    wallet_total_withdrawn: "कुल निकाली गई राशि",
    wallet_deposit_history: "जमा का इतिहास",
    wallet_withdraw_history: "निकासी का इतिहास",
    wallet_pay_via_upi: "UPI से भुगतान करें",
    wallet_youre_buying: "आप खरीद रहे हैं",
    wallet_send_payment_to: "📲 भुगतान यहाँ भेजें",
    wallet_ive_paid: "✅ भुगतान कर दिया — UTR नंबर डालें →",
    wallet_credited_note: "सत्यापन के बाद 30 मिनट में डायमंड्स क्रेडिट होंगे",
    wallet_submit_proof: "भुगतान प्रमाण जमा करें",
    wallet_pack: "पैक", wallet_amount_paid: "भुगतान की गई राशि",
    wallet_utr_label: "🔢 UTR / लेनदेन आईडी",
    wallet_utr_hint: "यह आपकी GPay / PhonePe रसीद में मिलेगा (12 अंकों की संख्या)",
    wallet_submit_deposit: "📤 जमा अनुरोध भेजें",
    wallet_after_verify_note: "एडमिन सत्यापन के बाद आपके डायमंड्स क्रेडिट होंगे (≤30 मिनट)",
    profile_total_balance: "कुल बैलेंस",
    profile_enter_wallet: "वॉलेट खोलें",
    profile_ar_wallet: "AR वॉलेट", profile_deposit: "जमा करें", profile_withdraw: "निकालें", profile_vip: "VIP",
    profile_game_history: "गेम इतिहास", profile_game_history_sub: "मेरा गेम इतिहास",
    profile_transaction: "लेनदेन", profile_transaction_sub: "मेरा लेनदेन इतिहास",
    profile_deposit_sub: "मेरा जमा इतिहास",
    profile_withdraw_sub: "मेरा निकासी इतिहास",
    profile_notification: "सूचनाएं", profile_gifts: "उपहार", profile_game_stats: "गेम आंकड़े",
    profile_language: "भाषा",
    profile_settings: "सेटिंग्स", profile_feedback: "प्रतिक्रिया", profile_announcement: "घोषणा",
    profile_customer_service: "ग्राहक सेवा", profile_beginners_guide: "शुरुआती गाइड", profile_about: "हमारे बारे में",
    profile_logout: "लॉगआउट",
    profile_choose_language: "भाषा चुनें",
    profile_language_updated: "भाषा अपडेट हो गई!",
    leaderboard_title: "🏆 लीडरबोर्ड",
    leaderboard_no_players: "अभी कोई खिलाड़ी नहीं",
    leaderboard_games_played: "गेम खेले",
    leaderboard_you: "आप",
  },
  mr: {
    nav_home: "होम", nav_games: "गेम्स", nav_wallet: "वॉलेट", nav_top: "टॉप", nav_profile: "प्रोफाइल",
    landing_tagline: "भारतातील सर्वात रोमांचक डायमंड गेमिंग प्लॅटफॉर्म. रोज खरे बक्षीस!",
    landing_start: "💎 मोफत खेळायला सुरुवात करा",
    landing_login: "आधीच खाते आहे? लॉगिन करा",
    landing_terms: "पुढे सुरू ठेवल्यास तुम्ही आमच्या अटी आणि गोपनीयता धोरणाशी सहमत आहात",
    auth_create_account: "खाते तयार करा 🚀", auth_welcome_back: "पुन्हा स्वागत आहे 👋",
    auth_verify_human: "तुम्ही माणूस आहात याची खात्री करा 🤖", auth_almost_done: "जवळजवळ पूर्ण! 🎉",
    auth_register_sub: "तुमच्या मोबाइल नंबरने नोंदणी करा", auth_login_sub: "तुमच्या मोबाइल नंबरने लॉगिन करा",
    auth_captcha_sub: "पुढे जाण्यासाठी खाली दाखवलेला कोड टाइप करा",
    auth_name_sub: "नोंदणी पूर्ण करण्यासाठी तुमचे नाव टाका",
    auth_mobile_placeholder: "मोबाइल नंबर", auth_continue: "पुढे जा →",
    auth_verifying: "तपासत आहे…", auth_verified_redirect: "सत्यापित! पाठवत आहे…",
    auth_new_code: "🔄 नवीन कोड घ्या", auth_verify_continue: "सत्यापित करा आणि पुढे जा →",
    auth_verify_verifying: "तपासत आहे...", auth_verified: "सत्यापित ✓",
    auth_full_name: "पूर्ण नाव", auth_full_name_ph: "तुमचे पूर्ण नाव",
    auth_referral: "रेफरल कोड (ऐच्छिक)", auth_referral_ph: "मित्राचा कोड, 50💎 बोनस मिळवा",
    auth_creating: "तयार होत आहे...", auth_start_playing: "🎉 खेळायला सुरुवात करा!",
    auth_welcome_bonus: "🎁 स्वागत बोनस!",
    auth_welcome_bonus_sub: "साइनअपवर {n} मोफत डायमंड्स मिळवा",
    home_welcome: "पुन्हा स्वागत आहे 👋",
    home_balance: "तुमची डायमंड शिल्लक",
    home_cashout: "≈ {v} कॅशआउट मूल्य",
    home_buy: "+ खरेदी करा", home_wallet: "💳 वॉलेट", home_withdraw: "↗ काढा",
    home_stats_games: "गेम्स", home_stats_txns: "व्यवहार", home_stats_rank: "रँक",
    home_mini_games: "🎮 मिनी गेम्स", home_see_all: "सर्व पहा →",
    home_to_play: "खेळण्यासाठी",
    home_tournament: "साप्ताहिक स्पर्धा",
    home_tournament_sub: "अधिक गेम खेळा • लीडरबोर्डवर चढा • मोठे बक्षीस जिंका!",
    home_ends_in: "संपेल",
    home_live_standings: "थेट क्रमवारी",
    home_your_rank: "तुमची रँक",
    home_rank_move_up: "वर जाण्यासाठी आणखी खेळा!",
    home_be_first: "सर्वात आधी खेळा आणि लीडरबोर्डवर टॉप करा! 🚀",
    home_view_leaderboard: "संपूर्ण लीडरबोर्ड पहा →",
    games_lobby: "🎮 गेम लॉबी",
    wallet_title: "💼 वॉलेट",
    wallet_tab_buy: "💎 खरेदी करा", wallet_tab_withdraw: "⬆️ काढा", wallet_tab_history: "📜 इतिहास",
    wallet_how_it_works: "💳 हे कसे काम करते",
    wallet_choose_pack: "डायमंड पॅक निवडा",
    wallet_available_balance: "उपलब्ध शिल्लक",
    wallet_after_fee: "≈ {v}, {p}% शुल्कानंतर",
    wallet_diamonds_to_withdraw: "काढण्यासाठी डायमंड्स",
    wallet_min_diamonds: "किमान {n} डायमंड्स",
    wallet_your_upi: "तुमचा UPI आयडी",
    wallet_fee: "शुल्क: 💎{n} ({p}%)",
    wallet_you_receive: "तुम्हाला मिळेल: {v}",
    wallet_request_withdrawal: "⬆️ पैसे काढण्याची विनंती करा",
    wallet_submitting: "पाठवत आहे...",
    wallet_withdraw_note: "अ‍ॅडमिनच्या मंजुरीनंतर 24 तासांत रक्कम काढली जाईल",
    wallet_no_txns: "अजून कोणतेही व्यवहार नाहीत",
    wallet_total_deposited: "एकूण जमा रक्कम",
    wallet_total_withdrawn: "एकूण काढलेली रक्कम",
    wallet_deposit_history: "जमा इतिहास",
    wallet_withdraw_history: "पैसे काढण्याचा इतिहास",
    wallet_pay_via_upi: "UPI ने पैसे भरा",
    wallet_youre_buying: "तुम्ही खरेदी करत आहात",
    wallet_send_payment_to: "📲 पेमेंट इथे पाठवा",
    wallet_ive_paid: "✅ पेमेंट केले — UTR नंबर टाका →",
    wallet_credited_note: "पडताळणीनंतर 30 मिनिटांत डायमंड्स जमा होतील",
    wallet_submit_proof: "पेमेंट पुरावा सबमिट करा",
    wallet_pack: "पॅक", wallet_amount_paid: "भरलेली रक्कम",
    wallet_utr_label: "🔢 UTR / व्यवहार आयडी",
    wallet_utr_hint: "हे तुमच्या GPay / PhonePe पावतीत मिळेल (12 अंकी क्रमांक)",
    wallet_submit_deposit: "📤 जमा विनंती पाठवा",
    wallet_after_verify_note: "अ‍ॅडमिन पडताळणीनंतर तुमचे डायमंड्स जमा होतील (≤30 मिनिटे)",
    profile_total_balance: "एकूण शिल्लक",
    profile_enter_wallet: "वॉलेट उघडा",
    profile_ar_wallet: "AR वॉलेट", profile_deposit: "जमा करा", profile_withdraw: "काढा", profile_vip: "VIP",
    profile_game_history: "गेम इतिहास", profile_game_history_sub: "माझा गेम इतिहास",
    profile_transaction: "व्यवहार", profile_transaction_sub: "माझा व्यवहार इतिहास",
    profile_deposit_sub: "माझा जमा इतिहास",
    profile_withdraw_sub: "माझा पैसे काढण्याचा इतिहास",
    profile_notification: "सूचना", profile_gifts: "भेटवस्तू", profile_game_stats: "गेम आकडेवारी",
    profile_language: "भाषा",
    profile_settings: "सेटिंग्ज", profile_feedback: "अभिप्राय", profile_announcement: "घोषणा",
    profile_customer_service: "ग्राहक सेवा", profile_beginners_guide: "नवशिक्यांसाठी मार्गदर्शक", profile_about: "आमच्याबद्दल",
    profile_logout: "लॉगआउट",
    profile_choose_language: "भाषा निवडा",
    profile_language_updated: "भाषा अपडेट झाली!",
    leaderboard_title: "🏆 लीडरबोर्ड",
    leaderboard_no_players: "अजून कोणीही खेळाडू नाही",
    leaderboard_games_played: "गेम्स खेळले",
    leaderboard_you: "तुम्ही",
  },
  ta: {
    nav_home: "முகப்பு", nav_games: "விளையாட்டுகள்", nav_wallet: "வாலட்", nav_top: "டாப்", nav_profile: "சுயவிவரம்",
    landing_tagline: "இந்தியாவின் மிகவும் சுவாரஸ்யமான டைமண்ட் கேமிங் தளம். தினமும் உண்மையான பரிசுகள்!",
    landing_start: "💎 இலவசமாக விளையாடத் தொடங்கு",
    landing_login: "ஏற்கனவே கணக்கு உள்ளதா? உள்நுழையவும்",
    landing_terms: "தொடர்வதன் மூலம் நீங்கள் எங்கள் விதிமுறைகள் & தனியுரிமைக் கொள்கையை ஏற்கிறீர்கள்",
    auth_create_account: "கணக்கை உருவாக்கு 🚀", auth_welcome_back: "மீண்டும் வரவேற்கிறோம் 👋",
    auth_verify_human: "நீங்கள் மனிதர் என சரிபார்க்கவும் 🤖", auth_almost_done: "கிட்டத்தட்ட முடிந்தது! 🎉",
    auth_register_sub: "உங்கள் மொபைல் எண்ணுடன் பதிவு செய்யவும்", auth_login_sub: "உங்கள் மொபைல் எண்ணுடன் உள்நுழையவும்",
    auth_captcha_sub: "தொடர கீழே காட்டப்பட்டுள்ள குறியீட்டை உள்ளிடவும்",
    auth_name_sub: "பதிவை முடிக்க உங்கள் பெயரை உள்ளிடவும்",
    auth_mobile_placeholder: "மொபைல் எண்", auth_continue: "தொடரவும் →",
    auth_verifying: "சரிபார்க்கிறது…", auth_verified_redirect: "சரிபார்க்கப்பட்டது! அனுப்புகிறது…",
    auth_new_code: "🔄 புதிய குறியீடு பெறவும்", auth_verify_continue: "சரிபார்த்து தொடரவும் →",
    auth_verify_verifying: "சரிபார்க்கிறது...", auth_verified: "சரிபார்க்கப்பட்டது ✓",
    auth_full_name: "முழு பெயர்", auth_full_name_ph: "உங்கள் முழு பெயர்",
    auth_referral: "பரிந்துரை குறியீடு (விருப்பம்)", auth_referral_ph: "நண்பரின் குறியீடு, 50💎 போனஸ் பெறவும்",
    auth_creating: "உருவாக்குகிறது...", auth_start_playing: "🎉 விளையாடத் தொடங்கு!",
    auth_welcome_bonus: "🎁 வரவேற்பு போனஸ்!",
    auth_welcome_bonus_sub: "பதிவின்போது {n} இலவச டைமண்ட்ஸ் பெறவும்",
    home_welcome: "மீண்டும் வரவேற்கிறோம் 👋",
    home_balance: "உங்கள் டைமண்ட் இருப்பு",
    home_cashout: "≈ {v} கேஷ்அவுட் மதிப்பு",
    home_buy: "+ வாங்கு", home_wallet: "💳 வாலட்", home_withdraw: "↗ திரும்பப் பெறு",
    home_stats_games: "விளையாட்டுகள்", home_stats_txns: "பரிவர்த்தனைகள்", home_stats_rank: "தரவரிசை",
    home_mini_games: "🎮 மினி கேம்ஸ்", home_see_all: "அனைத்தையும் காண →",
    home_to_play: "விளையாட",
    home_tournament: "வாராந்திர போட்டி",
    home_tournament_sub: "மேலும் விளையாடுங்கள் • தரவரிசையில் ஏறுங்கள் • பெரிய பரிசுகளை வெல்லுங்கள்!",
    home_ends_in: "முடிவடையும்",
    home_live_standings: "நேரடி தரவரிசை",
    home_your_rank: "உங்கள் தரவரிசை",
    home_rank_move_up: "மேலே செல்ல மேலும் விளையாடுங்கள்!",
    home_be_first: "முதலில் விளையாடி தரவரிசையில் முதலிடம் பிடியுங்கள்! 🚀",
    home_view_leaderboard: "முழு தரவரிசையைக் காண →",
    games_lobby: "🎮 கேம் லாபி",
    wallet_title: "💼 வாலட்",
    wallet_tab_buy: "💎 வாங்கு", wallet_tab_withdraw: "⬆️ திரும்பப் பெறு", wallet_tab_history: "📜 வரலாறு",
    wallet_how_it_works: "💳 இது எப்படி வேலை செய்கிறது",
    wallet_choose_pack: "டைமண்ட் பேக்கைத் தேர்ந்தெடுக்கவும்",
    wallet_available_balance: "கிடைக்கும் இருப்பு",
    wallet_after_fee: "≈ {v}, {p}% கட்டணத்திற்குப் பிறகு",
    wallet_diamonds_to_withdraw: "திரும்பப் பெற வேண்டிய டைமண்ட்ஸ்",
    wallet_min_diamonds: "குறைந்தபட்சம் {n} டைமண்ட்ஸ்",
    wallet_your_upi: "உங்கள் UPI ஐடி",
    wallet_fee: "கட்டணம்: 💎{n} ({p}%)",
    wallet_you_receive: "நீங்கள் பெறுவீர்கள்: {v}",
    wallet_request_withdrawal: "⬆️ திரும்பப் பெற கோரவும்",
    wallet_submitting: "அனுப்புகிறது...",
    wallet_withdraw_note: "நிர்வாகி ஒப்புதலுக்குப் பிறகு 24 மணி நேரத்தில் திரும்பப் பெறப்படும்",
    wallet_no_txns: "இதுவரை பரிவர்த்தனைகள் இல்லை",
    wallet_total_deposited: "மொத்த டெபாசிட்",
    wallet_total_withdrawn: "மொத்தம் திரும்பப் பெறப்பட்டது",
    wallet_deposit_history: "டெபாசிட் வரலாறு",
    wallet_withdraw_history: "திரும்பப் பெறும் வரலாறு",
    wallet_pay_via_upi: "UPI மூலம் செலுத்தவும்",
    wallet_youre_buying: "நீங்கள் வாங்குவது",
    wallet_send_payment_to: "📲 பணத்தை இங்கே அனுப்பவும்",
    wallet_ive_paid: "✅ செலுத்திவிட்டேன் — UTR எண்ணை உள்ளிடவும் →",
    wallet_credited_note: "சரிபார்ப்புக்குப் பிறகு 30 நிமிடங்களில் டைமண்ட்ஸ் வரவு வைக்கப்படும்",
    wallet_submit_proof: "பணம் செலுத்திய ஆதாரத்தை சமர்ப்பிக்கவும்",
    wallet_pack: "பேக்", wallet_amount_paid: "செலுத்திய தொகை",
    wallet_utr_label: "🔢 UTR / பரிவர்த்தனை ஐடி",
    wallet_utr_hint: "இதை உங்கள் GPay / PhonePe ரசீதில் காணலாம் (12 இலக்க எண்)",
    wallet_submit_deposit: "📤 டெபாசிட் கோரிக்கையை சமர்ப்பிக்கவும்",
    wallet_after_verify_note: "நிர்வாகி சரிபார்ப்புக்குப் பிறகு உங்கள் டைமண்ட்ஸ் வரவு வைக்கப்படும் (≤30 நிமிடங்கள்)",
    profile_total_balance: "மொத்த இருப்பு",
    profile_enter_wallet: "வாலட்டைத் திற",
    profile_ar_wallet: "AR வாலட்", profile_deposit: "டெபாசிட்", profile_withdraw: "திரும்பப் பெறு", profile_vip: "VIP",
    profile_game_history: "கேம் வரலாறு", profile_game_history_sub: "எனது கேம் வரலாறு",
    profile_transaction: "பரிவர்த்தனை", profile_transaction_sub: "எனது பரிவர்த்தனை வரலாறு",
    profile_deposit_sub: "எனது டெபாசிட் வரலாறு",
    profile_withdraw_sub: "எனது திரும்பப் பெறும் வரலாறு",
    profile_notification: "அறிவிப்பு", profile_gifts: "பரிசுகள்", profile_game_stats: "விளையாட்டு புள்ளிவிவரங்கள்",
    profile_language: "மொழி",
    profile_settings: "அமைப்புகள்", profile_feedback: "கருத்து", profile_announcement: "அறிவிப்பு",
    profile_customer_service: "வாடிக்கையாளர் சேவை", profile_beginners_guide: "தொடக்க வழிகாட்டி", profile_about: "எங்களைப் பற்றி",
    profile_logout: "வெளியேறு",
    profile_choose_language: "மொழியைத் தேர்ந்தெடுக்கவும்",
    profile_language_updated: "மொழி புதுப்பிக்கப்பட்டது!",
    leaderboard_title: "🏆 தரவரிசை",
    leaderboard_no_players: "இதுவரை வீரர்கள் இல்லை",
    leaderboard_games_played: "விளையாடிய கேம்கள்",
    leaderboard_you: "நீங்கள்",
  },
};

const LangContext = createContext(null);

const LangProviderComp = ({ children }) => {
  const [lang, setLangState] = useState(() => DB.get("dp_language") || "en");
  const setLang = (code) => {
    DB.set("dp_language", code);
    setLangState(code);
  };
  const t = useCallback((key, vars) => {
    let str = (TRANSLATIONS[lang] && TRANSLATIONS[lang][key]) || TRANSLATIONS.en[key] || key;
    if (vars) Object.keys(vars).forEach(k => { str = str.replace(`{${k}}`, vars[k]); });
    return str;
  }, [lang]);
  return <LangContext.Provider value={{ lang, setLang, t, languages: LANGUAGES }}>{children}</LangContext.Provider>;
};

const useLang = () => useContext(LangContext);

// ─── BASE COMPONENTS ─────────────────────────────────────────────────────────
const Btn = ({ children, onClick, variant = "primary", disabled, full, sm, style = {} }) => {
  const base = {
    border: "none", cursor: disabled ? "not-allowed" : "pointer", fontWeight: 700,
    borderRadius: 14, display: "inline-flex", alignItems: "center", justifyContent: "center",
    gap: 8, width: full ? "100%" : "auto", opacity: disabled ? 0.5 : 1,
    padding: sm ? "8px 18px" : "14px 24px", fontSize: sm ? 13 : 15, transition: "all 0.2s", ...style,
  };
  const v = {
    primary: { background: S.gradBlue, color: "#fff", boxShadow: "0 4px 20px rgba(0,212,255,0.3)" },
    gold: { background: S.gradGold, color: "#000", boxShadow: "0 4px 20px rgba(255,215,0,0.3)" },
    green: { background: S.gradGreen, color: "#000" },
    ghost: { background: "rgba(255,255,255,0.08)", color: "#fff", border: "1px solid rgba(255,255,255,0.15)" },
    danger: { background: "linear-gradient(135deg,#ff3d9a,#ff6b35)", color: "#fff" },
    pink: { background: S.gradPink, color: "#fff" },
    outline: { background: "transparent", color: S.neonBlue, border: `1px solid ${S.neonBlue}` },
  };
  return <button onClick={disabled ? undefined : onClick} style={{ ...base, ...v[variant] }}>{children}</button>;
};

const Card = ({ children, style = {}, glow, onClick }) => (
  <div onClick={onClick} style={{
    background: S.glass, borderRadius: 20, padding: 16,
    border: `1px solid rgba(255,255,255,${glow ? 0.2 : 0.07})`,
    backdropFilter: "blur(12px)", cursor: onClick ? "pointer" : "default",
    boxShadow: glow ? `0 0 20px ${S.neonBlue}33` : "0 4px 16px rgba(0,0,0,0.3)", ...style,
  }}>{children}</div>
);

const Badge = ({ label, color = S.neonBlue }) => (
  <span style={{ background: `${color}22`, color, border: `1px solid ${color}44`, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{label}</span>
);

const Input = ({ label, placeholder, value, onChange, type = "text", icon, readOnly }) => (
  <div style={{ marginBottom: 14 }}>
    {label && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 6, fontWeight: 600 }}>{label}</div>}
    <div style={{ position: "relative" }}>
      {icon && <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 18 }}>{icon}</span>}
      <input
        type={type} placeholder={placeholder} value={value}
        onChange={e => onChange && onChange(e.target.value)}
        readOnly={readOnly}
        style={{
          width: "100%", background: readOnly ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12,
          padding: icon ? "13px 14px 13px 44px" : "13px 14px",
          color: "#fff", fontSize: 15, outline: "none", boxSizing: "border-box",
        }}
        onFocus={e => !readOnly && (e.target.style.borderColor = S.neonBlue)}
        onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.12)"}
      />
    </div>
  </div>
);

const Modal = ({ open, onClose, title, children }) => {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center", backdropFilter: "blur(4px)" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#13132e", borderRadius: "24px 24px 0 0", width: "100%", maxWidth: 430, maxHeight: "92vh", overflow: "auto", padding: 24, border: "1px solid rgba(255,255,255,0.1)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{title}</div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", borderRadius: 50, width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
};

const Toast = ({ msg, type }) => {
  if (!msg) return null;
  const bg = type === "success" ? "rgba(0,255,136,0.15)" : type === "error" ? "rgba(255,61,154,0.15)" : "rgba(0,212,255,0.15)";
  const border = type === "success" ? S.neonGreen : type === "error" ? S.neonPink : S.neonBlue;
  return (
    <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", zIndex: 9999, background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: "12px 22px", color: "#fff", fontWeight: 700, fontSize: 14, backdropFilter: "blur(10px)", maxWidth: 360, textAlign: "center", whiteSpace: "pre-wrap" }}>
      {msg}
    </div>
  );
};

const Spinner = () => (
  <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
    <div style={{ width: 36, height: 36, border: `3px solid rgba(0,212,255,0.2)`, borderTop: `3px solid ${S.neonBlue}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
  </div>
);

const TopBar = ({ title, onBack, right }) => (
  <div style={{ display: "flex", alignItems: "center", padding: "16px 20px", gap: 12, background: "rgba(10,10,26,0.95)", backdropFilter: "blur(10px)", position: "sticky", top: 0, zIndex: 100 }}>
    {onBack && <button onClick={onBack} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "#fff", borderRadius: 50, width: 36, height: 36, cursor: "pointer", fontSize: 18 }}>←</button>}
    <div style={{ flex: 1, fontSize: 18, fontWeight: 800 }}>{title}</div>
    {right}
  </div>
);

const DiamondChip = ({ amount }) => (
  <span style={{ background: S.gradBlue, borderRadius: 50, fontWeight: 800, color: "#fff", display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 12px", fontSize: 14, boxShadow: "0 2px 12px rgba(0,212,255,0.3)" }}>
    💎 {fmt(amount)}
  </span>
);

const ProgressBar = ({ value, max, color = S.neonBlue }) => (
  <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 99, height: 7, overflow: "hidden" }}>
    <div style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: color, height: "100%", borderRadius: 99, transition: "width 0.4s" }} />
  </div>
);

// ─── BOTTOM NAV ───────────────────────────────────────────────────────────────
const BottomNav = ({ page, setPage, isAdmin }) => {
  const { t } = useLang();
  const adminItems = [
    { id: "admin",          label: "Overview", icon: "📊" },
    { id: "admin_games",    label: "Games",    icon: "🎮" },
    { id: "admin_users",    label: "Users",    icon: "👥" },
    { id: "admin_deposits", label: "Deposits", icon: "💵" },
    { id: "admin_withdraw", label: "Payouts",  icon: "💰" },
    { id: "admin_config",   label: "Settings", icon: "⚙️" },
  ];
  const userItems = [
    { id: "home",        label: t("nav_home"),    icon: "🏠" },
    { id: "games",       label: t("nav_games"),   icon: "🎮" },
    { id: "wallet",      label: t("nav_wallet"),  icon: "💼" },
    { id: "leaderboard", label: t("nav_top"),     icon: "🏆" },
    { id: "profile",     label: t("nav_profile"), icon: "👤" },
  ];
  const items = isAdmin ? adminItems : userItems;
  return (
    <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, background: "rgba(8,8,20,0.98)", borderTop: "1px solid rgba(255,255,255,0.1)", display: "flex", backdropFilter: "blur(24px)", zIndex: 200 }}>
      {items.map(item => {
        const active = page === item.id;
        return (
          <button key={item.id} onClick={() => setPage(item.id)} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "10px 4px 12px", transition: "all 0.18s" }}>
            <div style={{ width: 38, height: 34, borderRadius: 10, background: active ? "rgba(0,212,255,0.14)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 21, transition: "all 0.18s" }}>
              {item.icon}
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: active ? S.neonBlue : "rgba(255,255,255,0.38)", transition: "color 0.18s" }}>{item.label}</span>
            {active && <div style={{ width: 20, height: 2.5, background: S.neonBlue, borderRadius: 99, marginTop: 1 }} />}
          </button>
        );
      })}
    </div>
  );
};

// ─── LANDING PAGE ─────────────────────────────────────────────────────────────
const LandingPage = ({ setPage, setAuthMode }) => {
  const cfg = DB.get("dp_platform_config") || {};
  const { t } = useLang();
  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(ellipse at 50% 0%,#1a0a3e 0%,#0a0a1a 70%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", width: 220, height: 220, borderRadius: "50%", background: "radial-gradient(#b537f233,transparent)", top: "5%", left: "50%", transform: "translateX(-50%)" }} />
      <div style={{ textAlign: "center", position: "relative", zIndex: 1, width: "100%" }}>
        <div style={{ fontSize: 80, marginBottom: 8, filter: "drop-shadow(0 0 24px #b537f2)" }}>💎</div>
        <div style={{ fontSize: 34, fontWeight: 900, background: S.gradBlue, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: 4 }}>{cfg.siteName || "DiamondPlay"}</div>
        <div style={{ color: S.neonGold, fontSize: 13, fontWeight: 700, letterSpacing: 3, marginBottom: 8 }}>PLAY • WIN • EARN</div>
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, maxWidth: 280, margin: "0 auto 32px" }}>{t("landing_tagline")}</div>
        {cfg.bannerText && (
          <div style={{ background: "rgba(255,215,0,0.1)", border: "1px solid rgba(255,215,0,0.3)", borderRadius: 12, padding: "10px 16px", marginBottom: 24, fontSize: 13, color: S.neonGold, fontWeight: 600 }}>{cfg.bannerText}</div>
        )}
        <Btn full onClick={() => { setAuthMode("register"); setPage("auth"); }} style={{ marginBottom: 12 }}>{t("landing_start")}</Btn>
        <Btn full variant="ghost" onClick={() => { setAuthMode("login"); setPage("auth"); }}>{t("landing_login")}</Btn>
        <div style={{ marginTop: 16, color: "rgba(255,255,255,0.25)", fontSize: 11 }}>{t("landing_terms")}</div>
      </div>
    </div>
  );
};

// ─── CAPTCHA (Human Verification — replaces SMS OTP) ──────────────────────────
// No backend/SMS costs needed — verification happens fully on-device.
const CAPTCHA_LENGTH = 5;
const CAPTCHA_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // skips confusing 0/O/1/I
const CAPTCHA_COLORS = () => [S.neonBlue, S.neonPurple, S.neonGold, S.neonGreen, S.neonPink];

const generateCaptcha = () => {
  let code = "";
  for (let i = 0; i < CAPTCHA_LENGTH; i++) code += CAPTCHA_CHARS[rnd(0, CAPTCHA_CHARS.length - 1)];
  return code;
};

// ─── CAPTCHA DISPLAY (distorted code card) ────────────────────────────────────
const CaptchaDisplay = ({ code, shakeKey, onRefresh }) => {
  const colors = CAPTCHA_COLORS();
  return (
    <div style={{ position: "relative", marginBottom: 14 }} key={shakeKey}>
      <div style={{
        display: "flex", gap: 6, justifyContent: "center", alignItems: "center",
        background: "repeating-linear-gradient(135deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 2px, transparent 2px, transparent 9px), rgba(255,255,255,0.06)",
        border: "1.5px solid rgba(255,255,255,0.15)", borderRadius: 14, padding: "20px 14px",
        position: "relative", overflow: "hidden", animation: shakeKey ? "otpShake 0.4s" : "otpPop 0.3s ease",
        userSelect: "none",
      }}>
        <div style={{ position: "absolute", top: "32%", left: 0, right: 0, height: 2, background: `${S.neonBlue}44`, transform: "rotate(-4deg)" }} />
        <div style={{ position: "absolute", top: "64%", left: 0, right: 0, height: 2, background: `${S.neonPurple}44`, transform: "rotate(3deg)" }} />
        {code.split("").map((ch, i) => (
          <span key={i} style={{
            fontSize: 28, fontWeight: 900, position: "relative", zIndex: 1, color: colors[i % colors.length],
            display: "inline-block", fontStyle: i % 2 === 0 ? "normal" : "italic",
            transform: `rotate(${(i % 2 === 0 ? -1 : 1) * (6 + i * 3)}deg) translateY(${i % 2 === 0 ? -2 : 4}px)`,
            textShadow: "0 0 10px rgba(0,0,0,0.5)",
          }}>{ch}</span>
        ))}
      </div>
      <button onClick={onRefresh} style={{
        position: "absolute", top: -10, right: -6, background: S.gradBlue, border: "none",
        color: "#fff", borderRadius: "50%", width: 30, height: 30, fontSize: 14, cursor: "pointer",
        boxShadow: "0 2px 10px rgba(0,212,255,0.4)",
      }} title="Get a new code">🔄</button>
    </div>
  );
};

// ─── CAPTCHA INPUT (single text field) ────────────────────────────────────────
const CaptchaInput = ({ value, onChange, error, success }) => {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.focus(); }, []);
  return (
    <input
      ref={ref}
      type="text" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
      maxLength={CAPTCHA_LENGTH}
      placeholder="Type the code above"
      value={value}
      disabled={success}
      onChange={e => onChange(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CAPTCHA_LENGTH))}
      style={{
        width: "100%", textAlign: "center", letterSpacing: 6, fontSize: 20, fontWeight: 800,
        background: success ? "rgba(0,255,136,0.12)" : "rgba(255,255,255,0.06)",
        border: `1.5px solid ${success ? S.neonGreen : error ? "#ff6b6b" : value ? S.neonBlue : "rgba(255,255,255,0.15)"}`,
        borderRadius: 12, color: "#fff", outline: "none", boxSizing: "border-box",
        padding: "13px 14px", marginBottom: 14, transition: "border-color 0.2s, background 0.2s",
      }}
    />
  );
};

// ─── AUTH PAGE (Login / Register with CAPTCHA) ────────────────────────────────
const AuthPage = ({ mode, setUser, setPage, showToast }) => {
  const { t } = useLang();
  const [step, setStep] = useState("phone");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [referral, setReferral] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const isRegister = mode === "register";
  const cfg = DB.get("dp_platform_config") || {};

  // ── CAPTCHA state ──
  const [captchaCode, setCaptchaCode] = useState(() => generateCaptcha());
  const [captchaValue, setCaptchaValue] = useState("");
  const [captchaError, setCaptchaError] = useState("");
  const [captchaShakeKey, setCaptchaShakeKey] = useState(0);
  const [captchaVerified, setCaptchaVerified] = useState(false);
  const [captchaVerifying, setCaptchaVerifying] = useState(false);

  const handlePhoneSubmit = async () => {
    if (phone.length !== 10) { setError("Enter valid 10-digit number"); return; }
    const users = DB.get("dp_users") || [];
    const existing = users.find(u => u.phone === phone);
    if (!isRegister && !existing) { setError("No account found. Please register."); return; }
    if (isRegister && existing) { setError("Account already exists. Please login."); return; }
    setError("");
    setCaptchaCode(generateCaptcha());
    setCaptchaValue(""); setCaptchaError(""); setCaptchaVerified(false);
    setStep("captcha");
  };

  const refreshCaptcha = () => {
    setCaptchaCode(generateCaptcha());
    setCaptchaValue(""); setCaptchaError(""); setCaptchaVerified(false);
    setCaptchaShakeKey(k => k + 1);
  };

  const verifyCaptcha = async () => {
    if (captchaValue.length !== CAPTCHA_LENGTH) return;
    setCaptchaVerifying(true);
    await sleep(350); // brief verifying animation
    if (captchaValue !== captchaCode) {
      setCaptchaVerifying(false);
      setCaptchaError("That doesn't match. Try again.");
      setCaptchaShakeKey(k => k + 1);
      setCaptchaValue("");
      setCaptchaCode(generateCaptcha());
      return;
    }
    setCaptchaVerifying(false);
    setCaptchaError("");
    setCaptchaVerified(true);
    await sleep(600); // let the success animation play
    if (isRegister) {
      setStep("name");
    } else {
      finishLogin();
    }
  };

  // auto-verify once all characters are entered
  useEffect(() => {
    if (step === "captcha" && captchaValue.length === CAPTCHA_LENGTH && !captchaVerifying && !captchaVerified) {
      verifyCaptcha();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captchaValue]);

  const finishLogin = () => {
    const users = DB.get("dp_users") || [];
    const existing = users.find(u => u.phone === phone);
    const user = existing;
    const updated = users.map(u => u.phone === phone ? { ...u, lastLogin: new Date().toISOString() } : u);
    DB.set("dp_users", updated);
    DB.set("dp_session", { userId: user.id, loginTime: new Date().toISOString() });
    pushAdminAlert("login", { userName: user.name, phone: user.phone, time: new Date().toISOString() });
    setUser({ ...user, lastLogin: new Date().toISOString() });
    setPage(user.isAdmin ? "admin" : user.isDepositOperator ? "operator_center" : "home");
  };

  const completeRegister = async () => {
    if (!name.trim()) { setError("Enter your name"); return; }
    if (name.trim().length < 3) { setError("Name must be at least 3 characters"); return; }
    setLoading(true);
    await sleep(800);
    const users = DB.get("dp_users") || [];
    const refCode = `${name.toUpperCase().replace(/\s/g, "").slice(0, 5)}${rnd(10, 99)}`;
    // Check referral
    const referrer = referral ? users.find(u => u.referralCode === referral.toUpperCase()) : null;
    const welcomeBonus = cfg.welcomeBonus || 50;
    const newUser = {
      id: uid(), name: name.trim(), phone, email: "",
      password: "", diamonds: welcomeBonus,
      referralCode: refCode,
      referredBy: referrer ? referral.toUpperCase() : null,
      totalDeposited: 0, totalWithdrawn: 0, gamesPlayed: 0,
      joinedAt: new Date().toISOString(), isAdmin: false,
      lastLogin: new Date().toISOString(), phoneVerified: true,
      isAgent: false, commissionPaid: 0, customCommissionPercent: null,
      isDepositOperator: false,
      frozen: false, frozenReason: null, bonusDiamonds: 0, cashbackDiamonds: 0,
    };
    DB.set("dp_users", [...users, newUser]);
    // Give referrer bonus
    if (referrer) {
      const updatedUsers = DB.get("dp_users").map(u =>
        u.id === referrer.id ? { ...u, diamonds: u.diamonds + 30 } : u
      );
      DB.set("dp_users", updatedUsers);
    }
    // Log transaction
    const txns = DB.get("dp_transactions") || [];
    DB.set("dp_transactions", [{ id: tid(), userId: newUser.id, type: "bonus", amount: 0, diamonds: welcomeBonus, status: "success", date: new Date().toISOString(), method: "system", note: "Welcome Bonus" }, ...txns]);
    DB.set("dp_session", { userId: newUser.id, loginTime: new Date().toISOString() });
    pushAdminAlert("new_user", { userName: newUser.name, phone: newUser.phone, time: new Date().toISOString() });
    setLoading(false);
    setUser(newUser);
    setPage("home");
    showToast(`Welcome ${newUser.name}! 💎 ${welcomeBonus} Diamonds credited!`, "success");
  };

  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(ellipse at 50% 0%,#1a0a3e,#0a0a1a)", display: "flex", flexDirection: "column", padding: 24, overflowY: "auto" }}>
      <button onClick={() => { if (step === "captcha") { setStep("phone"); } else setPage("landing"); }} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 24, cursor: "pointer", alignSelf: "flex-start", marginBottom: 24 }}>←</button>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 28, fontWeight: 900, marginBottom: 6 }}>
          {step === "phone" && (isRegister ? t("auth_create_account") : t("auth_welcome_back"))}
          {step === "captcha" && t("auth_verify_human")}
          {step === "name" && t("auth_almost_done")}
        </div>
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>
          {step === "phone" && (isRegister ? t("auth_register_sub") : t("auth_login_sub"))}
          {step === "captcha" && t("auth_captcha_sub")}
          {step === "name" && t("auth_name_sub")}
        </div>
      </div>

      {step === "phone" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "13px 14px", marginBottom: 14 }}>
            <span style={{ color: "rgba(255,255,255,0.6)", fontWeight: 600 }}>🇮🇳 +91</span>
            <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.15)" }} />
            <input type="tel" placeholder={t("auth_mobile_placeholder")} value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              style={{ flex: 1, background: "none", border: "none", color: "#fff", fontSize: 16, outline: "none" }} />
          </div>

          {error && <div style={{ color: "#ff6b6b", fontSize: 13, marginBottom: 10 }}>{error}</div>}

          <Btn
            full
            onClick={handlePhoneSubmit}
            disabled={phone.length !== 10}
          >
            {t("auth_continue")}
          </Btn>
        </>
      )}

      {step === "captcha" && (
        <div style={{ animation: "resultSlide 0.35s ease" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
            <div style={{
              width: 72, height: 72, borderRadius: "50%",
              background: captchaVerified ? "rgba(0,255,136,0.12)" : "rgba(0,212,255,0.1)",
              border: `1.5px solid ${captchaVerified ? S.neonGreen : S.neonBlue}44`,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32,
              animation: captchaVerified ? "otpPop 0.35s ease" : "pulse 1.8s infinite",
            }}>
              {captchaVerified ? "✅" : "🤖"}
            </div>
          </div>

          <CaptchaDisplay code={captchaCode} shakeKey={captchaShakeKey} onRefresh={refreshCaptcha} />
          <CaptchaInput value={captchaValue} onChange={setCaptchaValue} error={!!captchaError} success={captchaVerified} />

          {captchaVerifying && <div style={{ textAlign: "center", color: "rgba(255,255,255,0.5)", fontSize: 13, marginBottom: 10 }}>{t("auth_verifying")}</div>}
          {captchaError && !captchaVerifying && <div style={{ textAlign: "center", color: "#ff6b6b", fontSize: 13, marginBottom: 10, fontWeight: 600 }}>⚠️ {captchaError}</div>}
          {captchaVerified && <div style={{ textAlign: "center", color: S.neonGreen, fontSize: 13, marginBottom: 10, fontWeight: 700 }}>{t("auth_verified_redirect")}</div>}

          <div style={{ textAlign: "center", marginBottom: 18 }}>
            <button onClick={refreshCaptcha} disabled={captchaVerifying || captchaVerified} style={{ background: "none", border: "none", color: S.neonBlue, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              {t("auth_new_code")}
            </button>
          </div>

          <Btn full onClick={verifyCaptcha} disabled={captchaValue.length !== CAPTCHA_LENGTH || captchaVerifying || captchaVerified}>
            {captchaVerifying ? t("auth_verify_verifying") : captchaVerified ? t("auth_verified") : t("auth_verify_continue")}
          </Btn>
        </div>
      )}

      {step === "name" && (
        <>
          <Input label={t("auth_full_name")} placeholder={t("auth_full_name_ph")} value={name} onChange={setName} icon="👤" />
          <Input label={t("auth_referral")} placeholder={t("auth_referral_ph")} value={referral} onChange={setReferral} icon="🎁" />
          {error && <div style={{ color: "#ff6b6b", fontSize: 13, marginBottom: 10 }}>{error}</div>}
          <Btn full onClick={completeRegister} disabled={loading}>{loading ? t("auth_creating") : t("auth_start_playing")}</Btn>
          <Card style={{ marginTop: 16, textAlign: "center" }}>
            <div style={{ color: S.neonGold, fontWeight: 700 }}>{t("auth_welcome_bonus")}</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>{t("auth_welcome_bonus_sub", { n: (DB.get("dp_platform_config") || {}).welcomeBonus || 50 })}</div>
          </Card>
        </>
      )}
    </div>
  );
};

// ─── WEEKLY TOURNAMENT UTILS ──────────────────────────────────────────────────
const getTournamentInfo = () => {
  // Tournament resets every Monday 00:00 IST
  const now = new Date();
  const day = now.getDay(); // 0=Sun,1=Mon...
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  const endDate = new Date(now);
  endDate.setDate(now.getDate() + daysUntilMonday);
  endDate.setHours(0, 0, 0, 0);
  const msLeft = endDate - now;
  const daysLeft = Math.floor(msLeft / (1000 * 60 * 60 * 24));
  const hoursLeft = Math.floor((msLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minsLeft = Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60));
  return { daysLeft, hoursLeft, minsLeft, msLeft };
};

const TOURNAMENT_PRIZES = [
  { rank: 1, label: "🥇 1st Place",  prize: 5000,  color: "#ffd700" },
  { rank: 2, label: "🥈 2nd Place",  prize: 2500,  color: "#c0c0c0" },
  { rank: 3, label: "🥉 3rd Place",  prize: 1000,  color: "#cd7f32" },
  { rank: 4, label: "4th–5th",       prize: 500,   color: S.neonBlue },
  { rank: 6, label: "6th–10th",      prize: 200,   color: S.neonPurple },
];

// ─── HOME PAGE ────────────────────────────────────────────────────────────────
const HomePage = ({ user, setUser, setPage, setNotifOpen, notifications }) => {
  const { t } = useLang();
  const [bannerIdx, setBannerIdx] = useState(0);
  const [tourTime, setTourTime] = useState(getTournamentInfo());
  const cfg = DB.get("dp_platform_config") || {};

  const banners = [
    { bg: S.gradBlue,   emoji: "💎", title: "Buy Diamonds",      sub: cfg.bannerText || "Get bonus diamonds on top-up!", action: () => setPage("buy") },
    { bg: S.gradGold,   emoji: "🏆", title: "Weekly Tournament", sub: "Play games • Climb ranks • Win big prizes!", action: () => setPage("leaderboard") },
    { bg: S.gradPink,   emoji: "🎮", title: "New: Color Predict", sub: "30-sec rounds · Live results · Win 4.5x!", action: () => setPage("game_color") },
  ];

  useEffect(() => {
    const bi = setInterval(() => setBannerIdx(b => (b + 1) % banners.length), 3500);
    // Update tournament countdown every minute
    const ti = setInterval(() => setTourTime(getTournamentInfo()), 60000);
    return () => { clearInterval(bi); clearInterval(ti); };
  }, []);

  const games = [
    { id: "color",   name: "Color Predict", emoji: "🎨", cost: cfg.gameCost || 5,    hot: true  },
    { id: "dice",    name: "Dice Roll",      emoji: "🎲", cost: cfg.gameCost || 5,    hot: false },
    { id: "number",  name: "Number Pick",    emoji: "🔢", cost: cfg.gameCost || 5,    hot: false },
    { id: "scratch", name: "Scratch Card",   emoji: "🃏", cost: cfg.scratchCost || 10, hot: true },
  ];

  const unread = notifications.filter(n => !n.read).length;
  const freshUser = (DB.get("dp_users") || []).find(u => u.id === user.id) || user;
  const txns = (DB.get("dp_transactions") || []).filter(t => t.userId === user.id);

  // Live leaderboard for tournament widget
  const topPlayers = (DB.get("dp_users") || [])
    .filter(u => !u.isAdmin)
    .sort((a, b) => b.gamesPlayed - a.gamesPlayed)
    .slice(0, 5);
  const myTourneyRank = (DB.get("dp_users") || [])
    .filter(u => !u.isAdmin)
    .sort((a, b) => b.gamesPlayed - a.gamesPlayed)
    .findIndex(u => u.id === user.id) + 1;

  return (
    <div style={S.page}>
      {/* ── HEADER */}
      <div style={{ background: "linear-gradient(180deg,#13132e,transparent)", padding: "16px 20px 10px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>{t("home_welcome")}</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{freshUser.name.split(" ")[0]}</div>
          </div>
          <button onClick={() => setNotifOpen(true)} style={{ position: "relative", background: "rgba(255,255,255,0.08)", border: "none", color: "#fff", borderRadius: 50, width: 40, height: 40, cursor: "pointer", fontSize: 18 }}>
            🔔
            {unread > 0 && <span style={{ position: "absolute", top: 4, right: 4, background: "#ff3d9a", borderRadius: "50%", width: 14, height: 14, fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>{unread}</span>}
          </button>
        </div>

        {/* Balance Card */}
        <Card glow style={{ marginTop: 14, background: "linear-gradient(135deg,rgba(0,212,255,0.12),rgba(181,55,242,0.12))" }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>{t("home_balance")}</div>
          <div style={{ fontSize: 36, fontWeight: 900, display: "flex", alignItems: "center", gap: 8 }}>
            💎 <span style={{ background: S.gradBlue, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{fmt(freshUser.diamonds)}</span>
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 14 }}>{t("home_cashout", { v: fmtINR(Math.floor(freshUser.diamonds * 0.9)) })}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="gold" sm onClick={() => setPage("buy")}>{t("home_buy")}</Btn>
            <Btn variant="ghost" sm onClick={() => setPage("wallet")}>{t("home_wallet")}</Btn>
            <Btn variant="ghost" sm onClick={() => setPage("profile")}>{t("home_withdraw")}</Btn>
          </div>
        </Card>
      </div>

      {/* ── BANNER CAROUSEL */}
      <div style={{ padding: "8px 20px" }}>
        <div style={{ borderRadius: 18, overflow: "hidden", position: "relative", height: 110 }}>
          {banners.map((b, i) => (
            <div key={i} onClick={b.action} style={{ position: "absolute", inset: 0, background: b.bg, padding: "18px 20px", display: "flex", alignItems: "center", gap: 16, cursor: "pointer", transition: "opacity 0.5s", opacity: i === bannerIdx ? 1 : 0 }}>
              <div style={{ fontSize: 44 }}>{b.emoji}</div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{b.title}</div>
                <div style={{ fontSize: 13, opacity: 0.8 }}>{b.sub}</div>
              </div>
            </div>
          ))}
          <div style={{ position: "absolute", bottom: 10, right: 14, display: "flex", gap: 4 }}>
            {banners.map((_, i) => <div key={i} style={{ width: i === bannerIdx ? 16 : 5, height: 5, borderRadius: 99, background: "rgba(255,255,255,0.8)", transition: "width 0.3s" }} />)}
          </div>
        </div>
      </div>

      {/* ── QUICK STATS */}
      <div style={{ padding: "8px 20px" }}>
        <div style={{ display: "flex", gap: 8 }}>
          {[[t("home_stats_games"), freshUser.gamesPlayed], [t("home_stats_txns"), txns.length], [t("home_stats_rank"), myTourneyRank ? `#${myTourneyRank}` : "—"]].map(([l, v]) => (
            <Card key={l} style={{ flex: 1, textAlign: "center", padding: 10 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: S.neonBlue }}>{v}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>{l}</div>
            </Card>
          ))}
        </div>
      </div>

      {/* ── GAMES */}
      <div style={{ padding: "8px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{t("home_mini_games")}</div>
          <span style={{ color: S.neonBlue, fontSize: 13, cursor: "pointer" }} onClick={() => setPage("games")}>{t("home_see_all")}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {games.map(g => (
            <Card key={g.id} onClick={() => setPage(`game_${g.id}`)} style={{ textAlign: "center", padding: 18, position: "relative", cursor: "pointer" }}>
              {g.hot && <div style={{ position: "absolute", top: 10, right: 10, background: S.gradPink, borderRadius: 6, padding: "2px 7px", fontSize: 10, fontWeight: 700 }}>🔥 HOT</div>}
              <div style={{ fontSize: 38, marginBottom: 8 }}>{g.emoji}</div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{g.name}</div>
              <div style={{ fontSize: 12, color: S.neonBlue, marginTop: 4 }}>💎 {g.cost} {t("home_to_play")}</div>
            </Card>
          ))}
        </div>
      </div>

      {/* ── WEEKLY TOURNAMENT WIDGET */}
      <div style={{ padding: "8px 20px 24px" }}>
        <Card onClick={() => setPage("leaderboard")} glow style={{
          background: "linear-gradient(135deg,rgba(255,215,0,0.08),rgba(255,107,53,0.06))",
          border: "1px solid rgba(255,215,0,0.3)",
          cursor: "pointer",
        }}>
          {/* Header row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 22 }}>🏆</span>
                <span style={{ fontSize: 17, fontWeight: 900, background: S.gradGold, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{t("home_tournament")}</span>
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{t("home_tournament_sub")}</div>
            </div>
            <div style={{ background: "rgba(255,215,0,0.12)", border: "1px solid rgba(255,215,0,0.3)", borderRadius: 10, padding: "6px 10px", textAlign: "center", flexShrink: 0 }}>
              <div style={{ fontSize: 9, color: "#ffd700", fontWeight: 700, letterSpacing: 1 }}>{t("home_ends_in")}</div>
              <div style={{ fontSize: 14, fontWeight: 900, color: "#ffd700" }}>
                {tourTime.daysLeft > 0 ? `${tourTime.daysLeft}d ${tourTime.hoursLeft}h` : `${tourTime.hoursLeft}h ${tourTime.minsLeft}m`}
              </div>
            </div>
          </div>

          {/* Prize pool preview */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {(cfg.tournamentPrizes && cfg.tournamentPrizes.length ? cfg.tournamentPrizes : TOURNAMENT_PRIZES.map(p => ({ ...p, active: true })))
              .filter(p => p.active !== false && p.rank <= 3)
              .map(p => (
              <div key={p.rank} style={{ flex: 1, textAlign: "center", background: "rgba(0,0,0,0.25)", borderRadius: 10, padding: "8px 4px" }}>
                <div style={{ fontSize: 18 }}>{["🥇", "🥈", "🥉"][p.rank - 1]}</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: p.color, marginTop: 2 }}>{fmt(p.prize)}💎</div>
              </div>
            ))}
          </div>

          {/* Live top 3 or user rank */}
          {topPlayers.length > 0 ? (
            <div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 700, marginBottom: 8, letterSpacing: 1 }}>{t("home_live_standings")}</div>
              {topPlayers.slice(0, 3).map((p, i) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <div style={{ fontSize: 14, width: 20 }}>{["🥇","🥈","🥉"][i]}</div>
                  <div style={{ flex: 1, fontSize: 13, fontWeight: p.id === user.id ? 800 : 600, color: p.id === user.id ? S.neonBlue : "#fff" }}>
                    {p.name.split(" ")[0]}{p.id === user.id ? ` (${t("leaderboard_you")})` : ""}
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: 700 }}>{p.gamesPlayed} {t("leaderboard_games_played")}</div>
                </div>
              ))}
              {myTourneyRank > 3 && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>{t("home_your_rank")}</span>
                  <span style={{ fontWeight: 800, color: S.neonBlue }}>#{myTourneyRank} — {t("home_rank_move_up")}</span>
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.4)", padding: "8px 0" }}>
              {t("home_be_first")}
            </div>
          )}

          <div style={{ marginTop: 12, textAlign: "right" }}>
            <span style={{ fontSize: 12, color: "#ffd700", fontWeight: 700 }}>{t("home_view_leaderboard")}</span>
          </div>
        </Card>
      </div>
    </div>
  );
};

// ─── GAMES PAGE ───────────────────────────────────────────────────────────────
const GamesPage = ({ setPage }) => {
  const { t } = useLang();
  const cfg = DB.get("dp_platform_config") || {};
  const games = [
    { id: "color", name: "Color Prediction", emoji: "🎨", cost: cfg.gameCost || 5, desc: "Predict the next color and win 1.9x!", tag: "Popular" },
    { id: "dice", name: "Dice Roll", emoji: "🎲", cost: cfg.gameCost || 5, desc: "Roll the dice, pick your number!", tag: "Classic" },
    { id: "number", name: "Number Pick", emoji: "🔢", cost: cfg.gameCost || 5, desc: "Pick a number 1-10 and win big!", tag: "Easy" },
    { id: "scratch", name: "Scratch Card", emoji: "🃏", cost: cfg.scratchCost || 10, desc: "Scratch & reveal your prize!", tag: "Lucky" },
  ];
  return (
    <div style={S.page}>
      <TopBar title={t("games_lobby")} />
      <div style={{ padding: "12px 20px" }}>
        {games.map(g => (
          <Card key={g.id} onClick={() => setPage(`game_${g.id}`)} style={{ marginBottom: 12, cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ fontSize: 48 }}>{g.emoji}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{g.name}</div>
                  <Badge label={g.tag} />
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>{g.desc}</div>
                <DiamondChip amount={g.cost} />
              </div>
              <div style={{ fontSize: 24, color: "rgba(255,255,255,0.3)" }}>›</div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

// ─── GAME HELPERS ─────────────────────────────────────────────────────────────
const saveGameResult = (userId, diamonds, note) => {
  const users = DB.get("dp_users") || [];
  const updated = users.map(u => u.id === userId ? { ...u, diamonds: u.diamonds + diamonds, gamesPlayed: u.gamesPlayed + 1 } : u);
  DB.set("dp_users", updated);
  const txns = DB.get("dp_transactions") || [];
  DB.set("dp_transactions", [{ id: tid(), userId, type: diamonds > 0 ? "game_win" : "game_spend", amount: 0, diamonds, status: "success", date: new Date().toISOString(), method: "game", note }, ...txns]);
};

// ─── COLOR GAME UTILS ────────────────────────────────────────────────────────
const getWinningColor = () => {
  const cfg = DB.get("dp_platform_config") || {};
  if (cfg.forcedColor) {
    const color = cfg.forcedColor;
    DB.set("dp_platform_config", { ...cfg, forcedColor: null });
    return color;
  }
  const pool = ["red", "green", "red", "green", "violet", "red", "green"];
  return pool[Math.floor(Math.random() * pool.length)];
};

// ─── COLOR GAME ───────────────────────────────────────────────────────────────
const ROUND_DURATION = 30;
const RESULT_SHOW_DURATION = 7; // seconds to show result before next round

const ColorGame = ({ user, setUser, setPage, showToast }) => {
  const cfg = DB.get("dp_platform_config") || {};
  const COST = cfg.gameCost || 5;

  const colors = [
    { id: "red",    label: "Red",    bg: "linear-gradient(135deg,#ff3d3d,#ff6b6b)", mult: 2,   emoji: "🔴" },
    { id: "green",  label: "Green",  bg: "linear-gradient(135deg,#00c853,#00ff88)", mult: 2,   emoji: "🟢" },
    { id: "violet", label: "Violet", bg: "linear-gradient(135deg,#b537f2,#8b00ff)", mult: 4.5, emoji: "🟣" },
  ];
  const colorMap  = { red: "#ff4444", green: "#00c853", violet: "#b537f2" };
  const colorGlow = { red: "rgba(255,68,68,0.45)", green: "rgba(0,200,83,0.45)", violet: "rgba(181,55,242,0.45)" };

  // ── phase: "betting" | "revealing" | "result" | "next"
  const [phase,        setPhase]        = useState("betting");
  const [timer,        setTimer]        = useState(ROUND_DURATION);
  const [resultTimer,  setResultTimer]  = useState(RESULT_SHOW_DURATION);
  const [roundNum,     setRoundNum]     = useState(() => DB.get("dp_color_roundNum") || 1);
  const [bet,          setBet]          = useState(null);       // chosen color id
  const [betAmt,       setBetAmt]       = useState(COST);      // how many diamonds bet
  const [betPlaced,    setBetPlaced]    = useState(false);
  const [lastWin,      setLastWin]      = useState(null);
  const [roundResult,  setRoundResult]  = useState(null);      // { win, userBet, prize, isWin }
  const [roundHistory, setRoundHistory] = useState(() => DB.get("dp_color_history") || []);
  const [animBall,     setAnimBall]     = useState(false);
  const [confetti,     setConfetti]     = useState(false);

  const timerRef       = useRef(null);
  const resultTimerRef = useRef(null);
  const betRef         = useRef(bet);
  const betAmtRef      = useRef(betAmt);
  const betPlacedRef   = useRef(betPlaced);
  const userRef        = useRef(user);

  useEffect(() => { betRef.current = bet; },       [bet]);
  useEffect(() => { betAmtRef.current = betAmt; }, [betAmt]);
  useEffect(() => { betPlacedRef.current = betPlaced; }, [betPlaced]);
  useEffect(() => { userRef.current = user; },     [user]);

  // ── Start betting phase
  const startBettingPhase = () => {
    clearInterval(timerRef.current);
    clearInterval(resultTimerRef.current);
    setPhase("betting");
    setBetPlaced(false);
    setBet(null);
    setRoundResult(null);
    setLastWin(null);
    setAnimBall(false);
    setConfetti(false);
    setTimer(ROUND_DURATION);

    timerRef.current = setInterval(() => {
      setTimer(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          triggerReveal();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // ── Reveal phase (2 sec animation → show result)
  const triggerReveal = () => {
    setPhase("revealing");
    setAnimBall(true);
    setTimeout(() => {
      const win     = getWinningColor();
      const rNum    = (DB.get("dp_color_roundNum") || 1);
      const nextNum = rNum + 1;
      DB.set("dp_color_roundNum", nextNum);
      setRoundNum(nextNum);

      // Build history entry with user's bet info
      const userBetNow   = betRef.current;
      const betAmtNow    = betAmtRef.current;
      const betPlacedNow = betPlacedRef.current;
      let prize = 0;
      let isWin = false;

      if (betPlacedNow && userBetNow) {
        const col = colors.find(c => c.id === win);
        if (win === userBetNow) {
          isWin = true;
          prize = Math.floor(betAmtNow * col.mult);
          saveGameResult(userRef.current.id, prize, `Color Win - ${win} @${col.mult}x`);
          setUser(u => ({ ...u, diamonds: u.diamonds + prize }));
        }
      }

      const histEntry = {
        round:    rNum,
        color:    win,
        time:     new Date().toISOString(),
        userBet:  betPlacedNow ? userBetNow : null,
        betAmt:   betPlacedNow ? betAmtNow  : 0,
        isWin,
        prize,
      };

      const hist    = DB.get("dp_color_history") || [];
      const newHist = [histEntry, ...hist].slice(0, 30);
      DB.set("dp_color_history", newHist);
      setRoundHistory(newHist);
      setLastWin(win);
      setRoundResult({ win, userBet: userBetNow, betPlaced: betPlacedNow, isWin, prize, betAmt: betAmtNow });
      setPhase("result");
      setAnimBall(false);
      if (isWin) setConfetti(true);

      // Countdown to next round
      setResultTimer(RESULT_SHOW_DURATION);
      let rt = RESULT_SHOW_DURATION;
      resultTimerRef.current = setInterval(() => {
        rt -= 1;
        setResultTimer(rt);
        if (rt <= 0) {
          clearInterval(resultTimerRef.current);
          startBettingPhase();
        }
      }, 1000);
    }, 2200);
  };

  // ── Init on mount
  useEffect(() => {
    startBettingPhase();
    return () => { clearInterval(timerRef.current); clearInterval(resultTimerRef.current); };
  }, []);

  const placeBet = (colorId) => {
    if (phase !== "betting") { showToast("Bets band ho gaye!", "error"); return; }
    if (betPlaced)           { showToast("Bet pehle se laga di hai!", "error"); return; }
    if (user.diamonds < betAmt) { showToast("Diamonds kam hain!", "error"); return; }
    setBet(colorId);
    setBetPlaced(true);
    saveGameResult(user.id, -betAmt, `Color Bet - ${colorId}`);
    setUser(u => ({ ...u, diamonds: u.diamonds - betAmt, gamesPlayed: u.gamesPlayed + 1 }));
    showToast(`✅ ${colorId.toUpperCase()} pe ${betAmt}💎 bet lagaya!`, "success");
  };

  const timerPct     = (timer / ROUND_DURATION) * 100;
  const timerColor   = timer <= 5 ? "#ff3d9a" : timer <= 10 ? "#ffd700" : S.neonGreen;
  const circumference = 2 * Math.PI * 48;

  // ── BET AMOUNT CHIPS
  const betOptions = [COST, COST*2, COST*5, COST*10, COST*20];

  return (
    <div style={S.page}>
      <TopBar title="🎨 Color Prediction" onBack={() => setPage("games")} right={<DiamondChip amount={user.diamonds} />} />

      {/* ── CONFETTI LAYER */}
      {confetti && (
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 999, overflow: "hidden" }}>
          {Array.from({ length: 22 }).map((_, i) => {
            const colors2 = ["#ff4444","#00c853","#b537f2","#ffd700","#00d4ff","#ff3d9a"];
            return (
              <div key={i} style={{
                position: "absolute",
                left:  `${10 + Math.random() * 80}%`,
                top:   `${20 + Math.random() * 40}%`,
                width:  6, height: 6, borderRadius: "50%",
                background: colors2[i % colors2.length],
                animation: `confettiFall${i % 3} 1.1s ease-out forwards`,
                animationDelay: `${Math.random() * 0.4}s`,
              }} />
            );
          })}
        </div>
      )}

      <div style={{ padding: "14px 18px 120px" }}>

        {/* ── ROUND NUMBER + STATUS BAR */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", fontWeight: 800, letterSpacing: 2 }}>
            ROUND #{String(roundNum).padStart(4, "0")}
          </div>
          {phase === "betting" && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(0,255,136,0.1)", border: "1px solid rgba(0,255,136,0.3)", borderRadius: 20, padding: "4px 14px" }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: S.neonGreen, animation: "pulse 1s infinite" }} />
              <span style={{ fontSize: 11, fontWeight: 800, color: S.neonGreen }}>LIVE · BET NOW</span>
            </div>
          )}
          {phase === "revealing" && (
            <div style={{ fontSize: 11, fontWeight: 800, color: "#ffd700", background: "rgba(255,215,0,0.1)", border: "1px solid rgba(255,215,0,0.3)", borderRadius: 20, padding: "4px 14px" }}>⏳ DRAWING...</div>
          )}
          {phase === "result" && (
            <div style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: "4px 14px" }}>
              Next round: {resultTimer}s
            </div>
          )}
        </div>

        {/* ── MAIN TIMER / RESULT CIRCLE */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
          <div style={{ position: "relative", width: 130, height: 130 }}>
            {/* Progress ring */}
            <svg width="130" height="130" style={{ transform: "rotate(-90deg)", position: "absolute", inset: 0 }}>
              <circle cx="65" cy="65" r="48" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
              <circle cx="65" cy="65" r="48" fill="none"
                stroke={
                  phase === "result"    ? colorMap[lastWin] || S.neonBlue :
                  phase === "revealing" ? "#ffd700" : timerColor
                }
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={
                  phase === "betting"   ? circumference * (1 - timerPct / 100) :
                  phase === "revealing" ? circumference * 0.6 :
                  phase === "result"    ? circumference * (1 - resultTimer / RESULT_SHOW_DURATION) : 0
                }
                style={{ transition: phase === "betting" ? "stroke-dashoffset 1s linear, stroke 0.3s" : "stroke 0.3s" }}
              />
            </svg>

            {/* Center content */}
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              {phase === "betting" && (
                <>
                  <div style={{ fontSize: 36, fontWeight: 900, color: timerColor, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                    {String(timer).padStart(2, "0")}
                  </div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", fontWeight: 700, marginTop: 3, letterSpacing: 1 }}>SECONDS</div>
                </>
              )}
              {phase === "revealing" && (
                <div style={{ fontSize: 38, animation: "spin 0.4s linear infinite" }}>🎲</div>
              )}
              {phase === "result" && lastWin && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{
                    width: 60, height: 60, borderRadius: "50%",
                    background: colorMap[lastWin],
                    boxShadow: `0 0 30px ${colorGlow[lastWin]}, 0 0 60px ${colorGlow[lastWin]}`,
                    animation: "pulse 0.6s ease-in-out 3",
                  }} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── RESULT CARD (shown when phase === result) */}
        {phase === "result" && roundResult && (
          <div style={{
            marginBottom: 16,
            borderRadius: 20,
            overflow: "hidden",
            border: `2px solid ${colorMap[roundResult.win]}55`,
            background: `linear-gradient(135deg, ${colorMap[roundResult.win]}12, rgba(0,0,0,0.4))`,
          }}>
            {/* Winner banner */}
            <div style={{
              background: colorMap[roundResult.win],
              padding: "10px 18px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                  {colors.find(c => c.id === roundResult.win)?.emoji}
                </div>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 18, color: "#fff" }}>{roundResult.win.toUpperCase()} WINS!</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>Round #{roundNum - 1}</div>
                </div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, color: "#fff" }}>
                {colors.find(c => c.id === roundResult.win)?.mult}x
              </div>
            </div>

            {/* User result */}
            <div style={{ padding: "14px 18px" }}>
              {!roundResult.betPlaced ? (
                <div style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 13, padding: "6px 0" }}>
                  Aapne is round mein bet nahi lagaya
                </div>
              ) : roundResult.isWin ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 700, color: S.neonGreen, fontSize: 15 }}>🎉 Aap Jeete!</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
                      {roundResult.userBet?.toUpperCase()} pe {roundResult.betAmt}💎 lagaya
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: S.neonGreen }}>+{roundResult.prize}💎</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                      {roundResult.betAmt}💎 × {colors.find(c=>c.id===roundResult.win)?.mult}x
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 700, color: "#ff6b6b", fontSize: 15 }}>😞 Haare</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
                      Aapne {roundResult.userBet?.toUpperCase()} pe bet lagaya tha
                    </div>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: "#ff6b6b" }}>-{roundResult.betAmt}💎</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── BET AMOUNT SELECTOR (show only during betting) */}
        {phase === "betting" && !betPlaced && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", marginBottom: 8, letterSpacing: 1 }}>BET AMOUNT</div>
            <div style={{ display: "flex", gap: 7 }}>
              {betOptions.map(amt => (
                <button key={amt} onClick={() => setBetAmt(amt)} style={{
                  flex: 1, padding: "9px 4px", borderRadius: 10,
                  background: betAmt === amt ? S.gradBlue : "rgba(255,255,255,0.06)",
                  border: `1px solid ${betAmt === amt ? S.neonBlue : "rgba(255,255,255,0.1)"}`,
                  color: betAmt === amt ? "#fff" : "rgba(255,255,255,0.6)",
                  fontWeight: 800, fontSize: 12, cursor: "pointer",
                  boxShadow: betAmt === amt ? `0 0 12px rgba(0,212,255,0.4)` : "none",
                }}>
                  {amt}💎
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── COLOR BET BUTTONS */}
        <div style={{ marginBottom: 6, fontSize: 11, color: "rgba(255,255,255,0.38)", fontWeight: 700, textAlign: "center", letterSpacing: 0.5 }}>
          {phase === "betting" && !betPlaced && "👇 Color choose karo — bet lagao"}
          {phase === "betting" && betPlaced && `✅ ${bet?.toUpperCase()} pe ${betAmt}💎 — result ka wait karo`}
          {phase === "revealing" && "🎲 Bets band — result aa raha hai..."}
          {phase === "result" && `⏳ Agla round ${resultTimer} second mein shuru hoga`}
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          {colors.map(c => {
            const isSelected = bet === c.id;
            const disabled   = phase !== "betting" || betPlaced;
            return (
              <button key={c.id}
                onClick={() => placeBet(c.id)}
                disabled={disabled}
                style={{
                  flex: 1, borderRadius: 16, padding: "14px 4px",
                  cursor: disabled ? "not-allowed" : "pointer",
                  background: isSelected ? c.bg : "rgba(255,255,255,0.06)",
                  border: `3px solid ${isSelected ? "#fff" : colorMap[c.id] + "55"}`,
                  color: isSelected ? "#fff" : colorMap[c.id],
                  fontWeight: 900, fontSize: 13,
                  boxShadow: isSelected ? `0 0 24px ${colorGlow[c.id]}, 0 0 8px ${colorMap[c.id]}` : "none",
                  opacity: disabled && !isSelected ? 0.38 : 1,
                  transition: "all 0.2s",
                  transform: isSelected ? "scale(1.04)" : "scale(1)",
                }}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>{c.emoji}</div>
                <div>{c.label}</div>
                <div style={{ fontSize: 11, opacity: 0.78, marginTop: 3 }}>{c.mult}x</div>
              </button>
            );
          })}
        </div>

        {/* ── ROUND HISTORY */}
        <Card style={{ marginTop: 6, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>📋 Round History</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontWeight: 700 }}>
              {roundHistory.length} rounds
            </div>
          </div>

          {/* Quick color dot strip */}
          {roundHistory.length > 0 && (
            <div style={{ display: "flex", gap: 5, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
              {roundHistory.slice(0, 20).map((h, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flexShrink: 0 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: colorMap[h.color],
                    boxShadow: `0 0 8px ${colorGlow[h.color]}`,
                    border: h.userBet === h.color ? "2px solid #fff" : h.userBet ? "2px solid #ff6b6b" : "2px solid transparent",
                  }} />
                  <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", fontWeight: 700 }}>#{h.round}</div>
                </div>
              ))}
            </div>
          )}

          {roundHistory.length === 0 && (
            <div style={{ textAlign: "center", padding: "20px 0", color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
              Abhi koi round complete nahi hua
            </div>
          )}

          {/* Detailed history rows */}
          {roundHistory.slice(0, 10).map((h, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "11px 0",
              borderBottom: i < Math.min(roundHistory.length, 10) - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
            }}>
              {/* Left: color circle + result */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: "50%",
                  background: colorMap[h.color],
                  boxShadow: `0 0 12px ${colorGlow[h.color]}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18, flexShrink: 0,
                }}>
                  {colors.find(c => c.id === h.color)?.emoji}
                </div>
                <div>
                  <div style={{ fontWeight: 800, color: colorMap[h.color], fontSize: 14 }}>
                    {h.color.toUpperCase()}
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 1 }}>
                    {timeAgo(h.time)}
                  </div>
                </div>
              </div>

              {/* Middle: Round number */}
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontWeight: 700 }}>
                  Round #{h.round}
                </div>
              </div>

              {/* Right: user bet result */}
              <div style={{ textAlign: "right", minWidth: 70 }}>
                {!h.userBet ? (
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>—</div>
                ) : h.isWin ? (
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: S.neonGreen }}>+{h.prize}💎</div>
                    <div style={{ fontSize: 9, color: "rgba(0,255,136,0.6)" }}>WIN</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: "#ff6b6b" }}>-{h.betAmt}💎</div>
                    <div style={{ fontSize: 9, color: "rgba(255,107,107,0.6)" }}>
                      Bet: {h.userBet?.toUpperCase()}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Stats bar */}
          {roundHistory.length >= 3 && (() => {
            const myRounds = roundHistory.filter(h => h.userBet);
            const myWins   = myRounds.filter(h => h.isWin).length;
            const totalR   = roundHistory.length;
            const redCount = roundHistory.filter(h => h.color === "red").length;
            const grnCount = roundHistory.filter(h => h.color === "green").length;
            const vlCount  = roundHistory.filter(h => h.color === "violet").length;
            return (
              <div style={{ marginTop: 14, padding: "12px 14px", background: "rgba(0,0,0,0.3)", borderRadius: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", marginBottom: 10, letterSpacing: 1 }}>
                  STATS (Last {totalR} rounds)
                </div>
                <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                  {[
                    { label: "🔴 Red",    count: redCount, color: "#ff4444" },
                    { label: "🟢 Green",  count: grnCount, color: "#00c853" },
                    { label: "🟣 Violet", count: vlCount,  color: "#b537f2" },
                  ].map(s => (
                    <div key={s.label} style={{ flex: 1, textAlign: "center" }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: s.color }}>{s.count}</div>
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>{s.label}</div>
                      <div style={{ marginTop: 5, height: 4, borderRadius: 99, background: "rgba(255,255,255,0.08)" }}>
                        <div style={{ height: "100%", borderRadius: 99, background: s.color, width: `${totalR ? (s.count/totalR)*100 : 0}%`, transition: "width 0.5s" }} />
                      </div>
                    </div>
                  ))}
                </div>
                {myRounds.length > 0 && (
                  <div style={{ display: "flex", gap: 12, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10 }}>
                    <div style={{ flex: 1, textAlign: "center" }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: S.neonBlue }}>{myRounds.length}</div>
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>My Bets</div>
                    </div>
                    <div style={{ flex: 1, textAlign: "center" }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: S.neonGreen }}>{myWins}</div>
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>Wins</div>
                    </div>
                    <div style={{ flex: 1, textAlign: "center" }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: myWins/myRounds.length >= 0.5 ? S.neonGreen : "#ff6b6b" }}>
                        {Math.round((myWins / myRounds.length) * 100)}%
                      </div>
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>Win Rate</div>
                    </div>
                    <div style={{ flex: 1, textAlign: "center" }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: roundHistory.filter(h=>h.userBet&&h.isWin).reduce((s,h)=>s+h.prize,0) - roundHistory.filter(h=>h.userBet&&!h.isWin).reduce((s,h)=>s+h.betAmt,0) >= 0 ? S.neonGreen : "#ff6b6b" }}>
                        {(() => {
                          const won  = roundHistory.filter(h=>h.userBet&&h.isWin).reduce((s,h)=>s+h.prize,0);
                          const lost = roundHistory.filter(h=>h.userBet&&!h.isWin).reduce((s,h)=>s+h.betAmt,0);
                          const net  = won - lost;
                          return (net >= 0 ? "+" : "") + net + "💎";
                        })()}
                      </div>
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>Net P&L</div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </Card>
      </div>
    </div>
  );
};


// ─── ADMIN COLOR PAGE (Standalone — matches screenshot exactly) ───────────────
const AdminColorPage = ({ showToast }) => {
  const colorMap  = { red: "#ff4444", green: "#00c853", violet: "#b537f2" };
  const colorGlow = { red: "rgba(255,68,68,0.55)", green: "rgba(0,200,83,0.55)", violet: "rgba(181,55,242,0.55)" };

  const [mode, setMode] = useState(() => (DB.get("dp_platform_config") || {}).adminMode || "random");
  const [nextColor, setNextColor] = useState(() => (DB.get("dp_platform_config") || {}).forcedColor || null);

  const getLiveBets = () => {
    const now = Date.now();
    const txns = (DB.get("dp_transactions") || [])
      .filter(t => t.type === "game_spend" && (t.note || "").includes("Color Bet") && now - new Date(t.date).getTime() < 60000);
    const bets = { red: 0, green: 0, violet: 0 };
    txns.forEach(t => {
      if ((t.note||"").includes("red"))    bets.red    += Math.abs(t.diamonds);
      if ((t.note||"").includes("green"))  bets.green  += Math.abs(t.diamonds);
      if ((t.note||"").includes("violet")) bets.violet += Math.abs(t.diamonds);
    });
    return bets;
  };

  const [liveBets, setLiveBets] = useState(getLiveBets);
  useEffect(() => {
    const iv = setInterval(() => setLiveBets(getLiveBets()), 3000);
    return () => clearInterval(iv);
  }, []);

  const totalBets = liveBets.red + liveBets.green + liveBets.violet;
  const pct = (c) => totalBets > 0 ? Math.round((liveBets[c] / totalBets) * 100) : 0;
  const smartColor = (() => {
    const b = getLiveBets();
    if (b.red <= b.green && b.red <= b.violet) return "red";
    if (b.green <= b.red && b.green <= b.violet) return "green";
    return "violet";
  })();

  const applyMode = (m) => {
    const cfg = DB.get("dp_platform_config") || {};
    setMode(m);
    if (m === "random") {
      DB.set("dp_platform_config", { ...cfg, adminMode: "random", forcedColor: null });
      setNextColor(null);
      showToast("🎲 Random mode active", "info");
    } else if (m === "smart") {
      DB.set("dp_platform_config", { ...cfg, adminMode: "smart", forcedColor: null });
      setNextColor(null);
      showToast("🤖 Smart Auto ON — picks minimum payout color", "success");
    } else {
      DB.set("dp_platform_config", { ...cfg, adminMode: m, forcedColor: m });
      setNextColor(m);
      showToast(`✅ ${m.toUpperCase()} forced for next round`, "success");
    }
  };

  const forceOpts = [
    { id: "red",    label: "RED",    color: "#ff4444" },
    { id: "green",  label: "GREEN",  color: "#00c853" },
    { id: "violet", label: "VIOLET", color: "#b537f2" },
  ];

  return (
    <div style={{ ...S.page, background: "#0a0a1a" }}>
      {/* ── HEADER */}
      <div style={{ padding: "16px 20px 10px", background: "linear-gradient(180deg,#0f0f2e,transparent)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <div style={{ fontSize: 20, fontWeight: 900 }}>🎨 Color Game Admin</div>
      </div>

      <div style={{ padding: "16px 20px 100px", display: "flex", flexDirection: "column", gap: 0 }}>

        {/* ── LIVE BETS */}
        <Card style={{ marginBottom: 14, padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#00ff88", boxShadow: "0 0 7px #00ff88", animation: "pulse 1.2s infinite" }} />
            <span style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.45)", letterSpacing: 1.2 }}>LIVE BETS THIS ROUND</span>
          </div>
          {forceOpts.map(c => (
            <div key={c.id} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 11, height: 11, borderRadius: "50%", background: c.color, boxShadow: `0 0 6px ${c.color}` }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: c.color }}>{c.label.charAt(0) + c.label.slice(1).toLowerCase()}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>{liveBets[c.id]} 💎</span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", minWidth: 28, textAlign: "right" }}>{pct(c.id)}%</span>
                </div>
              </div>
              {/* Progress bar */}
              <div style={{ height: 7, background: "rgba(255,255,255,0.07)", borderRadius: 99, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct(c.id)}%`, background: c.color, borderRadius: 99, boxShadow: `0 0 6px ${c.color}88`, transition: "width 0.6s ease" }} />
              </div>
              {liveBets[c.id] === 0 && (
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", marginTop: 3, fontStyle: "italic" }}>
                  No bets on {c.label.toLowerCase()} this round
                </div>
              )}
            </div>
          ))}
          <div style={{ paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.07)", display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>Total bets</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: S.neonBlue }}>{totalBets} 💎</span>
          </div>
        </Card>

        {/* ── NEXT ROUND CONTROL label */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 16 }}>🎯</span>
          <span style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.42)", letterSpacing: 1.4 }}>NEXT ROUND CONTROL</span>
        </div>

        {/* ── STATUS CARD */}
        <Card style={{
          marginBottom: 14, padding: "14px 16px",
          background: mode === "smart" ? "rgba(0,255,136,0.07)" : nextColor ? `${colorMap[nextColor]}10` : "rgba(255,255,255,0.04)",
          border: `1px solid ${mode === "smart" ? "rgba(0,255,136,0.25)" : nextColor ? colorMap[nextColor]+"40" : "rgba(255,255,255,0.1)"}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* Icon */}
            {mode === "smart" ? (
              <div style={{ width: 50, height: 50, borderRadius: 14, background: "rgba(0,255,136,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0 }}>🤖</div>
            ) : nextColor ? (
              <div style={{ width: 50, height: 50, borderRadius: "50%", background: colorMap[nextColor], boxShadow: `0 0 20px ${colorGlow[nextColor]}`, flexShrink: 0 }} />
            ) : (
              <div style={{ width: 50, height: 50, borderRadius: 14, background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0 }}>🎲</div>
            )}
            {/* Text */}
            <div>
              <div style={{ fontSize: 18, fontWeight: 900, color: mode === "smart" ? "#00ff88" : nextColor ? colorMap[nextColor] : "rgba(255,255,255,0.55)", lineHeight: 1.2 }}>
                {mode === "smart" ? "SMART AUTO" : nextColor ? `${nextColor.toUpperCase()} FORCED` : "NOT SET"}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", marginTop: 4 }}>
                {mode === "smart"
                  ? `Will pick: ${smartColor.toUpperCase()} (least bets = min payout)`
                  : nextColor
                    ? "This color wins next round — one shot"
                    : "Choose below to control next round"}
              </div>
            </div>
          </div>
        </Card>

        {/* ── FORCE WIN BUTTONS: Red / Green / Violet */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
          {forceOpts.map(o => {
            const active = (mode === o.id);
            return (
              <button key={o.id} onClick={() => applyMode(o.id)} style={{
                borderRadius: 18, padding: "20px 6px 16px",
                border: `2px solid ${active ? o.color : "rgba(255,255,255,0.1)"}`,
                background: active ? `${o.color}20` : "rgba(255,255,255,0.05)",
                cursor: "pointer", transition: "all 0.2s",
                boxShadow: active ? `0 0 20px ${colorGlow[o.id]}` : "none",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
              }}>
                {/* Big color circle */}
                <div style={{
                  width: 48, height: 48, borderRadius: "50%",
                  background: o.color,
                  boxShadow: active ? `0 0 18px ${colorGlow[o.id]}` : `0 0 6px ${o.color}66`,
                }} />
                {/* Label */}
                <div style={{ fontSize: 13, fontWeight: 900, color: o.color, letterSpacing: 0.5 }}>{o.label}</div>
                {/* Force Win badge */}
                <div style={{
                  fontSize: 10, fontWeight: 800,
                  color: active ? o.color : "rgba(255,255,255,0.35)",
                  background: active ? `${o.color}18` : "rgba(255,255,255,0.06)",
                  border: `1px solid ${active ? o.color + "55" : "rgba(255,255,255,0.12)"}`,
                  borderRadius: 99, padding: "2px 10px",
                }}>Force Win</div>
              </button>
            );
          })}
        </div>

        {/* ── SMART AUTO + RANDOM ROW */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          {/* Smart Auto */}
          <button onClick={() => applyMode("smart")} style={{
            borderRadius: 18, padding: "18px 12px",
            border: `2px solid ${mode === "smart" ? "#00ff88" : "rgba(255,255,255,0.1)"}`,
            background: mode === "smart" ? "linear-gradient(135deg,#00ff88,#00d4ff)" : "rgba(255,255,255,0.05)",
            cursor: "pointer", transition: "all 0.22s",
            boxShadow: mode === "smart" ? "0 0 28px rgba(0,255,136,0.55)" : "none",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 26, marginBottom: 5 }}>🤖</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: mode === "smart" ? "#000" : "#fff", lineHeight: 1.3 }}>
              Smart Auto<br />
              <span style={{ fontSize: 12, fontWeight: 700, color: mode === "smart" ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.5)" }}>(Min Payout)</span>
            </div>
          </button>

          {/* Random */}
          <button onClick={() => applyMode("random")} style={{
            borderRadius: 18, padding: "18px 12px",
            border: `2px solid ${mode === "random" ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.1)"}`,
            background: mode === "random" ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)",
            cursor: "pointer", transition: "all 0.22s",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 26, marginBottom: 5 }}>🎲</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: mode === "random" ? "#fff" : "rgba(255,255,255,0.55)", lineHeight: 1.3 }}>
              Random
            </div>
          </button>
        </div>

        {/* ── TIP */}
        <Card style={{ background: "rgba(255,215,0,0.04)", border: "1px solid rgba(255,215,0,0.14)", padding: "12px 14px" }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.75 }}>
            💡 <strong style={{ color: "#ffd700" }}>Admin Control:</strong><br />
            • <b>Force Win</b> → next round guaranteed result (one-shot)<br />
            • <b>Smart Auto</b> → auto-picks color with least bets (max revenue)<br />
            • <b>Random</b> → pure algorithm, no control<br />
            • Users ko kuch pata nahi chalta 🔒
          </div>
        </Card>
      </div>
    </div>
  );
};

// ─── ADMIN COLOR CONTROL PANEL ────────────────────────────────────────────────
const AdminColorControl = ({ showToast }) => {
  const colorMap  = { red: "#ff4444", green: "#00c853", violet: "#b537f2" };
  const colorGlow = { red: "rgba(255,68,68,0.5)", green: "rgba(0,200,83,0.5)", violet: "rgba(181,55,242,0.5)" };

  const [nextColor, setNextColor] = useState(() => (DB.get("dp_platform_config") || {}).forcedColor || null);
  const [mode,      setMode]      = useState(() => (DB.get("dp_platform_config") || {}).adminMode || "random");
  // "random" | "smart" | "red" | "green" | "violet"

  // Read live bets from current round transactions (last 60 sec)
  const getLiveBets = () => {
    const now  = Date.now();
    const txns = (DB.get("dp_transactions") || [])
      .filter(t => t.type === "game_spend" && (t.note || "").includes("Color Bet") && now - new Date(t.date).getTime() < 60000);
    const bets = { red: 0, green: 0, violet: 0 };
    txns.forEach(t => {
      if ((t.note||"").includes("red"))    bets.red    += Math.abs(t.diamonds);
      if ((t.note||"").includes("green"))  bets.green  += Math.abs(t.diamonds);
      if ((t.note||"").includes("violet")) bets.violet += Math.abs(t.diamonds);
    });
    return bets;
  };

  const [liveBets, setLiveBets] = useState(getLiveBets);
  // Refresh live bets every 3 seconds
  useEffect(() => {
    const iv = setInterval(() => setLiveBets(getLiveBets()), 3000);
    return () => clearInterval(iv);
  }, []);

  const totalBets = liveBets.red + liveBets.green + liveBets.violet;

  // Smart Auto: pick color with LEAST bets (min payout to platform)
  const getSmartColor = () => {
    const b = getLiveBets();
    if (b.red <= b.green && b.red <= b.violet)    return "red";
    if (b.green <= b.red && b.green <= b.violet)  return "green";
    return "violet";
  };

  const applyMode = (newMode) => {
    setMode(newMode);
    const cfg = DB.get("dp_platform_config") || {};
    if (newMode === "random") {
      DB.set("dp_platform_config", { ...cfg, forcedColor: null, adminMode: "random" });
      setNextColor(null);
      showToast("🎲 Random mode — system decides!", "info");
    } else if (newMode === "smart") {
      DB.set("dp_platform_config", { ...cfg, adminMode: "smart", forcedColor: null });
      setNextColor(null);
      showToast("🤖 Smart Auto ON — min payout color will be auto-picked!", "success");
    } else {
      // force a specific color
      DB.set("dp_platform_config", { ...cfg, forcedColor: newMode, adminMode: newMode });
      setNextColor(newMode);
      showToast(`✅ Force WIN set: ${newMode.toUpperCase()}`, "success");
    }
  };

  // Compute smart suggestion live
  const smartSuggestion = getSmartColor();
  const pctOf = (c) => totalBets > 0 ? Math.round((liveBets[c] / totalBets) * 100) : 0;

  const forceOptions = [
    { id: "red",    label: "RED",    color: "#ff4444", glow: colorGlow.red },
    { id: "green",  label: "GREEN",  color: "#00c853", glow: colorGlow.green },
    { id: "violet", label: "VIOLET", color: "#b537f2", glow: colorGlow.violet },
  ];

  return (
    <div style={{ paddingBottom: 30 }}>

      {/* ── LIVE BETS PANEL */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: S.neonGreen, boxShadow: `0 0 8px ${S.neonGreen}`, animation: "pulse 1s infinite" }} />
          <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.5)", letterSpacing: 1 }}>LIVE BETS THIS ROUND</div>
        </div>

        {[
          { id: "red",    label: "Red",    color: "#ff4444" },
          { id: "green",  label: "Green",  color: "#00c853" },
          { id: "violet", label: "Violet", color: "#b537f2" },
        ].map(c => (
          <div key={c.id} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: c.color }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: c.color }}>{c.label}</span>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{liveBets[c.id]}💎</span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", minWidth: 30, textAlign: "right" }}>{pctOf(c.id)}%</span>
              </div>
            </div>
            <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 99, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 99,
                background: c.color,
                width: `${pctOf(c.id)}%`,
                boxShadow: `0 0 8px ${c.color}`,
                transition: "width 0.6s ease",
              }} />
            </div>
            {liveBets[c.id] === 0 && (
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginTop: 3, fontStyle: "italic" }}>
                No bets on {c.label.toLowerCase()} this round
              </div>
            )}
          </div>
        ))}

        <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(255,255,255,0.04)", borderRadius: 10, display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Total bets this round</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: S.neonBlue }}>{totalBets} 💎</span>
        </div>
      </div>

      {/* ── NEXT ROUND CONTROL HEADER */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 16 }}>🎯</span>
        <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.5)", letterSpacing: 1 }}>NEXT ROUND CONTROL</div>
      </div>

      {/* ── STATUS CARD */}
      <Card style={{
        marginBottom: 16,
        background: mode === "smart"
          ? "rgba(0,255,136,0.08)"
          : nextColor
            ? `${colorMap[nextColor]}12`
            : "rgba(255,255,255,0.04)",
        border: `1px solid ${mode === "smart" ? "rgba(0,255,136,0.3)" : nextColor ? colorMap[nextColor]+"44" : "rgba(255,255,255,0.1)"}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {mode === "smart" ? (
            <>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(0,255,136,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>🤖</div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 900, color: S.neonGreen }}>SMART AUTO</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
                  Will pick: <span style={{ color: colorMap[smartSuggestion], fontWeight: 700 }}>{smartSuggestion.toUpperCase()}</span> (min payout)
                </div>
              </div>
            </>
          ) : nextColor ? (
            <>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: colorMap[nextColor], boxShadow: `0 0 20px ${colorGlow[nextColor]}`, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 17, fontWeight: 900, color: colorMap[nextColor] }}>{nextColor.toUpperCase()} FORCED</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>This color will win next round (one-shot)</div>
              </div>
            </>
          ) : (
            <>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0 }}>🎲</div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 900, color: "rgba(255,255,255,0.6)" }}>NOT SET</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>Choose below to control next round</div>
              </div>
            </>
          )}
        </div>
      </Card>

      {/* ── FORCE WIN BUTTONS — Red / Green / Violet */}
      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        {forceOptions.map(o => {
          const isActive = (mode === o.id || nextColor === o.id);
          return (
            <button key={o.id} onClick={() => applyMode(o.id)} style={{
              flex: 1,
              padding: "20px 4px 14px",
              borderRadius: 18,
              border: `2px solid ${isActive ? o.color : "rgba(255,255,255,0.1)"}`,
              background: isActive ? `${o.color}22` : "rgba(255,255,255,0.05)",
              cursor: "pointer",
              transition: "all 0.2s",
              boxShadow: isActive ? `0 0 22px ${o.glow}, inset 0 0 20px ${o.color}15` : "none",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: "50%",
                background: o.color,
                boxShadow: isActive ? `0 0 16px ${o.glow}` : `0 0 6px ${o.color}66`,
              }} />
              <div style={{ fontWeight: 900, fontSize: 14, color: o.color }}>{o.label}</div>
              <div style={{
                fontSize: 11, fontWeight: 800,
                color: isActive ? o.color : "rgba(255,255,255,0.35)",
                background: isActive ? `${o.color}20` : "rgba(255,255,255,0.06)",
                border: `1px solid ${isActive ? o.color+"55" : "rgba(255,255,255,0.1)"}`,
                borderRadius: 99,
                padding: "2px 10px",
                marginTop: 2,
              }}>Force Win</div>
            </button>
          );
        })}
      </div>

      {/* ── SMART AUTO + RANDOM BUTTONS */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        {/* Smart Auto */}
        <button onClick={() => applyMode("smart")} style={{
          flex: 1,
          padding: "18px 14px",
          borderRadius: 18,
          border: `2px solid ${mode === "smart" ? S.neonGreen : "rgba(255,255,255,0.1)"}`,
          background: mode === "smart"
            ? "linear-gradient(135deg,#00ff88,#00d4ff)"
            : "rgba(255,255,255,0.05)",
          cursor: "pointer",
          transition: "all 0.2s",
          boxShadow: mode === "smart" ? "0 0 24px rgba(0,255,136,0.5)" : "none",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 22, marginBottom: 4 }}>🤖</div>
          <div style={{ fontWeight: 900, fontSize: 15, color: mode === "smart" ? "#000" : "#fff" }}>Smart Auto</div>
          <div style={{ fontSize: 11, color: mode === "smart" ? "rgba(0,0,0,0.65)" : "rgba(255,255,255,0.4)", marginTop: 2 }}>(Min Payout)</div>
        </button>

        {/* Random */}
        <button onClick={() => applyMode("random")} style={{
          flex: 1,
          padding: "18px 14px",
          borderRadius: 18,
          border: `2px solid ${mode === "random" ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.1)"}`,
          background: mode === "random" ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)",
          cursor: "pointer",
          transition: "all 0.2s",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 22, marginBottom: 4 }}>🎲</div>
          <div style={{ fontWeight: 900, fontSize: 15, color: mode === "random" ? "#fff" : "rgba(255,255,255,0.6)" }}>Random</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>(System picks)</div>
        </button>
      </div>

      {/* ── INFO TIP */}
      <Card style={{ background: "rgba(255,215,0,0.05)", border: "1px solid rgba(255,215,0,0.15)" }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.7 }}>
          💡 <strong style={{ color: "#ffd700" }}>How it works:</strong><br />
          • <strong>Force Win</strong> → next round mein woh color guaranteed aayega (1 time)<br />
          • <strong>Smart Auto</strong> → automatically wo color choose karta hai jisme sabse kam bets hain (minimum payout)<br />
          • <strong>Random</strong> → pure algorithm decides, no control<br />
          • Users ko kuch pata nahi chalta 🔒
        </div>
      </Card>
    </div>
  );
};

// ─── ADMIN GAMES HUB (central place to manage all games) ─────────────────────
const GameRateCard = ({ icon, title, desc, cfgKey, cfg, showToast, accent }) => {
  const [val, setVal] = useState(String(cfg[cfgKey] ?? 0));
  const save = () => {
    const n = Number(val);
    if (isNaN(n) || n < 0 || n > 100) { showToast("Enter a valid % between 0-100", "error"); return; }
    const latest = DB.get("dp_platform_config") || {};
    DB.set("dp_platform_config", { ...latest, [cfgKey]: n });
    showToast(`${title} win rate set to ${n}%`, "success");
  };
  return (
    <Card style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 28 }}>{icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800 }}>{title}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{desc}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <Input label="Win chance %" value={val} onChange={setVal} type="number" icon="🎯" />
        </div>
        <Btn onClick={save} variant="green" style={{ marginBottom: 14 }}>💾 Save</Btn>
      </div>
    </Card>
  );
};

const AdminGamesHub = ({ setPage, showToast }) => {
  const cfg = DB.get("dp_platform_config") || {};

  return (
    <div style={S.page}>
      <TopBar title="🎮 Games" onBack={() => setPage("admin")} />
      <div style={{ padding: "0 20px" }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 14 }}>
          Sabhi games ka admin control ek hi jagah. Color Prediction apne dedicated advanced panel (auto/manual/live bets) se hi chalega — waisa hi rahega. Baaki games ka win-chance yahin se set karo.
        </div>

        {/* Color Prediction — untouched, links to its existing full control page */}
        <Card onClick={() => setPage("admin_color")} style={{ marginBottom: 16, background: "rgba(181,55,242,0.08)", border: `1px solid ${S.neonPink}44` }} glow>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ fontSize: 28 }}>🎨</div>
              <div>
                <div style={{ fontWeight: 800 }}>Color Prediction</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>Mode: {(cfg.adminMode || "random")} · Full live-bets control</div>
              </div>
            </div>
            <div style={{ color: S.neonBlue, fontWeight: 700 }}>Manage →</div>
          </div>
        </Card>

        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 10 }}>Other Games</div>

        <GameRateCard icon="🎲" title="Dice Roll" desc={`Cost ${cfg.gameCost || 5}💎 · Win 30💎 on exact match`} cfgKey="diceWinRate" cfg={cfg} showToast={showToast} />
        <GameRateCard icon="🔢" title="Number Pick" desc={`Cost ${cfg.gameCost || 5}💎 · Win 45💎 exact, 8💎 near-miss`} cfgKey="numberWinRate" cfg={cfg} showToast={showToast} />
        <GameRateCard icon="🃏" title="Scratch Card" desc={`Cost ${cfg.scratchCost || 10}💎 · Win up to 100💎`} cfgKey="scratchWinRate" cfg={cfg} showToast={showToast} />
      </div>
    </div>
  );
};

// ─── DICE GAME ────────────────────────────────────────────────────────────────
const DiceGame = ({ user, setUser, setPage, showToast }) => {
  const [pick, setPick] = useState(null);
  const [rolled, setRolled] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [msg, setMsg] = useState("");
  const cfg = DB.get("dp_platform_config") || {};
  const COST = cfg.gameCost || 5;
  const diceEmoji = ["", "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣"];
  const play = async () => {
    if (!pick) { setMsg("Pick a number 1-6!"); return; }
    if (user.diamonds < COST) { showToast("Not enough Diamonds!", "error"); return; }
    setMsg(""); setSpinning(true);
    saveGameResult(user.id, -COST, `Dice Roll - pick ${pick}`);
    setUser(u => ({ ...u, diamonds: u.diamonds - COST, gamesPlayed: u.gamesPlayed + 1 }));
    await sleep(1500);
    const winRate = cfg.diceWinRate ?? 17;
    const forceWin = Math.random() * 100 < winRate;
    let r;
    if (forceWin) { r = pick; }
    else { do { r = rnd(1, 6); } while (r === pick); }
    setRolled(r); setSpinning(false);
    if (r === pick) {
      saveGameResult(user.id, 30, `Dice Win - rolled ${r}`);
      setUser(u => ({ ...u, diamonds: u.diamonds + 30 }));
      setMsg("🎉 PERFECT ROLL! +30 Diamonds!");
    } else { setMsg(`Rolled ${r}. Try again!`); }
  };
  return (
    <div style={S.page}>
      <TopBar title="🎲 Dice Roll" onBack={() => setPage("games")} right={<DiamondChip amount={user.diamonds} />} />
      <div style={{ padding: 20, textAlign: "center" }}>
        <div style={{ fontSize: 80, marginBottom: 8 }}>{spinning ? "🎲" : rolled ? diceEmoji[rolled] : "🎲"}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
          {[1, 2, 3, 4, 5, 6].map(n => (
            <button key={n} onClick={() => { setPick(n); setRolled(null); setMsg(""); }} style={{ padding: 16, borderRadius: 14, background: pick === n ? S.gradBlue : "rgba(255,255,255,0.06)", border: `2px solid ${pick === n ? S.neonBlue : "rgba(255,255,255,0.1)"}`, color: "#fff", fontWeight: 800, fontSize: 20, cursor: "pointer" }}>{diceEmoji[n]}</button>
          ))}
        </div>
        {msg && <Card style={{ marginBottom: 14, background: msg.includes("🎉") ? "rgba(0,255,136,0.1)" : "rgba(255,61,154,0.1)" }}><div style={{ fontWeight: 700 }}>{msg}</div></Card>}
        <Btn full onClick={play} disabled={spinning}>{spinning ? "Rolling..." : `💎 Roll (${COST} Diamonds) · Win 30`}</Btn>
      </div>
    </div>
  );
};

// ─── NUMBER GAME ──────────────────────────────────────────────────────────────
const NumberGame = ({ user, setUser, setPage, showToast }) => {
  const [pick, setPick] = useState(null);
  const [result, setResult] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [msg, setMsg] = useState("");
  const cfg = DB.get("dp_platform_config") || {};
  const COST = cfg.gameCost || 5;
  const play = async () => {
    if (!pick) { setMsg("Pick a number!"); return; }
    if (user.diamonds < COST) { showToast("Not enough Diamonds!", "error"); return; }
    setMsg(""); setPlaying(true);
    saveGameResult(user.id, -COST, `Number Pick - pick ${pick}`);
    setUser(u => ({ ...u, diamonds: u.diamonds - COST, gamesPlayed: u.gamesPlayed + 1 }));
    await sleep(1200);
    const winRate = cfg.numberWinRate ?? 10;
    const forceWin = Math.random() * 100 < winRate;
    let r;
    if (forceWin) { r = pick; }
    else { do { r = rnd(1, 10); } while (r === pick); }
    setResult(r); setPlaying(false);
    if (r === pick) {
      saveGameResult(user.id, 45, `Number Win - exact ${r}`);
      setUser(u => ({ ...u, diamonds: u.diamonds + 45 }));
      setMsg("🎉 EXACT MATCH! +45 Diamonds!");
    } else if (Math.abs(r - pick) === 1) {
      saveGameResult(user.id, 8, `Number Near Win - ${r}`);
      setUser(u => ({ ...u, diamonds: u.diamonds + 8 }));
      setMsg(`Close! +8 Diamonds consolation!`);
    } else { setMsg(`Number was ${r}. Try again!`); }
  };
  return (
    <div style={S.page}>
      <TopBar title="🔢 Number Pick" onBack={() => setPage("games")} right={<DiamondChip amount={user.diamonds} />} />
      <div style={{ padding: 20 }}>
        <div style={{ fontSize: 64, textAlign: "center", marginBottom: 16 }}>{playing ? "🤔" : result ? `${result}` : "?"}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8, marginBottom: 16 }}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
            <button key={n} onClick={() => { setPick(n); setResult(null); setMsg(""); }} style={{ padding: "14px 0", borderRadius: 12, fontWeight: 800, fontSize: 18, cursor: "pointer", background: pick === n ? S.gradBlue : "rgba(255,255,255,0.06)", border: `2px solid ${pick === n ? S.neonBlue : "rgba(255,255,255,0.1)"}`, color: "#fff" }}>{n}</button>
          ))}
        </div>
        {msg && <Card style={{ marginBottom: 14, textAlign: "center", background: msg.includes("🎉") ? "rgba(0,255,136,0.1)" : "rgba(255,61,154,0.1)" }}><div style={{ fontWeight: 700 }}>{msg}</div></Card>}
        <Btn full onClick={play} disabled={playing}>{playing ? "Revealing..." : `💎 Play (${COST} Diamonds)`}</Btn>
      </div>
    </div>
  );
};

// ─── SCRATCH GAME ─────────────────────────────────────────────────────────────
const ScratchGame = ({ user, setUser, setPage, showToast }) => {
  const [bought, setBought] = useState(false);
  const [scratched, setScratched] = useState(false);
  const [prize, setPrize] = useState(0);
  const [loading, setLoading] = useState(false);
  const cfg = DB.get("dp_platform_config") || {};
  const COST = cfg.scratchCost || 10;
  const buy = async () => {
    if (user.diamonds < COST) { showToast("Not enough Diamonds!", "error"); return; }
    setLoading(true);
    saveGameResult(user.id, -COST, "Scratch Card Buy");
    setUser(u => ({ ...u, diamonds: u.diamonds - COST, gamesPlayed: u.gamesPlayed + 1 }));
    await sleep(800);
    const winRate = cfg.scratchWinRate ?? 33;
    const winPrizes = [5, 15, 30, 50, 100];
    const isWin = Math.random() * 100 < winRate;
    setPrize(isWin ? winPrizes[rnd(0, winPrizes.length - 1)] : 0);
    setBought(true); setScratched(false); setLoading(false);
  };
  const scratch = () => {
    if (!bought) return;
    setScratched(true);
    if (prize > 0) {
      saveGameResult(user.id, prize, `Scratch Card Win - ${prize}`);
      setUser(u => ({ ...u, diamonds: u.diamonds + prize }));
    }
  };
  return (
    <div style={S.page}>
      <TopBar title="🃏 Scratch Card" onBack={() => setPage("games")} right={<DiamondChip amount={user.diamonds} />} />
      <div style={{ padding: 20, textAlign: "center" }}>
        <Card style={{ padding: 40, marginBottom: 20, background: scratched ? (prize > 0 ? "rgba(0,255,136,0.1)" : "rgba(255,61,154,0.1)") : S.glass }}>
          {!bought ? <div style={{ fontSize: 60 }}>🃏</div>
            : scratched ? <div><div style={{ fontSize: 50 }}>{prize > 0 ? "🎉" : "😢"}</div><div style={{ fontSize: 28, fontWeight: 900, color: prize > 0 ? S.neonGreen : "#ff6b6b", marginTop: 8 }}>{prize > 0 ? `+${prize} 💎` : "No Prize"}</div></div>
              : <div style={{ cursor: "pointer" }} onClick={scratch}><div style={{ fontSize: 60 }}>✋</div><div style={{ marginTop: 10, color: S.neonBlue, fontWeight: 700 }}>Tap to Scratch!</div></div>}
        </Card>
        {!bought ? <Btn full variant="gold" onClick={buy} disabled={loading}>{loading ? "Getting card..." : `💎 Buy Card (${COST} Diamonds)`}</Btn>
          : scratched ? <Btn full onClick={() => { setBought(false); setScratched(false); setPrize(0); }}>🃏 Try Again</Btn>
            : <Btn full onClick={scratch}>✋ Scratch Now!</Btn>}
      </div>
    </div>
  );
};

// ─── WALLET / PAYMENT PAGE ────────────────────────────────────────────────────
const WalletPage = ({ user, setUser, setPage, showToast }) => {
  const { t } = useLang();
  // Support jumping straight to a specific tab/filter (e.g. from Profile page's
  // Deposit / Withdraw quick-actions), using the same window-global pattern used
  // for auth mode elsewhere in this app.
  const initialView = window.__walletInitialView || null;
  const [tab, setTab] = useState(initialView === "withdrawHistory" || initialView === "withdraw" ? "withdraw" : initialView ? "history" : "deposit");
  const [historyFilter, setHistoryFilter] = useState(
    initialView === "depositHistory" ? "deposit" : initialView === "withdrawHistory" ? "withdrawal" : "all"
  );
  useEffect(() => { window.__walletInitialView = null; }, []);
  const [selectedPack, setSelectedPack] = useState(null);
  const [payStep, setPayStep] = useState("select"); // select | instructions | utr
  const [utrNumber, setUtrNumber] = useState("");
  const [screenshotData, setScreenshotData] = useState(null);
  const [screenshotFileName, setScreenshotFileName] = useState("");
  const [screenshotError, setScreenshotError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [withdrawAmt, setWithdrawAmt] = useState("");
  const [upiId, setUpiId] = useState("");
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const cfg = DB.get("dp_platform_config") || {};
  const packs = DB.get("dp_diamond_packs") || [];
  const freshUser = (DB.get("dp_users") || []).find(u => u.id === user.id) || user;
  const allTxnsForUser = (DB.get("dp_transactions") || []).filter(t => t.userId === user.id);
  const txns = (historyFilter === "all" ? allTxnsForUser : allTxnsForUser.filter(t => t.type === historyFilter)).slice(0, 30);

  const startPayment = (pack) => {
    setSelectedPack(pack);
    setPayStep("instructions");
  };

  const cancelDeposit = () => {
    setSelectedPack(null);
    setPayStep("select");
    setUtrNumber("");
    setScreenshotData(null);
    setScreenshotFileName("");
    setScreenshotError("");
  };

  const handleScreenshotSelect = (file) => {
    setScreenshotError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) { setScreenshotError("Please upload an image file (JPG/PNG)"); return; }
    if (file.size > 3 * 1024 * 1024) { setScreenshotError("Image too large — please use a screenshot under 3MB"); return; }
    const reader = new FileReader();
    reader.onload = () => { setScreenshotData(reader.result); setScreenshotFileName(file.name); };
    reader.onerror = () => setScreenshotError("Couldn't read that image, try again");
    reader.readAsDataURL(file);
  };

  const handleScreenshotPaste = (e) => {
    const items = e.clipboardData?.items || [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) { handleScreenshotSelect(file); return; }
      }
    }
    setScreenshotError("No image found in clipboard — copy a screenshot first, then paste here");
  };

  const submitDepositRequest = async () => {
    if (freshUser.frozen) { showToast("🧊 Your wallet is frozen. Contact support to continue.", "error"); return; }
    const utr = utrNumber.trim();
    if (utr.length < 6) { showToast("Enter valid UTR / Transaction ID", "error"); return; }
    if (!screenshotData) { showToast("Please attach your payment screenshot", "error"); return; }
    // Check for duplicate UTR
    const allTxns = DB.get("dp_transactions") || [];
    const duplicate = allTxns.find(t => t.utr === utr);
    if (duplicate) { showToast("This UTR was already submitted!", "error"); return; }
    setSubmitting(true);
    await sleep(800);
    const total = selectedPack.diamonds + selectedPack.bonus;
    const gatewayLogId = `GW${Date.now().toString().slice(-8)}`;
    const newTxn = {
      id: tid(),
      userId: user.id,
      type: "deposit",
      amount: selectedPack.price,
      diamonds: total,
      status: "pending",
      date: new Date().toISOString(),
      method: "UPI",
      note: `${selectedPack.label} Pack — UTR: ${utr}`,
      utr,
      utrVerified: false,
      screenshotVerified: false,
      hasScreenshot: true,
      screenshotData,
      gateway: "Manual UPI",
      gatewayLogId,
      packId: selectedPack.id,
      packLabel: selectedPack.label,
    };
    DB.set("dp_transactions", [newTxn, ...allTxns]);
    // Log to payment gateway log
    const gwLogs = DB.get("dp_gateway_logs") || [];
    DB.set("dp_gateway_logs", [{
      id: gatewayLogId,
      txnId: newTxn.id,
      userId: user.id,
      userName: user.name,
      gateway: "Manual UPI",
      utr,
      amount: selectedPack.price,
      status: "received",
      at: new Date().toISOString(),
    }, ...gwLogs].slice(0, 300));
    pushAdminAlert("deposit_pending", {
      txnId: newTxn.id,
      userName: user.name,
      phone: user.phone,
      amount: selectedPack.price,
      diamonds: total,
      utr,
      pack: selectedPack.label,
      time: new Date().toISOString(),
    });
    setSubmitting(false);
    cancelDeposit();
    showToast("✅ Deposit request submitted!\nAdmin will verify & credit diamonds within 30 min.", "success");
  };

  const submitWithdrawal = async () => {
    if (freshUser.frozen) { showToast("🧊 Your wallet is frozen. Contact support to continue.", "error"); return; }
    const amt = parseInt(withdrawAmt);
    const minW = cfg.minWithdraw || 200;
    if (!amt || amt < minW) { showToast(`Minimum withdrawal: ${minW} Diamonds`, "error"); return; }
    if (amt > user.diamonds) { showToast("Not enough Diamonds", "error"); return; }
    if (!upiId || !upiId.includes("@")) { showToast("Enter valid UPI ID (e.g. name@upi)", "error"); return; }
    setWithdrawLoading(true);
    await sleep(1000);
    const fee = Math.floor(amt * (cfg.withdrawFeePercent || 5) / 100);
    const net = amt - fee;
    const users = DB.get("dp_users") || [];
    const updated = users.map(u => u.id === user.id ? { ...u, diamonds: u.diamonds - amt, totalWithdrawn: u.totalWithdrawn + amt } : u);
    DB.set("dp_users", updated);
    const txnsNow = DB.get("dp_transactions") || [];
    DB.set("dp_transactions", [{ id: tid(), userId: user.id, type: "withdrawal", amount: net, diamonds: -amt, status: "pending", date: new Date().toISOString(), method: "UPI", note: `Withdraw to ${upiId}`, upiId, fee }, ...txnsNow]);
    pushAdminAlert("withdrawal", { userName: user.name, diamonds: amt, upiId, time: new Date().toISOString() });
    setUser(u => ({ ...u, diamonds: u.diamonds - amt, totalWithdrawn: u.totalWithdrawn + amt }));
    setWithdrawLoading(false);
    setWithdrawAmt(""); setUpiId("");
    showToast("Withdrawal request submitted! Admin will process within 24 hours.", "success");
  };

  // ── Deposit — Step 1: pack select
  const DepositSelectView = () => (
    <div>
      <Card style={{ marginBottom: 16, background: "rgba(0,212,255,0.06)", border: `1px solid rgba(0,212,255,0.2)` }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: S.neonBlue, marginBottom: 6 }}>{t("wallet_how_it_works")}</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.7 }}>
          1️⃣ Select a Diamond pack<br />
          2️⃣ Pay to our UPI ID via GPay / PhonePe / Paytm<br />
          3️⃣ Submit your UTR / Transaction ID<br />
          4️⃣ Admin verifies & credits diamonds in ≤30 min ✅
        </div>
      </Card>
      <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.6)", marginBottom: 12 }}>{t("wallet_choose_pack")}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {packs.map(p => (
          <Card key={p.id} onClick={() => startPayment(p)} style={{ position: "relative", cursor: "pointer", textAlign: "center", padding: 14, border: p.popular ? `1px solid ${S.neonGold}` : undefined }}>
            {p.popular && <div style={{ position: "absolute", top: -8, left: "50%", transform: "translateX(-50%)", background: S.gradGold, borderRadius: 20, padding: "2px 10px", fontSize: 10, fontWeight: 800, color: "#000" }}>⭐ POPULAR</div>}
            <div style={{ fontSize: 28, marginBottom: 4 }}>💎</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{fmt(p.diamonds)}</div>
            {p.bonus > 0 && <div style={{ fontSize: 11, color: S.neonGreen }}>+{p.bonus} bonus</div>}
            <div style={{ fontSize: 16, fontWeight: 700, color: S.neonGold, marginTop: 6 }}>{fmtINR(p.price)}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>{p.label}</div>
          </Card>
        ))}
      </div>
    </div>
  );

  // ── Deposit — Step 2: UPI payment instructions
  const DepositInstructionsView = () => (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <button onClick={cancelDeposit} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "#fff", borderRadius: 50, width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>←</button>
        <div style={{ fontSize: 16, fontWeight: 800 }}>{t("wallet_pay_via_upi")}</div>
      </div>

      {/* Pack summary */}
      <Card style={{ textAlign: "center", marginBottom: 16, background: "linear-gradient(135deg,rgba(255,215,0,0.1),rgba(255,107,53,0.08))", border: `1px solid rgba(255,215,0,0.25)` }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 2 }}>{t("wallet_youre_buying")}</div>
        <div style={{ fontSize: 28, fontWeight: 900 }}>💎 {fmt(selectedPack.diamonds + selectedPack.bonus)}</div>
        {selectedPack.bonus > 0 && <div style={{ fontSize: 12, color: S.neonGreen }}>({selectedPack.diamonds} + {selectedPack.bonus} bonus)</div>}
        <div style={{ fontSize: 26, fontWeight: 800, color: S.neonGold, marginTop: 6 }}>{fmtINR(selectedPack.price)}</div>
        <Badge label={selectedPack.label} color={S.neonGold} />
      </Card>

      {/* UPI details box */}
      <Card style={{ marginBottom: 16, background: "rgba(0,212,255,0.05)", border: `1px solid rgba(0,212,255,0.2)` }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: S.neonBlue, marginBottom: 12 }}>{t("wallet_send_payment_to")}</div>
        <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 12, padding: 14, marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 2 }}>UPI ID</div>
          <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: 0.5, marginBottom: 4 }}>{cfg.upiId || "diamondplay@upi"}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{cfg.upiName || "DiamondPlay Gaming"}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn full sm variant="outline" onClick={() => { navigator.clipboard?.writeText(cfg.upiId || "diamondplay@upi"); showToast("UPI ID copied! 📋", "success"); }}>📋 Copy UPI ID</Btn>
          <Btn full sm variant="primary" onClick={() => {
            const upiUrl = `upi://pay?pa=${encodeURIComponent(cfg.upiId || "diamondplay@upi")}&pn=${encodeURIComponent(cfg.upiName || "DiamondPlay")}&am=${selectedPack.price}&cu=INR`;
            window.open(upiUrl, "_blank");
          }}>🚀 Open GPay</Btn>
        </div>
      </Card>

      {/* Steps */}
      <Card style={{ marginBottom: 16, background: "rgba(255,255,255,0.03)" }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>📋 Steps to complete</div>
        {[
          ["1", `Open GPay / PhonePe / Paytm`, S.neonBlue],
          ["2", `Send exactly ${fmtINR(selectedPack.price)} to the UPI ID above`, S.neonGold],
          ["3", "Note down your UTR / Transaction ID from payment receipt", S.neonGreen],
          ["4", "Tap 'I've Paid' below and enter the UTR number", S.neonPurple],
        ].map(([n, text, c]) => (
          <div key={n} style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: `${c}33`, border: `1px solid ${c}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: c, flexShrink: 0 }}>{n}</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", paddingTop: 3 }}>{text}</div>
          </div>
        ))}
      </Card>

      <Btn full variant="green" onClick={() => setPayStep("utr")}>{t("wallet_ive_paid")}</Btn>
      <div style={{ marginTop: 10, textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>{t("wallet_credited_note")}</div>
    </div>
  );

  // ── Deposit — Step 3: UTR submission
  const DepositUTRView = () => (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <button onClick={() => setPayStep("instructions")} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "#fff", borderRadius: 50, width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>←</button>
        <div style={{ fontSize: 16, fontWeight: 800 }}>{t("wallet_submit_proof")}</div>
      </div>

      <Card style={{ marginBottom: 16, background: "rgba(0,255,136,0.06)", border: `1px solid rgba(0,255,136,0.2)` }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{t("wallet_pack")}</div>
            <div style={{ fontWeight: 800 }}>💎 {fmt(selectedPack.diamonds + selectedPack.bonus)} Diamonds</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{t("wallet_amount_paid")}</div>
            <div style={{ fontWeight: 800, color: S.neonGold }}>{fmtINR(selectedPack.price)}</div>
          </div>
        </div>
      </Card>

      <div style={{ marginBottom: 6, fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>{t("wallet_utr_label")}</div>
      <div style={{ marginBottom: 6, fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{t("wallet_utr_hint")}</div>
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="e.g. 425678901234"
          value={utrNumber}
          onChange={e => setUtrNumber(e.target.value.replace(/\s/g, "").slice(0, 22))}
          style={{ width: "100%", background: "rgba(255,255,255,0.07)", border: `1px solid ${utrNumber.length >= 6 ? S.neonGreen : "rgba(255,255,255,0.15)"}`, borderRadius: 12, padding: "14px 16px", color: "#fff", fontSize: 16, fontWeight: 700, outline: "none", boxSizing: "border-box", letterSpacing: 1 }}
        />
      </div>

      <div style={{ marginBottom: 6, fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>📷 Payment Screenshot</div>
      <div style={{ marginBottom: 10, fontSize: 12, color: "rgba(255,255,255,0.45)" }}>Attach a screenshot of your payment receipt so admin can verify it faster.</div>

      {screenshotData ? (
        <div style={{ position: "relative", marginBottom: 12 }}>
          <img src={screenshotData} alt="Payment screenshot" style={{ width: "100%", maxHeight: 260, objectFit: "contain", borderRadius: 12, border: `1px solid ${S.neonGreen}55`, background: "rgba(0,0,0,0.3)" }} />
          <button onClick={() => { setScreenshotData(null); setScreenshotFileName(""); }} style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", fontSize: 14 }}>✕</button>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>✓ {screenshotFileName}</div>
        </div>
      ) : (
        <div
          tabIndex={0}
          onPaste={handleScreenshotPaste}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 110, border: `1px dashed ${screenshotError ? "#ff6b6b" : "rgba(255,255,255,0.25)"}`, borderRadius: 12, marginBottom: 6, background: "rgba(255,255,255,0.03)", padding: "14px 10px", outline: "none" }}
        >
          <label style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <div style={{ fontSize: 26 }}>📎</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.6)" }}>Tap to upload screenshot</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>JPG or PNG, up to 3MB</div>
            <input type="file" accept="image/*" onChange={e => handleScreenshotSelect(e.target.files?.[0])} style={{ display: "none" }} />
          </label>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>— or tap this box and paste (Ctrl+V / long-press → Paste) a copied screenshot —</div>
        </div>
      )}
      {screenshotError && <div style={{ fontSize: 12, color: "#ff6b6b", marginBottom: 10 }}>{screenshotError}</div>}
      <div style={{ marginBottom: 16 }} />

      <Card style={{ marginBottom: 16, background: "rgba(255,215,0,0.06)", border: "1px solid rgba(255,215,0,0.2)" }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.7 }}>
          ⚠️ <strong style={{ color: S.neonGold }}>Important:</strong> Enter the exact UTR from your payment app. Admin will cross-verify the transaction before crediting diamonds. Fake UTRs will result in a ban.
        </div>
      </Card>

      <Btn full variant="green" onClick={submitDepositRequest} disabled={submitting || utrNumber.trim().length < 6 || !screenshotData}>
        {submitting ? t("wallet_submitting") : t("wallet_submit_deposit")}
      </Btn>
      <div style={{ marginTop: 10, textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>{t("wallet_after_verify_note")}</div>
    </div>
  );

  return (
    <div style={S.page}>
      <TopBar title={t("wallet_title")} right={<DiamondChip amount={user.diamonds} />} />
      <div style={{ padding: "0 20px" }}>
        {freshUser.frozen && (
          <div style={{ background: "rgba(0,212,255,0.08)", border: `1px solid ${S.neonBlue}55`, borderRadius: 14, padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 20 }}>🧊</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 13 }}>Wallet Frozen</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{freshUser.frozenReason || "Deposits & withdrawals are paused. Contact support."}</div>
            </div>
          </div>
        )}
        {(freshUser.bonusDiamonds > 0 || freshUser.cashbackDiamonds > 0) && (
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {freshUser.bonusDiamonds > 0 && (
              <div style={{ flex: 1, background: "rgba(255,215,0,0.08)", border: `1px solid ${S.neonGold}33`, borderRadius: 12, padding: "10px 12px" }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>🎁 Bonus Wallet</div>
                <div style={{ fontWeight: 800, color: S.neonGold }}>💎 {fmt(freshUser.bonusDiamonds)}</div>
              </div>
            )}
            {freshUser.cashbackDiamonds > 0 && (
              <div style={{ flex: 1, background: "rgba(0,255,136,0.08)", border: `1px solid ${S.neonGreen}33`, borderRadius: 12, padding: "10px 12px" }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>💸 Cashback Wallet</div>
                <div style={{ fontWeight: 800, color: S.neonGreen }}>💎 {fmt(freshUser.cashbackDiamonds)}</div>
              </div>
            )}
          </div>
        )}
        {/* If in deposit flow step 2/3, hide tabs */}
        {payStep === "select" && (
          <div style={{ display: "flex", background: "rgba(255,255,255,0.05)", borderRadius: 14, padding: 4, marginBottom: 20 }}>
            {["deposit", "withdraw", "history"].map(tb => (
              <button key={tb} onClick={() => { setTab(tb); setHistoryFilter("all"); }} style={{ flex: 1, padding: "10px 0", background: tab === tb ? S.gradBlue : "none", border: "none", color: "#fff", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer", textTransform: "capitalize" }}>{tb === "deposit" ? t("wallet_tab_buy") : tb === "withdraw" ? t("wallet_tab_withdraw") : t("wallet_tab_history")}</button>
            ))}
          </div>
        )}

        {tab === "deposit" && (
          <>
            {payStep === "select" && <DepositSelectView />}
            {payStep === "instructions" && <DepositInstructionsView />}
            {payStep === "utr" && <DepositUTRView />}
          </>
        )}

        {tab === "withdraw" && payStep === "select" && (
          <div>
            <Card style={{ marginBottom: 16, background: "rgba(255,215,0,0.05)" }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>{t("wallet_available_balance")}</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>💎 {fmt(user.diamonds)}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{t("wallet_after_fee", { v: fmtINR(Math.floor(user.diamonds * 0.9)), p: cfg.withdrawFeePercent || 5 })}</div>
            </Card>

            {/* Total withdrawn so far */}
            <Card style={{ marginBottom: 16, background: "rgba(0,212,255,0.05)", cursor: "pointer" }} onClick={() => { setTab("history"); setHistoryFilter("withdrawal"); }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>📤 {t("wallet_total_withdrawn")}</div>
                <div style={{ fontWeight: 800, color: S.neonBlue }}>💎 {fmt(freshUser.totalWithdrawn || 0)}</div>
              </div>
            </Card>

            <Input label={t("wallet_diamonds_to_withdraw")} placeholder={t("wallet_min_diamonds", { n: cfg.minWithdraw || 200 })} value={withdrawAmt} onChange={setWithdrawAmt} type="number" icon="💎" />
            <Input label={t("wallet_your_upi")} placeholder="yourname@upi" value={upiId} onChange={setUpiId} icon="📲" />
            {withdrawAmt && upiId && (
              <Card style={{ marginBottom: 14, background: "rgba(0,212,255,0.05)" }}>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>{t("wallet_fee", { n: Math.floor(parseInt(withdrawAmt) * (cfg.withdrawFeePercent || 5) / 100), p: cfg.withdrawFeePercent || 5 })}</div>
                <div style={{ fontWeight: 700 }}>{t("wallet_you_receive", { v: fmtINR(Math.floor(parseInt(withdrawAmt) * (100 - (cfg.withdrawFeePercent || 5)) / 100)) })}</div>
              </Card>
            )}
            <Btn full variant="gold" onClick={submitWithdrawal} disabled={withdrawLoading}>{withdrawLoading ? t("wallet_submitting") : t("wallet_request_withdrawal")}</Btn>
            <div style={{ marginTop: 12, fontSize: 12, color: "rgba(255,255,255,0.35)", textAlign: "center" }}>{t("wallet_withdraw_note")}</div>
          </div>
        )}

        {tab === "history" && payStep === "select" && (
          <div>
            {/* Totals summary — highlights whichever filter is active, or both when viewing everything */}
            {historyFilter !== "withdrawal" && (
              <Card style={{ marginBottom: 10, background: "rgba(0,255,136,0.05)", cursor: "pointer" }} onClick={() => setHistoryFilter(historyFilter === "deposit" ? "all" : "deposit")}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>📥 {t("wallet_total_deposited")}</div>
                  <div style={{ fontWeight: 800, color: S.neonGreen }}>{fmtINR(freshUser.totalDeposited || 0)}</div>
                </div>
              </Card>
            )}
            {historyFilter !== "deposit" && (
              <Card style={{ marginBottom: 16, background: "rgba(255,215,0,0.05)", cursor: "pointer" }} onClick={() => setHistoryFilter(historyFilter === "withdrawal" ? "all" : "withdrawal")}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>📤 {t("wallet_total_withdrawn")}</div>
                  <div style={{ fontWeight: 800, color: S.neonGold }}>💎 {fmt(freshUser.totalWithdrawn || 0)}</div>
                </div>
              </Card>
            )}
            {historyFilter !== "all" && (
              <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.6)", marginBottom: 10 }}>
                {historyFilter === "deposit" ? t("wallet_deposit_history") : t("wallet_withdraw_history")}
              </div>
            )}
            {txns.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.35)" }}>{t("wallet_no_txns")}</div> :
              txns.map(tx => (
                <Card key={tx.id} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ flex: 1, paddingRight: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{tx.note}</div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{timeAgo(tx.date)} · {tx.method}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 800, color: tx.diamonds > 0 ? S.neonGreen : "#ff6b6b" }}>{tx.diamonds > 0 ? "+" : ""}{tx.diamonds}💎</div>
                      {tx.amount > 0 && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{fmtINR(tx.amount)}</div>}
                      <Badge label={tx.status} color={tx.status === "success" ? S.neonGreen : tx.status === "pending" ? S.neonGold : "#ff6b6b"} />
                    </div>
                  </div>
                </Card>
              ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── BUY PAGE ─────────────────────────────────────────────────────────────────
const BuyPage = ({ user, setUser, setPage, showToast }) => {
  return <WalletPage user={user} setUser={setUser} setPage={setPage} showToast={showToast} />;
};

// ─── PROFILE PAGE ─────────────────────────────────────────────────────────────
const ProfilePage = ({ user, setUser, setPage, showToast, onLogout, setNotifOpen }) => {
  const { t, lang, setLang, languages } = useLang();
  const [editMode, setEditMode] = useState(false);
  const [newName, setNewName] = useState(user.name);
  const [newEmail, setNewEmail] = useState(user.email || "");
  const [tick, setTick] = useState(0);
  const [langModalOpen, setLangModalOpen] = useState(false);
  const freshUser = (DB.get("dp_users") || []).find(u => u.id === user.id) || user;
  const agentRequests = DB.get("dp_agent_requests") || [];
  const myAgentRequest = agentRequests.find(r => r.userId === user.id && r.status === "pending");

  // Jump into the Wallet page with a specific tab / history filter pre-selected
  const goToWallet = (view) => {
    window.__walletInitialView = view || null;
    setPage("wallet");
  };

  const currentLangNative = (languages.find(l => l.code === lang) || languages[0]).native;

  const uidDisplay = ((freshUser.id.match(/\d+/g) || []).join("") || freshUser.id).slice(-7);
  const lastLoginDisplay = freshUser.lastLogin
    ? new Date(freshUser.lastLogin).toLocaleString("en-IN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).replace(",", "")
    : "—";

  const saveProfile = () => {
    if (!newName.trim()) { showToast("Name cannot be empty", "error"); return; }
    const users = DB.get("dp_users") || [];
    const updated = users.map(u => u.id === user.id ? { ...u, name: newName.trim(), email: newEmail } : u);
    DB.set("dp_users", updated);
    setUser(u => ({ ...u, name: newName.trim(), email: newEmail }));
    setEditMode(false);
    showToast("Profile updated!", "success");
  };

  const copyReferral = () => {
    navigator.clipboard?.writeText(freshUser.referralCode);
    showToast(`Referral code ${freshUser.referralCode} copied!`, "success");
  };

  const requestAgent = () => {
    const reqs = DB.get("dp_agent_requests") || [];
    const req = {
      id: `ar_${Date.now()}`, userId: freshUser.id, name: freshUser.name, phone: freshUser.phone,
      referralCode: freshUser.referralCode, status: "pending", date: new Date().toISOString(),
    };
    DB.set("dp_agent_requests", [req, ...reqs]);
    pushAdminAlert("agent_request", { userId: freshUser.id, name: freshUser.name, phone: freshUser.phone });
    setTick(t => t + 1);
    showToast("Agent request sent! Admin will review it soon.", "success");
  };

  const soon = (label) => showToast(`${label} — coming soon!`, "info");

  const L = {
    page: { minHeight: "100vh", background: S.bg1, paddingBottom: 100 },
    white: { background: S.glass, borderRadius: 16, border: "1px solid rgba(255,255,255,0.07)" },
    row: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", cursor: "pointer" },
    rowLeft: { display: "flex", alignItems: "center", gap: 12 },
    rowLabel: { fontSize: 14.5, fontWeight: 600, color: "#fff" },
    chevron: { color: "rgba(255,255,255,0.3)", fontSize: 16 },
    divider: { height: 1, background: "rgba(255,255,255,0.07)", margin: "0 16px" },
    iconCircle: (bg) => ({ width: 38, height: 38, borderRadius: "50%", background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }),
  };

  const historyItems = [
    { icon: "🎮", bg: "rgba(0,212,255,0.15)", label: t("profile_game_history"), sub: t("profile_game_history_sub"), action: () => setPage("games") },
    { icon: "🧾", bg: "rgba(0,255,136,0.15)", label: t("profile_transaction"), sub: t("profile_transaction_sub"), action: () => goToWallet("history") },
    { icon: "📥", bg: "rgba(255,61,154,0.15)", label: t("profile_deposit"), sub: t("profile_deposit_sub"), action: () => goToWallet("depositHistory") },
    { icon: "📤", bg: "rgba(255,215,0,0.15)", label: t("profile_withdraw"), sub: t("profile_withdraw_sub"), action: () => goToWallet("withdrawHistory") },
  ];

  const listItems = [
    { icon: "✉️", label: t("profile_notification"), action: () => setNotifOpen ? setNotifOpen(true) : soon("Notifications") },
    { icon: "🎁", label: t("profile_gifts"), action: () => soon("Gifts") },
    { icon: "📊", label: t("profile_game_stats"), action: () => soon("Game statistics") },
    { icon: "🌐", label: t("profile_language"), value: currentLangNative, action: () => setLangModalOpen(true) },
  ];

  const myTicketsUnread = (DB.get("dp_support_tickets") || []).filter(t => t.userId === user.id && t.unreadForUser).length;

  const serviceItems = [
    { icon: "⚙️", label: t("profile_settings"), action: () => soon("Settings") },
    { icon: "📝", label: t("profile_feedback"), action: () => soon("Feedback") },
    { icon: "📢", label: t("profile_announcement"), action: () => soon("Announcements") },
    { icon: "🎧", label: t("profile_customer_service"), action: () => setPage("support"), badge: myTicketsUnread },
    { icon: "📘", label: t("profile_beginners_guide"), action: () => soon("Beginner's Guide") },
    { icon: "ℹ️", label: t("profile_about"), action: () => soon("About us") },
  ];

  return (
    <div style={L.page}>
      {/* Header */}
      <div style={{ background: S.gradPink, padding: "20px 20px 56px", borderRadius: "0 0 28px 28px", position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(255,255,255,0.2)", border: "2px solid rgba(255,255,255,0.5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, color: "#fff" }}>
            {freshUser.name[0]?.toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            {editMode ? (
              <>
                <input value={newName} onChange={e => setNewName(e.target.value)} style={{ width: "100%", padding: 6, borderRadius: 8, border: "none", fontSize: 14, marginBottom: 4 }} />
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={saveProfile} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 8, border: "none", background: "#fff", color: S.neonPink, fontWeight: 700, cursor: "pointer" }}>Save</button>
                  <button onClick={() => setEditMode(false)} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.6)", background: "transparent", color: "#fff", cursor: "pointer" }}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <span style={{ fontSize: 16, fontWeight: 800, color: "#fff" }} onClick={() => setEditMode(true)}>{freshUser.name}</span>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
                  UID | {uidDisplay}
                  <span onClick={() => { navigator.clipboard?.writeText(uidDisplay); showToast("UID copied!", "success"); }} style={{ cursor: "pointer" }}>📋</span>
                </div>
                <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.65)", marginTop: 2 }}>Last login: {lastLoginDisplay}</div>
              </>
            )}
          </div>
        </div>
      </div>

      <div style={{ padding: "0 16px", marginTop: -40 }}>
        {/* Balance card */}
        <div style={{ ...L.white, padding: 18, marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.5)" }}>{t("profile_total_balance")}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, minWidth: 0 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>💎{fmt(freshUser.diamonds)}</span>
                <span onClick={() => setTick(t => t + 1)} style={{ cursor: "pointer", color: "rgba(255,255,255,0.5)", flexShrink: 0 }}>🔄</span>
              </div>
            </div>
            <button onClick={() => goToWallet(null)} style={{ background: S.gradPink, color: "#fff", border: "none", borderRadius: 20, padding: "10px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>{t("profile_enter_wallet")}</button>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            {[
              { icon: "👛", bg: "rgba(255,61,154,0.15)", label: t("profile_ar_wallet"), action: () => goToWallet(null) },
              { icon: "📥", bg: "rgba(255,215,0,0.15)", label: t("profile_deposit"), action: () => goToWallet("depositHistory") },
              { icon: "💳", bg: "rgba(0,212,255,0.15)", label: t("profile_withdraw"), action: () => goToWallet("withdrawHistory") },
              { icon: "🛡️", bg: "rgba(0,255,136,0.15)", label: t("profile_vip"), action: () => soon("VIP") },
            ].map(it => (
              <div key={it.label} onClick={it.action} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer", flex: 1 }}>
                <div style={L.iconCircle(it.bg)}>{it.icon}</div>
                <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>{it.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* History grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          {historyItems.map(it => (
            <div key={it.label} onClick={it.action} style={{ ...L.white, padding: 14, display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <div style={L.iconCircle(it.bg)}>{it.icon}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{it.label}</div>
                <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.4)" }}>{it.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* List card */}
        <div style={{ ...L.white, marginBottom: 14 }}>
          {listItems.map((it, i) => (
            <div key={it.label}>
              <div style={L.row} onClick={it.action}>
                <div style={L.rowLeft}>
                  <span style={{ fontSize: 18 }}>{it.icon}</span>
                  <span style={L.rowLabel}>{it.label}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {it.value && <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>{it.value}</span>}
                  <span style={L.chevron}>›</span>
                </div>
              </div>
              {i < listItems.length - 1 && <div style={L.divider} />}
            </div>
          ))}
        </div>

        {/* Service center */}
        <div style={{ ...L.white, padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "#fff", marginBottom: 14 }}>{lang === "hi" ? "सेवा केंद्र" : lang === "mr" ? "सेवा केंद्र" : lang === "ta" ? "சேவை மையம்" : "Service center"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", rowGap: 18 }}>
            {serviceItems.map(it => (
              <div key={it.label} onClick={it.action} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <div style={{ position: "relative" }}>
                  <span style={{ fontSize: 20 }}>{it.icon}</span>
                  {it.badge > 0 && <div style={{ position: "absolute", top: -4, right: -6, width: 9, height: 9, borderRadius: "50%", background: S.neonPink, border: "1.5px solid #0a0a1a" }} />}
                </div>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", fontWeight: 600, textAlign: "center" }}>{it.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Referral + Agent — kept exactly as before */}
        <Card style={{ marginBottom: 16, background: "rgba(255,215,0,0.06)" }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>🎁 Your Referral Code</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: S.neonGold, letterSpacing: 2 }}>{freshUser.referralCode}</div>
            <Btn sm variant="gold" onClick={copyReferral}>📋 Copy</Btn>
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>Share this code — you get 30💎, friend gets 50💎 bonus!</div>
        </Card>

        {/* ── AGENT CARD ── */}
        {freshUser.isAgent ? (
          <div onClick={() => setPage("agent_home")} style={{ marginBottom: 16, background: "linear-gradient(135deg,rgba(0,255,136,0.12),rgba(0,212,255,0.08))", border: "1.5px solid rgba(0,255,136,0.3)", borderRadius: 18, padding: 16, cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg,#00ff88,#00d4ff)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🤝</div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>Referral Agent</div>
                  <div style={{ fontSize: 11, color: S.neonGreen }}>● Active · Tap to open dashboard</div>
                </div>
              </div>
              <span style={{ fontSize: 20, color: S.neonGreen }}>›</span>
            </div>
          </div>
        ) : myAgentRequest ? (
          <Card style={{ marginBottom: 16, background: "rgba(255,215,0,0.07)", border: "1px solid rgba(255,215,0,0.25)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 28 }}>⏳</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Agent Request Pending</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>Admin se approval ka wait kar rahe hain</div>
              </div>
            </div>
          </Card>
        ) : (
          <div onClick={requestAgent} style={{ marginBottom: 16, background: "linear-gradient(135deg,rgba(181,55,242,0.15),rgba(255,61,154,0.10))", border: "1.5px solid rgba(181,55,242,0.35)", borderRadius: 18, padding: 16, cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg,#b537f2,#ff3d9a)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🤝</div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>Become a Referral Agent</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>Apni team se commission kamao</div>
                </div>
              </div>
              <span style={{ fontSize: 20, color: S.neonPurple }}>›</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {[["👥","Refer Users"],["💰","Earn Commission"],["📊","Track Stats"]].map(([ic,lb]) => (
                <div key={lb} style={{ flex: 1, background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: "7px 6px", textAlign: "center" }}>
                  <div style={{ fontSize: 16 }}>{ic}</div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{lb}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Logout */}
        <button onClick={onLogout} style={{ width: "100%", padding: 14, borderRadius: 30, border: `1px solid ${S.neonPink}`, background: "rgba(255,61,154,0.08)", color: S.neonPink, fontWeight: 700, fontSize: 14, cursor: "pointer", marginBottom: 8 }}>
          ⏻ {t("profile_logout")}
        </button>
      </div>

      {/* Language selector modal */}
      <Modal open={langModalOpen} onClose={() => setLangModalOpen(false)} title={t("profile_choose_language")}>
        {languages.map(l => (
          <div
            key={l.code}
            onClick={() => {
              setLang(l.code);
              setLangModalOpen(false);
              showToast(t("profile_language_updated"), "success");
            }}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 16px", borderRadius: 14, marginBottom: 8, cursor: "pointer",
              background: lang === l.code ? "rgba(0,212,255,0.12)" : "rgba(255,255,255,0.05)",
              border: lang === l.code ? `1px solid ${S.neonBlue}` : "1px solid transparent",
            }}
          >
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{l.native}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{l.label}</div>
            </div>
            {lang === l.code && <span style={{ color: S.neonBlue, fontSize: 18 }}>✓</span>}
          </div>
        ))}
      </Modal>
    </div>
  );
};

// ─── USER SUPPORT PAGE (raise tickets, chat with admin) ───────────────────────
const UserSupportPage = ({ user, setPage, showToast, onBack }) => {
  const [tick, setTick] = useState(0);
  const [view, setView] = useState("list"); // list | new | thread
  const [activeTicketId, setActiveTicketId] = useState(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [replyText, setReplyText] = useState("");
  const scrollRef = useRef(null);

  const refresh = () => setTick(k => k + 1);
  const cfg = DB.get("dp_platform_config") || {};
  const allTickets = DB.get("dp_support_tickets") || [];
  const myTickets = allTickets
    .filter(t => t.userId === user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const activeTicket = myTickets.find(t => t.id === activeTicketId);

  const statusColor = { open: S.neonGold, in_progress: S.neonBlue, resolved: S.neonGreen };
  const statusLabel = { open: "Open", in_progress: "In Progress", resolved: "Resolved" };

  useEffect(() => {
    if (view === "thread" && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [view, tick]);

  const openTicket = (t) => {
    setActiveTicketId(t.id);
    setView("thread");
    const updated = allTickets.map(x => x.id === t.id ? { ...x, unreadForUser: false } : x);
    DB.set("dp_support_tickets", updated);
    refresh();
  };

  const createTicket = () => {
    if (!subject.trim() || !message.trim()) { showToast("Please fill subject & message", "error"); return; }
    const newTicket = {
      id: `tk_${Date.now()}`, userId: user.id, userName: user.name, phone: user.phone,
      subject: subject.trim(), message: message.trim(), channel: "chat", priority: "medium",
      status: "open", createdAt: new Date().toISOString(), replies: [], unreadForUser: false,
    };
    DB.set("dp_support_tickets", [newTicket, ...allTickets]);
    pushAdminAlert("support_ticket", { userName: user.name, phone: user.phone, subject: subject.trim(), time: new Date().toISOString() });
    setSubject(""); setMessage("");
    setActiveTicketId(newTicket.id);
    setView("thread");
    refresh();
    showToast("🎫 Support ticket raised! Admin will respond soon.", "success");
  };

  const sendReply = () => {
    const text = replyText.trim();
    if (!text || !activeTicket) return;
    const updated = allTickets.map(t => t.id === activeTicket.id
      ? { ...t, status: t.status === "resolved" ? "open" : t.status, replies: [...(t.replies || []), { from: "user", text, at: new Date().toISOString() }] }
      : t);
    DB.set("dp_support_tickets", updated);
    setReplyText("");
    refresh();
  };

  // ── Ticket list ──
  if (view === "list") {
    return (
      <div style={S.page}>
        <TopBar title="🎧 Help & Support" onBack={onBack} />
        <div style={{ padding: "0 20px" }}>
          <Btn full onClick={() => setView("new")} style={{ marginBottom: 18 }}>➕ Raise a New Ticket</Btn>

          {(cfg.whatsappEnabled ?? true) && cfg.supportWhatsapp && (
            <div onClick={() => window.open(`https://wa.me/${cfg.supportWhatsapp.replace(/\D/g, "")}`, "_blank")} style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(0,255,136,0.08)", border: `1px solid ${S.neonGreen}33`, borderRadius: 14, padding: "12px 14px", marginBottom: 10, cursor: "pointer" }}>
              <div style={{ fontSize: 22 }}>🟢</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>Chat on WhatsApp</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Fast response for urgent issues</div>
              </div>
              <span style={{ color: S.neonGreen }}>›</span>
            </div>
          )}
          {(cfg.emailSupportEnabled ?? true) && cfg.supportEmail && (
            <div onClick={() => window.open(`mailto:${cfg.supportEmail}`, "_blank")} style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(0,212,255,0.08)", border: `1px solid ${S.neonBlue}33`, borderRadius: 14, padding: "12px 14px", marginBottom: 18, cursor: "pointer" }}>
              <div style={{ fontSize: 22 }}>✉️</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>Email Support</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{cfg.supportEmail}</div>
              </div>
              <span style={{ color: S.neonBlue }}>›</span>
            </div>
          )}

          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>My Tickets</div>
          {myTickets.length === 0
            ? <Card style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.35)" }}>No tickets yet. Raise one if you have any issue — deposit, withdrawal, game, or account related.</Card>
            : myTickets.map(t => (
              <Card key={t.id} onClick={() => openTicket(t)} style={{ marginBottom: 10, cursor: "pointer", border: t.unreadForUser ? `1px solid ${S.neonPink}55` : undefined }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {t.unreadForUser && <div style={{ width: 8, height: 8, borderRadius: "50%", background: S.neonPink }} />}
                    <div style={{ fontWeight: 800, fontSize: 14 }}>{t.subject}</div>
                  </div>
                  <Badge label={statusLabel[t.status] || t.status} color={statusColor[t.status] || S.neonBlue} />
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {(t.replies?.length ? t.replies[t.replies.length - 1].text : t.message)}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 6 }}>{timeAgo(t.createdAt)} {t.replies?.length > 0 && `· ${t.replies.length} repl${t.replies.length > 1 ? "ies" : "y"}`}</div>
              </Card>
            ))}
        </div>
      </div>
    );
  }

  // ── New ticket form ──
  if (view === "new") {
    return (
      <div style={S.page}>
        <TopBar title="🎫 New Ticket" onBack={() => setView("list")} />
        <div style={{ padding: "0 20px" }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 14 }}>Tell us what's wrong — deposit not credited, withdrawal delayed, game issue, or anything else. Admin will reply here.</div>
          <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject (e.g. Deposit not credited)" style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "12px 14px", color: "#fff", fontSize: 14, marginBottom: 12 }} />
          <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Describe your problem in detail…" rows={6} style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "12px 14px", color: "#fff", fontSize: 14, marginBottom: 16, resize: "none", fontFamily: "inherit" }} />
          <Btn full onClick={createTicket}>📨 Submit Ticket</Btn>
        </div>
      </div>
    );
  }

  // ── Chat thread ──
  if (view === "thread" && activeTicket) {
    const allMessages = [
      { from: "user", text: activeTicket.message, at: activeTicket.createdAt },
      ...(activeTicket.replies || []),
    ];
    return (
      <div style={{ ...S.page, display: "flex", flexDirection: "column", height: "100vh", paddingBottom: 0 }}>
        <TopBar title={activeTicket.subject} onBack={() => setView("list")} right={<Badge label={statusLabel[activeTicket.status] || activeTicket.status} color={statusColor[activeTicket.status] || S.neonBlue} />} />
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
          {allMessages.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: m.from === "user" ? "flex-end" : "flex-start", marginBottom: 10 }}>
              <div style={{ maxWidth: "78%" }}>
                <div style={{
                  background: m.from === "user" ? S.gradBlue : "rgba(255,255,255,0.08)",
                  color: "#fff", borderRadius: m.from === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                  padding: "10px 14px", fontSize: 13.5, lineHeight: 1.4,
                }}>
                  {m.from !== "user" && <div style={{ fontSize: 10, fontWeight: 800, color: S.neonBlue, marginBottom: 3 }}>🎧 Support</div>}
                  {m.text}
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 3, textAlign: m.from === "user" ? "right" : "left" }}>{timeAgo(m.at)}</div>
              </div>
            </div>
          ))}
          {activeTicket.status === "resolved" && (
            <div style={{ textAlign: "center", fontSize: 12, color: S.neonGreen, marginTop: 10 }}>✅ This ticket was marked resolved. Send a message if the issue persists.</div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, padding: "10px 16px 18px", borderTop: "1px solid rgba(255,255,255,0.08)", background: S.bg1 }}>
          <input
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") sendReply(); }}
            placeholder="Type a message…"
            style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 20, padding: "11px 16px", color: "#fff", fontSize: 13.5 }}
          />
          <button onClick={sendReply} style={{ width: 42, height: 42, borderRadius: "50%", background: S.gradBlue, border: "none", color: "#fff", fontSize: 16, cursor: "pointer", flexShrink: 0 }}>➤</button>
        </div>
      </div>
    );
  }

  return null;
};
const LeaderboardPage = ({ user }) => {
  const { t } = useLang();
  const users = (DB.get("dp_users") || []).filter(u => !u.isAdmin).sort((a, b) => b.diamonds - a.diamonds).slice(0, 10);
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <div style={S.page}>
      <TopBar title={t("leaderboard_title")} />
      <div style={{ padding: "0 20px" }}>
        {users.map((u, i) => (
          <Card key={u.id} style={{ marginBottom: 10, background: u.id === user.id ? "rgba(0,212,255,0.1)" : S.glass, border: u.id === user.id ? `1px solid ${S.neonBlue}` : undefined }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ fontSize: 22, width: 28 }}>{medals[i] || `#${i + 1}`}</div>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: S.gradBlue, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>{u.name[0]}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{u.name} {u.id === user.id && <Badge label={t("leaderboard_you")} color={S.neonGreen} />}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{u.gamesPlayed} {t("leaderboard_games_played")}</div>
              </div>
              <div style={{ fontWeight: 800, color: S.neonGold }}>💎{fmt(u.diamonds)}</div>
            </div>
          </Card>
        ))}
        {users.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)" }}>{t("leaderboard_no_players")}</div>}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN PANEL
// ═══════════════════════════════════════════════════════════════════════════════

const AdminOverview = ({ setPage, onLogout }) => {
  const [alerts, setAlerts]     = useState([]);
  const [tick, setTick]         = useState(0);
  const [graphPeriod, setGraphPeriod] = useState("daily"); // daily | weekly | monthly
  const [onlineCount, setOnlineCount] = useState(0);

  // Poll every 3s
  useEffect(() => {
    const i = setInterval(() => setTick(t => t + 1), 3000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    const raw = DB.get("dp_notifications_admin") || [];
    setAlerts(raw.slice(0, 30));
    // Simulate online users (real: use server heartbeat)
    const users = DB.get("dp_users") || [];
    setOnlineCount(Math.max(1, Math.floor(users.filter(u=>!u.isAdmin).length * 0.3)));
  }, [tick]);

  // ── Compute all stats ──
  const users        = DB.get("dp_users") || [];
  const txns         = DB.get("dp_transactions") || [];
  const cfg          = DB.get("dp_platform_config") || {};
  const realUsers    = users.filter(u => !u.isAdmin);
  const today        = new Date().toISOString().split("T")[0];
  const weekAgo      = new Date(Date.now()-7*86400000).toISOString().split("T")[0];
  const monthAgo     = new Date(Date.now()-30*86400000).toISOString().split("T")[0];

  const successDep   = txns.filter(t => t.type==="deposit"    && t.status==="success");
  const successWith  = txns.filter(t => t.type==="withdrawal" && t.status==="success");
  const pendingWith  = txns.filter(t => t.type==="withdrawal" && t.status==="pending");
  const pendingDep   = txns.filter(t => t.type==="deposit"    && t.status==="pending");

  const totalDeposits     = successDep.reduce((s,t) => s+t.amount, 0);
  const totalWithdrawals  = successWith.reduce((s,t) => s+t.amount, 0);
  const totalRevenue      = totalDeposits - totalWithdrawals;

  const todayDep     = successDep.filter(t => t.date?.startsWith(today));
  const todayWith    = successWith.filter(t => t.date?.startsWith(today));
  const todayProfit  = todayDep.reduce((s,t)=>s+t.amount,0) - todayWith.reduce((s,t)=>s+t.amount,0);
  const todayNewUsers= realUsers.filter(u => u.joinedAt?.startsWith(today)).length;
  const activeUsers  = realUsers.filter(u => {
    const lastLogin = u.lastLogin || u.joinedAt || "";
    return lastLogin >= new Date(Date.now()-24*3600000).toISOString();
  }).length;
  const pendingKYC   = realUsers.filter(u => u.kycStatus === "pending").length;
  const openTickets  = (DB.get("dp_support_tickets") || []).filter(t => t.status !== "resolved").length;

  // Agent summary
  const globalRate   = cfg.agentCommissionPercent ?? 10;
  const agents       = users.filter(u => u.isAgent);
  const pendingAgentRequests = (DB.get("dp_agent_requests")||[]).filter(r=>r.status==="pending");
  const pendingComm  = agents.reduce((sum, agent) => {
    const refs = users.filter(u => u.referredBy===agent.referralCode);
    const refIds = new Set(refs.map(u=>u.id));
    const dep = txns.filter(t=>t.type==="deposit"&&t.status==="success"&&refIds.has(t.userId)).reduce((s,t)=>s+t.amount,0);
    const wd  = txns.filter(t=>t.type==="withdrawal"&&t.status==="success"&&refIds.has(t.userId)).reduce((s,t)=>s+t.amount,0);
    const rate = agent.customCommissionPercent ?? globalRate;
    return sum + Math.max(0, Math.floor(Math.max(0,dep-wd)*rate/100) - (agent.commissionPaid||0));
  }, 0);

  // ── Graph data builder ──
  const buildGraph = (period) => {
    const points = period==="daily" ? 7 : period==="weekly" ? 8 : 6;
    const msStep  = period==="daily" ? 86400000 : period==="weekly" ? 7*86400000 : 30*86400000;
    const labels  = [];
    const depData = [];
    const widData = [];
    const usrData = [];
    for (let i=points-1; i>=0; i--) {
      const from = new Date(Date.now()-i*msStep);
      const to   = new Date(Date.now()-(i-1)*msStep);
      const fromStr = from.toISOString().split("T")[0];
      const toStr   = to.toISOString().split("T")[0];
      const lbl = period==="daily"
        ? from.toLocaleDateString("en-IN",{weekday:"short"})
        : period==="weekly"
        ? `W${points-i}`
        : from.toLocaleDateString("en-IN",{month:"short"});
      labels.push(lbl);
      depData.push(successDep.filter(t=>t.date>=fromStr&&t.date<toStr).reduce((s,t)=>s+t.amount,0));
      widData.push(successWith.filter(t=>t.date>=fromStr&&t.date<toStr).reduce((s,t)=>s+t.amount,0));
      usrData.push(realUsers.filter(u=>(u.joinedAt||"")>=fromStr&&(u.joinedAt||"")<toStr).length);
    }
    return { labels, depData, widData, usrData };
  };

  const graph = buildGraph(graphPeriod);
  const maxDep = Math.max(...graph.depData, 1);
  const maxUsr = Math.max(...graph.usrData, 1);

  const unreadAlerts = alerts.filter(a=>!a.read).length;
  const markAllRead  = () => {
    const updated = alerts.map(a=>({...a,read:true}));
    DB.set("dp_notifications_admin", updated);
    setAlerts(updated);
  };

  const alertIcon = { login:"🔓", new_user:"👤", deposit:"💰", deposit_pending:"⏳", withdrawal:"⬆️", agent_request:"🙋", support_ticket:"🎧" };

  // KPI card component
  const KPI = ({icon,label,value,color,sub,onClick}) => (
    <div onClick={onClick} style={{ background:"rgba(255,255,255,0.04)", border:`1px solid ${color}22`, borderRadius:16, padding:"14px 12px", cursor:onClick?"pointer":"default", position:"relative", overflow:"hidden" }}>
      <div style={{ position:"absolute", top:0, right:0, width:50, height:50, borderRadius:"50%", background:`radial-gradient(${color}30,transparent)`, transform:"translate(15px,-15px)" }} />
      <div style={{ fontSize:22, marginBottom:4 }}>{icon}</div>
      <div style={{ fontSize:19, fontWeight:900, color, marginBottom:2 }}>{value}</div>
      <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)", fontWeight:600 }}>{label}</div>
      {sub && <div style={{ fontSize:10, color:"rgba(255,255,255,0.3)", marginTop:3 }}>{sub}</div>}
      {onClick && <div style={{ position:"absolute", bottom:10, right:12, color, fontSize:14, opacity:0.6 }}>›</div>}
    </div>
  );

  return (
    <div style={S.page}>
      {/* ── Header ── */}
      <div style={{ background:"linear-gradient(180deg,#0d0d2e,transparent)", padding:"16px 20px 10px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
          <div>
            <div style={{ fontSize:21, fontWeight:900 }}>⚙️ Admin Dashboard</div>
            <div style={{ fontSize:12, color:"rgba(255,255,255,0.45)" }}>DiamondPlay · {new Date().toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short"})}</div>
          </div>
          <Btn sm variant="danger" onClick={onLogout}>🚪 Logout</Btn>
        </div>

        {/* ── Live Online Banner ── */}
        <div style={{ background:"linear-gradient(135deg,rgba(0,255,136,0.12),rgba(0,212,255,0.08))", border:"1px solid rgba(0,255,136,0.25)", borderRadius:14, padding:"10px 16px", marginBottom:12, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ width:10, height:10, borderRadius:"50%", background:S.neonGreen, boxShadow:`0 0 8px ${S.neonGreen}`, animation:"pulse 1.5s infinite" }} />
            <span style={{ fontWeight:700, fontSize:14 }}>{onlineCount} Users Online Now</span>
          </div>
          <span style={{ fontSize:12, color:"rgba(255,255,255,0.4)" }}>Live · updates every 3s</span>
        </div>

        {/* ── Alert Banner ── */}
        {unreadAlerts > 0 && (
          <div style={{ background:"rgba(255,61,154,0.12)", border:`1px solid ${S.neonPink}44`, borderRadius:14, padding:"10px 14px", marginBottom:12, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div style={{ fontWeight:700, fontSize:13 }}>🔔 {unreadAlerts} new alert{unreadAlerts>1?"s":""}</div>
            <button onClick={markAllRead} style={{ background:"none", border:"none", color:S.neonBlue, fontSize:12, cursor:"pointer", fontWeight:700 }}>Mark read</button>
          </div>
        )}
      </div>

      <div style={{ padding:"0 16px 24px" }}>

        {/* ── ROW 1: Users ── */}
        <div style={{ fontSize:13, fontWeight:700, color:"rgba(255,255,255,0.5)", marginBottom:8, letterSpacing:1, textTransform:"uppercase" }}>👥 Users</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:14 }}>
          <KPI icon="👥" label="Total Users"    value={realUsers.length}  color={S.neonBlue}   onClick={() => setPage("admin_users")} />
          <KPI icon="🟢" label="Active (24h)"   value={activeUsers}        color={S.neonGreen}  sub="last 24 hours" />
          <KPI icon="✨" label="New Today"       value={todayNewUsers}      color={S.neonPurple} sub="registrations" />
        </div>

        {/* ── ROW 2: Money ── */}
        <div style={{ fontSize:13, fontWeight:700, color:"rgba(255,255,255,0.5)", marginBottom:8, letterSpacing:1, textTransform:"uppercase" }}>💰 Financials</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
          <KPI icon="📥" label="Total Deposits"    value={fmtINR(totalDeposits)}    color={S.neonGreen}  onClick={()=>setPage("admin_deposits")} />
          <KPI icon="📤" label="Total Withdrawals" value={fmtINR(totalWithdrawals)} color={S.neonPink}   onClick={()=>setPage("admin_withdraw")} />
          <KPI icon="💹" label="Total Revenue"     value={fmtINR(Math.max(0,totalRevenue))} color={S.neonGold}  />
          <KPI icon="📆" label="Today's Profit"    value={fmtINR(Math.max(0,todayProfit))}  color={S.neonOrange} sub="deposits - withdrawals" />
        </div>

        {/* ── ROW 3: Pending Actions ── */}
        <div style={{ fontSize:13, fontWeight:700, color:"rgba(255,255,255,0.5)", marginBottom:8, letterSpacing:1, textTransform:"uppercase" }}>⏳ Pending Actions</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:14 }}>
          <KPI icon="⬆️" label="Withdrawals"  value={pendingWith.length}  color={S.neonPink}   onClick={()=>setPage("admin_withdraw")} />
          <KPI icon="📥" label="Deposits"     value={pendingDep.length}   color={S.neonGold}   onClick={()=>setPage("admin_deposits")} />
          <KPI icon="🪪" label="KYC"          value={pendingKYC || 0}     color={S.neonPurple} sub="verifications" />
        </div>

        {/* ── Agent Summary ── */}
        <div onClick={()=>setPage("admin_agents")} style={{ background:"rgba(255,215,0,0.07)", border:`1px solid ${S.neonGold}33`, borderRadius:16, padding:"14px 16px", marginBottom:16, cursor:"pointer" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div>
              <div style={{ fontWeight:800, fontSize:14, marginBottom:3 }}>
                🤝 Agent System {pendingAgentRequests.length>0 && <Badge label={`${pendingAgentRequests.length} pending`} color={S.neonPink} />}
              </div>
              <div style={{ fontSize:12, color:"rgba(255,255,255,0.45)" }}>{agents.length} agents · {globalRate}% commission rate</div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontWeight:900, color:S.neonGold, fontSize:16 }}>₹{fmt(pendingComm)}</div>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.35)" }}>pending payout →</div>
            </div>
          </div>
        </div>

        {/* ── Support & Analytics quick links ── */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:16 }}>
          <div onClick={()=>setPage("admin_support")} style={{ background:"rgba(0,212,255,0.07)", border:`1px solid ${S.neonBlue}33`, borderRadius:16, padding:"14px 14px", cursor:"pointer" }}>
            <div style={{ fontSize:22, marginBottom:6 }}>🎧</div>
            <div style={{ fontWeight:800, fontSize:13 }}>Support System {openTickets>0 && <Badge label={`${openTickets} open`} color={S.neonGold} />}</div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)" }}>Tickets, chat, complaints →</div>
          </div>
          <div onClick={()=>setPage("admin_analytics")} style={{ background:"rgba(181,55,242,0.07)", border:`1px solid ${S.neonPurple}33`, borderRadius:16, padding:"14px 14px", cursor:"pointer" }}>
            <div style={{ fontSize:22, marginBottom:6 }}>📊</div>
            <div style={{ fontWeight:800, fontSize:13 }}>Analytics</div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)" }}>Revenue, growth, retention →</div>
          </div>
          <div onClick={()=>setPage("admin_wallet")} style={{ background:"rgba(0,255,136,0.07)", border:`1px solid ${S.neonGreen}33`, borderRadius:16, padding:"14px 14px", cursor:"pointer" }}>
            <div style={{ fontSize:22, marginBottom:6 }}>👛</div>
            <div style={{ fontWeight:800, fontSize:13 }}>Wallet Management</div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)" }}>Add/deduct, freeze, bonus →</div>
          </div>
          <div onClick={()=>setPage("admin_deposits")} style={{ background:"rgba(255,215,0,0.07)", border:`1px solid ${S.neonGold}33`, borderRadius:16, padding:"14px 14px", cursor:"pointer" }}>
            <div style={{ fontSize:22, marginBottom:6 }}>🧾</div>
            <div style={{ fontWeight:800, fontSize:13 }}>Deposit Center</div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)" }}>UTR, screenshots, reports →</div>
          </div>
        </div>

        {/* ── GRAPHS ── */}
        <div style={{ fontSize:13, fontWeight:700, color:"rgba(255,255,255,0.5)", marginBottom:10, letterSpacing:1, textTransform:"uppercase" }}>📊 Analytics Graph</div>

        {/* Period selector */}
        <div style={{ display:"flex", gap:6, background:"rgba(255,255,255,0.05)", borderRadius:12, padding:4, marginBottom:14 }}>
          {[["daily","📅 Daily"],["weekly","📆 Weekly"],["monthly","🗓️ Monthly"]].map(([k,l]) => (
            <button key={k} onClick={()=>setGraphPeriod(k)} style={{
              flex:1, padding:"8px 4px", borderRadius:9, border:"none", cursor:"pointer", fontWeight:700, fontSize:11,
              background: graphPeriod===k ? S.gradBlue : "transparent",
              color: graphPeriod===k ? "#fff" : "rgba(255,255,255,0.4)",
            }}>{l}</button>
          ))}
        </div>

        {/* Deposits vs Withdrawals Bar Chart */}
        <div style={{ background:"rgba(255,255,255,0.04)", borderRadius:16, padding:"16px 12px", marginBottom:12 }}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:14, color:"rgba(255,255,255,0.8)" }}>💰 Deposits vs Withdrawals</div>
          <div style={{ display:"flex", alignItems:"flex-end", gap:4, height:90, marginBottom:8 }}>
            {graph.labels.map((lbl,i) => (
              <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
                <div style={{ width:"100%", display:"flex", gap:2, alignItems:"flex-end", height:80 }}>
                  <div style={{ flex:1, background:S.neonGreen, borderRadius:"3px 3px 0 0", height:`${Math.max(4,(graph.depData[i]/maxDep)*80)}px`, opacity:0.85, transition:"height 0.4s" }} />
                  <div style={{ flex:1, background:S.neonPink,  borderRadius:"3px 3px 0 0", height:`${Math.max(4,(graph.widData[i]/maxDep)*80)}px`, opacity:0.7,  transition:"height 0.4s" }} />
                </div>
                <div style={{ fontSize:9, color:"rgba(255,255,255,0.4)", marginTop:4, textAlign:"center" }}>{lbl}</div>
              </div>
            ))}
          </div>
          <div style={{ display:"flex", gap:16, justifyContent:"center" }}>
            <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"rgba(255,255,255,0.5)" }}>
              <div style={{ width:10, height:10, borderRadius:2, background:S.neonGreen }} />Deposits
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"rgba(255,255,255,0.5)" }}>
              <div style={{ width:10, height:10, borderRadius:2, background:S.neonPink }} />Withdrawals
            </div>
          </div>
        </div>

        {/* New Registrations Line Chart */}
        <div style={{ background:"rgba(255,255,255,0.04)", borderRadius:16, padding:"16px 12px", marginBottom:16 }}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:14, color:"rgba(255,255,255,0.8)" }}>✨ New Registrations</div>
          <div style={{ display:"flex", alignItems:"flex-end", gap:6, height:70, marginBottom:8, position:"relative" }}>
            {/* Line path using SVG */}
            <svg style={{ position:"absolute", inset:0, width:"100%", height:"100%", overflow:"visible" }}>
              <polyline
                points={graph.usrData.map((v,i) => {
                  const x = (i / (graph.usrData.length-1||1)) * 100;
                  const y = 100 - Math.max(4,(v/maxUsr)*90);
                  return `${x}% ${y}%`;
                }).join(" ")}
                fill="none" stroke={S.neonBlue} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              />
              {graph.usrData.map((v,i) => {
                const x = (i / (graph.usrData.length-1||1)) * 100;
                const y = 100 - Math.max(4,(v/maxUsr)*90);
                return <circle key={i} cx={`${x}%`} cy={`${y}%`} r="4" fill={S.neonBlue} />;
              })}
            </svg>
            {graph.labels.map((lbl,i) => (
              <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center" }}>
                <div style={{ height:50 }} />
                <div style={{ fontSize:9, color:"rgba(255,255,255,0.4)", textAlign:"center", marginTop:8 }}>{lbl}</div>
                <div style={{ fontSize:10, fontWeight:700, color:S.neonBlue }}>{graph.usrData[i]}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Recent Activity ── */}
        <div style={{ fontSize:13, fontWeight:700, color:"rgba(255,255,255,0.5)", marginBottom:10, letterSpacing:1, textTransform:"uppercase" }}>🔔 Live Activity</div>
        {alerts.length===0
          ? <Card style={{ textAlign:"center", padding:24, color:"rgba(255,255,255,0.3)", fontSize:13 }}>No activity yet. Waiting for users…</Card>
          : alerts.map(a => (
            <div key={a.id} style={{ display:"flex", gap:10, alignItems:"center", padding:"11px 0", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ width:36, height:36, borderRadius:10, background:`rgba(0,212,255,0.1)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>
                {alertIcon[a.type]||"📢"}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:13, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                  {a.type==="new_user"       && `New User: ${a.data?.userName}`}
                  {a.type==="login"           && `Login: ${a.data?.userName}`}
                  {a.type==="deposit"         && `Deposit: ${a.data?.userName} · ${fmtINR(a.data?.amount)}`}
                  {a.type==="deposit_pending" && `⏳ Pending: ${a.data?.userName} · ${fmtINR(a.data?.amount)}`}
                  {a.type==="withdrawal"      && `Withdrawal: ${a.data?.userName} · 💎${a.data?.diamonds}`}
                  {a.type==="agent_request"   && `Agent Request: ${a.data?.userName}`}
                  {a.type==="support_ticket"  && `🎧 New Ticket: ${a.data?.userName} — ${a.data?.subject}`}
                </div>
                <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)" }}>
                  {a.data?.phone&&`📱${a.data.phone} · `}{timeAgo(a.time)}
                </div>
              </div>
              {!a.read && <div style={{ width:8, height:8, borderRadius:"50%", background:S.neonBlue, flexShrink:0 }} />}
            </div>
          ))
        }
      </div>
    </div>
  );
};

const AdminUsers = ({ showToast }) => {
  const [search,        setSearch]        = useState("");
  const [filterStatus,  setFilterStatus]  = useState("all");
  const [sortBy,        setSortBy]        = useState("joined");
  const [selectedUser,  setSelectedUser]  = useState(null);
  const [activeTab,     setActiveTab]     = useState("profile");
  const [noteText,      setNoteText]      = useState("");
  const [newPass,       setNewPass]       = useState("");
  const [showPass,      setShowPass]      = useState(false);
  const [giftAmt,       setGiftAmt]       = useState("");
  const [deductAmt,     setDeductAmt]     = useState("");
  const [confirmAction, setConfirmAction] = useState(null);
  const [customComm,    setCustomComm]    = useState("");
  const [tick,          setTick]          = useState(0);

  const refresh = () => setTick(t => t + 1);

  const allUsers = (DB.get("dp_users") || []).filter(u => !u.isAdmin);
  const allTxns  = DB.get("dp_transactions") || [];

  // ── Filter + Search ──
  const filtered = allUsers
    .filter(u => {
      if (filterStatus === "active")      return !u.banned && u.lastLogin && new Date(u.lastLogin) > new Date(Date.now() - 48*3600000);
      if (filterStatus === "blocked")     return u.banned;
      if (filterStatus === "agent")       return u.isAgent;
      if (filterStatus === "kyc_pending") return u.kycStatus === "pending";
      if (filterStatus === "kyc_done")    return u.kycStatus === "approved";
      if (filterStatus === "no_deposit")  return !u.totalDeposited || u.totalDeposited === 0;
      return true;
    })
    .filter(u => {
      if (!search) return true;
      const q = search.toLowerCase().trim();
      return (
        u.name?.toLowerCase().includes(q) ||
        u.phone?.includes(q) ||
        u.id?.includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.referralCode?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sortBy === "diamonds")  return (b.diamonds||0) - (a.diamonds||0);
      if (sortBy === "games")     return (b.gamesPlayed||0) - (a.gamesPlayed||0);
      if (sortBy === "deposits")  return (b.totalDeposited||0) - (a.totalDeposited||0);
      if (sortBy === "lastlogin") return (b.lastLogin||"").localeCompare(a.lastLogin||"");
      return (b.joinedAt||"").localeCompare(a.joinedAt||"");
    });

  // ── Helpers ──
  const getUserTxns   = id => allTxns.filter(t => t.userId === id);
  const getDepTotal   = id => getUserTxns(id).filter(t => t.type==="deposit" && t.status==="success").reduce((s,t) => s+t.amount, 0);
  const getWithTotal  = id => getUserTxns(id).filter(t => t.type==="withdrawal" && t.status==="success").reduce((s,t) => s+t.amount, 0);
  const getGameStats  = id => {
    const g = getUserTxns(id).filter(t => t.type==="game_win" || t.type==="game_spend");
    const wins = g.filter(t => t.type==="game_win");
    const losses = g.filter(t => t.type==="game_spend");
    return {
      played: g.length,
      wins: wins.length,
      losses: losses.length,
      won:  wins.reduce((s,t) => s + (t.diamonds||0), 0),
      lost: losses.reduce((s,t) => s + Math.abs(t.diamonds||0), 0),
    };
  };
  const getLoginHistory = id => {
    const u = allUsers.find(x => x.id===id);
    return (u?.loginHistory || []).slice(0, 20);
  };
  const getReferredCount = code => allUsers.filter(u => u.referredBy === code).length;

  // ── Mutate user ──
  const mutateUser = (id, patch) => {
    const updated = (DB.get("dp_users")||[]).map(u => u.id===id ? {...u,...patch} : u);
    DB.set("dp_users", updated);
    if (selectedUser?.id === id) setSelectedUser(prev => ({...prev,...patch}));
    refresh();
  };

  // ── Actions ──
  const blockUser = (id, banned) => {
    mutateUser(id, { banned, bannedAt: banned ? new Date().toISOString() : null });
    showToast(banned ? "🚫 User blocked" : "✅ User unblocked", banned ? "error" : "success");
  };

  const deleteUser = id => {
    DB.set("dp_users", (DB.get("dp_users")||[]).filter(u => u.id!==id));
    setSelectedUser(null); setConfirmAction(null); refresh();
    showToast("🗑️ User deleted permanently", "success");
  };

  const resetPassword = id => {
    if (!newPass || newPass.length < 4) { showToast("Min 4 characters required", "error"); return; }
    mutateUser(id, { password: newPass, passwordResetAt: new Date().toISOString() });
    setNewPass(""); showToast("🔑 Password reset successfully", "success");
  };

  const approveKYC = id => {
    mutateUser(id, { kycStatus: "approved", kycApprovedAt: new Date().toISOString() });
    showToast("✅ KYC Approved", "success");
  };
  const rejectKYC = id => {
    mutateUser(id, { kycStatus: "rejected", kycRejectedAt: new Date().toISOString() });
    showToast("❌ KYC Rejected", "error");
  };

  const saveNote = (id, note) => {
    const noteEntry = {
      text: note,
      time: new Date().toISOString(),
      by: "Admin",
    };
    const u = (DB.get("dp_users")||[]).find(x => x.id===id);
    const prevNotes = u?.adminNotes || [];
    mutateUser(id, {
      adminNote: note,
      adminNotes: [noteEntry, ...prevNotes].slice(0, 20),
    });
    showToast("📝 Note saved", "success");
  };

  const giftDiamonds = id => {
    const amt = parseInt(giftAmt);
    if (!amt || amt <= 0) { showToast("Valid amount daalo", "error"); return; }
    const u = (DB.get("dp_users")||[]).find(x => x.id===id);
    mutateUser(id, { diamonds: (u?.diamonds||0) + amt });
    const txns = DB.get("dp_transactions")||[];
    DB.set("dp_transactions", [{
      id: tid(), userId: id, type: "bonus", amount: 0, diamonds: amt,
      status: "success", date: new Date().toISOString(), method: "admin",
      note: `Admin Gift: 💎${amt}`,
    }, ...txns]);
    setGiftAmt(""); showToast(`💎${fmt(amt)} gifted!`, "success");
  };

  const deductDiamonds = id => {
    const amt = parseInt(deductAmt);
    if (!amt || amt <= 0) { showToast("Valid amount daalo", "error"); return; }
    const u = (DB.get("dp_users")||[]).find(x => x.id===id);
    if ((u?.diamonds||0) < amt) { showToast("User ke paas itne diamonds nahi hain", "error"); return; }
    mutateUser(id, { diamonds: (u?.diamonds||0) - amt });
    const txns = DB.get("dp_transactions")||[];
    DB.set("dp_transactions", [{
      id: tid(), userId: id, type: "deduction", amount: 0, diamonds: -amt,
      status: "success", date: new Date().toISOString(), method: "admin",
      note: `Admin Deduction: -💎${amt}`,
    }, ...txns]);
    setDeductAmt(""); showToast(`💎${fmt(amt)} deducted`, "info");
  };

  const toggleAgent = (id, isAgent) => {
    mutateUser(id, {
      isAgent,
      agentSince: isAgent ? new Date().toISOString() : null,
      commissionPaid: isAgent ? 0 : undefined,
    });
    showToast(isAgent ? "🤝 Agent bana diya" : "Agent status hata diya", "success");
  };

  const toggleOperator = (id, isDepositOperator) => {
    mutateUser(id, {
      isDepositOperator,
      operatorSince: isDepositOperator ? new Date().toISOString() : null,
    });
    showToast(isDepositOperator ? "🧾 Deposit Operator bana diya" : "Operator status hata diya", "success");
  };

  const setCommission = id => {
    const pct = parseFloat(customComm);
    if (isNaN(pct) || pct < 0 || pct > 100) { showToast("0-100 ke beech dalein", "error"); return; }
    mutateUser(id, { customCommissionPercent: pct });
    setCustomComm(""); showToast(`Commission ${pct}% set`, "success");
  };

  // ── KYC color/label ──
  const kycColor = { approved: S.neonGreen, pending: S.neonGold, rejected: "#ff6b6b", none: "rgba(255,255,255,0.28)" };
  const kycLabel = { approved: "✅ KYC Verified", pending: "⏳ KYC Pending", rejected: "❌ KYC Rejected", none: "— No KYC" };

  // ── Summary stats ──
  const stats = {
    total:    allUsers.length,
    blocked:  allUsers.filter(u => u.banned).length,
    agents:   allUsers.filter(u => u.isAgent).length,
    kycPend:  allUsers.filter(u => u.kycStatus==="pending").length,
    active:   allUsers.filter(u => u.lastLogin && new Date(u.lastLogin) > new Date(Date.now()-48*3600000)).length,
  };

  return (
    <div style={S.page}>

      {/* ─── Confirm Dialog ─── */}
      {confirmAction && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:1100,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div style={{background:"#13132e",borderRadius:22,padding:28,width:"100%",maxWidth:340,border:`1px solid ${confirmAction.type==="delete"?"rgba(255,61,154,0.4)":"rgba(255,107,53,0.3)"}`}}>
            <div style={{fontSize:52,textAlign:"center",marginBottom:12}}>{confirmAction.type==="delete"?"🗑️":"⚠️"}</div>
            <div style={{fontWeight:900,fontSize:18,textAlign:"center",marginBottom:6}}>{confirmAction.label}</div>
            <div style={{color:"rgba(255,255,255,0.45)",textAlign:"center",fontSize:13,marginBottom:24,lineHeight:1.5}}>
              {confirmAction.type==="delete"
                ? "User aur uska sara data permanently delete ho jayega. Yeh undo nahi ho sakta."
                : "Kya aap sure hain?"}
            </div>
            <div style={{display:"flex",gap:10}}>
              <Btn full sm variant="ghost" onClick={()=>setConfirmAction(null)}>Cancel</Btn>
              <Btn full sm variant="danger" onClick={()=>{
                if (confirmAction.type==="delete") deleteUser(confirmAction.userId);
              }}>✓ Confirm</Btn>
            </div>
          </div>
        </div>
      )}

      {/* ─── User Profile Drawer ─── */}
      {selectedUser && (() => {
        const u        = (DB.get("dp_users")||[]).find(x=>x.id===selectedUser.id) || selectedUser;
        const depTotal = getDepTotal(u.id);
        const widTotal = getWithTotal(u.id);
        const gs       = getGameStats(u.id);
        const lh       = getLoginHistory(u.id);
        const userTxns = getUserTxns(u.id).slice(0, 25);
        const kycSt    = u.kycStatus || "none";
        const refCount = getReferredCount(u.referralCode);
        const profitForPlatform = depTotal - widTotal;
        const TABS = [["profile","👤","Profile"],["wallet","💎","Wallet"],["history","📊","History"],["device","📱","Device"],["notes","📝","Notes"]];

        return (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.94)",zIndex:900,overflowY:"auto"}}>
            <div style={{maxWidth:480,margin:"0 auto",paddingBottom:60}}>

              {/* Sticky Header */}
              <div style={{background:"linear-gradient(180deg,#0d0825,#0d0d2e)",padding:"16px 16px 0",position:"sticky",top:0,zIndex:50,boxShadow:"0 2px 20px rgba(0,0,0,0.6)"}}>

                {/* Top row */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                  <button onClick={()=>setSelectedUser(null)} style={{background:"rgba(255,255,255,0.08)",border:"none",color:"#fff",borderRadius:10,padding:"8px 14px",cursor:"pointer",fontWeight:700,fontSize:13,display:"flex",alignItems:"center",gap:5}}>
                    ← Back
                  </button>
                  <div style={{fontWeight:800,fontSize:15}}>User Management</div>
                  <div style={{display:"flex",gap:6}}>
                    <button
                      onClick={()=>blockUser(u.id, !u.banned)}
                      style={{background:u.banned?"rgba(0,255,136,0.13)":"rgba(255,61,154,0.13)",border:`1px solid ${u.banned?S.neonGreen+"44":"#ff3d9a44"}`,borderRadius:10,padding:"7px 10px",cursor:"pointer",fontSize:12,fontWeight:800,color:u.banned?S.neonGreen:S.neonPink}}>
                      {u.banned?"✓ Unblock":"🚫 Block"}
                    </button>
                    <button
                      onClick={()=>setConfirmAction({type:"delete",userId:u.id,label:`Delete "${u.name}"?`})}
                      style={{background:"rgba(255,61,61,0.12)",border:"1px solid rgba(255,61,61,0.3)",borderRadius:10,padding:"7px 10px",cursor:"pointer",fontSize:12,fontWeight:800,color:"#ff6b6b"}}>
                      🗑️
                    </button>
                  </div>
                </div>

                {/* User card */}
                <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:14,background:"rgba(255,255,255,0.04)",borderRadius:14,padding:"12px 14px"}}>
                  <div style={{width:56,height:56,borderRadius:"50%",background:u.banned?"rgba(255,61,154,0.25)":S.gradBlue,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:24,border:`2.5px solid ${u.banned?"#ff6b6b":S.neonBlue}`,flexShrink:0,boxShadow:`0 0 18px ${u.banned?"rgba(255,61,154,0.3)":"rgba(0,212,255,0.25)"}`}}>
                    {u.name?.[0]?.toUpperCase()}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:900,fontSize:17,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:3}}>
                      {u.name}
                      {u.banned   && <Badge label="🚫 Blocked" color="#ff6b6b" />}
                      {u.isAgent  && <Badge label="🤝 Agent"   color={S.neonGold} />}
                      {u.isDepositOperator && <Badge label="🧾 Operator" color={S.neonBlue} />}
                      {kycSt==="approved" && <Badge label="✅ KYC" color={S.neonGreen} />}
                      {kycSt==="pending"  && <Badge label="⏳ KYC" color={S.neonGold} />}
                    </div>
                    <div style={{fontSize:12,color:"rgba(255,255,255,0.55)"}}>📱 +91 {u.phone}</div>
                    {u.email && <div style={{fontSize:11,color:"rgba(255,255,255,0.38)"}}>✉️ {u.email}</div>}
                    <div style={{fontSize:10,color:"rgba(255,255,255,0.28)",marginTop:2,fontFamily:"monospace"}}>ID: {u.id}</div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <div style={{fontSize:20,fontWeight:900,color:S.neonGold}}>💎{fmt(u.diamonds)}</div>
                    <div style={{fontSize:11,color:S.neonGreen}}>↓{fmtINR(depTotal)}</div>
                    <div style={{fontSize:11,color:S.neonPink}}>↑{fmtINR(widTotal)}</div>
                  </div>
                </div>

                {/* Tabs */}
                <div style={{display:"flex",gap:3,overflowX:"auto",paddingBottom:2}}>
                  {TABS.map(([k,icon,label])=>(
                    <button key={k} onClick={()=>setActiveTab(k)} style={{
                      flex:"0 0 auto",padding:"8px 12px",borderRadius:"10px 10px 0 0",border:"none",cursor:"pointer",fontWeight:700,fontSize:11,
                      background:activeTab===k?"rgba(0,212,255,0.15)":"transparent",
                      color:activeTab===k?S.neonBlue:"rgba(255,255,255,0.4)",
                      borderBottom:activeTab===k?`2px solid ${S.neonBlue}`:"2px solid transparent",
                      transition:"all 0.15s",
                    }}>{icon} {label}</button>
                  ))}
                </div>
              </div>

              {/* Tab Content */}
              <div style={{padding:"16px 16px"}}>

                {/* ━━━━━━ PROFILE TAB ━━━━━━ */}
                {activeTab==="profile" && (
                  <div>

                    {/* KYC Card */}
                    <Card style={{marginBottom:12,background:kycSt==="approved"?"rgba(0,255,136,0.05)":kycSt==="pending"?"rgba(255,215,0,0.06)":kycSt==="rejected"?"rgba(255,61,154,0.05)":"rgba(255,255,255,0.03)",border:`1px solid ${kycColor[kycSt]}33`}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div>
                          <div style={{fontSize:11,color:"rgba(255,255,255,0.4)",marginBottom:4}}>🪪 KYC Status</div>
                          <div style={{fontWeight:800,fontSize:14,color:kycColor[kycSt]}}>{kycLabel[kycSt]}</div>
                          {u.kycApprovedAt && <div style={{fontSize:10,color:"rgba(255,255,255,0.3)",marginTop:2}}>Approved: {timeAgo(u.kycApprovedAt)}</div>}
                          {u.kycRejectedAt && <div style={{fontSize:10,color:"rgba(255,255,255,0.3)",marginTop:2}}>Rejected: {timeAgo(u.kycRejectedAt)}</div>}
                        </div>
                        {kycSt==="pending" && (
                          <div style={{display:"flex",gap:6}}>
                            <Btn sm variant="green"  onClick={()=>approveKYC(u.id)}>✓ Approve</Btn>
                            <Btn sm variant="danger" onClick={()=>rejectKYC(u.id)}>✕ Reject</Btn>
                          </div>
                        )}
                        {kycSt==="none" && (
                          <div style={{fontSize:11,color:"rgba(255,255,255,0.3)"}}>Not submitted</div>
                        )}
                      </div>
                    </Card>

                    {/* Info Grid */}
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
                      {[
                        ["📅 Joined",       (u.joinedAt||"").split("T")[0]],
                        ["🕐 Last Login",   u.lastLogin ? timeAgo(u.lastLogin) : "Never"],
                        ["✉️ Email",        u.email||"—"],
                        ["🎁 Referral Code",u.referralCode||"—"],
                        ["👥 Referred By",  u.referredBy||"Organic"],
                        ["🤝 My Referrals", refCount+" users"],
                        ["🎮 Total Games",  u.gamesPlayed||0],
                        ["🏆 Win Rate",     gs.played ? Math.round(gs.wins/gs.played*100)+"%" : "—"],
                        ["💰 Net Revenue",  profitForPlatform>=0?`+${fmtINR(profitForPlatform)}`:`${fmtINR(profitForPlatform)}`],
                        ["📊 Status",       u.banned ? "🚫 Blocked" : "✅ Active"],
                      ].map(([l,v])=>(
                        <div key={l} style={{background:"rgba(255,255,255,0.04)",borderRadius:11,padding:"10px 12px",border:"1px solid rgba(255,255,255,0.05)"}}>
                          <div style={{fontSize:10,color:"rgba(255,255,255,0.38)",marginBottom:3}}>{l}</div>
                          <div style={{fontWeight:700,fontSize:13,wordBreak:"break-word"}}>{String(v)}</div>
                        </div>
                      ))}
                    </div>

                    {/* Agent Section */}
                    <Card style={{marginBottom:12,background:"rgba(255,215,0,0.04)",border:`1px solid ${u.isAgent?S.neonGold+"44":"rgba(255,255,255,0.06)"}`}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:u.isAgent?12:0}}>
                        <div>
                          <div style={{fontWeight:800,fontSize:13}}>🤝 Agent Status</div>
                          {u.isAgent && <div style={{fontSize:11,color:"rgba(255,255,255,0.4)",marginTop:2}}>Since: {u.agentSince?timeAgo(u.agentSince):"—"} · Earned: {fmtINR(u.commissionPaid||0)}</div>}
                        </div>
                        <Btn sm variant={u.isAgent?"danger":"gold"} onClick={()=>toggleAgent(u.id,!u.isAgent)}>
                          {u.isAgent?"Remove":"Make Agent"}
                        </Btn>
                      </div>
                      {u.isAgent && (
                        <div>
                          <div style={{fontSize:11,color:"rgba(255,255,255,0.4)",marginBottom:6}}>Custom Commission % (leave blank for default)</div>
                          <div style={{display:"flex",gap:8}}>
                            <input type="number" placeholder={`Default: ${(DB.get("dp_platform_config")||{}).agentCommissionPercent||10}%`}
                              value={customComm} onChange={e=>setCustomComm(e.target.value)}
                              style={{flex:1,background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:10,padding:"8px 12px",color:"#fff",fontSize:13,outline:"none"}} />
                            <Btn sm variant="gold" onClick={()=>setCommission(u.id)}>Set</Btn>
                          </div>
                          {u.customCommissionPercent!=null && <div style={{fontSize:11,color:S.neonGold,marginTop:5}}>Current: {u.customCommissionPercent}% custom rate</div>}
                        </div>
                      )}
                    </Card>

                    {/* Deposit Operator Section */}
                    <Card style={{marginBottom:12,background:"rgba(0,212,255,0.04)",border:`1px solid ${u.isDepositOperator?S.neonBlue+"44":"rgba(255,255,255,0.06)"}`}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div>
                          <div style={{fontWeight:800,fontSize:13}}>🧾 Deposit Operator</div>
                          <div style={{fontSize:11,color:"rgba(255,255,255,0.4)",marginTop:2}}>
                            {u.isDepositOperator ? `Since: ${u.operatorSince?timeAgo(u.operatorSince):"—"} · Can approve/reject deposits only` : "Grant access to just the Deposit Center (UTR + screenshot verification)"}
                          </div>
                        </div>
                        <Btn sm variant={u.isDepositOperator?"danger":"primary"} onClick={()=>toggleOperator(u.id,!u.isDepositOperator)}>
                          {u.isDepositOperator?"Remove":"Make Operator"}
                        </Btn>
                      </div>
                    </Card>
                    {u.banned && u.bannedAt && (
                      <Card style={{marginBottom:12,background:"rgba(255,61,154,0.07)",border:"1px solid rgba(255,61,154,0.25)"}}>
                        <div style={{fontWeight:700,color:S.neonPink,marginBottom:4}}>🚫 Blocked User</div>
                        <div style={{fontSize:12,color:"rgba(255,255,255,0.45)"}}>Blocked: {timeAgo(u.bannedAt)}</div>
                        <Btn sm variant="green" style={{marginTop:10}} onClick={()=>blockUser(u.id,false)}>✓ Unblock User</Btn>
                      </Card>
                    )}

                    {/* Reset Password */}
                    <Card style={{marginBottom:12,background:"rgba(255,255,255,0.03)"}}>
                      <div style={{fontWeight:800,fontSize:13,marginBottom:10}}>🔑 Reset Password</div>
                      <div style={{display:"flex",gap:8,alignItems:"center"}}>
                        <div style={{flex:1,position:"relative"}}>
                          <input placeholder="Naya password (min 4 chars)" value={newPass} onChange={e=>setNewPass(e.target.value)}
                            type={showPass?"text":"password"}
                            style={{width:"100%",background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:10,padding:"10px 40px 10px 12px",color:"#fff",fontSize:13,outline:"none",boxSizing:"border-box"}} />
                          <button onClick={()=>setShowPass(p=>!p)} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:16,color:"rgba(255,255,255,0.4)"}}>
                            {showPass?"🙈":"👁️"}
                          </button>
                        </div>
                        <Btn sm variant="gold" onClick={()=>resetPassword(u.id)}>Reset</Btn>
                      </div>
                      {u.passwordResetAt && <div style={{fontSize:10,color:"rgba(255,255,255,0.3)",marginTop:6}}>Last reset: {timeAgo(u.passwordResetAt)}</div>}
                    </Card>

                    {/* Gift Diamonds */}
                    <Card style={{marginBottom:12,background:"rgba(0,212,255,0.04)",border:"1px solid rgba(0,212,255,0.15)"}}>
                      <div style={{fontWeight:800,fontSize:13,marginBottom:8}}>💎 Gift Diamonds</div>
                      <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
                        {[50,100,250,500,1000,2500].map(a=>(
                          <button key={a} onClick={()=>setGiftAmt(String(a))} style={{padding:"6px 12px",borderRadius:8,border:`1px solid ${giftAmt===String(a)?S.neonBlue:"rgba(0,212,255,0.2)"}`,background:giftAmt===String(a)?"rgba(0,212,255,0.2)":"rgba(0,212,255,0.05)",color:giftAmt===String(a)?S.neonBlue:"rgba(255,255,255,0.5)",fontWeight:700,fontSize:12,cursor:"pointer"}}>
                            {a}
                          </button>
                        ))}
                      </div>
                      <div style={{display:"flex",gap:8}}>
                        <input type="number" placeholder="Ya custom amount" value={giftAmt} onChange={e=>setGiftAmt(e.target.value)}
                          style={{flex:1,background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:10,padding:"10px 12px",color:"#fff",fontSize:13,outline:"none"}} />
                        <Btn sm variant="primary" onClick={()=>giftDiamonds(u.id)}>💎 Gift</Btn>
                      </div>
                    </Card>

                    {/* Deduct Diamonds */}
                    <Card style={{background:"rgba(255,61,154,0.04)",border:"1px solid rgba(255,61,154,0.15)"}}>
                      <div style={{fontWeight:800,fontSize:13,marginBottom:8}}>➖ Deduct Diamonds</div>
                      <div style={{display:"flex",gap:8}}>
                        <input type="number" placeholder="Amount to deduct" value={deductAmt} onChange={e=>setDeductAmt(e.target.value)}
                          style={{flex:1,background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:10,padding:"10px 12px",color:"#fff",fontSize:13,outline:"none"}} />
                        <Btn sm variant="danger" onClick={()=>deductDiamonds(u.id)}>Deduct</Btn>
                      </div>
                    </Card>
                  </div>
                )}

                {/* ━━━━━━ WALLET TAB ━━━━━━ */}
                {activeTab==="wallet" && (
                  <div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
                      {[
                        ["💎 Balance",        `💎 ${fmt(u.diamonds)}`,           S.neonBlue],
                        ["📥 Total Deposited", fmtINR(depTotal),                   S.neonGreen],
                        ["📤 Total Withdrawn", fmtINR(widTotal),                   S.neonPink],
                        ["💹 Platform Profit", fmtINR(profitForPlatform),          profitForPlatform>=0?S.neonGold:"#ff6b6b"],
                        ["🎮 Diamonds Won",    `+💎${fmt(gs.won)}`,               S.neonGreen],
                        ["📉 Diamonds Lost",   `-💎${fmt(gs.lost)}`,              "#ff6b6b"],
                        ["🎲 Net Game P/L",    `${gs.won-gs.lost>=0?"+":""}💎${fmt(gs.won-gs.lost)}`, gs.won>=gs.lost?S.neonGreen:"#ff6b6b"],
                        ["🎯 Win Rate",        gs.played ? Math.round(gs.wins/gs.played*100)+"%" : "—", "#fff"],
                      ].map(([l,v,c])=>(
                        <div key={l} style={{background:"rgba(255,255,255,0.04)",borderRadius:12,padding:"12px",textAlign:"center",border:"1px solid rgba(255,255,255,0.05)"}}>
                          <div style={{fontWeight:900,fontSize:16,color:c}}>{v}</div>
                          <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",marginTop:3}}>{l}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{fontWeight:700,fontSize:13,marginBottom:10,color:"rgba(255,255,255,0.6)"}}>📜 Transaction History</div>
                    {userTxns.length===0
                      ? <div style={{textAlign:"center",padding:30,color:"rgba(255,255,255,0.3)"}}>Koi transaction nahi</div>
                      : userTxns.map(t=>(
                        <div key={t.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontWeight:600,fontSize:12,marginBottom:2}}>{t.note||t.type}</div>
                            <div style={{fontSize:10,color:"rgba(255,255,255,0.35)"}}>{timeAgo(t.date)} · {t.method||"—"}</div>
                            <Badge label={t.type?.replace(/_/g," ")} color={t.type==="deposit"?S.neonGreen:t.type==="withdrawal"?S.neonPink:t.type==="bonus"?S.neonGold:S.neonBlue} />
                          </div>
                          <div style={{textAlign:"right",flexShrink:0,marginLeft:8}}>
                            {t.diamonds!==undefined && <div style={{fontWeight:800,fontSize:13,color:t.diamonds>0?S.neonGreen:"#ff6b6b"}}>{t.diamonds>0?"+":""}{t.diamonds}💎</div>}
                            {t.amount>0 && <div style={{fontSize:11,color:"rgba(255,255,255,0.4)"}}>{fmtINR(t.amount)}</div>}
                            <Badge label={t.status} color={t.status==="success"?S.neonGreen:t.status==="pending"?S.neonGold:"#ff6b6b"} />
                          </div>
                        </div>
                      ))
                    }
                  </div>
                )}

                {/* ━━━━━━ HISTORY TAB ━━━━━━ */}
                {activeTab==="history" && (
                  <div>
                    {/* Game Stats */}
                    <Card style={{marginBottom:12,background:"rgba(255,255,255,0.03)"}}>
                      <div style={{fontWeight:800,fontSize:13,marginBottom:12}}>🎮 Game Statistics</div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
                        {[
                          ["Total",  gs.played, "#fff"],
                          ["Won",    gs.wins,   S.neonGreen],
                          ["Lost",   gs.losses, "#ff6b6b"],
                        ].map(([l,v,c])=>(
                          <div key={l} style={{textAlign:"center",background:"rgba(255,255,255,0.04)",borderRadius:10,padding:"10px 6px"}}>
                            <div style={{fontWeight:900,fontSize:22,color:c}}>{v}</div>
                            <div style={{fontSize:10,color:"rgba(255,255,255,0.4)"}}>{l}</div>
                          </div>
                        ))}
                      </div>
                      {gs.played>0 && (
                        <div>
                          <div style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"5px 0",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
                            <span style={{color:"rgba(255,255,255,0.45)"}}>Win Rate</span>
                            <span style={{fontWeight:700,color:S.neonGreen}}>{Math.round(gs.wins/gs.played*100)}%</span>
                          </div>
                          <div style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"5px 0"}}>
                            <span style={{color:"rgba(255,255,255,0.45)"}}>Net Diamond P/L</span>
                            <span style={{fontWeight:700,color:gs.won>=gs.lost?S.neonGreen:"#ff6b6b"}}>{gs.won-gs.lost>=0?"+":""}{gs.won-gs.lost}💎</span>
                          </div>
                        </div>
                      )}
                    </Card>

                    {/* Login History */}
                    <Card style={{background:"rgba(255,255,255,0.03)"}}>
                      <div style={{fontWeight:800,fontSize:13,marginBottom:12}}>🕐 Login History</div>
                      {lh.length===0 && !u.lastLogin && (
                        <div style={{textAlign:"center",padding:20,color:"rgba(255,255,255,0.28)",fontSize:12}}>No login history recorded</div>
                      )}
                      {/* Show last login if no history array */}
                      {lh.length===0 && u.lastLogin && (
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                          <div>
                            <div style={{fontWeight:600,fontSize:13}}>🔓 Last Login</div>
                            <div style={{fontSize:10,color:"rgba(255,255,255,0.35)"}}>Most recent session</div>
                          </div>
                          <div style={{textAlign:"right"}}>
                            <div style={{fontSize:12,color:"rgba(255,255,255,0.5)"}}>{timeAgo(u.lastLogin)}</div>
                          </div>
                        </div>
                      )}
                      {lh.map((entry,i)=>(
                        <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                          <div>
                            <div style={{fontWeight:600,fontSize:12}}>🔓 Login #{lh.length-i}</div>
                            <div style={{fontSize:10,color:"rgba(255,255,255,0.35)"}}>{entry.device||"Unknown device"}</div>
                          </div>
                          <div style={{textAlign:"right"}}>
                            <div style={{fontSize:12,color:"rgba(255,255,255,0.5)"}}>{timeAgo(entry.time||entry)}</div>
                            {entry.ip && <div style={{fontSize:10,color:"rgba(255,255,255,0.28)"}}>IP: {entry.ip}</div>}
                          </div>
                        </div>
                      ))}
                      <div style={{marginTop:10,fontSize:11,color:"rgba(255,255,255,0.25)",textAlign:"center"}}>Login history capture ke liye server-side session logging integrate karo</div>
                    </Card>
                  </div>
                )}

                {/* ━━━━━━ DEVICE TAB ━━━━━━ */}
                {activeTab==="device" && (
                  <div>
                    <Card style={{marginBottom:12,background:"rgba(255,255,255,0.03)"}}>
                      <div style={{fontWeight:800,fontSize:13,marginBottom:14}}>📱 Device & Network Details</div>
                      {[
                        ["📱 Device",         u.device      || "Not recorded"],
                        ["🌐 IP Address",      u.ipAddress   || "Not recorded"],
                        ["🗺️ Location",       u.location    || "Not recorded"],
                        ["📡 Browser",         u.browser     || "Not recorded"],
                        ["🖥️ OS",             u.os          || "Not recorded"],
                        ["📶 Network",         u.network     || "Not recorded"],
                        ["🔑 Device ID",       u.deviceId    || "Not recorded"],
                        ["📅 First Seen",      u.joinedAt    ? (u.joinedAt||"").split("T")[0] : "—"],
                        ["🕐 Last Seen",       u.lastLogin   ? timeAgo(u.lastLogin) : "Never"],
                      ].map(([l,v])=>(
                        <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"9px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                          <div style={{fontSize:12,color:"rgba(255,255,255,0.4)",minWidth:120,flexShrink:0}}>{l}</div>
                          <div style={{fontWeight:600,fontSize:12,textAlign:"right",flex:1,wordBreak:"break-all",color:v==="Not recorded"?"rgba(255,255,255,0.2)":"#fff"}}>{v}</div>
                        </div>
                      ))}
                    </Card>

                    {/* Multiple Accounts Check */}
                    <Card style={{background:"rgba(255,107,53,0.05)",border:"1px solid rgba(255,107,53,0.2)"}}>
                      <div style={{fontWeight:800,fontSize:13,marginBottom:10}}>🔍 Multiple Account Check</div>
                      {(() => {
                        const samePhone = allUsers.filter(x => x.phone===u.phone && x.id!==u.id);
                        const sameDevice = u.deviceId ? allUsers.filter(x => x.deviceId===u.deviceId && x.id!==u.id) : [];
                        const sameIP = u.ipAddress ? allUsers.filter(x => x.ipAddress===u.ipAddress && x.id!==u.id) : [];
                        const suspicious = [...new Set([...samePhone,...sameDevice,...sameIP].map(x=>x.id))];
                        if (suspicious.length===0) return <div style={{fontSize:12,color:S.neonGreen}}>✅ No duplicate accounts detected</div>;
                        return (
                          <div>
                            <div style={{fontSize:12,color:S.neonPink,marginBottom:6}}>⚠️ {suspicious.length} possible duplicate account(s)</div>
                            {samePhone.length>0 && <div style={{fontSize:11,color:"rgba(255,255,255,0.5)"}}>Same phone: {samePhone.map(x=>x.name).join(", ")}</div>}
                            {sameDevice.length>0 && <div style={{fontSize:11,color:"rgba(255,255,255,0.5)"}}>Same device: {sameDevice.map(x=>x.name).join(", ")}</div>}
                            {sameIP.length>0 && <div style={{fontSize:11,color:"rgba(255,255,255,0.5)"}}>Same IP: {sameIP.map(x=>x.name).join(", ")}</div>}
                          </div>
                        );
                      })()}
                    </Card>
                  </div>
                )}

                {/* ━━━━━━ NOTES TAB ━━━━━━ */}
                {activeTab==="notes" && (
                  <div>
                    <Card style={{marginBottom:12,background:"rgba(255,255,255,0.03)"}}>
                      <div style={{fontWeight:800,fontSize:13,marginBottom:4}}>📝 Admin Note</div>
                      <div style={{fontSize:11,color:"rgba(255,255,255,0.35)",marginBottom:10}}>Yeh note sirf admin ko dikhta hai. User nahi dekh sakta.</div>
                      <textarea
                        value={noteText || u.adminNote || ""}
                        onChange={e=>setNoteText(e.target.value)}
                        placeholder="User ke baare mein note likhein... (suspicious activity, VIP deal, custom bonus, etc.)"
                        rows={5}
                        style={{width:"100%",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:12,padding:"12px 14px",color:"#fff",fontSize:13,outline:"none",resize:"vertical",boxSizing:"border-box",fontFamily:"inherit",marginBottom:10}}
                      />
                      <Btn full variant="gold" onClick={()=>saveNote(u.id, noteText || u.adminNote || "")}>💾 Note Save Karo</Btn>
                    </Card>

                    {/* Notes history */}
                    {(u.adminNotes||[]).length>0 && (
                      <Card style={{background:"rgba(255,255,255,0.03)"}}>
                        <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>📋 Previous Notes</div>
                        {(u.adminNotes||[]).map((n,i)=>(
                          <div key={i} style={{padding:"10px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                            <div style={{fontSize:12,color:"rgba(255,255,255,0.7)",marginBottom:3}}>{n.text||n}</div>
                            <div style={{fontSize:10,color:"rgba(255,255,255,0.3)"}}>by {n.by||"Admin"} · {timeAgo(n.time||new Date().toISOString())}</div>
                          </div>
                        ))}
                      </Card>
                    )}

                    {/* Danger zone */}
                    <Card style={{marginTop:12,background:"rgba(255,61,154,0.04)",border:"1px solid rgba(255,61,154,0.2)"}}>
                      <div style={{fontWeight:800,fontSize:13,color:"#ff6b6b",marginBottom:10}}>⛔ Danger Zone</div>
                      <div style={{display:"flex",gap:8}}>
                        <Btn full sm variant={u.banned?"green":"danger"} onClick={()=>blockUser(u.id,!u.banned)}>
                          {u.banned?"✓ Unblock User":"🚫 Block User"}
                        </Btn>
                        <Btn full sm variant="danger" onClick={()=>setConfirmAction({type:"delete",userId:u.id,label:`Delete "${u.name}"?`})}>
                          🗑️ Delete User
                        </Btn>
                      </div>
                    </Card>
                  </div>
                )}

              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── Main List ─── */}
      <div style={{background:"linear-gradient(180deg,#0d0d2e,transparent)",padding:"16px 20px 10px"}}>

        {/* Header + Stats Row */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontSize:20,fontWeight:900}}>👥 User Management</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,0.4)"}}>Total: {stats.total}</div>
        </div>

        {/* Quick Stats */}
        <div style={{display:"flex",gap:6,marginBottom:12,overflowX:"auto"}}>
          {[
            ["🟢 Active",  stats.active,  S.neonGreen],
            ["🚫 Blocked", stats.blocked, "#ff6b6b"],
            ["🤝 Agents",  stats.agents,  S.neonGold],
            ["⏳ KYC",     stats.kycPend, S.neonGold],
          ].map(([l,v,c])=>(
            <div key={l} style={{background:"rgba(255,255,255,0.04)",borderRadius:10,padding:"6px 12px",flexShrink:0,textAlign:"center",border:"1px solid rgba(255,255,255,0.06)"}}>
              <div style={{fontWeight:900,fontSize:15,color:c}}>{v}</div>
              <div style={{fontSize:10,color:"rgba(255,255,255,0.35)"}}>{l}</div>
            </div>
          ))}
        </div>

        {/* Search Box */}
        <div style={{position:"relative",marginBottom:10}}>
          <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:15}}>🔍</span>
          <input
            value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search naam, mobile, ID, email, referral code..."
            style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:12,padding:"11px 14px 11px 36px",color:"#fff",fontSize:13,outline:"none",boxSizing:"border-box"}}
          />
          {search && (
            <button onClick={()=>setSearch("")} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"rgba(255,255,255,0.4)",cursor:"pointer",fontSize:16}}>✕</button>
          )}
        </div>

        {/* Filter Chips */}
        <div style={{display:"flex",gap:5,overflowX:"auto",paddingBottom:4,marginBottom:8}}>
          {[
            ["all",        "All"],
            ["active",     "🟢 Active"],
            ["blocked",    "🚫 Blocked"],
            ["agent",      "🤝 Agents"],
            ["kyc_pending","⏳ KYC Pending"],
            ["kyc_done",   "✅ KYC Done"],
            ["no_deposit", "💰 No Deposit"],
          ].map(([k,l])=>(
            <button key={k} onClick={()=>setFilterStatus(k)} style={{
              padding:"6px 12px",borderRadius:99,border:"none",cursor:"pointer",fontWeight:700,fontSize:11,whiteSpace:"nowrap",flexShrink:0,
              background:filterStatus===k?S.gradBlue:"rgba(255,255,255,0.06)",
              color:filterStatus===k?"#fff":"rgba(255,255,255,0.5)",
            }}>{l}</button>
          ))}
        </div>

        {/* Sort */}
        <div style={{display:"flex",gap:5,marginBottom:6,flexWrap:"wrap"}}>
          {[
            ["joined",    "🕐 Newest"],
            ["lastlogin", "🔓 Active"],
            ["diamonds",  "💎 Balance"],
            ["games",     "🎮 Games"],
            ["deposits",  "💰 Deposits"],
          ].map(([k,l])=>(
            <button key={k} onClick={()=>setSortBy(k)} style={{
              padding:"5px 10px",borderRadius:99,border:"none",cursor:"pointer",fontWeight:700,fontSize:10,whiteSpace:"nowrap",
              background:sortBy===k?"rgba(0,212,255,0.18)":"rgba(255,255,255,0.05)",
              color:sortBy===k?S.neonBlue:"rgba(255,255,255,0.38)",
            }}>{l}</button>
          ))}
        </div>
      </div>

      {/* User Cards */}
      <div style={{padding:"4px 14px 30px"}}>
        <div style={{fontSize:12,color:"rgba(255,255,255,0.35)",marginBottom:10,paddingLeft:2}}>
          {filtered.length} user{filtered.length!==1?"s":""} found
        </div>

        {filtered.length===0 && (
          <div style={{textAlign:"center",padding:"40px 0",color:"rgba(255,255,255,0.28)"}}>
            <div style={{fontSize:40,marginBottom:8}}>👥</div>
            <div>{search ? `"${search}" ke liye koi user nahi mila` : "Koi user nahi"}</div>
          </div>
        )}

        {filtered.map(u => {
          const dep = getDepTotal(u.id);
          const gs  = getGameStats(u.id);
          return (
            <div key={u.id}
              onClick={()=>{ setSelectedUser(u); setActiveTab("profile"); setNoteText(""); setNewPass(""); setGiftAmt(""); setDeductAmt(""); setCustomComm(""); }}
              style={{
                background: u.banned ? "rgba(255,61,154,0.06)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${u.banned?"rgba(255,61,154,0.25)":u.adminNote?"rgba(181,55,242,0.25)":"rgba(255,255,255,0.07)"}`,
                borderRadius:16,padding:"13px 14px",marginBottom:9,cursor:"pointer",position:"relative",
                transition:"all 0.15s",
              }}>
              <div style={{display:"flex",gap:11,alignItems:"center"}}>
                {/* Avatar */}
                <div style={{width:46,height:46,borderRadius:"50%",background:u.banned?"rgba(255,61,154,0.2)":S.gradBlue,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:18,flexShrink:0,border:`2px solid ${u.banned?"#ff6b6b33":S.neonBlue+"33"}`}}>
                  {u.name?.[0]?.toUpperCase()}
                </div>

                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:800,fontSize:14,display:"flex",alignItems:"center",gap:5,flexWrap:"wrap",marginBottom:2}}>
                    {u.name}
                    {u.banned        && <Badge label="🚫" color="#ff6b6b" />}
                    {u.isAgent       && <Badge label="🤝" color={S.neonGold} />}
                    {u.kycStatus==="approved" && <Badge label="✅" color={S.neonGreen} />}
                    {u.kycStatus==="pending"  && <Badge label="⏳" color={S.neonGold} />}
                    {u.adminNote     && <span title="Has admin note" style={{fontSize:13}}>📝</span>}
                  </div>
                  <div style={{fontSize:11,color:"rgba(255,255,255,0.42)"}}>📱 {u.phone}</div>
                  <div style={{fontSize:10,color:"rgba(255,255,255,0.25)"}}>
                    {(u.joinedAt||"").split("T")[0]} · {u.lastLogin ? "Active "+timeAgo(u.lastLogin) : "Never logged in"}
                  </div>
                </div>

                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontWeight:900,color:S.neonGold,fontSize:14}}>💎{fmt(u.diamonds)}</div>
                  <div style={{fontSize:11,color:S.neonGreen}}>↓{fmtINR(dep)}</div>
                  <div style={{fontSize:10,color:"rgba(255,255,255,0.3)"}}>{gs.played} games</div>
                </div>
              </div>
              <div style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",fontSize:18,color:"rgba(255,255,255,0.18)"}}>›</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};



const AdminTxns = () => {
  const [filter, setFilter] = useState("all");
  const txns = (DB.get("dp_transactions") || []).filter(t => filter === "all" || t.type === filter).slice(0, 50);
  const users = DB.get("dp_users") || [];
  const getUserName = (id) => users.find(u => u.id === id)?.name || id;

  return (
    <div style={S.page}>
      <TopBar title="📜 Transactions" />
      <div style={{ padding: "0 20px" }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto", paddingBottom: 4 }}>
          {["all", "deposit", "withdrawal", "game_win", "bonus"].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ background: filter === f ? S.gradBlue : "rgba(255,255,255,0.06)", border: "none", color: "#fff", borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>{f.replace("_", " ")}</button>
          ))}
        </div>
        {txns.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)" }}>No transactions</div> :
          txns.map(t => (
            <Card key={t.id} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{getUserName(t.userId)}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{t.note} · {timeAgo(t.date)}</div>
                  <Badge label={t.type.replace("_", " ")} color={t.type === "deposit" ? S.neonGreen : t.type === "withdrawal" ? S.neonGold : S.neonBlue} />
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 800, color: t.diamonds > 0 ? S.neonGreen : "#ff6b6b" }}>{t.diamonds > 0 ? "+" : ""}{t.diamonds}💎</div>
                  {t.amount > 0 && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{fmtINR(t.amount)}</div>}
                  <Badge label={t.status} color={t.status === "success" ? S.neonGreen : t.status === "pending" ? S.neonGold : "#ff6b6b"} />
                </div>
              </div>
            </Card>
          ))}
      </div>
    </div>
  );
};

// ─── ADMIN DEPOSIT MANAGEMENT (full hub) ──────────────────────────────────────
// Sections: Pending / Approved / Rejected / UTR Verification / Screenshot
// Verification / Payment Gateway Logs / Deposit Reports
// ─── OPERATOR CENTER (restricted staff — Deposit Center only) ────────────────
// A regular (non-admin) user promoted via Users → "Make Operator" lands here on
// login. They see nothing but the Deposit Center: UTR / screenshot verification
// and approve/reject on incoming deposits. Full AdminDeposits UI is reused as-is.
const OperatorCenter = ({ user, showToast, onLogout }) => {
  return (
    <div style={S.page}>
      <div style={{ position: "sticky", top: 0, zIndex: 60, background: "linear-gradient(135deg, rgba(0,212,255,0.14), rgba(10,10,26,0.98))", borderBottom: `1px solid ${S.neonBlue}33`, padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 15 }}>🧾 Deposit Center</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>Operator: {user.name} · {user.phone}</div>
        </div>
        <button onClick={onLogout} style={{ background: "rgba(255,61,154,0.14)", border: `1px solid ${S.neonPink}44`, color: S.neonPink, borderRadius: 10, padding: "8px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
          ⏻ Logout
        </button>
      </div>
      <AdminDeposits showToast={showToast} />
    </div>
  );
};

const AdminDeposits = ({ showToast }) => {
  const [tick, setTick] = useState(0);
  const [section, setSection] = useState("pending");
  const [reportRange, setReportRange] = useState("all"); // today | week | month | all
  const [lightbox, setLightbox] = useState(null);

  const refresh = () => setTick(k => k + 1);

  const allTxns = (DB.get("dp_transactions") || []).filter(t => t.type === "deposit");
  const users = DB.get("dp_users") || [];
  const getUserName  = (id) => users.find(u => u.id === id)?.name || id;
  const getUserPhone = (id) => users.find(u => u.id === id)?.phone || "";

  const pendingTxns  = allTxns.filter(t => t.status === "pending");
  const approvedTxns = allTxns.filter(t => t.status === "success");
  const rejectedTxns = allTxns.filter(t => t.status === "rejected");
  const unverifiedUtr = pendingTxns.filter(t => !t.utrVerified);
  const unverifiedShots = pendingTxns.filter(t => t.hasScreenshot && !t.screenshotVerified);

  const statusColor = { pending: S.neonGold, success: S.neonGreen, rejected: "#ff6b6b" };

  const approveDeposit = (txn) => {
    const allUsers = DB.get("dp_users") || [];
    const updatedUsers = allUsers.map(u =>
      u.id === txn.userId
        ? { ...u, diamonds: u.diamonds + txn.diamonds, totalDeposited: u.totalDeposited + txn.amount }
        : u
    );
    DB.set("dp_users", updatedUsers);
    const allT = DB.get("dp_transactions") || [];
    const updatedT = allT.map(t =>
      t.id === txn.id ? { ...t, status: "success", approvedAt: new Date().toISOString(), note: t.note.includes("✅ Approved") ? t.note : t.note + " ✅ Approved" } : t
    );
    DB.set("dp_transactions", updatedT);
    const gwLogs = DB.get("dp_gateway_logs") || [];
    DB.set("dp_gateway_logs", gwLogs.map(g => g.txnId === txn.id ? { ...g, status: "credited" } : g));
    refresh();
    showToast(`✅ Approved! 💎${fmt(txn.diamonds)} credited to ${getUserName(txn.userId)}`, "success");
  };

  const rejectDeposit = (txn) => {
    const allT = DB.get("dp_transactions") || [];
    const updatedT = allT.map(t =>
      t.id === txn.id ? { ...t, status: "rejected", rejectedAt: new Date().toISOString() } : t
    );
    DB.set("dp_transactions", updatedT);
    const gwLogs = DB.get("dp_gateway_logs") || [];
    DB.set("dp_gateway_logs", gwLogs.map(g => g.txnId === txn.id ? { ...g, status: "rejected" } : g));
    refresh();
    showToast(`Deposit rejected — UTR: ${txn.utr}`, "info");
  };

  const verifyUtr = (txn) => {
    const allT = DB.get("dp_transactions") || [];
    DB.set("dp_transactions", allT.map(t => t.id === txn.id ? { ...t, utrVerified: true } : t));
    refresh();
    showToast(`UTR ${txn.utr} verified ✓`, "success");
  };

  const verifyScreenshot = (txn) => {
    const allT = DB.get("dp_transactions") || [];
    DB.set("dp_transactions", allT.map(t => t.id === txn.id ? { ...t, screenshotVerified: true } : t));
    refresh();
    showToast("Screenshot verified ✓", "success");
  };

  const flagScreenshot = (txn) => {
    const allT = DB.get("dp_transactions") || [];
    DB.set("dp_transactions", allT.map(t => t.id === txn.id ? { ...t, screenshotVerified: false, screenshotFlagged: true } : t));
    refresh();
    showToast("Screenshot flagged — mismatch suspected", "info");
  };

  const rangeFilter = (t) => {
    if (reportRange === "all") return true;
    const d = new Date(t.date);
    const now = Date.now();
    if (reportRange === "today") return d.toISOString().split("T")[0] === new Date().toISOString().split("T")[0];
    if (reportRange === "week") return now - d.getTime() <= 7 * 86400000;
    if (reportRange === "month") return now - d.getTime() <= 30 * 86400000;
    return true;
  };
  const reportTxns = allTxns.filter(rangeFilter);
  const reportPending  = reportTxns.filter(t => t.status === "pending");
  const reportApproved = reportTxns.filter(t => t.status === "success");
  const reportRejected = reportTxns.filter(t => t.status === "rejected");
  const reportAmountApproved = reportApproved.reduce((s, t) => s + t.amount, 0);
  const reportDiamondsApproved = reportApproved.reduce((s, t) => s + t.diamonds, 0);

  const exportCSV = () => {
    const rows = [["ID", "User", "Phone", "Amount(INR)", "Diamonds", "UTR", "Gateway", "Status", "Date"]];
    reportTxns.forEach(t => rows.push([t.id, getUserName(t.userId), getUserPhone(t.userId), t.amount, t.diamonds, t.utr || "", t.gateway || "", t.status, t.date]));
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    try {
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `deposit_report_${reportRange}_${Date.now()}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("📄 Report exported!", "success");
    } catch { showToast("Export failed in this preview", "error"); }
  };

  const sections = [
    { id: "pending",    label: "Pending",     icon: "⏳", count: pendingTxns.length },
    { id: "approved",   label: "Approved",    icon: "✅", count: approvedTxns.length },
    { id: "rejected",   label: "Rejected",    icon: "✕",  count: rejectedTxns.length },
    { id: "utr",        label: "UTR Verify",  icon: "🔢", count: unverifiedUtr.length },
    { id: "screenshot", label: "Screenshots", icon: "📷", count: unverifiedShots.length },
    { id: "gateway",    label: "Gateway Logs",icon: "🧾", count: 0 },
    { id: "reports",    label: "Reports",     icon: "📊", count: 0 },
  ];

  // ── Shared deposit card ──
  const DepositCard = ({ t, mode }) => (
    <Card key={t.id} style={{ marginBottom: 12, border: t.status === "pending" ? `1px solid ${S.neonGold}44` : undefined, background: t.status === "pending" ? "rgba(255,215,0,0.04)" : S.glass }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{getUserName(t.userId)}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>📱 {getUserPhone(t.userId)}</div>
        </div>
        <Badge label={t.status} color={statusColor[t.status] || S.neonBlue} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Pack</div>
          <div style={{ fontWeight: 700 }}>💎 {fmt(t.diamonds)} Diamonds</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Amount</div>
          <div style={{ fontWeight: 800, color: S.neonGold, fontSize: 18 }}>{fmtINR(t.amount)}</div>
        </div>
      </div>

      {t.utr && (
        <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: "8px 12px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>UTR / Transaction ID {t.utrVerified && <span style={{ color: S.neonGreen }}>✓ Verified</span>}</div>
            <div style={{ fontWeight: 800, fontSize: 15, color: S.neonBlue, letterSpacing: 1 }}>{t.utr}</div>
          </div>
          <button onClick={() => { navigator.clipboard?.writeText(t.utr); showToast("UTR copied!", "success"); }} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "#fff", padding: "6px 10px", borderRadius: 8, cursor: "pointer", fontSize: 12 }}>📋</button>
        </div>
      )}

      {t.hasScreenshot && (
        <div style={{ background: "rgba(181,55,242,0.08)", border: `1px solid ${S.neonPurple}33`, borderRadius: 10, padding: "8px 12px", marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: t.screenshotData ? 8 : 0 }}>
            <div style={{ fontSize: 12 }}>📷 Payment screenshot {t.screenshotVerified ? <span style={{ color: S.neonGreen }}> · ✓ Verified</span> : t.screenshotFlagged ? <span style={{ color: "#ff6b6b" }}> · ⚠️ Flagged</span> : <span style={{ color: "rgba(255,255,255,0.4)" }}> · pending review</span>}</div>
          </div>
          {t.screenshotData && (
            <img src={t.screenshotData} alt="Payment proof" onClick={() => setLightbox(t.screenshotData)} style={{ width: "100%", maxHeight: 160, objectFit: "contain", borderRadius: 8, background: "rgba(0,0,0,0.3)", cursor: "pointer" }} />
          )}
        </div>
      )}

      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 10 }}>{t.gateway || "Manual UPI"} · {timeAgo(t.date)}</div>

      {mode === "pending" && (
        <div style={{ display: "flex", gap: 8 }}>
          <Btn full variant="green" sm onClick={() => approveDeposit(t)}>✅ Approve & Credit</Btn>
          <Btn sm variant="danger" onClick={() => rejectDeposit(t)}>✕ Reject</Btn>
        </div>
      )}
      {mode === "approved" && t.approvedAt && (
        <div style={{ fontSize: 12, color: S.neonGreen }}>✅ Approved {timeAgo(t.approvedAt)}</div>
      )}
      {mode === "rejected" && (
        <div style={{ fontSize: 12, color: "#ff6b6b" }}>✕ Rejected {t.rejectedAt ? timeAgo(t.rejectedAt) : ""}</div>
      )}
    </Card>
  );

  return (
    <div style={S.page}>
      <TopBar title="💰 Deposit Management" />
      <div style={{ padding: "0 20px" }}>
        {pendingTxns.length > 0 && section !== "pending" && (
          <div onClick={() => setSection("pending")} style={{ cursor: "pointer", background: "rgba(255,215,0,0.12)", border: `1px solid ${S.neonGold}44`, borderRadius: 14, padding: "10px 14px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 800, color: S.neonGold }}>⏳ {pendingTxns.length} pending verification{pendingTxns.length > 1 ? "s" : ""}</div>
            <Badge label="Action needed" color={S.neonGold} />
          </div>
        )}

        <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
          {sections.map(s => (
            <button key={s.id} onClick={() => setSection(s.id)} style={{ background: section === s.id ? S.gradBlue : "rgba(255,255,255,0.06)", border: "none", color: "#fff", borderRadius: 20, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
              {s.icon} {s.label}{s.count > 0 ? ` (${s.count})` : ""}
            </button>
          ))}
        </div>

        {section === "pending" && (
          pendingTxns.length === 0
            ? <Card style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.35)" }}>No pending deposits</Card>
            : pendingTxns.map(t => <DepositCard key={t.id} t={t} mode="pending" />)
        )}

        {section === "approved" && (
          approvedTxns.length === 0
            ? <Card style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.35)" }}>No approved deposits</Card>
            : approvedTxns.map(t => <DepositCard key={t.id} t={t} mode="approved" />)
        )}

        {section === "rejected" && (
          rejectedTxns.length === 0
            ? <Card style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.35)" }}>No rejected deposits</Card>
            : rejectedTxns.map(t => <DepositCard key={t.id} t={t} mode="rejected" />)
        )}

        {section === "utr" && (
          <>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 12 }}>Cross-check each UTR / transaction ID against your bank or UPI statement before crediting diamonds.</div>
            {pendingTxns.length === 0
              ? <Card style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.35)" }}>No deposits awaiting UTR check</Card>
              : pendingTxns.map(t => (
                <Card key={t.id} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{getUserName(t.userId)}</div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{fmtINR(t.amount)} · 💎{fmt(t.diamonds)}</div>
                    </div>
                    {t.utrVerified ? <Badge label="✓ Verified" color={S.neonGreen} /> : <Badge label="Unverified" color={S.neonGold} />}
                  </div>
                  <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: "8px 12px", marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>UTR / Transaction ID</div>
                    <div style={{ fontWeight: 800, fontSize: 16, color: S.neonBlue, letterSpacing: 1 }}>{t.utr}</div>
                  </div>
                  {!t.utrVerified && <Btn full sm variant="primary" onClick={() => verifyUtr(t)}>🔎 Mark UTR Verified</Btn>}
                </Card>
              ))}
          </>
        )}

        {section === "screenshot" && (
          <>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 12 }}>Confirm the uploaded payment screenshot matches the amount and UTR before approving.</div>
            {pendingTxns.filter(t => t.hasScreenshot).length === 0
              ? <Card style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.35)" }}>No screenshots awaiting review</Card>
              : pendingTxns.filter(t => t.hasScreenshot).map(t => (
                <Card key={t.id} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{getUserName(t.userId)}</div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{fmtINR(t.amount)} · UTR {t.utr}</div>
                    </div>
                    {t.screenshotVerified ? <Badge label="✓ Verified" color={S.neonGreen} /> : t.screenshotFlagged ? <Badge label="⚠️ Flagged" color="#ff6b6b" /> : <Badge label="Pending review" color={S.neonGold} />}
                  </div>
                  {t.screenshotData
                    ? <img src={t.screenshotData} alt="Payment proof" onClick={() => setLightbox(t.screenshotData)} style={{ width: "100%", maxHeight: 220, objectFit: "contain", borderRadius: 10, background: "rgba(0,0,0,0.3)", marginBottom: 10, cursor: "pointer", border: "1px solid rgba(255,255,255,0.1)" }} />
                    : (
                      <div style={{ background: "rgba(255,255,255,0.05)", border: "1px dashed rgba(255,255,255,0.2)", borderRadius: 10, height: 90, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10, fontSize: 28 }}>
                        🧾
                      </div>
                    )}
                  {!t.screenshotVerified && !t.screenshotFlagged && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <Btn full sm variant="green" onClick={() => verifyScreenshot(t)}>✅ Verify</Btn>
                      <Btn sm variant="danger" onClick={() => flagScreenshot(t)}>⚠️ Flag</Btn>
                    </div>
                  )}
                </Card>
              ))}
          </>
        )}

        {section === "gateway" && (
          <>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 12 }}>Raw log of every incoming payment notification, for reconciliation with your gateway/bank.</div>
            {(DB.get("dp_gateway_logs") || []).length === 0
              ? <Card style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.35)" }}>No gateway logs yet</Card>
              : (DB.get("dp_gateway_logs") || []).map(g => (
                <Card key={g.id} style={{ marginBottom: 10, padding: "12px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{g.userName}</div>
                    <Badge label={g.status} color={g.status === "credited" ? S.neonGreen : g.status === "rejected" ? "#ff6b6b" : S.neonGold} />
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{g.gateway} · UTR {g.utr} · {fmtINR(g.amount)}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 3 }}>Log ID {g.id} · {timeAgo(g.at)}</div>
                </Card>
              ))}
          </>
        )}

        {section === "reports" && (
          <>
            <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
              {["today", "week", "month", "all"].map(r => (
                <button key={r} onClick={() => setReportRange(r)} style={{ flex: 1, background: reportRange === r ? S.gradBlue : "rgba(255,255,255,0.06)", border: "none", color: "#fff", borderRadius: 10, padding: "8px 0", fontSize: 12, fontWeight: 700, cursor: "pointer", textTransform: "capitalize" }}>{r}</button>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
              <Card style={{ padding: 14 }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Approved Amount</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: S.neonGreen }}>{fmtINR(reportAmountApproved)}</div>
              </Card>
              <Card style={{ padding: 14 }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Diamonds Credited</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: S.neonBlue }}>💎{fmt(reportDiamondsApproved)}</div>
              </Card>
              <Card style={{ padding: 14 }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Pending</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: S.neonGold }}>{reportPending.length}</div>
              </Card>
              <Card style={{ padding: 14 }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Rejected</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: "#ff6b6b" }}>{reportRejected.length}</div>
              </Card>
            </div>
            <Btn full onClick={exportCSV}>📄 Export CSV Report</Btn>
          </>
        )}
      </div>

      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <img src={lightbox} alt="Payment proof full size" style={{ maxWidth: "100%", maxHeight: "90vh", borderRadius: 12, objectFit: "contain" }} />
          <button onClick={() => setLightbox(null)} style={{ position: "fixed", top: 20, right: 20, background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: "50%", width: 40, height: 40, fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>
      )}
    </div>
  );
};

const AdminWithdrawals = ({ showToast }) => {  const [tick, setTick] = useState(0);
  const txns = (DB.get("dp_transactions") || []).filter(t => t.type === "withdrawal");
  const users = DB.get("dp_users") || [];
  const getUserName = (id) => users.find(u => u.id === id)?.name || id;

  const approve = (txnId) => {
    const all = DB.get("dp_transactions") || [];
    const updated = all.map(t => t.id === txnId ? { ...t, status: "success", approvedAt: new Date().toISOString() } : t);
    DB.set("dp_transactions", updated);
    setTick(t => t + 1);
    showToast("Withdrawal approved!", "success");
  };

  const reject = (txnId, userId, diamonds) => {
    const all = DB.get("dp_transactions") || [];
    const updated = all.map(t => t.id === txnId ? { ...t, status: "rejected" } : t);
    DB.set("dp_transactions", updated);
    // Refund diamonds
    const allUsers = DB.get("dp_users") || [];
    const updatedUsers = allUsers.map(u => u.id === userId ? { ...u, diamonds: u.diamonds + Math.abs(diamonds) } : u);
    DB.set("dp_users", updatedUsers);
    setTick(t => t + 1);
    showToast("Rejected & diamonds refunded", "info");
  };

  const latestTxns = (DB.get("dp_transactions") || []).filter(t => t.type === "withdrawal");

  return (
    <div style={S.page}>
      <TopBar title="⬆️ Payouts" />
      <div style={{ padding: "0 20px" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {[["Pending", latestTxns.filter(t => t.status === "pending").length, S.neonGold],
            ["Approved", latestTxns.filter(t => t.status === "success").length, S.neonGreen],
            ["Rejected", latestTxns.filter(t => t.status === "rejected").length, "#ff6b6b"]].map(([l, v, c]) => (
            <Card key={l} style={{ flex: 1, textAlign: "center", padding: 10 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: c }}>{v}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{l}</div>
            </Card>
          ))}
        </div>
        {latestTxns.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)" }}>No withdrawal requests yet</div> :
          latestTxns.map(t => (
            <Card key={t.id} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{getUserName(t.userId)}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{t.note} · {timeAgo(t.date)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 800, color: "#ff6b6b" }}>{t.diamonds}💎</div>
                  <div style={{ fontSize: 12, color: S.neonGold }}>{fmtINR(t.amount || 0)} net</div>
                </div>
              </div>
              {t.status === "pending"
                ? <div style={{ display: "flex", gap: 8 }}>
                    <Btn sm full variant="green" onClick={() => approve(t.id)}>✓ Approve & Pay</Btn>
                    <Btn sm full variant="danger" onClick={() => reject(t.id, t.userId, t.diamonds)}>✕ Reject</Btn>
                  </div>
                : <Badge label={t.status === "success" ? "✓ Approved" : "✕ Rejected"} color={t.status === "success" ? S.neonGreen : "#ff6b6b"} />}
            </Card>
          ))}
      </div>
    </div>
  );
};

// ─── ADMIN WALLET MANAGEMENT ───────────────────────────────────────────────────
// Sections: Add Balance / Deduct Balance / Freeze Wallet / Bonus Wallet /
// Cashback Wallet / Transaction History / Manual Adjustment (audit log)
const AdminWallet = ({ showToast }) => {
  const [tick, setTick] = useState(0);
  const [section, setSection] = useState("add");
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [freezeReason, setFreezeReason] = useState("");

  const refresh = () => setTick(k => k + 1);

  const users = DB.get("dp_users") || [];
  const realUsers = users.filter(u => !u.isAdmin);
  const filteredUsers = search.trim()
    ? realUsers.filter(u => u.name.toLowerCase().includes(search.toLowerCase()) || u.phone.includes(search))
    : realUsers;
  const selectedUser = realUsers.find(u => u.id === selectedUserId) || null;
  const frozenUsers = realUsers.filter(u => u.frozen);

  const logAdjustment = (type, walletType, amt, why, uid_ = selectedUser?.id, uname = selectedUser?.name) => {
    const logs = DB.get("dp_wallet_adjustments") || [];
    DB.set("dp_wallet_adjustments", [{ id: tid(), userId: uid_, userName: uname, type, walletType, amount: amt, reason: why || "—", at: new Date().toISOString() }, ...logs].slice(0, 300));
  };

  const requireUser = () => { if (!selectedUser) { showToast("Select a user first", "error"); return false; } return true; };
  const requireAmt = () => { const a = parseInt(amount); if (!a || a <= 0) { showToast("Enter a valid amount", "error"); return null; } return a; };

  const addBalance = () => {
    if (!requireUser()) return;
    const amt = requireAmt(); if (!amt) return;
    DB.set("dp_users", (DB.get("dp_users") || []).map(u => u.id === selectedUser.id ? { ...u, diamonds: u.diamonds + amt } : u));
    logAdjustment("credit", "main", amt, reason || "Manual credit by admin");
    setAmount(""); setReason(""); refresh();
    showToast(`💎 ${fmt(amt)} added to ${selectedUser.name}`, "success");
  };

  const deductBalance = () => {
    if (!requireUser()) return;
    const amt = requireAmt(); if (!amt) return;
    DB.set("dp_users", (DB.get("dp_users") || []).map(u => u.id === selectedUser.id ? { ...u, diamonds: Math.max(0, u.diamonds - amt) } : u));
    logAdjustment("debit", "main", amt, reason || "Manual deduction by admin");
    setAmount(""); setReason(""); refresh();
    showToast(`💎 ${fmt(amt)} deducted from ${selectedUser.name}`, "info");
  };

  const toggleFreeze = (u) => {
    const newFrozen = !u.frozen;
    DB.set("dp_users", (DB.get("dp_users") || []).map(x => x.id === u.id ? { ...x, frozen: newFrozen, frozenReason: newFrozen ? (freezeReason || "Frozen by admin") : null } : x));
    logAdjustment(newFrozen ? "freeze" : "unfreeze", "main", 0, freezeReason || (newFrozen ? "Wallet frozen" : "Wallet unfrozen"), u.id, u.name);
    setFreezeReason(""); refresh();
    showToast(newFrozen ? `🧊 ${u.name}'s wallet frozen` : `✅ ${u.name}'s wallet unfrozen`, "info");
  };

  const adjustSub = (field, type, amt, why) => {
    if (!requireUser()) return;
    if (!amt || amt <= 0) { showToast("Enter a valid amount", "error"); return; }
    DB.set("dp_users", (DB.get("dp_users") || []).map(u => u.id === selectedUser.id ? { ...u, [field]: type === "credit" ? (u[field] || 0) + amt : Math.max(0, (u[field] || 0) - amt) } : u));
    logAdjustment(type, field === "bonusDiamonds" ? "bonus" : "cashback", amt, why);
    setAmount(""); setReason(""); refresh();
    showToast(`${type === "credit" ? "Added to" : "Deducted from"} ${field === "bonusDiamonds" ? "bonus" : "cashback"} wallet`, "success");
  };

  const sections = [
    { id: "add",       label: "Add Balance",    icon: "➕" },
    { id: "deduct",    label: "Deduct Balance", icon: "➖" },
    { id: "freeze",    label: "Freeze Wallet",  icon: "🧊", count: frozenUsers.length },
    { id: "bonus",     label: "Bonus Wallet",   icon: "🎁" },
    { id: "cashback",  label: "Cashback Wallet",icon: "💸" },
    { id: "history",   label: "Txn History",    icon: "📜" },
    { id: "manual",    label: "Manual Adjustment", icon: "🧾" },
  ];

  // ── User picker (shared across most sections) ──
  const UserPicker = () => (
    <div style={{ marginBottom: 14 }}>
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="🔍 Search user by name or phone…"
        style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "10px 14px", color: "#fff", fontSize: 13, marginBottom: 8 }}
      />
      {search.trim() && !selectedUser && (
        <div style={{ maxHeight: 180, overflowY: "auto", background: "rgba(255,255,255,0.03)", borderRadius: 12 }}>
          {filteredUsers.length === 0
            ? <div style={{ padding: 12, fontSize: 12, color: "rgba(255,255,255,0.35)" }}>No users found</div>
            : filteredUsers.slice(0, 8).map(u => (
              <div key={u.id} onClick={() => { setSelectedUserId(u.id); setSearch(""); }} style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)", cursor: "pointer", display: "flex", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{u.name}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>📱 {u.phone}</div>
                </div>
                <div style={{ fontSize: 12, color: S.neonGold, fontWeight: 700 }}>💎{fmt(u.diamonds)}</div>
              </div>
            ))}
        </div>
      )}
      {selectedUser && (
        <Card style={{ marginTop: 8, padding: "12px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14 }}>{selectedUser.name} {selectedUser.frozen && <span style={{ color: S.neonBlue }}>🧊</span>}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>📱 {selectedUser.phone}</div>
            </div>
            <button onClick={() => setSelectedUserId(null)} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "#fff", borderRadius: 8, padding: "5px 9px", cursor: "pointer", fontSize: 11 }}>Change</button>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <div style={{ flex: 1, background: "rgba(0,212,255,0.08)", borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Main</div>
              <div style={{ fontWeight: 800, color: S.neonBlue, fontSize: 13 }}>💎{fmt(selectedUser.diamonds)}</div>
            </div>
            <div style={{ flex: 1, background: "rgba(255,215,0,0.08)", borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Bonus</div>
              <div style={{ fontWeight: 800, color: S.neonGold, fontSize: 13 }}>💎{fmt(selectedUser.bonusDiamonds || 0)}</div>
            </div>
            <div style={{ flex: 1, background: "rgba(0,255,136,0.08)", borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Cashback</div>
              <div style={{ fontWeight: 800, color: S.neonGreen, fontSize: 13 }}>💎{fmt(selectedUser.cashbackDiamonds || 0)}</div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );

  const AmountReasonForm = ({ onSubmit, btnLabel, variant = "primary" }) => (
    <>
      <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Amount (💎 diamonds)" inputMode="numeric" style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "12px 14px", color: "#fff", fontSize: 14, marginBottom: 10 }} />
      <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason / note (optional)" style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "12px 14px", color: "#fff", fontSize: 13, marginBottom: 12 }} />
      <Btn full variant={variant} onClick={onSubmit}>{btnLabel}</Btn>
    </>
  );

  const adjustments = DB.get("dp_wallet_adjustments") || [];
  const typeIcon = { credit: "➕", debit: "➖", freeze: "🧊", unfreeze: "✅" };
  const typeColor = { credit: S.neonGreen, debit: "#ff6b6b", freeze: S.neonBlue, unfreeze: S.neonGreen };

  return (
    <div style={S.page}>
      <TopBar title="👛 Wallet Management" />
      <div style={{ padding: "0 20px" }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
          {sections.map(s => (
            <button key={s.id} onClick={() => setSection(s.id)} style={{ background: section === s.id ? S.gradBlue : "rgba(255,255,255,0.06)", border: "none", color: "#fff", borderRadius: 20, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
              {s.icon} {s.label}{s.count > 0 ? ` (${s.count})` : ""}
            </button>
          ))}
        </div>

        {section === "add" && (
          <>
            <UserPicker />
            <AmountReasonForm onSubmit={addBalance} btnLabel="➕ Add Balance" variant="green" />
          </>
        )}

        {section === "deduct" && (
          <>
            <UserPicker />
            <AmountReasonForm onSubmit={deductBalance} btnLabel="➖ Deduct Balance" variant="danger" />
          </>
        )}

        {section === "freeze" && (
          <>
            <UserPicker />
            {selectedUser && (
              <>
                <input value={freezeReason} onChange={e => setFreezeReason(e.target.value)} placeholder="Reason for freeze (optional)" style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "12px 14px", color: "#fff", fontSize: 13, marginBottom: 12 }} />
                <Btn full variant={selectedUser.frozen ? "green" : "danger"} onClick={() => toggleFreeze(selectedUser)}>
                  {selectedUser.frozen ? "✅ Unfreeze Wallet" : "🧊 Freeze Wallet"}
                </Btn>
              </>
            )}
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", margin: "18px 0 10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Currently Frozen ({frozenUsers.length})</div>
            {frozenUsers.length === 0
              ? <Card style={{ textAlign: "center", padding: 24, color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No frozen wallets</Card>
              : frozenUsers.map(u => (
                <Card key={u.id} style={{ marginBottom: 8, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{u.name}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{u.frozenReason || "No reason given"}</div>
                  </div>
                  <button onClick={() => toggleFreeze(u)} style={{ background: S.gradGreen, border: "none", color: "#000", borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Unfreeze</button>
                </Card>
              ))}
          </>
        )}

        {section === "bonus" && (
          <>
            <UserPicker />
            <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Amount (💎 diamonds)" inputMode="numeric" style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "12px 14px", color: "#fff", fontSize: 14, marginBottom: 10 }} />
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (e.g. loyalty bonus)" style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "12px 14px", color: "#fff", fontSize: 13, marginBottom: 12 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <Btn full sm variant="gold" onClick={() => adjustSub("bonusDiamonds", "credit", parseInt(amount), reason || "Bonus credited by admin")}>➕ Add Bonus</Btn>
              <Btn full sm variant="danger" onClick={() => adjustSub("bonusDiamonds", "debit", parseInt(amount), reason || "Bonus deducted by admin")}>➖ Deduct Bonus</Btn>
            </div>
          </>
        )}

        {section === "cashback" && (
          <>
            <UserPicker />
            <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Amount (💎 diamonds)" inputMode="numeric" style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "12px 14px", color: "#fff", fontSize: 14, marginBottom: 10 }} />
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (e.g. loss cashback)" style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "12px 14px", color: "#fff", fontSize: 13, marginBottom: 12 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <Btn full sm variant="green" onClick={() => adjustSub("cashbackDiamonds", "credit", parseInt(amount), reason || "Cashback credited by admin")}>➕ Add Cashback</Btn>
              <Btn full sm variant="danger" onClick={() => adjustSub("cashbackDiamonds", "debit", parseInt(amount), reason || "Cashback deducted by admin")}>➖ Deduct Cashback</Btn>
            </div>
          </>
        )}

        {section === "history" && (
          <>
            <UserPicker />
            {(() => {
              const txns = (DB.get("dp_transactions") || []).filter(t => !selectedUser || t.userId === selectedUser.id).slice(0, 40);
              return txns.length === 0
                ? <Card style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.35)" }}>{selectedUser ? "No transactions for this user" : "Select a user, or browse all transactions above"}</Card>
                : txns.map(t => (
                  <Card key={t.id} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{users.find(u => u.id === t.userId)?.name || t.userId}</div>
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{t.note} · {timeAgo(t.date)}</div>
                        <Badge label={t.type.replace("_", " ")} color={t.type === "deposit" ? S.neonGreen : t.type === "withdrawal" ? S.neonGold : S.neonBlue} />
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 800, color: t.diamonds > 0 ? S.neonGreen : "#ff6b6b" }}>{t.diamonds > 0 ? "+" : ""}{t.diamonds}💎</div>
                        <Badge label={t.status} color={t.status === "success" ? S.neonGreen : t.status === "pending" ? S.neonGold : "#ff6b6b"} />
                      </div>
                    </div>
                  </Card>
                ));
            })()}
          </>
        )}

        {section === "manual" && (
          <>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 12 }}>Audit trail of every manual wallet adjustment made from this panel (add/deduct, bonus, cashback, freeze/unfreeze).</div>
            {adjustments.length === 0
              ? <Card style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.35)" }}>No manual adjustments yet</Card>
              : adjustments.map(a => (
                <Card key={a.id} style={{ marginBottom: 8, padding: "10px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{typeIcon[a.type] || "🔧"} {a.userName}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{a.reason} · {a.walletType} wallet · {timeAgo(a.at)}</div>
                    </div>
                    {a.amount > 0 && <div style={{ fontWeight: 800, color: typeColor[a.type] || "#fff" }}>{a.type === "debit" ? "-" : "+"}{fmt(a.amount)}💎</div>}
                  </div>
                </Card>
              ))}
          </>
        )}
      </div>
    </div>
  );
};

// ─── ADMIN AGENT SYSTEM (Referral / Commission management) ───────────────────
// Profit generated by a referred user = their approved deposits (₹) minus their
// approved withdrawals (₹). Agent earns a % commission (global default, or a
// custom per-agent override) of the total profit generated by all users they
// referred (users whose referredBy === agent.referralCode).
const AdminAgents = ({ showToast, onBack }) => {
  const [tick, setTick] = useState(0);
  const [rateInput, setRateInput] = useState(String((DB.get("dp_platform_config") || {}).agentCommissionPercent ?? 10));
  const [customRateEdit, setCustomRateEdit] = useState(null);
  const [customRateVal, setCustomRateVal] = useState("");

  const cfg = DB.get("dp_platform_config") || {};
  const users = DB.get("dp_users") || [];
  const txns = DB.get("dp_transactions") || [];
  const agents = users.filter(u => u.isAgent);
  const pendingRequests = (DB.get("dp_agent_requests") || []).filter(r => r.status === "pending");

  const globalRate = cfg.agentCommissionPercent ?? 10;

  const approveRequest = (req) => {
    const allUsers = DB.get("dp_users") || [];
    const updatedUsers = allUsers.map(u => u.id === req.userId ? { ...u, isAgent: true } : u);
    DB.set("dp_users", updatedUsers);
    const allReqs = DB.get("dp_agent_requests") || [];
    DB.set("dp_agent_requests", allReqs.map(r => r.id === req.id ? { ...r, status: "approved" } : r));
    setTick(t => t + 1);
    showToast(`✅ ${req.name} is now a referral agent`, "success");
  };

  const rejectRequest = (req) => {
    const allReqs = DB.get("dp_agent_requests") || [];
    DB.set("dp_agent_requests", allReqs.map(r => r.id === req.id ? { ...r, status: "rejected" } : r));
    setTick(t => t + 1);
    showToast(`Request from ${req.name} rejected`, "info");
  };

  const agentStats = (agent) => {
    const referred = users.filter(u => u.referredBy === agent.referralCode);
    const referredIds = new Set(referred.map(u => u.id));
    const deposits = txns.filter(t => t.type === "deposit" && t.status === "success" && referredIds.has(t.userId))
      .reduce((s, t) => s + (t.amount || 0), 0);
    const withdrawals = txns.filter(t => t.type === "withdrawal" && t.status === "success" && referredIds.has(t.userId))
      .reduce((s, t) => s + (t.amount || 0), 0);
    const profit = Math.max(0, deposits - withdrawals);
    const rate = agent.customCommissionPercent ?? globalRate;
    const totalEarned = Math.floor(profit * rate / 100);
    const paid = agent.commissionPaid || 0;
    const pending = Math.max(0, totalEarned - paid);
    return { referredCount: referred.length, deposits, withdrawals, profit, rate, totalEarned, paid, pending };
  };

  const allStats = agents.map(a => ({ agent: a, ...agentStats(a) }));
  const totalPendingAll = allStats.reduce((s, a) => s + a.pending, 0);
  const totalPaidAll = allStats.reduce((s, a) => s + a.paid, 0);

  const saveGlobalRate = () => {
    const r = Number(rateInput);
    if (isNaN(r) || r < 0 || r > 100) { showToast("Enter a valid % between 0-100", "error"); return; }
    DB.set("dp_platform_config", { ...cfg, agentCommissionPercent: r });
    showToast(`Default agent commission set to ${r}%`, "success");
    setTick(t => t + 1);
  };

  const saveCustomRate = (agentId) => {
    const r = customRateVal.trim() === "" ? null : Number(customRateVal);
    if (r !== null && (isNaN(r) || r < 0 || r > 100)) { showToast("Enter a valid % between 0-100", "error"); return; }
    const allUsers = DB.get("dp_users") || [];
    const updated = allUsers.map(u => u.id === agentId ? { ...u, customCommissionPercent: r } : u);
    DB.set("dp_users", updated);
    setCustomRateEdit(null);
    setTick(t => t + 1);
    showToast("Custom commission rate updated!", "success");
  };

  const payCommission = (agent, pending) => {
    if (pending <= 0) { showToast("No pending commission to pay", "info"); return; }
    const allUsers = DB.get("dp_users") || [];
    const updated = allUsers.map(u =>
      u.id === agent.id ? { ...u, diamonds: u.diamonds + pending, commissionPaid: (u.commissionPaid || 0) + pending } : u
    );
    DB.set("dp_users", updated);
    const allT = DB.get("dp_transactions") || [];
    DB.set("dp_transactions", [{
      id: tid(), userId: agent.id, type: "commission", amount: 0, diamonds: pending,
      status: "success", date: new Date().toISOString(), method: "admin",
      note: `Agent Commission Payout (${agentStats(agent).rate}%)`,
    }, ...allT]);
    setTick(t => t + 1);
    showToast(`✅ 💎${fmt(pending)} commission credited to ${agent.name}`, "success");
  };

  return (
    <div style={S.page}>
      <TopBar title="🧑‍💼 Agent System" onBack={onBack} />
      <div style={{ padding: "0 20px" }}>
        {/* Global stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          <Card style={{ padding: 14 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: S.neonBlue }}>{agents.length}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>🧑‍💼 Total Agents</div>
          </Card>
          <Card style={{ padding: 14 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: S.neonOrange }}>💎{fmt(totalPendingAll)}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>⏳ Pending Commission</div>
          </Card>
        </div>

        {/* Pending agent requests from users */}
        {pendingRequests.length > 0 && (
          <>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>🙋 Agent Requests ({pendingRequests.length})</div>
            {pendingRequests.map(req => (
              <Card key={req.id} style={{ marginBottom: 12, background: "rgba(181,55,242,0.06)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>{req.name}</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>📱 {req.phone} · 🎟️ {req.referralCode}</div>
                  </div>
                  <Badge label={timeAgo(req.date)} color={S.neonPurple} />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn sm full variant="green" onClick={() => approveRequest(req)}>✓ Approve</Btn>
                  <Btn sm full variant="danger" onClick={() => rejectRequest(req)}>✕ Reject</Btn>
                </div>
              </Card>
            ))}
          </>
        )}

        {/* Global commission rate */}
        <Card style={{ marginBottom: 16, background: "rgba(255,215,0,0.05)" }}>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>⚙️ Default Commission Rate</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 10 }}>Applies to all agents unless a custom rate is set for them below.</div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <Input label="Commission % of profit" value={rateInput} onChange={setRateInput} type="number" icon="💹" />
            </div>
            <Btn onClick={saveGlobalRate} variant="green" style={{ marginBottom: 14 }}>💾 Save</Btn>
          </div>
        </Card>

        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>Agents ({agents.length})</div>

        {agents.length === 0
          ? <Card style={{ textAlign: "center", padding: 30, color: "rgba(255,255,255,0.35)" }}>
              No agents yet. Go to Users tab and tap "🧑‍💼 Make Agent" on any user to turn them into a referral agent.
            </Card>
          : allStats.map(({ agent, referredCount, deposits, withdrawals, profit, rate, totalEarned, paid, pending }) => (
            <Card key={agent.id} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{agent.name}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>📱 {agent.phone} · 🎟️ {agent.referralCode}</div>
                </div>
                <Badge label={`${rate}% rate`} color={S.neonGold} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Referred</div>
                  <div style={{ fontWeight: 700 }}>{referredCount} users</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Deposits</div>
                  <div style={{ fontWeight: 700, color: S.neonGreen }}>{fmtINR(deposits)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Withdrawals</div>
                  <div style={{ fontWeight: 700, color: "#ff6b6b" }}>{fmtINR(withdrawals)}</div>
                </div>
              </div>

              <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: "8px 12px", marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>App Profit from referrals</span>
                  <span style={{ fontWeight: 700 }}>{fmtINR(profit)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Total Commission Earned ({rate}%)</span>
                  <span style={{ fontWeight: 700, color: S.neonGold }}>💎{fmt(totalEarned)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Already Paid</span>
                  <span style={{ fontWeight: 700, color: S.neonGreen }}>💎{fmt(paid)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Pending Payout</span>
                  <span style={{ fontWeight: 800, color: S.neonOrange }}>💎{fmt(pending)}</span>
                </div>
              </div>

              {customRateEdit === agent.id ? (
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <input type="number" placeholder={`Default ${globalRate}%`} value={customRateVal} onChange={e => setCustomRateVal(e.target.value)} style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: "8px 12px", color: "#fff", fontSize: 13, outline: "none" }} />
                  <Btn sm variant="green" onClick={() => saveCustomRate(agent.id)}>✓ Set</Btn>
                  <Btn sm variant="ghost" onClick={() => setCustomRateEdit(null)}>Cancel</Btn>
                </div>
              ) : null}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Btn sm full variant="green" onClick={() => payCommission(agent, pending)} disabled={pending <= 0}>💸 Pay 💎{fmt(pending)}</Btn>
                <Btn sm variant="ghost" onClick={() => { setCustomRateEdit(agent.id); setCustomRateVal(agent.customCommissionPercent != null ? String(agent.customCommissionPercent) : ""); }}>✏️ Custom %</Btn>
              </div>
            </Card>
          ))}
      </div>
    </div>
  );
};

// ─── ADMIN CONFIG (Customize Everything) ──────────────────────────────────────
// ─── ROLE MANAGEMENT SYSTEM ───────────────────────────────────────────────────
const ROLE_PRESETS = [
  {
    id: "super_admin",
    name: "Super Admin",
    icon: "👑",
    color: "#ffd700",
    gradient: "linear-gradient(135deg,#ffd700,#ff6b35)",
    description: "Full platform access. Can manage everything including other admins.",
    fixed: true,
    permissions: {
      view_dashboard: true, view_users: true, edit_users: true, ban_users: true,
      gift_diamonds: true, deduct_diamonds: true,
      view_deposits: true, approve_deposits: true, reject_deposits: true,
      view_withdrawals: true, approve_withdrawals: true, reject_withdrawals: true,
      view_transactions: true, view_games: true, control_games: true,
      view_agents: true, manage_agents: true,
      view_config: true, edit_config: true,
      manage_packs: true, manage_roles: true,
      view_reports: true, export_data: true, send_notifications: true,
    },
  },
  {
    id: "finance_admin",
    name: "Finance Admin",
    icon: "💰",
    color: "#00ff88",
    gradient: "linear-gradient(135deg,#00ff88,#00d4ff)",
    description: "Manages deposits, withdrawals and financial transactions only.",
    fixed: false,
    permissions: {
      view_dashboard: true, view_users: true, edit_users: false, ban_users: false,
      gift_diamonds: true, deduct_diamonds: false,
      view_deposits: true, approve_deposits: true, reject_deposits: true,
      view_withdrawals: true, approve_withdrawals: true, reject_withdrawals: true,
      view_transactions: true, view_games: false, control_games: false,
      view_agents: true, manage_agents: false,
      view_config: false, edit_config: false,
      manage_packs: false, manage_roles: false,
      view_reports: true, export_data: true, send_notifications: false,
    },
  },
  {
    id: "customer_support",
    name: "Customer Support",
    icon: "🎧",
    color: "#00d4ff",
    gradient: "linear-gradient(135deg,#00d4ff,#b537f2)",
    description: "Handles user queries, can view accounts and gift bonuses.",
    fixed: false,
    permissions: {
      view_dashboard: true, view_users: true, edit_users: false, ban_users: false,
      gift_diamonds: true, deduct_diamonds: false,
      view_deposits: true, approve_deposits: false, reject_deposits: false,
      view_withdrawals: true, approve_withdrawals: false, reject_withdrawals: false,
      view_transactions: true, view_games: true, control_games: false,
      view_agents: false, manage_agents: false,
      view_config: false, edit_config: false,
      manage_packs: false, manage_roles: false,
      view_reports: false, export_data: false, send_notifications: true,
    },
  },
  {
    id: "moderator",
    name: "Moderator",
    icon: "🛡️",
    color: "#b537f2",
    gradient: "linear-gradient(135deg,#b537f2,#ff3d9a)",
    description: "Monitors games, can ban users and view activity.",
    fixed: false,
    permissions: {
      view_dashboard: true, view_users: true, edit_users: false, ban_users: true,
      gift_diamonds: false, deduct_diamonds: false,
      view_deposits: false, approve_deposits: false, reject_deposits: false,
      view_withdrawals: false, approve_withdrawals: false, reject_withdrawals: false,
      view_transactions: true, view_games: true, control_games: true,
      view_agents: false, manage_agents: false,
      view_config: false, edit_config: false,
      manage_packs: false, manage_roles: false,
      view_reports: true, export_data: false, send_notifications: false,
    },
  },
  {
    id: "sub_admin",
    name: "Sub Admin",
    icon: "🔑",
    color: "#ff6b35",
    gradient: "linear-gradient(135deg,#ff6b35,#ffd700)",
    description: "Limited admin access. Can approve deposits & withdrawals.",
    fixed: false,
    permissions: {
      view_dashboard: true, view_users: true, edit_users: true, ban_users: false,
      gift_diamonds: true, deduct_diamonds: false,
      view_deposits: true, approve_deposits: true, reject_deposits: false,
      view_withdrawals: true, approve_withdrawals: true, reject_withdrawals: false,
      view_transactions: true, view_games: true, control_games: false,
      view_agents: true, manage_agents: false,
      view_config: true, edit_config: false,
      manage_packs: false, manage_roles: false,
      view_reports: true, export_data: false, send_notifications: true,
    },
  },
];

const PERMISSION_GROUPS = [
  {
    group: "Dashboard & Overview",
    icon: "📊",
    perms: [
      { key: "view_dashboard",      label: "View Dashboard" },
      { key: "view_reports",        label: "View Reports" },
      { key: "export_data",         label: "Export Data" },
    ],
  },
  {
    group: "User Management",
    icon: "👥",
    perms: [
      { key: "view_users",          label: "View Users" },
      { key: "edit_users",          label: "Edit Users" },
      { key: "ban_users",           label: "Ban / Unban Users" },
      { key: "gift_diamonds",       label: "Gift Diamonds" },
      { key: "deduct_diamonds",     label: "Deduct Diamonds" },
    ],
  },
  {
    group: "Deposits",
    icon: "💳",
    perms: [
      { key: "view_deposits",       label: "View Deposits" },
      { key: "approve_deposits",    label: "Approve Deposits" },
      { key: "reject_deposits",     label: "Reject Deposits" },
    ],
  },
  {
    group: "Withdrawals",
    icon: "💸",
    perms: [
      { key: "view_withdrawals",    label: "View Withdrawals" },
      { key: "approve_withdrawals", label: "Approve Withdrawals" },
      { key: "reject_withdrawals",  label: "Reject Withdrawals" },
    ],
  },
  {
    group: "Transactions",
    icon: "📜",
    perms: [
      { key: "view_transactions",   label: "View Transactions" },
    ],
  },
  {
    group: "Games",
    icon: "🎮",
    perms: [
      { key: "view_games",          label: "View Games" },
      { key: "control_games",       label: "Control / Pause Games" },
    ],
  },
  {
    group: "Agents",
    icon: "🤝",
    perms: [
      { key: "view_agents",         label: "View Agents" },
      { key: "manage_agents",       label: "Manage Agents" },
    ],
  },
  {
    group: "Settings",
    icon: "⚙️",
    perms: [
      { key: "view_config",         label: "View Settings" },
      { key: "edit_config",         label: "Edit Settings" },
      { key: "manage_packs",        label: "Manage Diamond Packs" },
      { key: "manage_roles",        label: "Manage Roles" },
    ],
  },
  {
    group: "Communication",
    icon: "📢",
    perms: [
      { key: "send_notifications",  label: "Send Notifications" },
    ],
  },
];

const RoleManagement = ({ showToast }) => {
  const [roles, setRoles]             = useState(() => {
    const saved = DB.get("dp_roles");
    return saved || ROLE_PRESETS.map(r => ({ ...r }));
  });
  const [selectedRole, setSelectedRole] = useState(null);
  const [subAdmins, setSubAdmins]     = useState(() => DB.get("dp_sub_admins") || []);
  const [activeView, setActiveView]   = useState("roles"); // "roles" | "edit" | "assign"
  const [editingRole, setEditingRole] = useState(null);
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customForm, setCustomForm]   = useState({ name: "", icon: "🔧", color: "#b537f2", description: "" });
  const [assignPhone, setAssignPhone] = useState("");
  const [assignRoleId, setAssignRoleId] = useState("");

  const saveRoles = (updated) => {
    DB.set("dp_roles", updated);
    setRoles(updated);
  };

  const saveSubAdmins = (updated) => {
    DB.set("dp_sub_admins", updated);
    setSubAdmins(updated);
  };

  const openEdit = (role) => {
    setEditingRole({ ...role, permissions: { ...role.permissions } });
    setActiveView("edit");
  };

  const saveEditedRole = () => {
    if (!editingRole.name.trim()) { showToast("Role name required", "error"); return; }
    const updated = roles.map(r => r.id === editingRole.id ? editingRole : r);
    saveRoles(updated);
    showToast(`✅ "${editingRole.name}" saved!`, "success");
    setActiveView("roles");
  };

  const togglePerm = (key) => {
    if (editingRole?.fixed) return;
    setEditingRole(r => ({ ...r, permissions: { ...r.permissions, [key]: !r.permissions[key] } }));
  };

  const addCustomRole = () => {
    if (!customForm.name.trim()) { showToast("Enter role name", "error"); return; }
    const newRole = {
      id: `custom_${Date.now()}`,
      name: customForm.name.trim(),
      icon: customForm.icon || "🔧",
      color: customForm.color || "#b537f2",
      gradient: `linear-gradient(135deg,${customForm.color},#0a0a1a)`,
      description: customForm.description || "Custom role",
      fixed: false,
      permissions: Object.fromEntries(
        PERMISSION_GROUPS.flatMap(g => g.perms.map(p => [p.key, false]))
      ),
    };
    const updated = [...roles, newRole];
    saveRoles(updated);
    showToast(`✅ "${newRole.name}" created!`, "success");
    setCustomForm({ name: "", icon: "🔧", color: "#b537f2", description: "" });
    setShowAddCustom(false);
  };

  const deleteRole = (roleId) => {
    if (roles.find(r => r.id === roleId)?.fixed) { showToast("Cannot delete built-in role", "error"); return; }
    const updated = roles.filter(r => r.id !== roleId);
    saveRoles(updated);
    showToast("Role deleted", "success");
    setActiveView("roles");
  };

  const assignRole = () => {
    if (!assignPhone || !assignRoleId) { showToast("Enter phone and select role", "error"); return; }
    const allUsers = DB.get("dp_users") || [];
    const target = allUsers.find(u => u.phone === assignPhone && !u.isAdmin);
    if (!target) { showToast("User not found or is already admin", "error"); return; }
    const role = roles.find(r => r.id === assignRoleId);
    if (!role) return;
    const already = subAdmins.find(s => s.userId === target.id);
    let updated;
    if (already) {
      updated = subAdmins.map(s => s.userId === target.id ? { ...s, roleId: assignRoleId, roleName: role.name } : s);
    } else {
      updated = [...subAdmins, {
        id: `sa_${Date.now()}`, userId: target.id,
        name: target.name, phone: target.phone,
        roleId: assignRoleId, roleName: role.name,
        assignedAt: new Date().toISOString(),
      }];
    }
    saveSubAdmins(updated);
    showToast(`✅ ${role.icon} ${role.name} assigned to ${target.name}`, "success");
    setAssignPhone(""); setAssignRoleId("");
  };

  const revokeSubAdmin = (saId) => {
    saveSubAdmins(subAdmins.filter(s => s.id !== saId));
    showToast("Access revoked", "success");
  };

  const permCount = (role) => Object.values(role.permissions || {}).filter(Boolean).length;
  const totalPerms = PERMISSION_GROUPS.flatMap(g => g.perms).length;

  // ── EDIT ROLE VIEW
  if (activeView === "edit" && editingRole) {
    return (
      <div>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <button onClick={() => setActiveView("roles")} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "#fff", borderRadius: 10, width: 36, height: 36, cursor: "pointer", fontSize: 18 }}>←</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{editingRole.icon} {editingRole.name}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{permCount(editingRole)}/{totalPerms} permissions enabled</div>
          </div>
          {!editingRole.fixed && (
            <Btn sm variant="danger" onClick={() => deleteRole(editingRole.id)}>🗑️</Btn>
          )}
        </div>

        {/* Progress bar */}
        <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 99, marginBottom: 16, overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 99, background: editingRole.gradient || S.gradBlue, width: `${(permCount(editingRole) / totalPerms) * 100}%`, transition: "width 0.3s" }} />
        </div>

        {editingRole.fixed && (
          <div style={{ background: "rgba(255,215,0,0.08)", border: "1px solid rgba(255,215,0,0.25)", borderRadius: 12, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#ffd700" }}>
            👑 Super Admin permissions are locked and cannot be changed.
          </div>
        )}

        {/* Permission groups */}
        {PERMISSION_GROUPS.map(grp => (
          <div key={grp.group} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.5)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <span>{grp.icon}</span> {grp.group}
            </div>
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,0.07)" }}>
              {grp.perms.map((p, i) => {
                const enabled = !!editingRole.permissions?.[p.key];
                return (
                  <div key={p.key} onClick={() => togglePerm(p.key)} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "13px 14px",
                    borderBottom: i < grp.perms.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                    cursor: editingRole.fixed ? "default" : "pointer",
                    background: enabled ? "rgba(0,212,255,0.04)" : "transparent",
                    transition: "background 0.15s",
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: enabled ? "#fff" : "rgba(255,255,255,0.45)" }}>{p.label}</span>
                    {/* Toggle */}
                    <div style={{
                      width: 44, height: 24, borderRadius: 12, position: "relative",
                      background: enabled ? (editingRole.color || S.neonBlue) : "rgba(255,255,255,0.12)",
                      transition: "background 0.2s", flexShrink: 0,
                      opacity: editingRole.fixed ? 0.6 : 1,
                    }}>
                      <div style={{
                        position: "absolute", top: 3, left: enabled ? 22 : 3,
                        width: 18, height: 18, borderRadius: "50%", background: "#fff",
                        transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {!editingRole.fixed && (
          <Btn full variant="green" onClick={saveEditedRole} style={{ marginTop: 4, marginBottom: 20 }}>
            💾 Save Permissions
          </Btn>
        )}
      </div>
    );
  }

  // ── ROLES LIST VIEW
  return (
    <div>
      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 18, background: "rgba(255,255,255,0.04)", borderRadius: 14, padding: 4 }}>
        {[["roles","🏷️ Roles"], ["assign","👤 Assign"]].map(([v, l]) => (
          <button key={v} onClick={() => setActiveView(v)} style={{ flex: 1, background: activeView === v ? S.gradBlue : "transparent", border: "none", color: activeView === v ? "#fff" : "rgba(255,255,255,0.4)", borderRadius: 10, padding: "9px 4px", fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }}>{l}</button>
        ))}
      </div>

      {/* ── ROLES VIEW */}
      {activeView === "roles" && (
        <div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 14 }}>
            {roles.length} roles · Tap a role to edit permissions
          </div>

          {roles.map(role => (
            <div key={role.id} style={{ marginBottom: 12, borderRadius: 18, overflow: "hidden", border: `1px solid ${role.color}33`, background: `${role.color}08` }}>
              {/* Role header */}
              <div style={{ background: role.gradient, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 28 }}>{role.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 900, fontSize: 15, color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,0.4)" }}>{role.name}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", marginTop: 1 }}>{role.description}</div>
                </div>
                {role.fixed && <span style={{ fontSize: 10, background: "rgba(0,0,0,0.3)", borderRadius: 8, padding: "3px 8px", color: "rgba(255,255,255,0.7)", fontWeight: 700 }}>BUILT-IN</span>}
              </div>

              {/* Role body */}
              <div style={{ padding: "12px 14px" }}>
                {/* Permission summary pills */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
                  {PERMISSION_GROUPS.map(grp => {
                    const on = grp.perms.filter(p => role.permissions?.[p.key]);
                    if (on.length === 0) return null;
                    return (
                      <div key={grp.group} style={{ background: `${role.color}18`, border: `1px solid ${role.color}33`, borderRadius: 20, padding: "3px 10px", fontSize: 10, fontWeight: 700, color: role.color }}>
                        {grp.icon} {on.length}/{grp.perms.length}
                      </div>
                    );
                  })}
                </div>

                {/* Progress */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 99, background: role.gradient, width: `${(permCount(role) / totalPerms) * 100}%` }} />
                  </div>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", flexShrink: 0 }}>{permCount(role)}/{totalPerms}</span>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <Btn sm full variant="ghost" onClick={() => openEdit(role)}>
                    {role.fixed ? "👁️ View" : "✏️ Edit"} Permissions
                  </Btn>
                  {!role.fixed && (
                    <Btn sm variant="danger" onClick={() => deleteRole(role.id)}>🗑️</Btn>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Add Custom Role */}
          {showAddCustom ? (
            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: 16, marginBottom: 12 }}>
              <div style={{ fontWeight: 800, marginBottom: 12, color: S.neonBlue }}>🔧 Create Custom Role</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                <Input label="Role Name *" value={customForm.name} onChange={v => setCustomForm(f => ({ ...f, name: v }))} icon="🏷️" placeholder="e.g. Support Lead" />
                <div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>Icon (emoji)</div>
                  <input value={customForm.icon} onChange={e => setCustomForm(f => ({ ...f, icon: e.target.value }))} maxLength={2}
                    style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "11px 12px", color: "#fff", fontSize: 22, outline: "none", textAlign: "center", boxSizing: "border-box" }} />
                </div>
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>Role Color</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {["#ffd700","#00ff88","#00d4ff","#b537f2","#ff3d9a","#ff6b35","#ff6b6b","#fff"].map(c => (
                    <div key={c} onClick={() => setCustomForm(f => ({ ...f, color: c }))} style={{ width: 28, height: 28, borderRadius: "50%", background: c, cursor: "pointer", border: customForm.color === c ? "3px solid #fff" : "2px solid rgba(255,255,255,0.15)", flexShrink: 0, transition: "transform 0.15s", transform: customForm.color === c ? "scale(1.2)" : "scale(1)" }} />
                  ))}
                  <input type="color" value={customForm.color} onChange={e => setCustomForm(f => ({ ...f, color: e.target.value }))} style={{ width: 28, height: 28, borderRadius: "50%", border: "none", cursor: "pointer", background: "none", padding: 0 }} />
                </div>
              </div>
              <Input label="Description" value={customForm.description} onChange={v => setCustomForm(f => ({ ...f, description: v }))} icon="📝" placeholder="What this role can do..." />
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <Btn sm full variant="primary" onClick={addCustomRole}>✅ Create Role</Btn>
                <Btn sm full variant="ghost" onClick={() => setShowAddCustom(false)}>Cancel</Btn>
              </div>
            </div>
          ) : (
            <Btn full variant="ghost" onClick={() => setShowAddCustom(true)} style={{ marginBottom: 8 }}>
              ➕ Create Custom Role
            </Btn>
          )}

          <div style={{ background: "rgba(0,212,255,0.04)", border: "1px solid rgba(0,212,255,0.12)", borderRadius: 12, padding: "11px 14px" }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>
              💡 <strong style={{ color: "rgba(255,255,255,0.7)" }}>Custom permissions</strong> — toggle individual access per role.<br />
              Built-in roles (Super Admin) cannot be deleted.
            </div>
          </div>
        </div>
      )}

      {/* ── ASSIGN VIEW */}
      {activeView === "assign" && (
        <div>
          {/* Assign new */}
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 16, marginBottom: 18 }}>
            <div style={{ fontWeight: 800, marginBottom: 12 }}>➕ Assign Role to User</div>
            <Input label="User Mobile Number" value={assignPhone} onChange={setAssignPhone} icon="📱" placeholder="10-digit phone number" />
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>Select Role</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {roles.filter(r => !r.fixed).map(r => (
                  <div key={r.id} onClick={() => setAssignRoleId(r.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, border: `1px solid ${assignRoleId === r.id ? r.color : "rgba(255,255,255,0.08)"}`, background: assignRoleId === r.id ? `${r.color}12` : "rgba(255,255,255,0.02)", cursor: "pointer", transition: "all 0.15s" }}>
                    <span style={{ fontSize: 20 }}>{r.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: assignRoleId === r.id ? r.color : "#fff" }}>{r.name}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{permCount(r)} permissions</div>
                    </div>
                    <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${assignRoleId === r.id ? r.color : "rgba(255,255,255,0.2)"}`, background: assignRoleId === r.id ? r.color : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>
                      {assignRoleId === r.id && "✓"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <Btn full variant="green" onClick={assignRole}>🔑 Assign Role</Btn>
          </div>

          {/* Current sub-admins */}
          <div style={{ fontWeight: 800, marginBottom: 10 }}>🗂️ Active Role Assignments ({subAdmins.length})</div>
          {subAdmins.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px 20px", color: "rgba(255,255,255,0.25)", fontSize: 14 }}>
              No role assignments yet.<br />Assign a role to a user above.
            </div>
          ) : subAdmins.map(sa => {
            const role = roles.find(r => r.id === sa.roleId);
            return (
              <Card key={sa.id} style={{ marginBottom: 10, border: `1px solid ${role?.color || S.neonBlue}33` }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ width: 44, height: 44, borderRadius: "50%", background: role?.gradient || S.gradBlue, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{role?.icon || "🔑"}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>{sa.name}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>📱 {sa.phone}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: role?.color || S.neonBlue, background: `${role?.color || S.neonBlue}18`, border: `1px solid ${role?.color || S.neonBlue}33`, borderRadius: 20, padding: "2px 8px" }}>{role?.icon} {sa.roleName}</span>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>Since {new Date(sa.assignedAt).toLocaleDateString("en-IN")}</span>
                    </div>
                  </div>
                  <Btn sm variant="danger" onClick={() => revokeSubAdmin(sa.id)}>Revoke</Btn>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── ADMIN SUPPORT SYSTEM ──────────────────────────────────────────────────────
const AdminSupport = ({ showToast, onBack }) => {
  const [tick, setTick]           = useState(0);
  const [tab, setTab]             = useState("tickets");
  const [ticketFilter, setTicketFilter] = useState("open");
  const [complaintFilter, setComplaintFilter] = useState("open");
  const [replyDrafts, setReplyDrafts] = useState({});
  const [cfg, setCfg]             = useState(DB.get("dp_platform_config") || {});

  const tickets    = DB.get("dp_support_tickets") || [];
  const complaints = DB.get("dp_complaints") || [];

  const TABS = [
    { id: "tickets",    label: "🎫 Tickets" },
    { id: "chat",       label: "💬 Live Chat" },
    { id: "whatsapp",   label: "🟢 WhatsApp" },
    { id: "email",      label: "✉️ Email" },
    { id: "complaints", label: "⚠️ Complaints" },
  ];

  const statusColor   = { open: S.neonGold, in_progress: S.neonBlue, resolved: S.neonGreen, investigating: S.neonPurple };
  const priorityColor = { high: "#ff6b6b", medium: S.neonGold, low: "rgba(255,255,255,0.4)" };
  const channelIcon   = { ticket: "🎫", whatsapp: "🟢", email: "✉️", chat: "💬" };

  const saveTickets    = (updated) => { DB.set("dp_support_tickets", updated); setTick(k => k + 1); };
  const saveComplaints = (updated) => { DB.set("dp_complaints", updated); setTick(k => k + 1); };
  const saveCfg        = (next) => { setCfg(next); DB.set("dp_platform_config", next); };

  const setTicketStatus = (id, status) => {
    saveTickets(tickets.map(t => t.id === id ? { ...t, status } : t));
    showToast(`Ticket marked ${status.replace("_", " ")}`, "success");
  };

  const sendReply = (id) => {
    const text = (replyDrafts[id] || "").trim();
    if (!text) return;
    saveTickets(tickets.map(t => t.id === id
      ? { ...t, status: t.status === "open" ? "in_progress" : t.status, unreadForUser: true, replies: [...(t.replies || []), { from: "admin", text, at: new Date().toISOString() }] }
      : t));
    setReplyDrafts(d => ({ ...d, [id]: "" }));
    showToast("Reply sent", "success");
  };

  const setComplaintStatus = (id, status) => {
    saveComplaints(complaints.map(c => c.id === id ? { ...c, status } : c));
    showToast(`Complaint marked ${status}`, "success");
  };

  const StatBox = ({ label, value, color }) => (
    <div style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${color}22`, borderRadius: 14, padding: "12px 10px", textAlign: "center" }}>
      <div style={{ fontSize: 18, fontWeight: 900, color }}>{value}</div>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", fontWeight: 600, marginTop: 2 }}>{label}</div>
    </div>
  );

  const ToggleRow = ({ label, desc, enabled, onToggle }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
      <div>
        <div style={{ fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{desc}</div>
      </div>
      <button onClick={onToggle} style={{ width: 52, height: 28, borderRadius: 14, background: enabled ? S.neonGreen : "rgba(255,255,255,0.15)", border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s" }}>
        <div style={{ position: "absolute", top: 4, left: enabled ? 28 : 4, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
      </button>
    </div>
  );

  const TicketCard = ({ t }) => (
    <Card style={{ marginBottom: 12, border: t.status === "open" ? `1px solid ${S.neonGold}44` : undefined }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14 }}>{channelIcon[t.channel] || "🎫"} {t.subject}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{t.userName} · 📱 {t.phone}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
          <Badge label={t.status.replace("_", " ")} color={statusColor[t.status] || S.neonBlue} />
          <span style={{ fontSize: 10, fontWeight: 700, color: priorityColor[t.priority] }}>{t.priority} priority</span>
        </div>
      </div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", marginBottom: 8 }}>{t.message}</div>
      {t.replies?.length > 0 && (
        <div style={{ background: "rgba(0,0,0,0.25)", borderRadius: 10, padding: "8px 10px", marginBottom: 8 }}>
          {t.replies.map((r, i) => (
            <div key={i} style={{ fontSize: 12, marginBottom: i < t.replies.length - 1 ? 6 : 0 }}>
              <b style={{ color: S.neonBlue }}>Admin:</b> <span style={{ color: "rgba(255,255,255,0.7)" }}>{r.text}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 10 }}>{timeAgo(t.createdAt)}</div>
      {t.status !== "resolved" ? (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input value={replyDrafts[t.id] || ""} onChange={e => setReplyDrafts(d => ({ ...d, [t.id]: e.target.value }))} placeholder="Type a reply…"
              style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "9px 12px", color: "#fff", fontSize: 13 }} />
            <Btn sm onClick={() => sendReply(t.id)}>Send</Btn>
          </div>
          <Btn full sm variant="green" onClick={() => setTicketStatus(t.id, "resolved")}>✅ Mark Resolved</Btn>
        </>
      ) : <div style={{ fontSize: 12, color: S.neonGreen }}>✅ Resolved</div>}
    </Card>
  );

  const ComplaintCard = ({ c }) => (
    <Card style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14 }}>⚠️ {c.category}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{c.userName} · 📱 {c.phone}</div>
        </div>
        <Badge label={c.status} color={statusColor[c.status] || S.neonBlue} />
      </div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", marginBottom: 8 }}>{c.message}</div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 10 }}>{timeAgo(c.createdAt)}</div>
      {c.status !== "resolved" && (
        <div style={{ display: "flex", gap: 8 }}>
          {c.status !== "investigating" && <Btn sm onClick={() => setComplaintStatus(c.id, "investigating")}>🔍 Investigate</Btn>}
          <Btn sm variant="green" onClick={() => setComplaintStatus(c.id, "resolved")}>✅ Resolve</Btn>
        </div>
      )}
    </Card>
  );

  const filteredTickets = tickets.filter(t => ticketFilter === "all" ? true : t.status === ticketFilter);
  const filteredComplaints = complaints.filter(c => complaintFilter === "all" ? true : c.status === complaintFilter);
  const chatTickets = tickets.filter(t => t.channel === "chat");
  const waTickets    = tickets.filter(t => t.channel === "whatsapp");
  const emailTickets = tickets.filter(t => t.channel === "email");

  return (
    <div style={S.page}>
      <TopBar title="🎧 Support System" onBack={onBack} />
      <div style={{ padding: "0 20px 24px" }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
          {TABS.map(tb => (
            <button key={tb.id} onClick={() => setTab(tb.id)} style={{ background: tab === tb.id ? S.gradBlue : "rgba(255,255,255,0.06)", border: "none", color: "#fff", borderRadius: 20, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>{tb.label}</button>
          ))}
        </div>

        {/* ── TICKETS ── */}
        {tab === "tickets" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
              <StatBox label="Open" value={tickets.filter(t => t.status === "open").length} color={S.neonGold} />
              <StatBox label="In Progress" value={tickets.filter(t => t.status === "in_progress").length} color={S.neonBlue} />
              <StatBox label="Resolved" value={tickets.filter(t => t.status === "resolved").length} color={S.neonGreen} />
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
              {["open", "in_progress", "resolved", "all"].map(f => (
                <button key={f} onClick={() => setTicketFilter(f)} style={{ background: ticketFilter === f ? S.gradBlue : "rgba(255,255,255,0.06)", border: "none", color: "#fff", borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", textTransform: "capitalize" }}>{f.replace("_", " ")}</button>
              ))}
            </div>
            {filteredTickets.length === 0
              ? <Card style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.35)" }}>No {ticketFilter.replace("_", " ")} tickets</Card>
              : filteredTickets.map(t => <TicketCard key={t.id} t={t} />)}
          </div>
        )}

        {/* ── LIVE CHAT ── */}
        {tab === "chat" && (
          <div>
            <ToggleRow label="Live Chat Widget" desc="Show in-app chat bubble to logged-in users" enabled={cfg.liveChatEnabled ?? true} onToggle={() => saveCfg({ ...cfg, liveChatEnabled: !(cfg.liveChatEnabled ?? true) })} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
              <StatBox label="Active Chats" value={chatTickets.filter(t => t.status !== "resolved").length} color={S.neonBlue} />
              <StatBox label="Resolved Today" value={chatTickets.filter(t => t.status === "resolved").length} color={S.neonGreen} />
            </div>
            {chatTickets.length === 0
              ? <Card style={{ textAlign: "center", padding: 30, color: "rgba(255,255,255,0.35)" }}>No live chat conversations yet</Card>
              : chatTickets.map(t => <TicketCard key={t.id} t={t} />)}
          </div>
        )}

        {/* ── WHATSAPP ── */}
        {tab === "whatsapp" && (
          <div>
            <ToggleRow label="WhatsApp Support" desc="Show WhatsApp contact button to users" enabled={cfg.whatsappEnabled ?? true} onToggle={() => saveCfg({ ...cfg, whatsappEnabled: !(cfg.whatsappEnabled ?? true) })} />
            <Input label="Support WhatsApp Number" value={cfg.supportWhatsapp || ""} onChange={v => saveCfg({ ...cfg, supportWhatsapp: v })} icon="🟢" placeholder="9198XXXXXXXX" />
            {cfg.supportWhatsapp && (
              <Btn full variant="green" style={{ marginBottom: 16 }} onClick={() => window.open(`https://wa.me/${cfg.supportWhatsapp.replace(/\D/g, "")}`, "_blank")}>🟢 Open WhatsApp Chat</Btn>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
              <StatBox label="Open Chats" value={waTickets.filter(t => t.status !== "resolved").length} color={S.neonGold} />
              <StatBox label="Resolved" value={waTickets.filter(t => t.status === "resolved").length} color={S.neonGreen} />
            </div>
            {waTickets.length === 0
              ? <Card style={{ textAlign: "center", padding: 30, color: "rgba(255,255,255,0.35)" }}>No WhatsApp queries yet</Card>
              : waTickets.map(t => <TicketCard key={t.id} t={t} />)}
          </div>
        )}

        {/* ── EMAIL ── */}
        {tab === "email" && (
          <div>
            <ToggleRow label="Email Support" desc="Show support email to users" enabled={cfg.emailSupportEnabled ?? true} onToggle={() => saveCfg({ ...cfg, emailSupportEnabled: !(cfg.emailSupportEnabled ?? true) })} />
            <Input label="Support Email" value={cfg.supportEmail || ""} onChange={v => saveCfg({ ...cfg, supportEmail: v })} icon="✉️" placeholder="support@diamondplay.in" />
            {cfg.supportEmail && (
              <Btn full style={{ marginBottom: 16 }} onClick={() => window.open(`mailto:${cfg.supportEmail}`, "_blank")}>✉️ Open Mail Client</Btn>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
              <StatBox label="Open" value={emailTickets.filter(t => t.status !== "resolved").length} color={S.neonGold} />
              <StatBox label="Resolved" value={emailTickets.filter(t => t.status === "resolved").length} color={S.neonGreen} />
            </div>
            {emailTickets.length === 0
              ? <Card style={{ textAlign: "center", padding: 30, color: "rgba(255,255,255,0.35)" }}>No email queries yet</Card>
              : emailTickets.map(t => <TicketCard key={t.id} t={t} />)}
          </div>
        )}

        {/* ── COMPLAINTS ── */}
        {tab === "complaints" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
              <StatBox label="Open" value={complaints.filter(c => c.status === "open").length} color={S.neonGold} />
              <StatBox label="Investigating" value={complaints.filter(c => c.status === "investigating").length} color={S.neonPurple} />
              <StatBox label="Resolved" value={complaints.filter(c => c.status === "resolved").length} color={S.neonGreen} />
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
              {["open", "investigating", "resolved", "all"].map(f => (
                <button key={f} onClick={() => setComplaintFilter(f)} style={{ background: complaintFilter === f ? S.gradBlue : "rgba(255,255,255,0.06)", border: "none", color: "#fff", borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", textTransform: "capitalize" }}>{f}</button>
              ))}
            </div>
            {filteredComplaints.length === 0
              ? <Card style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.35)" }}>No {complaintFilter} complaints</Card>
              : filteredComplaints.map(c => <ComplaintCard key={c.id} c={c} />)}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── ADMIN ANALYTICS ────────────────────────────────────────────────────────────
const AdminAnalytics = ({ onBack }) => {
  const [period, setPeriod] = useState("daily");

  const users      = DB.get("dp_users") || [];
  const txns       = DB.get("dp_transactions") || [];
  const realUsers  = users.filter(u => !u.isAdmin);

  const successDep  = txns.filter(t => t.type === "deposit"    && t.status === "success");
  const successWith = txns.filter(t => t.type === "withdrawal" && t.status === "success");
  const totalDeposits    = successDep.reduce((s, t) => s + t.amount, 0);
  const totalWithdrawals = successWith.reduce((s, t) => s + t.amount, 0);
  const totalRevenue     = Math.max(0, totalDeposits - totalWithdrawals);
  const avgRevenuePerUser = realUsers.length ? Math.round(totalRevenue / realUsers.length) : 0;

  const buildGraph = (p) => {
    const points = p === "daily" ? 7 : p === "weekly" ? 8 : 6;
    const msStep = p === "daily" ? 86400000 : p === "weekly" ? 7 * 86400000 : 30 * 86400000;
    const labels = [], depData = [], widData = [], usrData = [];
    for (let i = points - 1; i >= 0; i--) {
      const from = new Date(Date.now() - i * msStep);
      const to   = new Date(Date.now() - (i - 1) * msStep);
      const fromStr = from.toISOString().split("T")[0];
      const toStr   = to.toISOString().split("T")[0];
      labels.push(p === "daily" ? from.toLocaleDateString("en-IN", { weekday: "short" }) : p === "weekly" ? `W${points - i}` : from.toLocaleDateString("en-IN", { month: "short" }));
      depData.push(successDep.filter(t => t.date >= fromStr && t.date < toStr).reduce((s, t) => s + t.amount, 0));
      widData.push(successWith.filter(t => t.date >= fromStr && t.date < toStr).reduce((s, t) => s + t.amount, 0));
      usrData.push(realUsers.filter(u => (u.joinedAt || "") >= fromStr && (u.joinedAt || "") < toStr).length);
    }
    return { labels, depData, widData, usrData };
  };
  const graph  = buildGraph(period);
  const maxDep = Math.max(...graph.depData, 1);
  const maxUsr = Math.max(...graph.usrData, 1);

  const sevenDaysAgoIso = new Date(Date.now() - 7 * 86400000).toISOString();
  const eligible = realUsers.filter(u => u.joinedAt && u.joinedAt < sevenDaysAgoIso);
  const retained = eligible.filter(u => (u.lastLogin || "") >= sevenDaysAgoIso);
  const retentionRate = eligible.length ? Math.round((retained.length / eligible.length) * 100) : 0;

  const depositedUserIds = new Set(successDep.map(t => t.userId));
  const conversionRate = realUsers.length ? Math.round((depositedUserIds.size / realUsers.length) * 100) : 0;

  const gameLabels = { Color: "🎨 Color", Dice: "🎲 Dice", Number: "🔢 Number", Scratch: "🎟️ Scratch" };
  const gameCounts = {};
  txns.filter(t => t.type === "game_win" || t.type === "game_spend").forEach(t => {
    const key = (t.note || "").split(" ")[0];
    if (key) gameCounts[key] = (gameCounts[key] || 0) + 1;
  });
  const topGames = Object.entries(gameCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxGameCount = Math.max(...topGames.map(g => g[1]), 1);

  const agents = users.filter(u => u.isAgent);
  const referrerStats = agents.map(agent => {
    const refs = users.filter(u => u.referredBy === agent.referralCode);
    const refIds = new Set(refs.map(u => u.id));
    const dep = txns.filter(t => t.type === "deposit" && t.status === "success" && refIds.has(t.userId)).reduce((s, t) => s + t.amount, 0);
    return { name: agent.name, phone: agent.phone, referrals: refs.length, deposits: dep };
  }).sort((a, b) => b.deposits - a.deposits).slice(0, 5);

  const activeDaily = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86400000);
    const dayStr = day.toISOString().split("T")[0];
    const count = realUsers.filter(u => (u.lastLogin || u.joinedAt || "").startsWith(dayStr)).length;
    activeDaily.push({ label: day.toLocaleDateString("en-IN", { weekday: "short" }), count });
  }
  const maxActive = Math.max(...activeDaily.map(d => d.count), 1);

  const SectionTitle = ({ icon, text }) => (
    <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 10, letterSpacing: 1, textTransform: "uppercase" }}>{icon} {text}</div>
  );
  const StatBox = ({ label, value, color }) => (
    <div style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${color}22`, borderRadius: 14, padding: "14px 12px" }}>
      <div style={{ fontSize: 19, fontWeight: 900, color }}>{value}</div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, marginTop: 2 }}>{label}</div>
    </div>
  );
  const GaugeBox = ({ label, value, color, sub }) => (
    <div style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${color}22`, borderRadius: 14, padding: "14px 12px" }}>
      <div style={{ fontSize: 24, fontWeight: 900, color, marginBottom: 4 }}>{value}%</div>
      <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 99, height: 6, overflow: "hidden", marginBottom: 6 }}>
        <div style={{ width: `${value}%`, height: "100%", background: color, borderRadius: 99 }} />
      </div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{sub}</div>
    </div>
  );
  const LegendDot = ({ color, label }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
      <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />{label}
    </div>
  );

  return (
    <div style={S.page}>
      <TopBar title="📊 Analytics" onBack={onBack} />
      <div style={{ padding: "0 20px 24px" }}>

        {/* ── Revenue Analytics ── */}
        <SectionTitle icon="💹" text="Revenue Analytics" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
          <StatBox label="Total Revenue" value={fmtINR(totalRevenue)} color={S.neonGold} />
          <StatBox label="Avg Revenue / User" value={fmtINR(avgRevenuePerUser)} color={S.neonGreen} />
        </div>
        <div style={{ display: "flex", gap: 6, background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: 4, marginBottom: 14 }}>
          {[["daily", "📅 Daily"], ["weekly", "📆 Weekly"], ["monthly", "🗓️ Monthly"]].map(([k, l]) => (
            <button key={k} onClick={() => setPeriod(k)} style={{ flex: 1, padding: "8px 4px", borderRadius: 9, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 11, background: period === k ? S.gradBlue : "transparent", color: period === k ? "#fff" : "rgba(255,255,255,0.4)" }}>{l}</button>
          ))}
        </div>
        <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 16, padding: "16px 12px", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 90, marginBottom: 8 }}>
            {graph.labels.map((lbl, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <div style={{ width: "100%", display: "flex", gap: 2, alignItems: "flex-end", height: 80 }}>
                  <div style={{ flex: 1, background: S.neonGreen, borderRadius: "3px 3px 0 0", height: `${Math.max(4, (graph.depData[i] / maxDep) * 80)}px`, opacity: 0.85 }} />
                  <div style={{ flex: 1, background: S.neonPink, borderRadius: "3px 3px 0 0", height: `${Math.max(4, (graph.widData[i] / maxDep) * 80)}px`, opacity: 0.7 }} />
                </div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>{lbl}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
            <LegendDot color={S.neonGreen} label="Deposits" />
            <LegendDot color={S.neonPink} label="Withdrawals" />
          </div>
        </div>

        {/* ── User Growth ── */}
        <SectionTitle icon="✨" text="User Growth" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
          <StatBox label="Total Users" value={fmt(realUsers.length)} color={S.neonBlue} />
          <StatBox label="New This Period" value={fmt(graph.usrData.reduce((a, b) => a + b, 0))} color={S.neonPurple} />
        </div>
        <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 16, padding: "16px 12px", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 70, marginBottom: 8, position: "relative" }}>
            <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
              <polyline
                points={graph.usrData.map((v, i) => {
                  const x = (i / (graph.usrData.length - 1 || 1)) * 100;
                  const y = 100 - Math.max(4, (v / maxUsr) * 90);
                  return `${x}% ${y}%`;
                }).join(" ")}
                fill="none" stroke={S.neonBlue} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              />
              {graph.usrData.map((v, i) => {
                const x = (i / (graph.usrData.length - 1 || 1)) * 100;
                const y = 100 - Math.max(4, (v / maxUsr) * 90);
                return <circle key={i} cx={`${x}%`} cy={`${y}%`} r="4" fill={S.neonBlue} />;
              })}
            </svg>
            {graph.labels.map((lbl, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ height: 50 }} />
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 8 }}>{lbl}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: S.neonBlue }}>{graph.usrData[i]}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Retention & Conversion ── */}
        <SectionTitle icon="📈" text="Retention & Conversion" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
          <GaugeBox label="Retention Rate" value={retentionRate} color={S.neonGreen} sub="active in last 7 days" />
          <GaugeBox label="Conversion Rate" value={conversionRate} color={S.neonGold} sub="users who deposited" />
        </div>

        {/* ── Top Games ── */}
        <SectionTitle icon="🎮" text="Top Games" />
        <Card style={{ marginBottom: 20 }}>
          {topGames.length === 0
            ? <div style={{ textAlign: "center", padding: 20, color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No game activity yet</div>
            : topGames.map(([name, count], i) => (
              <div key={name} style={{ marginBottom: i < topGames.length - 1 ? 12 : 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                  <span style={{ fontWeight: 700 }}>{gameLabels[name] || name}</span>
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>{count} plays</span>
                </div>
                <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 99, height: 7, overflow: "hidden" }}>
                  <div style={{ width: `${(count / maxGameCount) * 100}%`, height: "100%", background: S.gradBlue, borderRadius: 99 }} />
                </div>
              </div>
            ))}
        </Card>

        {/* ── Top Referrers ── */}
        <SectionTitle icon="🤝" text="Top Referrers" />
        {referrerStats.length === 0
          ? <Card style={{ textAlign: "center", padding: 20, color: "rgba(255,255,255,0.3)", fontSize: 13, marginBottom: 20 }}>No agent referrals yet</Card>
          : referrerStats.map((r, i) => (
            <Card key={i} style={{ marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14 }}>#{i + 1} {r.name}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>📱 {r.phone} · {r.referrals} referrals</div>
              </div>
              <div style={{ fontWeight: 800, color: S.neonGold }}>{fmtINR(r.deposits)}</div>
            </Card>
          ))}

        {/* ── Active Users Chart ── */}
        <SectionTitle icon="🟢" text="Active Users (7 days)" />
        <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 16, padding: "16px 12px" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80 }}>
            {activeDaily.map((d, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: S.neonBlue }}>{d.count}</div>
                <div style={{ width: "100%", background: S.neonBlue, borderRadius: "3px 3px 0 0", height: `${Math.max(4, (d.count / maxActive) * 60)}px`, opacity: 0.85 }} />
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>{d.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── ADMIN CONFIG (with Roles tab) ────────────────────────────────────────────
const AdminConfig = ({ showToast }) => {
  const [cfg, setCfg] = useState(DB.get("dp_platform_config") || {});
  const [packs, setPacks] = useState(DB.get("dp_diamond_packs") || []);
  const [tab, setTab] = useState("general");
  const [editPack, setEditPack] = useState(null);

  const saveCfg = () => {
    DB.set("dp_platform_config", cfg);
    showToast("Settings saved!", "success");
  };

  const savePacks = () => {
    DB.set("dp_diamond_packs", packs);
    showToast("Diamond packs updated!", "success");
  };

  const updatePack = (id, field, val) => {
    setPacks(prev => prev.map(p => p.id === id ? { ...p, [field]: field === "popular" ? val : (isNaN(val) ? val : Number(val)) } : p));
  };

  const addPack = () => {
    const newPack = { id: `p_${Date.now()}`, diamonds: 100, price: 100, bonus: 0, popular: false, label: "New Pack" };
    setPacks(prev => [...prev, newPack]);
    setEditPack(newPack.id);
  };

  const deletePack = (id) => { setPacks(prev => prev.filter(p => p.id !== id)); };

  const TABS = [
    { id: "general",    label: "⚙️ General" },
    { id: "roles",      label: "🛡️ Roles" },
    { id: "payment",    label: "💳 Payment" },
    { id: "games",      label: "🎮 Games" },
    { id: "color",      label: "🎨 Color" },
    { id: "packs",      label: "💎 Packs" },
    { id: "tournament", label: "🏆 Tournament" },
  ];

  return (
    <div style={S.page}>
      <TopBar title="⚙️ App Settings" />
      <div style={{ padding: "0 20px" }}>

        {/* Scrollable tab bar */}
        <div style={{ display: "flex", gap: 6, marginBottom: 18, overflowX: "auto", paddingBottom: 4 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              background: tab === t.id ? S.gradBlue : "rgba(255,255,255,0.06)",
              border: "none", color: "#fff", borderRadius: 20,
              padding: "7px 14px", fontSize: 12, fontWeight: 700,
              cursor: "pointer", whiteSpace: "nowrap",
            }}>{t.label}</button>
          ))}
        </div>

        {/* ── GENERAL ── */}
        {tab === "general" && (
          <div>
            <Input label="Site Name" value={cfg.siteName || ""} onChange={v => setCfg(c => ({ ...c, siteName: v }))} icon="🏷️" />
            <Input label="Banner Text" value={cfg.bannerText || ""} onChange={v => setCfg(c => ({ ...c, bannerText: v }))} icon="📢" />
            <Input label="Welcome Bonus (Diamonds)" value={String(cfg.welcomeBonus || 50)} onChange={v => setCfg(c => ({ ...c, welcomeBonus: Number(v) }))} type="number" icon="🎁" />
            <Input label="Daily Reward (Diamonds)" value={String(cfg.dailyReward || 25)} onChange={v => setCfg(c => ({ ...c, dailyReward: Number(v) }))} type="number" icon="📅" />
            {/* Maintenance toggle */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
              <div>
                <div style={{ fontWeight: 700 }}>Maintenance Mode</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Disable user access temporarily</div>
              </div>
              <button onClick={() => setCfg(c => ({ ...c, maintenanceMode: !c.maintenanceMode }))} style={{ width: 52, height: 28, borderRadius: 14, background: cfg.maintenanceMode ? S.neonPink : "rgba(255,255,255,0.15)", border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s" }}>
                <div style={{ position: "absolute", top: 4, left: cfg.maintenanceMode ? 28 : 4, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
              </button>
            </div>
            <Btn full variant="green" onClick={saveCfg}>💾 Save General Settings</Btn>
          </div>
        )}

        {/* ── ROLES ── */}
        {tab === "roles" && <RoleManagement showToast={showToast} />}

        {/* ── PAYMENT ── */}
        {tab === "payment" && (
          <div>
            <Input label="UPI ID" value={cfg.upiId || ""} onChange={v => setCfg(c => ({ ...c, upiId: v }))} icon="📲" placeholder="yourapp@upi" />
            <Input label="UPI Name (shown to users)" value={cfg.upiName || ""} onChange={v => setCfg(c => ({ ...c, upiName: v }))} icon="🏷️" />
            <Input label="Minimum Deposit (₹)" value={String(cfg.minDeposit || 100)} onChange={v => setCfg(c => ({ ...c, minDeposit: Number(v) }))} type="number" icon="⬇️" />
            <Input label="Minimum Withdrawal (Diamonds)" value={String(cfg.minWithdraw || 200)} onChange={v => setCfg(c => ({ ...c, minWithdraw: Number(v) }))} type="number" icon="⬆️" />
            <Input label="Withdrawal Fee (%)" value={String(cfg.withdrawFeePercent || 5)} onChange={v => setCfg(c => ({ ...c, withdrawFeePercent: Number(v) }))} type="number" icon="💸" />
            <Card style={{ background: "rgba(255,215,0,0.05)", marginBottom: 14 }}>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>💡 For real payment gateway, integrate Razorpay/Cashfree API keys here.</div>
            </Card>
            <Btn full variant="green" onClick={saveCfg}>💾 Save Payment Settings</Btn>
          </div>
        )}

        {/* ── GAMES ── */}
        {tab === "games" && (
          <div>
            <Input label="Game Cost (Diamonds per game)" value={String(cfg.gameCost || 5)} onChange={v => setCfg(c => ({ ...c, gameCost: Number(v) }))} type="number" icon="🎮" />
            <Input label="Scratch Card Cost (Diamonds)" value={String(cfg.scratchCost || 10)} onChange={v => setCfg(c => ({ ...c, scratchCost: Number(v) }))} type="number" icon="🃏" />
            <Card style={{ background: "rgba(0,212,255,0.05)", marginBottom: 14 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Game Multipliers</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Color Prediction: Red/Green = 2x, Violet = 4.5x<br />Dice: Exact = 6x<br />Number: Exact = 9x, ±1 = 1.6x</div>
            </Card>
            <Btn full variant="green" onClick={saveCfg}>💾 Save Game Settings</Btn>
          </div>
        )}

        {/* ── COLOR ── */}
        {tab === "color" && <AdminColorControl showToast={showToast} />}

        {/* ── PACKS ── */}
        {tab === "packs" && (
          <div>
            {packs.map(p => (
              <Card key={p.id} style={{ marginBottom: 10 }}>
                {editPack === p.id ? (
                  <div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <Input label="Label" value={p.label} onChange={v => updatePack(p.id, "label", v)} />
                      <Input label="Price ₹" value={String(p.price)} onChange={v => updatePack(p.id, "price", v)} type="number" />
                      <Input label="Diamonds" value={String(p.diamonds)} onChange={v => updatePack(p.id, "diamonds", v)} type="number" />
                      <Input label="Bonus 💎" value={String(p.bonus)} onChange={v => updatePack(p.id, "bonus", v)} type="number" />
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10 }}>
                      <label style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Popular:</label>
                      <input type="checkbox" checked={p.popular} onChange={e => updatePack(p.id, "popular", e.target.checked)} />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Btn sm full variant="green" onClick={() => { savePacks(); setEditPack(null); }}>✓ Save</Btn>
                      <Btn sm full variant="ghost" onClick={() => setEditPack(null)}>Cancel</Btn>
                      <Btn sm variant="danger" onClick={() => { deletePack(p.id); setEditPack(null); }}>🗑️</Btn>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{p.label} {p.popular && <Badge label="Popular" color={S.neonGold} />}</div>
                      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>{fmt(p.diamonds + p.bonus)}💎 · {fmtINR(p.price)}</div>
                    </div>
                    <Btn sm variant="ghost" onClick={() => setEditPack(p.id)}>✏️ Edit</Btn>
                  </div>
                )}
              </Card>
            ))}
            <Btn full variant="primary" onClick={addPack} style={{ marginBottom: 10 }}>+ Add New Pack</Btn>
            <Btn full variant="green" onClick={savePacks}>💾 Save All Packs</Btn>
          </div>
        )}

        {/* ── TOURNAMENT ── */}
        {tab === "tournament" && <TournamentManagement cfg={cfg} setCfg={setCfg} saveCfg={saveCfg} showToast={showToast} />}
      </div>
    </div>
  );
};

// ─── TOURNAMENT MANAGEMENT (Admin Settings → Tournament tab) ─────────────────
// Lets the admin turn the weekly tournament on/off overall, enable/disable each
// individual game's participation in it, and see the live standings across
// every game at a glance.
const ALL_GAMES = [
  { id: "color",   name: "Color Prediction", emoji: "🎨" },
  { id: "dice",    name: "Dice Roll",        emoji: "🎲" },
  { id: "number",  name: "Number Pick",      emoji: "🔢" },
  { id: "scratch", name: "Scratch Card",     emoji: "🃏" },
];

const TournamentManagement = ({ cfg, setCfg, saveCfg, showToast }) => {
  const [tourTime] = useState(getTournamentInfo());
  const gameTournaments = cfg.gameTournaments || { color: true, dice: true, number: true, scratch: true };
  const prizes = cfg.tournamentPrizes && cfg.tournamentPrizes.length
    ? cfg.tournamentPrizes
    : TOURNAMENT_PRIZES.map(p => ({ ...p, active: true }));
  const topPlayers = (DB.get("dp_users") || []).filter(u => !u.isAdmin).sort((a, b) => b.gamesPlayed - a.gamesPlayed).slice(0, 5);
  const medals = ["🥇", "🥈", "🥉"];

  const toggleOverall = () => {
    const next = { ...cfg, tournamentEnabled: !cfg.tournamentEnabled };
    setCfg(next);
    DB.set("dp_platform_config", next);
    showToast(next.tournamentEnabled ? "Tournament enabled" : "Tournament disabled", next.tournamentEnabled ? "success" : "info");
  };

  const toggleGame = (gameId) => {
    const nextGT = { ...gameTournaments, [gameId]: !gameTournaments[gameId] };
    const next = { ...cfg, gameTournaments: nextGT };
    setCfg(next);
    DB.set("dp_platform_config", next);
    showToast(`${ALL_GAMES.find(g => g.id === gameId)?.name} ${nextGT[gameId] ? "added to" : "removed from"} tournament`, "success");
  };

  const updatePrizeAmount = (rank, val) => {
    const n = val === "" ? "" : Math.max(0, Number(val) || 0);
    setCfg(c => ({ ...c, tournamentPrizes: prizes.map(p => p.rank === rank ? { ...p, prize: n } : p) }));
  };

  const togglePrizeActive = (rank) => {
    setCfg(c => ({ ...c, tournamentPrizes: prizes.map(p => p.rank === rank ? { ...p, active: !p.active } : p) }));
  };

  const savePrizes = () => {
    const cleaned = prizes.map(p => ({ ...p, prize: Number(p.prize) || 0 }));
    const next = { ...cfg, tournamentPrizes: cleaned };
    setCfg(next);
    DB.set("dp_platform_config", next);
    showToast("Prize distribution saved!", "success");
  };

  return (
    <div>
      <Card style={{ marginBottom: 14, background: "rgba(255,215,0,0.06)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>🏆 Weekly Tournament</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Resets every Monday · {tourTime.daysLeft}d {tourTime.hoursLeft}h {tourTime.minsLeft}m left</div>
          </div>
          <button onClick={toggleOverall} style={{ width: 52, height: 28, borderRadius: 14, background: cfg.tournamentEnabled ? S.neonGreen : "rgba(255,255,255,0.15)", border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
            <div style={{ position: "absolute", top: 4, left: cfg.tournamentEnabled ? 28 : 4, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
          </button>
        </div>
      </Card>

      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>🎮 All Games</div>
      {ALL_GAMES.map(g => (
        <Card key={g.id} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 24 }}>{g.emoji}</div>
              <div>
                <div style={{ fontWeight: 700 }}>{g.name}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{gameTournaments[g.id] ? "✅ Counts toward tournament" : "🚫 Excluded from tournament"}</div>
              </div>
            </div>
            <button onClick={() => toggleGame(g.id)} style={{ width: 48, height: 26, borderRadius: 13, background: gameTournaments[g.id] ? S.neonBlue : "rgba(255,255,255,0.15)", border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
              <div style={{ position: "absolute", top: 3, left: gameTournaments[g.id] ? 25 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
            </button>
          </div>
        </Card>
      ))}

      <div style={{ fontSize: 14, fontWeight: 800, margin: "16px 0 10px" }}>🥇 Prize Distribution</div>
      <Card style={{ marginBottom: 6, background: "rgba(0,212,255,0.05)" }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>💡 Set how many diamonds each rank wins. Turn a rank OFF to skip paying it out this week.</div>
      </Card>
      {prizes.map(p => (
        <Card key={p.rank} style={{ marginBottom: 10, opacity: p.active ? 1 : 0.5 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: p.active ? 10 : 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{p.label}</div>
            <button onClick={() => togglePrizeActive(p.rank)} style={{ width: 48, height: 26, borderRadius: 13, background: p.active ? S.neonGreen : "rgba(255,255,255,0.15)", border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
              <div style={{ position: "absolute", top: 3, left: p.active ? 25 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
            </button>
          </div>
          {p.active && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="number" min="0" value={p.prize}
                onChange={e => updatePrizeAmount(p.rank, e.target.value)}
                style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: "10px 12px", color: "#fff", fontSize: 15, fontWeight: 700, outline: "none" }}
              />
              <span style={{ color: p.color, fontWeight: 800 }}>💎</span>
            </div>
          )}
        </Card>
      ))}
      <Btn full variant="green" onClick={savePrizes} style={{ marginBottom: 16 }}>💾 Save Prize Distribution</Btn>

      <div style={{ fontSize: 14, fontWeight: 800, margin: "16px 0 10px" }}>📊 Live Standings (Top 5)</div>
      {topPlayers.length === 0
        ? <Card style={{ textAlign: "center", padding: 24, color: "rgba(255,255,255,0.35)" }}>No players yet</Card>
        : topPlayers.map((p, i) => (
          <Card key={p.id} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 18, width: 24 }}>{medals[i] || `#${i + 1}`}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{p.gamesPlayed} games played</div>
              </div>
              <div style={{ fontWeight: 800, color: S.neonGold }}>💎{fmt(p.diamonds)}</div>
            </div>
          </Card>
        ))}
    </div>
  );
};

// ─── NOTIFICATION PANEL ───────────────────────────────────────────────────────
const NotifPanel = ({ open, onClose, userId }) => {
  const [notifs, setNotifs] = useState([]);
  useEffect(() => {
    if (open) {
      const txns = (DB.get("dp_transactions") || []).filter(t => t.userId === userId && (t.type === "bonus" || t.type === "deposit" || t.type === "withdrawal")).slice(0, 15);
      setNotifs(txns);
    }
  }, [open, userId]);
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 500 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "85%", maxWidth: 360, background: "#13132e", padding: 20, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>🔔 Activity</div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "#fff", borderRadius: 50, width: 32, height: 32, cursor: "pointer" }}>✕</button>
        </div>
        {notifs.length === 0
          ? <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)" }}>No recent activity</div>
          : notifs.map(n => (
            <div key={n.id} style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: 22 }}>{n.type === "deposit" ? "💰" : n.type === "withdrawal" ? "⬆️" : "🎁"}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{n.note}</div>
                <div style={{ fontSize: 12, color: n.diamonds > 0 ? S.neonGreen : "#ff6b6b", marginBottom: 2 }}>{n.diamonds > 0 ? "+" : ""}{n.diamonds}💎</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{timeAgo(n.date)}</div>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
};

// ─── SPLASH SCREEN (logo + name intro animation) ──────────────────────────────
const SplashScreen = () => {
  const cfg = DB.get("dp_platform_config") || {};
  const siteName = cfg.siteName || "DiamondPlay";
  return (
    <div style={{
      minHeight: "100vh", background: "radial-gradient(ellipse at 50% 40%,#1a0a3e 0%,#0a0a1a 75%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", width: 280, height: 280, borderRadius: "50%",
        background: "radial-gradient(#b537f233,transparent)", animation: "splashGlow 2.2s ease-in-out infinite",
      }} />
      <div style={{ fontSize: 92, filter: "drop-shadow(0 0 30px #b537f2)", animation: "splashLogo 1s cubic-bezier(.34,1.56,.64,1) both", position: "relative", zIndex: 1 }}>💎</div>
      <div style={{ display: "flex", marginTop: 14, position: "relative", zIndex: 1 }}>
        {siteName.split("").map((ch, i) => (
          <span key={i} style={{
            fontSize: 32, fontWeight: 900, background: S.gradBlue, WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent", display: "inline-block",
            animation: `splashLetter 0.5s ease both`, animationDelay: `${0.5 + i * 0.05}s`,
          }}>{ch === " " ? "\u00A0" : ch}</span>
        ))}
      </div>
      <div style={{
        color: S.neonGold, fontSize: 12, fontWeight: 700, letterSpacing: 4, marginTop: 10,
        opacity: 0, animation: "fadeIn 0.6s ease both", animationDelay: `${0.5 + siteName.length * 0.05 + 0.3}s`,
        position: "relative", zIndex: 1,
      }}>PLAY • WIN • EARN</div>
    </div>
  );
};

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════════
// ─── AGENT HOME PAGE (Image 1 style) ─────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
const AgentHomePage = ({ user, setPage, showToast }) => {
  const allUsers = DB.get("dp_users") || [];
  const allTxns  = DB.get("dp_transactions") || [];
  const cfg      = DB.get("dp_platform_config") || {};
  const commPct  = user.customCommissionPercent ?? cfg.agentCommissionPercent ?? 10;

  // Direct referrals (1st level)
  const directs = allUsers.filter(u => u.referredBy === user.referralCode && !u.isAdmin);

  // Today
  const today = new Date().toISOString().split("T")[0];

  const directStats = {
    registered: directs.length,
    depositCount: allTxns.filter(t => directs.some(d => d.id === t.userId) && t.type === "deposit" && t.status === "success").length,
    depositAmount: allTxns.filter(t => directs.some(d => d.id === t.userId) && t.type === "deposit" && t.status === "success").reduce((s,t) => s + t.amount, 0),
    firstDeposit: directs.filter(u => allTxns.some(t => t.userId === u.id && t.type === "deposit" && t.status === "success")).length,
  };

  // Commission
  const commTxns   = allTxns.filter(t => t.userId === user.id && t.type === "agent_commission");
  const payoutTxns = allTxns.filter(t => t.userId === user.id && t.type === "agent_payout");
  const totalComm  = commTxns.reduce((s,t) => s + (t.diamonds||0), 0);
  const totalPaid  = payoutTxns.reduce((s,t) => s + (t.diamonds||0), 0);
  const pending    = totalComm - totalPaid;

  // Yesterday commission
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  const yestComm = commTxns.filter(t => t.date?.startsWith(yesterday)).reduce((s,t) => s + (t.diamonds||0), 0);

  // This week
  const weekAgo = new Date(Date.now() - 7*86400000).toISOString();
  const weekComm = commTxns.filter(t => t.date >= weekAgo).reduce((s,t) => s + (t.diamonds||0), 0);

  const copyCode = () => {
    navigator.clipboard?.writeText(user.referralCode).catch(()=>{});
    showToast("✅ Referral code copied!", "success");
  };
  const copyLink = () => {
    const link = `${window.location.origin}${window.location.pathname}?ref=${user.referralCode}`;
    navigator.clipboard?.writeText(link).catch(()=>{});
    showToast("✅ Invite link copied!", "success");
  };

  const menuItems = [
    { icon: "👥", label: "Subordinate data", page: "agent_subordinates" },
    { icon: "💰", label: "Commission detail", page: null, info: `💎${totalComm} earned · 💎${pending} pending` },
    { icon: "📋", label: "Invitation rules", page: null, info: `${commPct}% commission rate` },
    { icon: "🎧", label: "Agent customer service", page: null, info: "Contact admin" },
    { icon: "📊", label: "Rebate ratio", page: null, info: `Your rate: ${commPct}%` },
  ];

  return (
    <div style={{ ...S.page, background: "#f5f5f5", color: "#222" }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg,#ff6b6b,#ff3d9a)", padding: "0 0 0 0", borderRadius: "0 0 0 0" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "16px 20px 0" }}>
          <button onClick={() => setPage("profile")} style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.25)", border: "none", color: "#fff", fontSize: 17, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, flexShrink: 0 }}>‹</button>
          <div style={{ fontWeight: 800, fontSize: 18, color: "#fff", flex: 1, textAlign: "center" }}>Referral Agent</div>
          <div style={{ width: 34 }} />
        </div>

        {/* Yesterday commission banner */}
        <div style={{ textAlign: "center", padding: "20px 20px 0" }}>
          <div style={{ fontSize: 42, fontWeight: 900, color: "#fff" }}>💎{yestComm}</div>
          <div style={{ display: "inline-block", background: "rgba(255,255,255,0.2)", borderRadius: 20, padding: "4px 16px", marginTop: 6, fontSize: 13, color: "#fff", fontWeight: 600 }}>
            Yesterday's total commission
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", marginTop: 6, marginBottom: 16 }}>
            Commission rate: {commPct}% on referred users' losses
          </div>
        </div>

        {/* Direct vs Team tabs */}
        <div style={{ display: "flex", background: "#fff", margin: "0 16px", borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
          {[
            { label: "Direct subordinates", stats: directStats },
            { label: "Team subordinates",   stats: directStats }, // same for now
          ].map((col, ci) => (
            <div key={ci} style={{ flex: 1, padding: "14px 10px", borderRight: ci === 0 ? "1px solid #eee" : "none" }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: "#ff5a5a", textAlign: "center", marginBottom: 10 }}>{col.label}</div>
              {[
                ["Number of register",             col.stats.registered],
                ["Deposit number",                 col.stats.depositCount,  true],
                ["Deposit amount",                 `₹${col.stats.depositAmount}`, true],
                ["People making first deposit",    col.stats.firstDeposit],
              ].map(([lbl, val, green]) => (
                <div key={lbl} style={{ textAlign: "center", marginBottom: 8 }}>
                  <div style={{ fontWeight: 800, fontSize: 17, color: green ? "#22c55e" : "#222" }}>{val}</div>
                  <div style={{ fontSize: 10, color: "#888" }}>{lbl}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: "14px 16px", background: "#f5f5f5" }}>
        {/* Invitation Link Button */}
        <div onClick={copyLink} style={{ background: "linear-gradient(135deg,#ff6b6b,#ff3d9a)", borderRadius: 30, padding: "14px", textAlign: "center", fontWeight: 800, fontSize: 15, color: "#fff", cursor: "pointer", marginBottom: 16, letterSpacing: 1, boxShadow: "0 4px 16px rgba(255,61,154,0.35)" }}>
          🔗 INVITATION LINK
        </div>

        {/* Copy invitation code */}
        <div style={{ background: "#fff", borderRadius: 14, marginBottom: 10, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div onClick={copyCode} style={{ display: "flex", alignItems: "center", padding: "16px 16px", cursor: "pointer", borderBottom: "1px solid #f0f0f0" }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#ff6b6b,#ff3d9a)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, marginRight: 12 }}>📋</div>
            <div style={{ flex: 1, fontWeight: 600, fontSize: 14, color: "#222" }}>Copy invitation code</div>
            <div style={{ color: "#888", fontSize: 13, marginRight: 8 }}>{user.referralCode}</div>
            <span style={{ fontSize: 18, color: "#aaa" }}>⧉</span>
          </div>

          {/* Menu Items */}
          {menuItems.map((item, i) => (
            <div key={i} onClick={() => item.page ? setPage(item.page) : showToast(item.info, "info")}
              style={{ display: "flex", alignItems: "center", padding: "16px 16px", cursor: "pointer", borderBottom: i < menuItems.length-1 ? "1px solid #f0f0f0" : "none" }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#ff6b6b,#ff3d9a)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, marginRight: 12 }}>{item.icon}</div>
              <div style={{ flex: 1, fontWeight: 600, fontSize: 14, color: "#222" }}>{item.label}</div>
              {item.info && <div style={{ fontSize: 11, color: "#aaa", marginRight: 6 }}>{item.info}</div>}
              <span style={{ fontSize: 18, color: "#bbb" }}>›</span>
            </div>
          ))}
        </div>

        {/* Promotion data */}
        <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#ff6b6b,#ff3d9a)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>📣</div>
            <div style={{ fontWeight: 800, fontSize: 15, color: "#222" }}>promotion data</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              ["This Week",                    `💎${weekComm}`],
              ["Total commission",             `💎${totalComm}`],
              ["Direct subordinate",           directs.length],
              ["Total subordinates in team",   directs.length],
            ].map(([lbl, val]) => (
              <div key={lbl} style={{ textAlign: "center", padding: "10px 0" }}>
                <div style={{ fontWeight: 900, fontSize: 20, color: "#222" }}>{val}</div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 3 }}>{lbl}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ─── AGENT SUBORDINATES PAGE (Image 2 style) ─────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
const AgentSubordinatesPage = ({ user, setPage, showToast }) => {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split("T")[0]);

  const allUsers = DB.get("dp_users") || [];
  const allTxns  = DB.get("dp_transactions") || [];

  const directs = allUsers.filter(u => u.referredBy === user.referralCode && !u.isAdmin);
  const filtered = directs.filter(u =>
    !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.id.includes(search) || u.phone.includes(search)
  );

  // Aggregate stats for the whole group
  const groupTxns = allTxns.filter(t => directs.some(d => d.id === t.userId));
  const depositTxns = groupTxns.filter(t => t.type === "deposit" && t.status === "success");
  const gameTxns   = groupTxns.filter(t => t.type === "game_spend");
  const stats = {
    depositCount: depositTxns.length,
    depositAmount: depositTxns.reduce((s,t) => s + t.amount, 0),
    bettors: new Set(gameTxns.map(t => t.userId)).size,
    totalBet: gameTxns.reduce((s,t) => s + Math.abs(t.diamonds||0), 0),
    firstDepositPeople: directs.filter(u => depositTxns.some(t => t.userId === u.id)).length,
    firstDepositAmount: depositTxns.reduce((s,t,_,arr) => {
      const first = arr.filter(x => x.userId === t.userId).sort((a,b) => a.date.localeCompare(b.date))[0];
      return first?.id === t.id ? s + t.amount : s;
    }, 0),
  };

  return (
    <div style={{ ...S.page, background: "#f5f5f5", color: "#222" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", background: "#fff", padding: "16px 20px", borderBottom: "1px solid #eee" }}>
        <button onClick={() => setPage("agent_home")} style={{ width: 32, height: 32, borderRadius: "50%", background: "#f0f0f0", border: "none", color: "#333", fontSize: 17, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, flexShrink: 0, marginRight: 12 }}>‹</button>
        <div style={{ fontWeight: 800, fontSize: 17, flex: 1, textAlign: "center", color: "#222" }}>Subordinate data</div>
        <div style={{ width: 34 }} />
      </div>

      <div style={{ padding: "14px 16px" }}>
        {/* Search */}
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center", background: "#fff", borderRadius: 10, padding: "10px 14px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search subordinate name / phone"
              style={{ flex: 1, border: "none", outline: "none", fontSize: 14, background: "none", color: "#222" }}
            />
          </div>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: "linear-gradient(135deg,#ff6b6b,#ff3d9a)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 18 }}>🔍</div>
        </div>

        {/* Filter row */}
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1, background: "#fff", borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14, color: "#555", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <span>{filter}</span><span style={{ color: "#bbb" }}>▾</span>
          </div>
          <div style={{ flex: 1, background: "#fff", borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, color: "#555", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <span>{dateFilter}</span><span style={{ color: "#bbb" }}>▾</span>
          </div>
        </div>

        {/* Stats Card */}
        <div style={{ background: "linear-gradient(135deg,#ff6b6b,#ff4a7a)", borderRadius: 16, padding: "18px 16px", marginBottom: 16, boxShadow: "0 4px 16px rgba(255,61,154,0.25)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
            {[
              ["Deposit number",              stats.depositCount],
              ["Deposit amount",              `₹${stats.depositAmount}`],
              ["Number of bettors",           stats.bettors],
              ["Total bet",                   `💎${stats.totalBet}`],
              ["People making first deposit", stats.firstDepositPeople],
              ["First deposit amount",        `₹${stats.firstDepositAmount}`],
            ].map(([lbl, val], i) => (
              <div key={lbl} style={{ textAlign: "center", padding: "10px 8px", borderRight: i%2===0 ? "1px solid rgba(255,255,255,0.2)" : "none", borderBottom: i < 4 ? "1px solid rgba(255,255,255,0.2)" : "none" }}>
                <div style={{ fontWeight: 900, fontSize: 20, color: "#fff" }}>{val}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.8)", marginTop: 4 }}>{lbl}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Subordinate List */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <div style={{ fontSize: 64, marginBottom: 12, opacity: 0.3 }}>📋</div>
            <div style={{ color: "#aaa", fontSize: 15 }}>No data</div>
            <div style={{ color: "#bbb", fontSize: 12, marginTop: 4 }}>No subordinates yet. Share your referral code!</div>
          </div>
        ) : (
          filtered.map(sub => {
            const subTxns = allTxns.filter(t => t.userId === sub.id);
            const subDeposit = subTxns.filter(t => t.type === "deposit" && t.status === "success").reduce((s,t) => s + t.amount, 0);
            const subGames = subTxns.filter(t => t.type === "game_spend").length;
            return (
              <div key={sub.id} style={{ background: "#fff", borderRadius: 14, padding: 14, marginBottom: 10, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg,#ff6b6b,#ff3d9a)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 16, color: "#fff" }}>
                    {sub.name[0]}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#222" }}>{sub.name}</div>
                    <div style={{ fontSize: 11, color: "#888" }}>📱 {sub.phone} · Joined {sub.joinedAt?.split("T")[0]}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12, color: "#22c55e", fontWeight: 700 }}>₹{subDeposit}</div>
                    <div style={{ fontSize: 10, color: "#aaa" }}>{subGames} games</div>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                  {[
                    ["💎", `${sub.diamonds}`, "Balance"],
                    ["📥", `₹${subDeposit}`, "Deposited"],
                    ["🎮", subGames, "Games"],
                  ].map(([ic, val, lbl]) => (
                    <div key={lbl} style={{ background: "#f8f8f8", borderRadius: 8, padding: "6px 8px", textAlign: "center" }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "#333" }}>{ic} {val}</div>
                      <div style={{ fontSize: 9, color: "#aaa", marginTop: 1 }}>{lbl}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
// ═══════════════════════════════════════════════════════════════════════════════

function AppInner() {
  const [page, setPage] = useState("landing");
  const [user, setUser] = useState(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [toast, setToast] = useState({ msg: "", type: "info" });
  const [showSplash, setShowSplash] = useState(true);
  const toastRef = useRef(null);

  useEffect(() => { initDB(); }, []);

  // Show logo/name splash animation on app open
  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 2200);
    return () => clearTimeout(t);
  }, []);

  // Restore session on reload
  useEffect(() => {
    const session = DB.get("dp_session");
    if (session) {
      const users = DB.get("dp_users") || [];
      const u = users.find(x => x.id === session.userId);
      if (u) { setUser(u); setPage(u.isAdmin ? "admin" : u.isDepositOperator ? "operator_center" : "home"); }
    }
  }, []);

  const showToast = (msg, type = "info") => {
    setToast({ msg, type });
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast({ msg: "", type: "info" }), 3200);
  };

  const logout = () => {
    DB.del("dp_session");
    setUser(null);
    setPage("landing");
    showToast("Logged out successfully", "info");
  };

  // Show logo/name animation on app open, before anything else
  if (showSplash) {
    return (
      <>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
          * { box-sizing: border-box; }
          body { margin: 0; background: #0a0a1a; }
          @keyframes splashGlow { 0%,100% { transform: scale(1); opacity: 0.7; } 50% { transform: scale(1.15); opacity: 1; } }
          @keyframes splashLogo { 0% { transform: scale(0) rotate(-30deg); opacity: 0; } 60% { transform: scale(1.2) rotate(8deg); opacity: 1; } 100% { transform: scale(1) rotate(0deg); opacity: 1; } }
          @keyframes splashLetter { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        `}</style>
        <div style={S.app}>
          <SplashScreen />
        </div>
      </>
    );
  }

  const isAdmin = user?.isAdmin;
  const isOperator = !!user && !user.isAdmin && !!user.isDepositOperator;
  const cfg = DB.get("dp_platform_config") || {};

  // Maintenance check for non-admins
  if (cfg.maintenanceMode && user && !isAdmin) {
    return (
      <>
        <style>{CSS}</style>
        <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
          <div style={{ textAlign: "center", padding: 40 }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🔧</div>
            <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Under Maintenance</div>
            <div style={{ color: "rgba(255,255,255,0.5)" }}>We'll be back soon! Check back later.</div>
            <Btn style={{ marginTop: 20 }} onClick={logout}>← Go Back</Btn>
          </div>
        </div>
      </>
    );
  }

  const renderPage = () => {
    if (!user) {
      if (page === "auth") return <AuthPage mode={page === "auth" ? (window.__authMode || "login") : "login"} setUser={setUser} setPage={setPage} showToast={showToast} />;
      return <LandingPage setPage={p => { if (p === "auth") {} setPage(p); }} setAuthMode={m => { window.__authMode = m; }} />;
    }
    if (isOperator) {
      return <OperatorCenter user={user} showToast={showToast} onLogout={logout} />;
    }
    if (isAdmin) {
      if (page === "admin_color")    return <AdminColorPage showToast={showToast} />;
      if (page === "admin_games")    return <AdminGamesHub setPage={setPage} showToast={showToast} />;
      if (page === "admin_users")    return <AdminUsers />;
      if (page === "admin_txn")      return <AdminTxns />;
      if (page === "admin_deposits") return <AdminDeposits showToast={showToast} />;
      if (page === "admin_withdraw") return <AdminWithdrawals showToast={showToast} />;
      if (page === "admin_wallet")   return <AdminWallet showToast={showToast} />;
      if (page === "admin_config")   return <AdminConfig showToast={showToast} />;
      if (page === "admin_agents")   return <AdminAgents showToast={showToast} onBack={() => setPage("admin")} />;
      if (page === "admin_support")  return <AdminSupport showToast={showToast} onBack={() => setPage("admin")} />;
      if (page === "admin_analytics") return <AdminAnalytics onBack={() => setPage("admin")} />;
      return <AdminOverview setPage={setPage} onLogout={logout} />;
    }
    const props = { user, setUser, setPage, showToast };
    switch (page) {
      case "home": return <HomePage {...props} setNotifOpen={setNotifOpen} notifications={[]} />;
      case "games": return <GamesPage setPage={setPage} />;
      case "game_color": return <ColorGame {...props} />;
      case "game_dice": return <DiceGame {...props} />;
      case "game_number": return <NumberGame {...props} />;
      case "game_scratch": return <ScratchGame {...props} />;
      case "wallet": case "buy": return <WalletPage {...props} />;
      case "profile": return <ProfilePage {...props} onLogout={logout} setNotifOpen={setNotifOpen} />;
      case "support": return <UserSupportPage {...props} onBack={() => setPage("profile")} />;
      case "agent_home": return <AgentHomePage {...props} />;
      case "agent_subordinates": return <AgentSubordinatesPage {...props} />;
      case "leaderboard": return <LeaderboardPage user={user} />;
      default: return <HomePage {...props} setNotifOpen={setNotifOpen} notifications={[]} />;
    }
  };

  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
    * { box-sizing: border-box; }
    body { margin: 0; background: #0a0a1a; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
    @keyframes pulse { 0%,100% { transform: scale(1); opacity:1; } 50% { transform: scale(1.12); opacity:0.85; } }
    @keyframes confettiFall0 { 0%{transform:translateY(0) scale(1) rotate(0deg);opacity:1} 100%{transform:translateY(-90px) scale(0) rotate(360deg);opacity:0} }
    @keyframes confettiFall1 { 0%{transform:translateY(0) scale(1) rotate(0deg);opacity:1} 100%{transform:translateY(-70px) translateX(30px) scale(0) rotate(-180deg);opacity:0} }
    @keyframes confettiFall2 { 0%{transform:translateY(0) scale(1) rotate(0deg);opacity:1} 100%{transform:translateY(-80px) translateX(-20px) scale(0) rotate(270deg);opacity:0} }
    @keyframes resultSlide { from{transform:translateY(20px);opacity:0} to{transform:translateY(0);opacity:1} }
    @keyframes otpShake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-8px)} 40%{transform:translateX(8px)} 60%{transform:translateX(-6px)} 80%{transform:translateX(6px)} }
    @keyframes otpPop { 0%{transform:scale(0.7)} 60%{transform:scale(1.15)} 100%{transform:scale(1)} }
    ::-webkit-scrollbar { width: 0; }
    input, button { font-family: 'Inter', sans-serif; }
  `;

  // Handle landing page auth navigation
  const handleSetPage = (p) => {
    if (p === "auth") setPage("auth");
    else setPage(p);
  };

  return (
    <>
      <style>{CSS}</style>
      <Toast msg={toast.msg} type={toast.type} />
      <div style={S.app}>
        <div style={{ background: S.gradDark, minHeight: "100vh" }}>
          {!user ? (
            page === "auth"
              ? <AuthPage mode={window.__authMode || "login"} setUser={setUser} setPage={setPage} showToast={showToast} />
              : <LandingPage setPage={handleSetPage} setAuthMode={m => { window.__authMode = m; setPage("auth"); }} />
          ) : (
            <>
              {renderPage()}
              {!isOperator && <BottomNav page={page} setPage={setPage} isAdmin={isAdmin} />}
              <NotifPanel open={notifOpen} onClose={() => setNotifOpen(false)} userId={user.id} />
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default function App() {
  return (
    <LangProviderComp>
      <AppInner />
    </LangProviderComp>
  );
}
