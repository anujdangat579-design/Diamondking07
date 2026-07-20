import { useState, useEffect, useRef, useCallback, useContext, createContext } from "react";
import { db } from "./firebaseClient.js";
import { collection, doc, getDocs, setDoc, deleteDoc, onSnapshot } from "firebase/firestore";


// ─── PERSISTENT STORAGE LAYER (Firebase Firestore — shared across devices) ──
// Every DB.set() call is:
//   1. written to an in-memory cache immediately (so the UI never waits), and
//   2. pushed to the "app_kv" Firestore collection in the background.
// On boot, hydrateFromFirebase() pulls the full app_kv collection into the
// cache BEFORE initDB() seeds any defaults, so a second device never
// overwrites real cloud data. After that, a live onSnapshot listener keeps
// every open device in sync in real time (see startLiveSync in AppInner).
export const KV_COLLECTION = "app_kv";
export const _cache = {};
export let _hydrated = false;

export const DB = {
  get: (key) => (key in _cache ? _cache[key] : null),
  set: (key, val) => {
    _cache[key] = val;
    try { setDoc(doc(db, KV_COLLECTION, key), { value: val, updatedAt: Date.now() }); } catch {}
    return true;
  },
  del: (key) => {
    delete _cache[key];
    try { deleteDoc(doc(db, KV_COLLECTION, key)); } catch {}
  },
};

export const hydrateFromFirebase = async () => {
  if (_hydrated) return;
  try {
    const snap = await getDocs(collection(db, KV_COLLECTION));
    snap.forEach((docSnap) => { _cache[docSnap.id] = docSnap.data().value; });
  } catch (e) {
    // Offline, or Firebase not configured yet — app still works locally.
    console.warn("Firebase hydrate failed, using local defaults:", e?.message || e);
  }
  _hydrated = true;
};

// Live sync: called once from AppInner after the initial hydrate. Any write
// from ANY device updates every other open device's cache + triggers onChange
// so React re-renders with the fresh data.
export let _unsubscribeLive = null;
export const startLiveSync = (onChange) => {
  if (_unsubscribeLive) return;
  try {
    _unsubscribeLive = onSnapshot(collection(db, KV_COLLECTION), (snapshot) => {
      let changed = false;
      snapshot.docChanges().forEach((change) => {
        const key = change.doc.id;
        if (change.type === "removed") {
          if (key in _cache) { delete _cache[key]; changed = true; }
        } else {
          const val = change.doc.data().value;
          if (JSON.stringify(_cache[key]) !== JSON.stringify(val)) {
            _cache[key] = val;
            changed = true;
          }
        }
      });
      if (changed) onChange();
    });
  } catch (e) {
    console.warn("Firebase live sync failed to start:", e?.message || e);
  }
};

export const initDB = () => {
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
      supportWhatsapp: "919876543210",
      supportEmail: "support@diamondplay.in",
      whatsappEnabled: true,
      emailSupportEnabled: true,
      gameCost: 5,
      scratchCost: 10,
      agentCommissionPercent: 10,
      diceWinRate: 17,
      diceMode: "smart",
      aviatorMode: "smart",
      aviatorAvgCrash: 2.0,
      aviatorForcedCrash: null,
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
      vipLevels: [
        { level: 0, name: "Bronze",   minDeposit: 0,     dailyBonus: 5,   rebatePercent: 0 },
        { level: 1, name: "Silver",   minDeposit: 500,   dailyBonus: 15,  rebatePercent: 0.5 },
        { level: 2, name: "Gold",     minDeposit: 2000,  dailyBonus: 40,  rebatePercent: 1 },
        { level: 3, name: "Platinum", minDeposit: 5000,  dailyBonus: 100, rebatePercent: 1.5 },
        { level: 4, name: "Diamond",  minDeposit: 15000, dailyBonus: 250, rebatePercent: 2 },
        { level: 5, name: "Crown",    minDeposit: 50000, dailyBonus: 600, rebatePercent: 3 },
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
export const pushAdminAlert = (type, data) => {
  const alerts = DB.get("dp_notifications_admin") || [];
  const alert = { id: `a_${Date.now()}`, type, data, time: new Date().toISOString(), read: false };
  DB.set("dp_notifications_admin", [alert, ...alerts].slice(0, 100));
};

// ─── LIVE CHAT (user ↔ admin) ─────────────────────────────────────────────────
// One thread per user, stored in dp_chat_threads. Each thread carries the full
// back-and-forth so both sides see a real conversation, not just a one-shot ticket.
export const getOrCreateChatThread = (user) => {
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

export const sendChatMessage = (userLike, from, text) => {
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
export const fmt = (n) => n?.toLocaleString("en-IN") ?? "0";
export const fmtINR = (n) => `₹${n?.toLocaleString("en-IN") ?? "0"}`;
export const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const uid = () => `u_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
export const tid = () => `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

// Credits diamonds to a user for a non-game bonus (daily check-in, VIP claim,
// etc.) and logs it in dp_transactions the same way admin bonus credits are —
// does NOT touch gamesPlayed since this isn't a game round.
export const creditBonus = (userId, diamonds, note, extraFields = {}) => {
  const users = DB.get("dp_users") || [];
  const updated = users.map(u => u.id === userId ? { ...u, diamonds: u.diamonds + diamonds, ...extraFields } : u);
  DB.set("dp_users", updated);
  const txns = DB.get("dp_transactions") || [];
  DB.set("dp_transactions", [{ id: tid(), userId, type: "bonus", amount: 0, diamonds, status: "success", date: new Date().toISOString(), method: "bonus", note }, ...txns]);
  return updated.find(u => u.id === userId);
};

export const timeAgo = (iso) => {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

// ─── STYLES ───────────────────────────────────────────────────────────────────
export const S = {
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
export const LANGUAGES = [
  { code: "en", label: "English", native: "English" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
  { code: "mr", label: "Marathi", native: "मराठी" },
  { code: "ta", label: "Tamil", native: "தமிழ்" },
];

export const TRANSLATIONS = {
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
    auth_verify_human: "Verify OTP 📱", auth_almost_done: "Almost Done! 🎉",
    auth_register_sub: "Register with your mobile number", auth_login_sub: "Login with your mobile number",
    auth_captcha_sub: "Enter the 4-digit OTP sent to your number",
    auth_name_sub: "Enter your name to complete registration",
    auth_mobile_placeholder: "Mobile Number", auth_continue: "Continue →",
    auth_verifying: "Verifying…", auth_verified_redirect: "Verified! Redirecting…",
    auth_new_code: "🔄 Resend OTP", auth_verify_continue: "Verify & Continue →",
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
    profile_notification: "Notification", profile_gifts: "Gifts", profile_game_stats: "Game statistics", profile_checkin: "Daily Check-in",
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
    auth_verify_human: "OTP सत्यापित करें 📱", auth_almost_done: "लगभग पूरा हो गया! 🎉",
    auth_register_sub: "अपने मोबाइल नंबर से रजिस्टर करें", auth_login_sub: "अपने मोबाइल नंबर से लॉगिन करें",
    auth_captcha_sub: "आपके नंबर पर भेजा गया 4-अंकों का OTP डालें",
    auth_name_sub: "रजिस्ट्रेशन पूरा करने के लिए अपना नाम दर्ज करें",
    auth_mobile_placeholder: "मोबाइल नंबर", auth_continue: "जारी रखें →",
    auth_verifying: "जांच हो रही है…", auth_verified_redirect: "सत्यापित! भेजा जा रहा है…",
    auth_new_code: "🔄 OTP फिर भेजें", auth_verify_continue: "सत्यापित करें और जारी रखें →",
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
    profile_notification: "सूचनाएं", profile_gifts: "उपहार", profile_game_stats: "गेम आंकड़े", profile_checkin: "डेली चेक-इन",
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
    auth_verify_human: "OTP पडताळणी करा 📱", auth_almost_done: "जवळजवळ पूर्ण! 🎉",
    auth_register_sub: "तुमच्या मोबाइल नंबरने नोंदणी करा", auth_login_sub: "तुमच्या मोबाइल नंबरने लॉगिन करा",
    auth_captcha_sub: "तुमच्या नंबरवर पाठवलेला 4-अंकी OTP टाका",
    auth_name_sub: "नोंदणी पूर्ण करण्यासाठी तुमचे नाव टाका",
    auth_mobile_placeholder: "मोबाइल नंबर", auth_continue: "पुढे जा →",
    auth_verifying: "तपासत आहे…", auth_verified_redirect: "सत्यापित! पाठवत आहे…",
    auth_new_code: "🔄 OTP पुन्हा पाठवा", auth_verify_continue: "सत्यापित करा आणि पुढे जा →",
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
    profile_notification: "सूचना", profile_gifts: "भेटवस्तू", profile_game_stats: "गेम आकडेवारी", profile_checkin: "डेली चेक-इन",
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
    auth_verify_human: "OTP சரிபார்க்கவும் 📱", auth_almost_done: "கிட்டத்தட்ட முடிந்தது! 🎉",
    auth_register_sub: "உங்கள் மொபைல் எண்ணுடன் பதிவு செய்யவும்", auth_login_sub: "உங்கள் மொபைல் எண்ணுடன் உள்நுழையவும்",
    auth_captcha_sub: "உங்கள் எண்ணுக்கு அனுப்பப்பட்ட 4-இலக்க OTPஐ உள்ளிடவும்",
    auth_name_sub: "பதிவை முடிக்க உங்கள் பெயரை உள்ளிடவும்",
    auth_mobile_placeholder: "மொபைல் எண்", auth_continue: "தொடரவும் →",
    auth_verifying: "சரிபார்க்கிறது…", auth_verified_redirect: "சரிபார்க்கப்பட்டது! அனுப்புகிறது…",
    auth_new_code: "🔄 OTP-ஐ மீண்டும் அனுப்பவும்", auth_verify_continue: "சரிபார்த்து தொடரவும் →",
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
    profile_notification: "அறிவிப்பு", profile_gifts: "பரிசுகள்", profile_game_stats: "விளையாட்டு புள்ளிவிவரங்கள்", profile_checkin: "தினசரி செக்-இன்",
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

export const LangContext = createContext(null);

export const LangProviderComp = ({ children }) => {
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

export const useLang = () => useContext(LangContext);


// ─── BASE COMPONENTS ─────────────────────────────────────────────────────────
export const Btn = ({ children, onClick, variant = "primary", disabled, full, sm, style = {} }) => {
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

export const Card = ({ children, style = {}, glow, onClick }) => (
  <div onClick={onClick} style={{
    background: S.glass, borderRadius: 20, padding: 16,
    border: `1px solid rgba(255,255,255,${glow ? 0.2 : 0.07})`,
    backdropFilter: "blur(12px)", cursor: onClick ? "pointer" : "default",
    boxShadow: glow ? `0 0 20px ${S.neonBlue}33` : "0 4px 16px rgba(0,0,0,0.3)", ...style,
  }}>{children}</div>
);

export const Badge = ({ label, color = S.neonBlue }) => (
  <span style={{ background: `${color}22`, color, border: `1px solid ${color}44`, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{label}</span>
);

export const Input = ({ label, placeholder, value, onChange, type = "text", icon, readOnly }) => (
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

export const Modal = ({ open, onClose, title, children }) => {
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

export const Toast = ({ msg, type }) => {
  if (!msg) return null;
  const bg = type === "success" ? "rgba(0,255,136,0.15)" : type === "error" ? "rgba(255,61,154,0.15)" : "rgba(0,212,255,0.15)";
  const border = type === "success" ? S.neonGreen : type === "error" ? S.neonPink : S.neonBlue;
  return (
    <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", zIndex: 9999, background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: "12px 22px", color: "#fff", fontWeight: 700, fontSize: 14, backdropFilter: "blur(10px)", maxWidth: 360, textAlign: "center", whiteSpace: "pre-wrap" }}>
      {msg}
    </div>
  );
};

export const Spinner = () => (
  <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
    <div style={{ width: 36, height: 36, border: `3px solid rgba(0,212,255,0.2)`, borderTop: `3px solid ${S.neonBlue}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
  </div>
);

export const TopBar = ({ title, onBack, right }) => (
  <div style={{ display: "flex", alignItems: "center", padding: "16px 20px", gap: 12, background: "rgba(10,10,26,0.95)", backdropFilter: "blur(10px)", position: "sticky", top: 0, zIndex: 100 }}>
    {onBack && <button onClick={onBack} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "#fff", borderRadius: 50, width: 36, height: 36, cursor: "pointer", fontSize: 18 }}>←</button>}
    <div style={{ flex: 1, fontSize: 18, fontWeight: 800 }}>{title}</div>
    {right}
  </div>
);

export const DiamondChip = ({ amount }) => (
  <span style={{ background: S.gradBlue, borderRadius: 50, fontWeight: 800, color: "#fff", display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 12px", fontSize: 14, boxShadow: "0 2px 12px rgba(0,212,255,0.3)" }}>
    💎 {fmt(amount)}
  </span>
);

// ─── AVIATOR ICON (original stylized icon — dark bg, red rays, rising curve, glowing plane) ──
export const AviatorIcon = ({ size = 56, rounded = true }) => (
  <div style={{
    width: size, height: size, borderRadius: rounded ? size * 0.28 : 0, position: "relative", overflow: "hidden",
    background: "radial-gradient(circle at 28% 105%, rgba(255,61,61,0.4), #0a0505 68%)",
    border: "1px solid rgba(255,61,61,0.35)", flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    boxShadow: `0 0 ${size * 0.25}px rgba(255,61,61,0.25)`,
  }}>
    {/* radiating rays, mimicking a spotlight burst behind the plane */}
    <div style={{
      position: "absolute", inset: -size * 0.4,
      background: "repeating-conic-gradient(from 0deg, rgba(255,61,61,0.10) 0deg 5deg, transparent 5deg 16deg)",
      animation: "spin 14s linear infinite",
    }} />
    {/* grid */}
    <svg width="100%" height="100%" viewBox="0 0 100 100" style={{ position: "absolute", inset: 0, opacity: 0.35 }}>
      <line x1="0" y1="70" x2="100" y2="70" stroke="#ff3d3d" strokeWidth="0.6" />
      <line x1="0" y1="45" x2="100" y2="45" stroke="#ff3d3d" strokeWidth="0.4" />
    </svg>
    {/* rising glow curve */}
    <svg width="100%" height="100%" viewBox="0 0 100 100" style={{ position: "absolute", inset: 0 }}>
      <path d="M8,88 Q42,88 58,52 T92,10" fill="none" stroke="#ff3d3d" strokeWidth={size * 0.045} strokeLinecap="round" opacity="0.95" style={{ filter: `drop-shadow(0 0 ${size * 0.06}px rgba(255,61,61,0.8))` }} />
    </svg>
    {/* plane */}
    <div style={{
      position: "relative", fontSize: size * 0.42, transform: "rotate(-20deg) translate(6%, -4%)",
      filter: `drop-shadow(0 0 ${size * 0.1}px rgba(255,90,60,0.9))`,
    }}>✈️</div>
  </div>
);

export const ProgressBar = ({ value, max, color = S.neonBlue }) => (
  <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 99, height: 7, overflow: "hidden" }}>
    <div style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: color, height: "100%", borderRadius: 99, transition: "width 0.4s" }} />
  </div>
);

// ─── BOTTOM NAV ───────────────────────────────────────────────────────────────
export const BottomNav = ({ page, setPage, isAdmin }) => {
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

// ─── WEEKLY TOURNAMENT UTILS ──────────────────────────────────────────────────
export const getTournamentInfo = () => {
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

export const TOURNAMENT_PRIZES = [
  { rank: 1, label: "🥇 1st Place",  prize: 5000,  color: "#ffd700" },
  { rank: 2, label: "🥈 2nd Place",  prize: 2500,  color: "#c0c0c0" },
  { rank: 3, label: "🥉 3rd Place",  prize: 1000,  color: "#cd7f32" },
  { rank: 4, label: "4th–5th",       prize: 500,   color: S.neonBlue },
  { rank: 6, label: "6th–10th",      prize: 200,   color: S.neonPurple },
];


// ─── NOTIFICATION PANEL ───────────────────────────────────────────────────────
export const NotifPanel = ({ open, onClose, userId }) => {
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
export const SplashScreen = () => {
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

// ─── SECURITY GUARD (client-side deterrents — see README "Security" section for
// what this does and does NOT protect against) ─────────────────────────────────
export const SecurityGuard = () => {
  useEffect(() => {
    // Block right-click context menu
    const onContext = (e) => e.preventDefault();
    document.addEventListener("contextmenu", onContext);

    // Block common devtools / view-source shortcuts
    const onKeyDown = (e) => {
      const k = e.key;
      if (
        k === "F12" ||
        (e.ctrlKey && e.shiftKey && (k === "I" || k === "J" || k === "C")) ||
        (e.ctrlKey && k === "U") ||
        (e.metaKey && e.altKey && (k === "I" || k === "J" || k === "C")) // Mac
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);

    // Best-effort devtools-open detector (window size delta). This is a
    // deterrent for casual users only — it does not stop anyone determined.
    let warned = false;
    const threshold = 160;
    const checkDevtools = () => {
      const wDelta = window.outerWidth - window.innerWidth;
      const hDelta = window.outerHeight - window.innerHeight;
      const open = wDelta > threshold || hDelta > threshold;
      if (open && !warned) {
        warned = true;
        console.log("%cSTOP", "color:red;font-size:50px;font-weight:bold;");
        console.log("%cThis is a browser feature for developers. Pasting anything here can compromise your account.", "font-size:16px;");
      }
      if (!open) warned = false;
    };
    const interval = setInterval(checkDevtools, 1000);

    return () => {
      document.removeEventListener("contextmenu", onContext);
      document.removeEventListener("keydown", onKeyDown, true);
      clearInterval(interval);
    };
  }, []);
  return null;
};
