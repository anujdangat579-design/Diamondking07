import { useState, useEffect, useRef, useCallback, useContext, createContext } from "react";
import {
  DB, S, fmt, fmtINR, rnd, sleep, uid, tid, timeAgo,
  pushAdminAlert, getOrCreateChatThread, sendChatMessage,
  hydrateFromFirebase, startLiveSync, initDB,
  useLang, LangProviderComp,
  Btn, Card, Badge, Input, Modal, Toast, Spinner, TopBar, DiamondChip,
  AviatorIcon, ProgressBar, BottomNav, NotifPanel, SplashScreen,
  getTournamentInfo, TOURNAMENT_PRIZES,
} from "../core.jsx";

// ─── GAMES PAGE ───────────────────────────────────────────────────────────────
export const GamesPage = ({ setPage }) => {
  const { t } = useLang();
  const cfg = DB.get("dp_platform_config") || {};
  const managedGames = (DB.get("dp_managed_games") || []).filter(g => g.enabled);
  const games = [
    { id: "color", name: "Color Prediction", emoji: "🎨", cost: cfg.gameCost || 5, desc: "Predict the next color and win 1.9x!", tag: "Popular" },
    { id: "aviator", name: "Aviator", emoji: "✈️", cost: cfg.gameCost || 5, desc: "Cash out before the plane flies away!", tag: "Trending" },
    { id: "dice", name: "Dice Roll", emoji: "🎲", cost: cfg.gameCost || 5, desc: "Roll the dice, pick your number!", tag: "Classic" },
    { id: "number", name: "Number Pick", emoji: "🔢", cost: cfg.gameCost || 5, desc: "Pick a number 1-10 and win big!", tag: "Easy" },
    { id: "scratch", name: "Scratch Card", emoji: "🃏", cost: cfg.scratchCost || 10, desc: "Scratch & reveal your prize!", tag: "Lucky" },
    { id: "quizbattle", name: "Quiz Battle 1v1", emoji: "🧠", cost: 10, desc: "Educational 1v1 battle — beat a real player, win ₹18!", tag: "New" },
  ];
  return (
    <div style={S.page}>
      <TopBar title={t("games_lobby")} />
      <div style={{ padding: "12px 20px" }}>
        {games.map(g => (
          <Card key={g.id} onClick={() => setPage(`game_${g.id}`)} style={{ marginBottom: 12, cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {g.id === "aviator" ? <AviatorIcon size={48} /> : <div style={{ fontSize: 48 }}>{g.emoji}</div>}
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

        {managedGames.length > 0 && (
          <>
            <div style={{ fontSize: 15, fontWeight: 800, margin: "18px 0 10px" }}>More Games</div>
            {managedGames.map(g => (
              <Card key={g.id} onClick={() => setPage(`game_custom_${g.id}`)} style={{ marginBottom: 12, cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ fontSize: 44 }}>{g.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 3 }}>{g.name}</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>{g.multipliers.length} outcomes · {g.timerSeconds}s round</div>
                    <DiamondChip amount={g.minBet} />
                  </div>
                  <div style={{ fontSize: 24, color: "rgba(255,255,255,0.3)" }}>›</div>
                </div>
              </Card>
            ))}
          </>
        )}
      </div>
    </div>
  );
};


// ─── GAME HELPERS ─────────────────────────────────────────────────────────────
export const saveGameResult = (userId, diamonds, note) => {
  const users = DB.get("dp_users") || [];
  const updated = users.map(u => u.id === userId ? { ...u, diamonds: u.diamonds + diamonds, gamesPlayed: u.gamesPlayed + 1 } : u);
  DB.set("dp_users", updated);
  const txns = DB.get("dp_transactions") || [];
  DB.set("dp_transactions", [{ id: tid(), userId, type: diamonds > 0 ? "game_win" : "game_spend", amount: 0, diamonds, status: "success", date: new Date().toISOString(), method: "game", note }, ...txns]);
};



// ─── CUSTOM GAMES — generic bet engine for admin-created games ────────────────
// Every bet is written with the placing user's `userId`, and every win/loss is
// posted through saveGameResult(userId, ...) so it shows in that user's own
// transaction history (dp_transactions) exactly like the built-in games.
export const getOrStartRound = (game) => {
  const games = DB.get("dp_managed_games") || [];
  const g = games.find(x => x.id === game.id);
  if (!g) return null;
  if (g.currentRound && g.currentRound.roundId) return g.currentRound;
  const round = { roundId: tid(), startedAt: new Date().toISOString() };
  DB.set("dp_managed_games", games.map(x => x.id === game.id ? { ...x, currentRound: round } : x));
  return round;
};

export const placeCustomBet = (game, outcomeLabel, amount, user, showToast) => {
  const amt = Number(amount);
  if (!amt || amt < game.minBet || amt > game.maxBet) {
    showToast(`Bet ${game.minBet}-${game.maxBet}💎 ke beech honi chahiye`, "error");
    return false;
  }
  if (amt > user.diamonds) { showToast("Diamonds kam hain", "error"); return false; }
  const round = getOrStartRound(game);
  if (!round) { showToast("Game abhi available nahi hai", "error"); return false; }
  saveGameResult(user.id, -amt, `${game.name} Bet - ${outcomeLabel}`);
  const bets = DB.get("dp_custom_game_bets") || [];
  DB.set("dp_custom_game_bets", [
    { id: tid(), gameId: game.id, roundId: round.roundId, userId: user.id, outcomeLabel, amount: amt, placedAt: new Date().toISOString(), settled: false, won: false, payout: 0 },
    ...bets,
  ]);
  showToast(`✅ Bet lagayi: ${outcomeLabel} - ${amt}💎`, "success");
  return true;
};

// Called from Admin's "Run Auto Result" / manual override so every bet on the
// current round gets paid out (or marked lost), then a fresh round starts.
export const settleCustomRound = (game, resultLabel) => {
  const round = game.currentRound;
  if (!round) return;
  const multiplier = (game.multipliers.find(m => m.label === resultLabel) || {}).value || 0;
  const bets = DB.get("dp_custom_game_bets") || [];
  const updatedBets = bets.map(b => {
    if (b.gameId !== game.id || b.roundId !== round.roundId || b.settled) return b;
    const won = b.outcomeLabel === resultLabel;
    const payout = won ? Math.round(b.amount * multiplier) : 0;
    if (won) saveGameResult(b.userId, payout, `${game.name} Win - ${resultLabel}`);
    return { ...b, settled: true, won, payout };
  });
  DB.set("dp_custom_game_bets", updatedBets);
  const games = DB.get("dp_managed_games") || [];
  const newRound = { roundId: tid(), startedAt: new Date().toISOString() };
  DB.set("dp_managed_games", games.map(g => g.id === game.id ? { ...g, currentRound: newRound } : g));
};

export const CustomGamePlay = ({ user, setUser, setPage, showToast, gameId }) => {
  const [tick, setTick] = useState(0);
  const [betAmt, setBetAmt] = useState("");
  const [betOutcome, setBetOutcome] = useState(null);

  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const games = DB.get("dp_managed_games") || [];
  const game = games.find(g => g.id === gameId);

  useEffect(() => { if (game && !game.currentRound) getOrStartRound(game); }, [game && game.id]);

  if (!game) {
    return (
      <div style={S.page}>
        <TopBar title="Game" onBack={() => setPage("games")} />
        <div style={{ padding: 30, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>Yeh game abhi available nahi hai.</div>
      </div>
    );
  }

  const round = game.currentRound || getOrStartRound(game);
  const elapsed = round ? Math.floor((Date.now() - new Date(round.startedAt).getTime()) / 1000) : 0;
  const timeLeft = Math.max(0, game.timerSeconds - elapsed);
  const bettingOpen = timeLeft > 0;

  const myBets = (DB.get("dp_custom_game_bets") || []).filter(b => b.gameId === game.id && b.roundId === (round && round.roundId) && b.userId === user.id);

  const placeBet = () => {
    if (!betOutcome) { showToast("Outcome choose karo", "error"); return; }
    if (!bettingOpen) { showToast("Round band ho gaya, agle round ka wait karo", "error"); return; }
    const ok = placeCustomBet(game, betOutcome, betAmt, user, showToast);
    if (ok) {
      const users = DB.get("dp_users") || [];
      const fresh = users.find(u => u.id === user.id);
      if (fresh) setUser(fresh);
      setBetAmt(""); setBetOutcome(null);
    }
  };

  return (
    <div style={S.page}>
      <TopBar title={`${game.icon} ${game.name}`} onBack={() => setPage("games")} />
      <div style={{ padding: "0 20px 100px" }}>
        <Card style={{ textAlign: "center", marginBottom: 16, background: "rgba(0,212,255,0.06)" }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>
            {bettingOpen ? "Betting band hone mein" : "Result ka wait karo..."}
          </div>
          <div style={{ fontSize: 36, fontWeight: 900, color: bettingOpen ? S.neonGreen : "#ff6b6b" }}>
            {bettingOpen ? `${timeLeft}s` : "⏳"}
          </div>
        </Card>

        {game.lastResult && (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 14, textAlign: "center" }}>
            Pichla result: <strong style={{ color: S.neonGold }}>{game.lastResult}</strong>
          </div>
        )}

        <div style={{ fontWeight: 800, marginBottom: 10 }}>Outcome Chuno</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {game.multipliers.map((m, i) => (
            <button key={i} onClick={() => setBetOutcome(m.label)} disabled={!bettingOpen} style={{
              flex: "1 1 45%", padding: "14px 8px", borderRadius: 12, cursor: bettingOpen ? "pointer" : "not-allowed",
              border: `2px solid ${betOutcome === m.label ? S.neonBlue : "rgba(255,255,255,0.12)"}`,
              background: betOutcome === m.label ? "rgba(0,212,255,0.15)" : "rgba(255,255,255,0.05)",
              opacity: bettingOpen ? 1 : 0.5,
            }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>{m.label}</div>
              <div style={{ fontSize: 12, color: S.neonGold }}>{m.value}x</div>
            </button>
          ))}
        </div>

        <Card style={{ marginBottom: 16 }}>
          <Input label={`Bet Amount (${game.minBet}-${game.maxBet}💎)`} value={betAmt} onChange={setBetAmt} type="number" icon="💎" />
        </Card>

        <Btn full variant="primary" onClick={placeBet} disabled={!bettingOpen}>🎯 Place Bet</Btn>

        {myBets.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Aapki Bets (is round)</div>
            {myBets.map(b => (
              <Card key={b.id} style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>{b.outcomeLabel} · {b.amount}💎</div>
                <Badge label={b.settled ? (b.won ? `Won +${b.payout}💎` : "Lost") : "Pending"} color={b.settled ? (b.won ? S.neonGreen : "#ff6b6b") : S.neonGold} />
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
// Number-based engine (0-9). Color and Big/Small are both derived from the
// same winning number, so both bet types share one fair draw per round.
//   Color:  0,5 → Violet · 1,3,7,9 → Green · 2,4,6,8 → Red
//   Size:   0-4 → Small · 5-9 → Big
export const numberToColor = (n) => (n === 0 || n === 5) ? "violet" : ([1,3,7,9].includes(n) ? "green" : "red");
export const numberToSize  = (n) => (n <= 4 ? "small" : "big");

// ─── SECURITY: Anti-Cheat Rate Limiter ───────────────────────────────────────
const _rateLimitStore = {};
export const checkRateLimit = (userId) => {
  const now = Date.now();
  if (!_rateLimitStore[userId]) _rateLimitStore[userId] = [];
  _rateLimitStore[userId] = _rateLimitStore[userId].filter(t => now - t < 5000);
  const last = _rateLimitStore[userId].slice(-1)[0] || 0;
  if (now - last < 800) return { ok: false, reason: "Bet bahut fast! Please wait." };
  if (_rateLimitStore[userId].length >= 10) return { ok: false, reason: "Too many bets! Slow down." };
  _rateLimitStore[userId].push(now);
  return { ok: true };
};

export const logSuspiciousActivity = (userId, type, details) => {
  const logs = DB.get("dp_security_logs") || [];
  const entry = { id: "sec_" + Date.now(), userId, type, details, time: new Date().toISOString(), reviewed: false };
  DB.set("dp_security_logs", [entry, ...logs].slice(0, 500));
};

export const checkBetAnomaly = (userId, betAmt, userDiamonds) => {
  if (betAmt > userDiamonds * 0.8 && betAmt > 500)
    logSuspiciousActivity(userId, "large_bet", "Bet " + betAmt + " on balance " + userDiamonds);
  const txns = DB.get("dp_transactions") || [];
  const recentWins = txns.filter(t => t.userId === userId && t.type === "game_win" && Date.now() - new Date(t.date).getTime() < 300000);
  if (recentWins.length >= 8)
    logSuspiciousActivity(userId, "win_streak", recentWins.length + " wins in 5 min");
};

export const numberToEven = (n) => (n % 2 === 0 ? "even" : "odd");

export const getWinningNumber = () => {
  const cfg         = DB.get("dp_platform_config") || {};
  const forcedColor = cfg.forcedColor || null;
  const forcedSize  = cfg.forcedSize  || null;
  const forcedNum   = (cfg.forcedNum !== undefined && cfg.forcedNum !== null) ? cfg.forcedNum : null;
  const forcedEven  = cfg.forcedEven  || null;
  const colorMode   = cfg.colorMode   || "random";
  const sizeMode    = cfg.sizeMode    || "random";

  // Admin forced a specific number
  if (forcedNum !== null) {
    DB.set("dp_platform_config", { ...cfg, forcedNum: null });
    return parseInt(forcedNum);
  }

  const all = [0,1,2,3,4,5,6,7,8,9];
  let pool = [...all];
  if (forcedColor) pool = pool.filter(n => numberToColor(n) === forcedColor);
  if (forcedSize)  pool = pool.filter(n => numberToSize(n)  === forcedSize);
  if (forcedEven)  pool = pool.filter(n => numberToEven(n)  === forcedEven);
  if (pool.length === 0) pool = all;

  // Smart mode: pick number with fewest bets (max revenue for platform)
  if (colorMode === "smart" || sizeMode === "smart") {
    const txns = DB.get("dp_transactions") || [];
    const now = Date.now();
    const liveBets = {};
    txns.filter(t => t.type === "game_spend" && now - new Date(t.date).getTime() < 120000)
        .forEach(t => {
          const note = t.note || "";
          [0,1,2,3,4,5,6,7,8,9].forEach(n => {
            if (note.includes("number:" + n)) liveBets[n] = (liveBets[n] || 0) + Math.abs(t.diamonds || 0);
          });
          ["red","green","violet","big","small","even","odd"].forEach(k => {
            if (note.includes(k)) liveBets[k] = (liveBets[k] || 0) + Math.abs(t.diamonds || 0);
          });
        });
    pool.sort((a, b) => {
      const bA = (liveBets[a] || 0) + (liveBets[numberToColor(a)] || 0) + (liveBets[numberToSize(a)] || 0);
      const bB = (liveBets[b] || 0) + (liveBets[numberToColor(b)] || 0) + (liveBets[numberToSize(b)] || 0);
      return bA - bB;
    });
    const minVal = (liveBets[pool[0]] || 0);
    const minPool = pool.filter(n => (liveBets[n] || 0) === minVal);
    const result = minPool[Math.floor(Math.random() * minPool.length)];
    const next = { ...cfg, forcedColor: null, forcedSize: null, forcedEven: null };
    DB.set("dp_platform_config", next);
    return result;
  }

  const next = { ...cfg };
  if (forcedColor) next.forcedColor = null;
  if (forcedSize)  next.forcedSize  = null;
  if (forcedEven)  next.forcedEven  = null;
  DB.set("dp_platform_config", next);
  return pool[Math.floor(Math.random() * pool.length)];
};


// ─── COLOR GAME ───────────────────────────────────────────────────────────────
export const RESULT_SHOW_DURATION = 7; // seconds to show result before next round

// The 3 speed "rooms" a player can choose between. Each keeps its own round
// counter + history in DB, and only the selected room's countdown runs.
export const DURATIONS = [
  { id: "15",  label: "15s",   secs: 15,  emoji: "⚡" },
  { id: "30",  label: "30s",   secs: 30,  emoji: "🔥" },
  { id: "60",  label: "1 Min", secs: 60,  emoji: "🕐" },
  { id: "180", label: "3 Min", secs: 180, emoji: "🕒" },
  { id: "300", label: "5 Min", secs: 300, emoji: "🕔" },
  { id: "600", label: "10 Min",secs: 600, emoji: "🕙" },
];

export const ColorGame = ({ user, setUser, setPage, showToast }) => {
  const cfg = DB.get("dp_platform_config") || {};
  const COST = cfg.gameCost || 5;

  const colors = [
    { id: "red",    label: "Red",    bg: "linear-gradient(135deg,#ff3d3d,#ff6b6b)", mult: 2,   emoji: "🔴" },
    { id: "green",  label: "Green",  bg: "linear-gradient(135deg,#00c853,#00ff88)", mult: 2,   emoji: "🟢" },
    { id: "violet", label: "Violet", bg: "linear-gradient(135deg,#b537f2,#8b00ff)", mult: 4.5, emoji: "🟣" },
  ];
  const sizes = [
    { id: "small", label: "Small (0-4)", bg: "linear-gradient(135deg,#ff9d3d,#ffb84d)", mult: 2, emoji: "🔽" },
    { id: "big",   label: "Big (5-9)",   bg: "linear-gradient(135deg,#3d9dff,#4dc4ff)", mult: 2, emoji: "🔼" },
  ];
  const colorMap  = { red: "#ff4444", green: "#00c853", violet: "#b537f2" };
  const colorGlow = { red: "rgba(255,68,68,0.45)", green: "rgba(0,200,83,0.45)", violet: "rgba(181,55,242,0.45)" };
  const sizeMap   = { small: "#ff9d3d", big: "#3d9dff" };
  const sizeGlow  = { small: "rgba(255,157,61,0.45)", big: "rgba(61,157,255,0.45)" };

  // ── which speed room is active ──
  const [duration, setDuration] = useState("30");
  const roundKey   = `dp_color_roundNum_${duration}`;
  const historyKey = `dp_color_history_${duration}`;
  const ROUND_DURATION = DURATIONS.find(d => d.id === duration).secs;

  // ── phase: "betting" | "revealing" | "result"
  const [phase,        setPhase]        = useState("betting");
  const [timer,        setTimer]        = useState(ROUND_DURATION);
  const [resultTimer,  setResultTimer]  = useState(RESULT_SHOW_DURATION);
  const [roundNum,     setRoundNum]     = useState(() => DB.get(roundKey) || 1);
  const [betAmt,       setBetAmt]       = useState(COST);

  // ── Two independent bet slots — user can bet on BOTH Color and Big/Small in the same round ──
  const [colorBet,       setColorBet]       = useState(null); // chosen color id
  const [colorBetPlaced, setColorBetPlaced] = useState(false);
  const [colorBetAmt,    setColorBetAmt]    = useState(0);
  const [sizeBet,        setSizeBet]        = useState(null); // chosen size id
  const [sizeBetPlaced,  setSizeBetPlaced]  = useState(false);
  const [sizeBetAmt,     setSizeBetAmt]     = useState(0);

  const [lastWin,      setLastWin]      = useState(null);       // winning number (0-9)
  const [roundResult,  setRoundResult]  = useState(null);
  const [roundHistory, setRoundHistory] = useState(() => DB.get(historyKey) || []);
  const [animBall,     setAnimBall]     = useState(false);
  const [confetti,     setConfetti]     = useState(false);

  const timerRef       = useRef(null);
  const resultTimerRef = useRef(null);
  const colorBetRef       = useRef(colorBet);
  const colorBetPlacedRef = useRef(colorBetPlaced);
  const colorBetAmtRef    = useRef(colorBetAmt);
  const sizeBetRef        = useRef(sizeBet);
  const sizeBetPlacedRef  = useRef(sizeBetPlaced);
  const sizeBetAmtRef     = useRef(sizeBetAmt);
  const userRef        = useRef(user);
  const durationRef    = useRef(duration);

  useEffect(() => { colorBetRef.current = colorBet; },             [colorBet]);
  useEffect(() => { colorBetPlacedRef.current = colorBetPlaced; }, [colorBetPlaced]);
  useEffect(() => { colorBetAmtRef.current = colorBetAmt; },       [colorBetAmt]);
  useEffect(() => { sizeBetRef.current = sizeBet; },                 [sizeBet]);
  useEffect(() => { sizeBetPlacedRef.current = sizeBetPlaced; },     [sizeBetPlaced]);
  useEffect(() => { sizeBetAmtRef.current = sizeBetAmt; },           [sizeBetAmt]);
  useEffect(() => { userRef.current = user; },           [user]);
  useEffect(() => { durationRef.current = duration; },   [duration]);

  // ── Start betting phase for the currently selected room ──
  const startBettingPhase = () => {
    clearInterval(timerRef.current);
    clearInterval(resultTimerRef.current);
    const d = durationRef.current;
    const secs = DURATIONS.find(x => x.id === d).secs;
    setPhase("betting");
    setColorBetPlaced(false); setColorBet(null); setColorBetAmt(0);
    setSizeBetPlaced(false);  setSizeBet(null);  setSizeBetAmt(0);
    setRoundResult(null);
    setLastWin(null);
    setAnimBall(false);
    setConfetti(false);
    setTimer(secs);

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

  // ── Reveal phase (2 sec animation → show result) ──
  const triggerReveal = () => {
    setPhase("revealing");
    setAnimBall(true);
    setTimeout(() => {
      const d          = durationRef.current;
      const rKey       = `dp_color_roundNum_${d}`;
      const hKey       = `dp_color_history_${d}`;
      const winNum     = getWinningNumber();
      const winColor   = numberToColor(winNum);
      const winSize    = numberToSize(winNum);
      const rNum       = DB.get(rKey) || 1;
      const nextNum    = rNum + 1;
      DB.set(rKey, nextNum);
      setRoundNum(nextNum);

      const colorBetNow       = colorBetRef.current;
      const colorBetPlacedNow = colorBetPlacedRef.current;
      const colorBetAmtNow    = colorBetAmtRef.current;
      const sizeBetNow        = sizeBetRef.current;
      const sizeBetPlacedNow  = sizeBetPlacedRef.current;
      const sizeBetAmtNow     = sizeBetAmtRef.current;

      let colorWin = false, colorPrize = 0;
      if (colorBetPlacedNow && colorBetNow === winColor) {
        colorWin = true;
        colorPrize = Math.floor(colorBetAmtNow * colors.find(c => c.id === winColor).mult);
      }
      let sizeWin = false, sizePrize = 0;
      if (sizeBetPlacedNow && sizeBetNow === winSize) {
        sizeWin = true;
        sizePrize = Math.floor(sizeBetAmtNow * sizes.find(s => s.id === winSize).mult);
      }
      const totalPrize = colorPrize + sizePrize;
      const anyWin = colorWin || sizeWin;

      if (totalPrize > 0) {
        saveGameResult(userRef.current.id, totalPrize, `Color Win - ${winNum} (${winColor}/${winSize})`);
        setUser(u => ({ ...u, diamonds: u.diamonds + totalPrize }));
      }

      const histEntry = {
        round:    rNum,
        number:   winNum,
        color:    winColor,
        size:     winSize,
        time:     new Date().toISOString(),
        colorBet:    colorBetPlacedNow ? colorBetNow : null,
        colorBetAmt: colorBetPlacedNow ? colorBetAmtNow : 0,
        colorWin,   colorPrize,
        sizeBet:     sizeBetPlacedNow ? sizeBetNow : null,
        sizeBetAmt:  sizeBetPlacedNow ? sizeBetAmtNow : 0,
        sizeWin,    sizePrize,
        anyWin, totalPrize,
      };

      const hist    = DB.get(hKey) || [];
      const newHist = [histEntry, ...hist].slice(0, 30);
      DB.set(hKey, newHist);
      setRoundHistory(newHist);
      setLastWin(winNum);
      setRoundResult({
        winNum, winColor, winSize,
        colorBet: colorBetNow, colorBetPlaced: colorBetPlacedNow, colorBetAmt: colorBetAmtNow, colorWin, colorPrize,
        sizeBet: sizeBetNow, sizeBetPlaced: sizeBetPlacedNow, sizeBetAmt: sizeBetAmtNow, sizeWin, sizePrize,
        anyWin, totalPrize,
      });
      setPhase("result");
      setAnimBall(false);
      if (anyWin) setConfetti(true);

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

  // ── Init on mount ──
  useEffect(() => {
    startBettingPhase();
    return () => { clearInterval(timerRef.current); clearInterval(resultTimerRef.current); };
  }, []);

  // ── Switching speed room: stop current round, load that room's own round/history, start fresh betting ──
  const switchDuration = (id) => {
    if (id === duration) return;
    clearInterval(timerRef.current);
    clearInterval(resultTimerRef.current);
    setDuration(id);
    durationRef.current = id;
    setRoundNum(DB.get(`dp_color_roundNum_${id}`) || 1);
    setRoundHistory(DB.get(`dp_color_history_${id}`) || []);
    // startBettingPhase reads durationRef.current, so call after state settles
    setTimeout(startBettingPhase, 0);
  };

  const placeBet = (type, id) => {
    if (phase !== "betting") { showToast("Bets band ho gaye!", "error"); return; }
    const alreadyPlaced = type === "color" ? colorBetPlaced : sizeBetPlaced;
    if (alreadyPlaced) { showToast("Is type par bet pehle se lagi hai!", "error"); return; }
    if (user.diamonds < betAmt) { showToast("Diamonds kam hain!", "error"); return; }
    if (type === "color") {
      setColorBet(id); setColorBetPlaced(true); setColorBetAmt(betAmt);
    } else {
      setSizeBet(id); setSizeBetPlaced(true); setSizeBetAmt(betAmt);
    }
    saveGameResult(user.id, -betAmt, `Color Bet - ${id}`);
    setUser(u => ({ ...u, diamonds: u.diamonds - betAmt, gamesPlayed: u.gamesPlayed + 1 }));
    showToast(`✅ ${id.toUpperCase()} pe ${betAmt}💎 bet lagaya!`, "success");
  };

  const timerPct     = (timer / ROUND_DURATION) * 100;
  const timerColor   = timer <= 5 ? "#ff3d9a" : timer <= 10 ? "#ffd700" : S.neonGreen;
  const circumference = 2 * Math.PI * 48;

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

        {/* ── DURATION TABS (15s / 30s / 1min rooms) */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {DURATIONS.map(d => {
            const active = duration === d.id;
            return (
              <button key={d.id} onClick={() => switchDuration(d.id)} style={{
                flex: 1, padding: "10px 4px", borderRadius: 12,
                background: active ? S.gradBlue : "rgba(255,255,255,0.06)",
                border: `1.5px solid ${active ? S.neonBlue : "rgba(255,255,255,0.1)"}`,
                color: active ? "#fff" : "rgba(255,255,255,0.55)",
                fontWeight: 800, fontSize: 12.5, cursor: "pointer",
                boxShadow: active ? "0 0 14px rgba(0,212,255,0.4)" : "none",
                transition: "all 0.2s",
              }}>
                <div style={{ fontSize: 16, marginBottom: 2 }}>{d.emoji}</div>
                {d.label}
              </button>
            );
          })}
        </div>

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
            <svg width="130" height="130" style={{ transform: "rotate(-90deg)", position: "absolute", inset: 0 }}>
              <circle cx="65" cy="65" r="48" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
              <circle cx="65" cy="65" r="48" fill="none"
                stroke={
                  phase === "result"    ? colorMap[lastWin != null ? numberToColor(lastWin) : "red"] || S.neonBlue :
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
              {phase === "result" && lastWin != null && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{
                    width: 60, height: 60, borderRadius: "50%",
                    background: colorMap[numberToColor(lastWin)],
                    boxShadow: `0 0 30px ${colorGlow[numberToColor(lastWin)]}, 0 0 60px ${colorGlow[numberToColor(lastWin)]}`,
                    animation: "pulse 0.6s ease-in-out 3",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 26, fontWeight: 900, color: "#fff",
                  }}>{lastWin}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── RESULT CARD (shown when phase === result) — shows BOTH color & size outcomes */}
        {phase === "result" && roundResult && (
          <div style={{
            marginBottom: 16,
            borderRadius: 20,
            overflow: "hidden",
            border: `2px solid ${colorMap[roundResult.winColor]}55`,
            background: `linear-gradient(135deg, ${colorMap[roundResult.winColor]}12, rgba(0,0,0,0.4))`,
          }}>
            <div style={{
              background: colorMap[roundResult.winColor],
              padding: "10px 18px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 900, color: "#fff" }}>
                  {roundResult.winNum}
                </div>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 16, color: "#fff" }}>
                    {roundResult.winColor.toUpperCase()} · {roundResult.winSize.toUpperCase()} WINS!
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>Round #{roundNum - 1}</div>
                </div>
              </div>
            </div>

            <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Color bet outcome */}
              {!roundResult.colorBetPlaced ? (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>🎨 Color: koi bet nahi lagaya</div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 700, color: roundResult.colorWin ? S.neonGreen : "#ff6b6b", fontSize: 14 }}>
                      {roundResult.colorWin ? "🎉 Color Jeete!" : "😞 Color Haare"}
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
                      {roundResult.colorBet?.toUpperCase()} pe {roundResult.colorBetAmt}💎 lagaya
                    </div>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: roundResult.colorWin ? S.neonGreen : "#ff6b6b" }}>
                    {roundResult.colorWin ? `+${roundResult.colorPrize}💎` : `-${roundResult.colorBetAmt}💎`}
                  </div>
                </div>
              )}
              {/* Size bet outcome */}
              {!roundResult.sizeBetPlaced ? (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>🔼🔽 Big/Small: koi bet nahi lagaya</div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, color: roundResult.sizeWin ? S.neonGreen : "#ff6b6b", fontSize: 14 }}>
                      {roundResult.sizeWin ? "🎉 Big/Small Jeete!" : "😞 Big/Small Haare"}
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
                      {roundResult.sizeBet?.toUpperCase()} pe {roundResult.sizeBetAmt}💎 lagaya
                    </div>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: roundResult.sizeWin ? S.neonGreen : "#ff6b6b" }}>
                    {roundResult.sizeWin ? `+${roundResult.sizePrize}💎` : `-${roundResult.sizeBetAmt}💎`}
                  </div>
                </div>
              )}
              {(roundResult.colorBetPlaced || roundResult.sizeBetPlaced) && (
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 10 }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontWeight: 700 }}>Total</span>
                  <span style={{ fontSize: 16, fontWeight: 900, color: roundResult.totalPrize > 0 ? S.neonGreen : "rgba(255,255,255,0.6)" }}>
                    {roundResult.totalPrize > 0 ? `+${roundResult.totalPrize}💎` : "0💎"}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── BET AMOUNT SELECTOR (show only during betting) */}
        {phase === "betting" && (!colorBetPlaced || !sizeBetPlaced) && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", marginBottom: 8, letterSpacing: 1 }}>BET AMOUNT (per pick)</div>
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

        {/* ── STATUS LINE ── you can place both a color bet AND a size bet in the same round */}
        <div style={{ marginBottom: 6, fontSize: 11, color: "rgba(255,255,255,0.38)", fontWeight: 700, textAlign: "center", letterSpacing: 0.5 }}>
          {phase === "betting" && !colorBetPlaced && !sizeBetPlaced && "👇 Color aur Big/Small — dono pe ek sath bet laga sakte ho"}
          {phase === "betting" && (colorBetPlaced || sizeBetPlaced) && !(colorBetPlaced && sizeBetPlaced) && "✅ Ek bet lag gaya — chaho to doosra bhi laga do"}
          {phase === "betting" && colorBetPlaced && sizeBetPlaced && "✅ Dono bets lag gaye — result ka wait karo"}
          {phase === "revealing" && "🎲 Bets band — result aa raha hai..."}
          {phase === "result" && `⏳ Agla round ${resultTimer} second mein shuru hoga`}
        </div>

        {/* ── COLOR BET BUTTONS (always shown during betting) ── */}
        <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.4)", marginBottom: 8, letterSpacing: 1 }}>🎨 COLOR</div>
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          {colors.map(c => {
            const isSelected = colorBet === c.id && colorBetPlaced;
            const disabled   = phase !== "betting" || colorBetPlaced;
            return (
              <button key={c.id}
                onClick={() => placeBet("color", c.id)}
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

        {/* ── BIG / SMALL BET BUTTONS (always shown during betting) ── */}
        <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.4)", marginBottom: 8, letterSpacing: 1 }}>🔼🔽 BIG / SMALL</div>
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          {sizes.map(s => {
            const isSelected = sizeBet === s.id && sizeBetPlaced;
            const disabled   = phase !== "betting" || sizeBetPlaced;
            return (
              <button key={s.id}
                onClick={() => placeBet("size", s.id)}
                disabled={disabled}
                style={{
                  flex: 1, borderRadius: 16, padding: "18px 4px",
                  cursor: disabled ? "not-allowed" : "pointer",
                  background: isSelected ? s.bg : "rgba(255,255,255,0.06)",
                  border: `3px solid ${isSelected ? "#fff" : sizeMap[s.id] + "55"}`,
                  color: isSelected ? "#fff" : sizeMap[s.id],
                  fontWeight: 900, fontSize: 13,
                  boxShadow: isSelected ? `0 0 24px ${sizeGlow[s.id]}, 0 0 8px ${sizeMap[s.id]}` : "none",
                  opacity: disabled && !isSelected ? 0.38 : 1,
                  transition: "all 0.2s",
                  transform: isSelected ? "scale(1.04)" : "scale(1)",
                }}>
                <div style={{ fontSize: 24, marginBottom: 4 }}>{s.emoji}</div>
                <div>{s.label}</div>
                <div style={{ fontSize: 11, opacity: 0.78, marginTop: 3 }}>{s.mult}x</div>
              </button>
            );
          })}
        </div>

        {/* ── ROUND HISTORY */}
        <Card style={{ marginTop: 6, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>📋 Round History · {DURATIONS.find(d=>d.id===duration).label}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontWeight: 700 }}>
              {roundHistory.length} rounds
            </div>
          </div>

          {/* Quick number/color dot strip */}
          {roundHistory.length > 0 && (
            <div style={{ display: "flex", gap: 5, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
              {roundHistory.slice(0, 20).map((h, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flexShrink: 0 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: colorMap[h.color],
                    boxShadow: `0 0 8px ${colorGlow[h.color]}`,
                    border: h.anyWin ? "2px solid #fff" : (h.colorBet || h.sizeBet) ? "2px solid #ff6b6b" : "2px solid transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 900, color: "#fff",
                  }}>{h.number}</div>
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
          {roundHistory.slice(0, 10).map((h, i) => {
            const hasBet  = !!(h.colorBet || h.sizeBet);
            const lostAmt = (h.colorBet && !h.colorWin ? h.colorBetAmt : 0) + (h.sizeBet && !h.sizeWin ? h.sizeBetAmt : 0);
            const netAmt  = (h.totalPrize || 0) - lostAmt;
            return (
              <div key={i} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "11px 0",
                borderBottom: i < Math.min(roundHistory.length, 10) - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: "50%",
                    background: colorMap[h.color],
                    boxShadow: `0 0 12px ${colorGlow[h.color]}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16, fontWeight: 900, color: "#fff", flexShrink: 0,
                  }}>{h.number}</div>
                  <div>
                    <div style={{ fontWeight: 800, color: colorMap[h.color], fontSize: 14 }}>
                      {h.color.toUpperCase()} · {h.size?.toUpperCase()}
                    </div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 1 }}>
                      {timeAgo(h.time)}
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontWeight: 700 }}>
                    Round #{h.round}
                  </div>
                </div>

                <div style={{ textAlign: "right", minWidth: 78 }}>
                  {!hasBet ? (
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>—</div>
                  ) : (
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 900, color: netAmt >= 0 ? S.neonGreen : "#ff6b6b" }}>
                        {netAmt >= 0 ? "+" : ""}{netAmt}💎
                      </div>
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>
                        {[h.colorBet ? `🎨${h.colorBet.charAt(0).toUpperCase()}` : null, h.sizeBet ? (h.sizeBet === "big" ? "🔼Big" : "🔽Small") : null].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Stats bar */}
          {roundHistory.length >= 3 && (() => {
            const myRounds = roundHistory.filter(h => h.colorBet || h.sizeBet);
            const myWins   = myRounds.filter(h => h.anyWin).length;
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
                      <div style={{ fontSize: 13, fontWeight: 800, color: (() => {
                        const won  = myRounds.reduce((s,h)=>s+(h.totalPrize||0),0);
                        const lost = myRounds.reduce((s,h)=>s+((h.colorBet && !h.colorWin ? h.colorBetAmt:0)+(h.sizeBet && !h.sizeWin ? h.sizeBetAmt:0)),0);
                        return won - lost >= 0 ? S.neonGreen : "#ff6b6b";
                      })() }}>
                        {(() => {
                          const won  = myRounds.reduce((s,h)=>s+(h.totalPrize||0),0);
                          const lost = myRounds.reduce((s,h)=>s+((h.colorBet && !h.colorWin ? h.colorBetAmt:0)+(h.sizeBet && !h.sizeWin ? h.sizeBetAmt:0)),0);
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



// ─── DICE GAME ────────────────────────────────────────────────────────────────
export const DiceGame = ({ user, setUser, setPage, showToast }) => {
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
    const mode = cfg.diceMode || "smart";
    let r;
    if (mode === "random") {
      r = rnd(1, 6);
    } else if (mode === "smart") {
      const winRate = cfg.diceWinRate ?? 17;
      const forceWin = Math.random() * 100 < winRate;
      if (forceWin) { r = pick; }
      else { do { r = rnd(1, 6); } while (r === pick); }
    } else {
      r = Number(mode); // admin has forced a specific number for every roll
    }
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


// ─── AVIATOR GAME UTILS ────────────────────────────────────────────────────────
export const generateCrashPoint = (avgTarget) => {
  const u = Math.random();
  const lambda = 1 / Math.max(0.1, avgTarget - 1);
  const x = -Math.log(1 - u) / lambda;
  let crash = 1 + x;
  crash = Math.min(crash, 1000);
  return Math.round(crash * 100) / 100;
};

export const getNextCrashPoint = () => {
  const cfg = DB.get("dp_platform_config") || {};
  if (cfg.aviatorMode === "force" && cfg.aviatorForcedCrash) {
    const crash = cfg.aviatorForcedCrash;
    DB.set("dp_platform_config", { ...cfg, aviatorMode: cfg._prevAviatorMode || "smart", aviatorForcedCrash: null });
    return crash;
  }
  if (cfg.aviatorMode === "random") return generateCrashPoint(2.0);
  return generateCrashPoint(cfg.aviatorAvgCrash ?? 2.0);
};

export const AVIATOR_BETTING_DURATION = 6; // seconds to place bets before takeoff

// ─── AVIATOR GAME ───────────────────────────────────────────────────────────────
export const AviatorGame = ({ user, setUser, setPage, showToast }) => {
  const cfg = DB.get("dp_platform_config") || {};
  const COST = cfg.gameCost || 5;

  const [phase, setPhase] = useState("betting"); // betting | flying | crashed
  const [timer, setTimer] = useState(AVIATOR_BETTING_DURATION);
  const [multiplier, setMultiplier] = useState(1.00);
  const [crashPoint, setCrashPoint] = useState(2.00);
  const [roundNum, setRoundNum] = useState(() => DB.get("dp_aviator_roundNum") || 1);
  const [betAmt, setBetAmt] = useState(COST);
  const [betPlaced, setBetPlaced] = useState(false);
  const [cashedOut, setCashedOut] = useState(false);
  const [cashedOutAt, setCashedOutAt] = useState(null);
  const [history, setHistory] = useState(() => DB.get("dp_aviator_history") || []);
  const [trail, setTrail] = useState([]); // { t, m } points for the flight path
  const [shake, setShake] = useState(false);

  const timerRef = useRef(null);
  const flyRafRef = useRef(null);
  const startTimeRef = useRef(null);
  const crashPointRef = useRef(2.00);
  const betPlacedRef = useRef(false);
  const betAmtRef = useRef(betAmt);
  const cashedOutRef = useRef(false);
  const userRef = useRef(user);
  const lastTrailPushRef = useRef(0);

  useEffect(() => { betAmtRef.current = betAmt; }, [betAmt]);
  useEffect(() => { userRef.current = user; }, [user]);

  const startBetting = () => {
    clearInterval(timerRef.current);
    cancelAnimationFrame(flyRafRef.current);
    setPhase("betting");
    setBetPlaced(false); betPlacedRef.current = false;
    setCashedOut(false); cashedOutRef.current = false;
    setCashedOutAt(null);
    setMultiplier(1.00);
    setTrail([]);
    setShake(false);
    setTimer(AVIATOR_BETTING_DURATION);

    timerRef.current = setInterval(() => {
      setTimer(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          startFlying();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const startFlying = () => {
    const cp = getNextCrashPoint();
    crashPointRef.current = cp;
    setCrashPoint(cp);
    setPhase("flying");
    startTimeRef.current = Date.now();
    setTrail([{ t: 0, m: 1.00 }]);
    lastTrailPushRef.current = 0;

    const tick = () => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      // Multiplier accelerates smoothly upward
      const m = Math.round((1 + 0.06 * elapsed * elapsed + 0.15 * elapsed) * 100) / 100;
      if (m >= crashPointRef.current) {
        setMultiplier(crashPointRef.current);
        setShake(true);
        setTimeout(() => setShake(false), 400);
        endRound(crashPointRef.current);
        return;
      }
      setMultiplier(m);
      if (elapsed - lastTrailPushRef.current > 0.05) {
        lastTrailPushRef.current = elapsed;
        setTrail(prev => [...prev.slice(-80), { t: elapsed, m }]);
      }
      flyRafRef.current = requestAnimationFrame(tick);
    };
    flyRafRef.current = requestAnimationFrame(tick);
  };

  const endRound = (finalCrash) => {
    setPhase("crashed");

    // If user placed bet but never cashed out, they lose (already deducted at bet time)
    const rNum = DB.get("dp_aviator_roundNum") || 1;
    const nextNum = rNum + 1;
    DB.set("dp_aviator_roundNum", nextNum);
    setRoundNum(nextNum);

    const histEntry = {
      round: rNum,
      crash: finalCrash,
      time: new Date().toISOString(),
      userBet: betPlacedRef.current ? betAmtRef.current : 0,
      userCashedOut: cashedOutRef.current,
    };
    const hist = DB.get("dp_aviator_history") || [];
    const newHist = [histEntry, ...hist].slice(0, 30);
    DB.set("dp_aviator_history", newHist);
    setHistory(newHist);

    if (betPlacedRef.current && !cashedOutRef.current) {
      showToast(`💥 Crashed @ ${finalCrash.toFixed(2)}x — bet lose ho gaya!`, "error");
    }

    setTimeout(() => startBetting(), 2800);
  };

  useEffect(() => {
    startBetting();
    return () => { clearInterval(timerRef.current); cancelAnimationFrame(flyRafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const placeBet = () => {
    if (phase !== "betting") { showToast("Round shuru ho chuka hai, agle round ka wait karo!", "error"); return; }
    if (betPlaced) { showToast("Bet pehle se laga di hai!", "error"); return; }
    if (user.diamonds < betAmt) { showToast("Diamonds kam hain!", "error"); return; }
    setBetPlaced(true); betPlacedRef.current = true;
    saveGameResult(user.id, -betAmt, "Aviator Bet");
    setUser(u => ({ ...u, diamonds: u.diamonds - betAmt, gamesPlayed: u.gamesPlayed + 1 }));
    showToast(`✅ ${betAmt}💎 bet lagaya! Takeoff ka wait karo`, "success");
  };

  const cashOut = () => {
    if (phase !== "flying" || !betPlaced || cashedOut) return;
    const prize = Math.floor(betAmtRef.current * multiplier);
    setCashedOut(true); cashedOutRef.current = true;
    setCashedOutAt(multiplier);
    saveGameResult(user.id, prize, `Aviator Cash Out @${multiplier.toFixed(2)}x`);
    setUser(u => ({ ...u, diamonds: u.diamonds + prize }));
    showToast(`💰 Cash out @ ${multiplier.toFixed(2)}x — +${prize}💎!`, "success");
  };

  const betOptions = [COST, COST * 2, COST * 5, COST * 10, COST * 20];

  // Plane position along an arc based on current multiplier progress
  const progress = phase === "betting" ? 0 : Math.min(1, (multiplier - 1) / Math.max(0.5, crashPoint - 1));
  const planeX = 10 + progress * 75;
  const planeY = 82 - progress * 60;

  return (
    <div style={S.page}>
      <TopBar title="✈️ Aviator" onBack={() => setPage("games")} right={<DiamondChip amount={user.diamonds} />} />

      <div style={{ padding: "14px 18px 120px" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", fontWeight: 800, letterSpacing: 2 }}>
            ROUND #{String(roundNum).padStart(4, "0")}
          </div>
          {phase === "betting" && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(0,255,136,0.1)", border: "1px solid rgba(0,255,136,0.3)", borderRadius: 20, padding: "4px 14px" }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: S.neonGreen, animation: "pulse 1s infinite" }} />
              <span style={{ fontSize: 11, fontWeight: 800, color: S.neonGreen }}>BETTING · {timer}s</span>
            </div>
          )}
          {phase === "flying" && (
            <div style={{ fontSize: 11, fontWeight: 800, color: "#ff3d3d", background: "rgba(255,61,61,0.1)", border: "1px solid rgba(255,61,61,0.3)", borderRadius: 20, padding: "4px 14px" }}>✈️ FLYING</div>
          )}
          {phase === "crashed" && (
            <div style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: "4px 14px" }}>💥 CRASHED</div>
          )}
        </div>

        {/* ── FLIGHT DISPLAY */}
        <div style={{
          position: "relative", height: 220, borderRadius: 20, marginBottom: 16, overflow: "hidden",
          background: "radial-gradient(circle at 22% 105%, rgba(255,61,61,0.22), #0a0505 68%)",
          border: `1px solid ${phase === "crashed" ? "rgba(255,61,61,0.5)" : "rgba(255,61,61,0.15)"}`,
          animation: shake ? "aviatorShake 0.4s" : "none",
          boxShadow: phase === "flying" ? "0 0 30px rgba(255,61,61,0.15) inset" : "none",
        }}>
          {/* radiating rays behind everything */}
          <div style={{
            position: "absolute", inset: "-30%",
            background: "repeating-conic-gradient(from 0deg, rgba(255,61,61,0.05) 0deg 4deg, transparent 4deg 14deg)",
            animation: "spin 40s linear infinite",
            opacity: phase === "crashed" ? 0.7 : 0.5,
          }} />

          {/* grid lines */}
          <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
            {[0.25, 0.5, 0.75].map(f => (
              <line key={f} x1="0" y1={`${f * 100}%`} x2="100%" y2={`${f * 100}%`} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
            ))}
          </svg>

          {/* flight trail path with glow */}
          {trail.length > 1 && (
            <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }} viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                <linearGradient id="aviatorTrailGrad" x1="0" y1="1" x2="1" y2="0">
                  <stop offset="0%" stopColor="#ffd700" stopOpacity="0.9" />
                  <stop offset="100%" stopColor={phase === "crashed" ? "#ff3d3d" : "#ff6b35"} stopOpacity="1" />
                </linearGradient>
              </defs>
              {/* soft glow underlay */}
              <polyline
                points={trail.map((p, i) => {
                  const px = 10 + (i / Math.max(1, trail.length - 1)) * progress * 75;
                  const py = 82 - Math.min(1, (p.m - 1) / Math.max(0.5, crashPoint - 1)) * 60;
                  return `${px},${py}`;
                }).join(" ")}
                fill="none" stroke={phase === "crashed" ? "#ff3d3d" : "#ff6b35"} strokeWidth="5" opacity="0.25" strokeLinecap="round"
              />
              {/* crisp core line */}
              <polyline
                points={trail.map((p, i) => {
                  const px = 10 + (i / Math.max(1, trail.length - 1)) * progress * 75;
                  const py = 82 - Math.min(1, (p.m - 1) / Math.max(0.5, crashPoint - 1)) * 60;
                  return `${px},${py}`;
                }).join(" ")}
                fill="none" stroke="url(#aviatorTrailGrad)" strokeWidth="2" strokeLinecap="round"
              />
              {/* filled area under the curve for a "chart" feel */}
              <polygon
                points={`10,82 ${trail.map((p, i) => {
                  const px = 10 + (i / Math.max(1, trail.length - 1)) * progress * 75;
                  const py = 82 - Math.min(1, (p.m - 1) / Math.max(0.5, crashPoint - 1)) * 60;
                  return `${px},${py}`;
                }).join(" ")} ${planeX},82`}
                fill={phase === "crashed" ? "rgba(255,61,61,0.08)" : "rgba(255,107,53,0.08)"}
              />
            </svg>
          )}

          {/* smoke/thrust particle trail behind the plane */}
          {phase === "flying" && trail.slice(-8).map((p, i) => {
            const idx = trail.length - 8 + i;
            const px = 10 + (Math.max(0, idx) / Math.max(1, trail.length - 1)) * progress * 75;
            const py = 82 - Math.min(1, (p.m - 1) / Math.max(0.5, crashPoint - 1)) * 60;
            return (
              <div key={p.t} style={{
                position: "absolute", left: `${px}%`, top: `${py}%`, width: 5, height: 5, borderRadius: "50%",
                background: "rgba(255,150,90,0.5)", transform: "translate(-50%,-50%)",
                opacity: (i + 1) / 8 * 0.6, pointerEvents: "none",
              }} />
            );
          })}

          {/* plane */}
          {phase !== "betting" && (
            <div style={{
              position: "absolute", left: `${planeX}%`, top: `${planeY}%`, fontSize: 32,
              transform: `translate(-50%,-50%) rotate(${phase === "crashed" ? 35 : -18}deg) scale(${phase === "crashed" ? 1.15 : 1})`,
              transition: phase === "flying" ? "none" : "transform 0.3s ease",
              filter: phase === "crashed"
                ? "grayscale(0.3) brightness(0.85) drop-shadow(0 0 14px rgba(255,61,61,0.9))"
                : "drop-shadow(0 0 10px rgba(255,110,60,0.85))",
            }}>
              {phase === "crashed" ? "💥" : "✈️"}
            </div>
          )}

          {/* multiplier readout */}
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            {phase === "betting" ? (
              <>
                <div style={{ fontSize: 15, color: "rgba(255,255,255,0.4)", fontWeight: 700, marginBottom: 6 }}>Next flight in</div>
                <div style={{ fontSize: 40, fontWeight: 900, color: S.neonGreen }}>{timer}s</div>
              </>
            ) : (
              <div style={{
                fontSize: 46, fontWeight: 900,
                color: phase === "crashed" ? "#ff3d3d" : "#fff",
                textShadow: phase === "flying" ? "0 0 24px rgba(255,107,53,0.7)" : phase === "crashed" ? "0 0 20px rgba(255,61,61,0.6)" : "none",
                transition: "color 0.2s",
              }}>
                {multiplier.toFixed(2)}x
              </div>
            )}
            {phase === "crashed" && <div style={{ fontSize: 13, color: "rgba(255,61,61,0.8)", fontWeight: 800, marginTop: 4 }}>FLEW AWAY!</div>}
          </div>
        </div>

        {/* ── RESULT (cashed out banner) */}
        {phase !== "betting" && betPlaced && cashedOut && (
          <Card style={{ marginBottom: 14, background: "rgba(0,255,136,0.08)", border: `1px solid ${S.neonGreen}55` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 800, color: S.neonGreen, fontSize: 14 }}>🎉 Cash Out ho gaya!</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>@ {cashedOutAt?.toFixed(2)}x</div>
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color: S.neonGreen }}>+{Math.floor(betAmtRef.current * cashedOutAt)}💎</div>
            </div>
          </Card>
        )}
        {phase === "crashed" && betPlaced && !cashedOut && (
          <Card style={{ marginBottom: 14, background: "rgba(255,61,61,0.08)", border: "1px solid rgba(255,61,61,0.4)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 800, color: "#ff6b6b", fontSize: 14 }}>😞 Bach nahi paye!</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Plane {crashPoint.toFixed(2)}x pe crash ho gaya</div>
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#ff6b6b" }}>-{betAmtRef.current}💎</div>
            </div>
          </Card>
        )}

        {/* ── BET AMOUNT SELECTOR */}
        {phase === "betting" && !betPlaced && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", marginBottom: 8, letterSpacing: 1 }}>BET AMOUNT</div>
            <div style={{ display: "flex", gap: 7 }}>
              {betOptions.map(amt => (
                <button key={amt} onClick={() => setBetAmt(amt)} style={{
                  flex: 1, padding: "9px 4px", borderRadius: 10,
                  background: betAmt === amt ? "linear-gradient(135deg,#ff3d3d,#cc0000)" : "rgba(255,255,255,0.06)",
                  border: `1px solid ${betAmt === amt ? "#ff3d3d" : "rgba(255,255,255,0.1)"}`,
                  color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer",
                }}>
                  {amt}💎
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── ACTION BUTTON */}
        {phase === "betting" && (
          <Btn full disabled={betPlaced} onClick={placeBet} style={{ background: betPlaced ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg,#ff3d3d,#cc0000)", boxShadow: betPlaced ? "none" : "0 4px 20px rgba(255,61,61,0.35)" }}>
            {betPlaced ? `✅ ${betAmt}💎 Bet Placed — wait for takeoff` : `✈️ Place Bet — ${betAmt}💎`}
          </Btn>
        )}
        {phase === "flying" && betPlaced && !cashedOut && (
          <Btn full onClick={cashOut} variant="green">💰 Cash Out @ {multiplier.toFixed(2)}x — Win {Math.floor(betAmtRef.current * multiplier)}💎</Btn>
        )}
        {phase === "flying" && (!betPlaced || cashedOut) && (
          <div style={{ textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.35)", padding: "14px 0" }}>
            {cashedOut ? "Already cashed out — agle round ka wait karo" : "Is round mein bet nahi laga — agle round ka wait karo"}
          </div>
        )}
        {phase === "crashed" && (
          <div style={{ textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.35)", padding: "14px 0" }}>Agla round shuru ho raha hai...</div>
        )}

        {/* ── HISTORY */}
        <Card style={{ marginTop: 16, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>📋 Flight History</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontWeight: 700 }}>{history.length} rounds</div>
          </div>
          {history.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px 0", color: "rgba(255,255,255,0.25)", fontSize: 13 }}>Abhi koi round complete nahi hua</div>
          ) : (
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
              {history.slice(0, 20).map((h, i) => (
                <div key={i} style={{
                  flexShrink: 0, padding: "6px 10px", borderRadius: 10,
                  background: h.crash >= 2 ? "rgba(0,255,136,0.12)" : "rgba(255,61,61,0.12)",
                  border: `1px solid ${h.crash >= 2 ? "rgba(0,255,136,0.3)" : "rgba(255,61,61,0.3)"}`,
                  fontSize: 12, fontWeight: 800, color: h.crash >= 2 ? S.neonGreen : "#ff6b6b",
                }}>
                  {h.crash.toFixed(2)}x
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};


// ─── NUMBER GAME ──────────────────────────────────────────────────────────────
export const NumberGame = ({ user, setUser, setPage, showToast }) => {
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
export const ScratchGame = ({ user, setUser, setPage, showToast }) => {
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


// ═══════════════════════════════════════════════════════════════════════════
// QUIZ BATTLE 1v1 — education-based head-to-head betting quiz
// Both players stake ₹10 (₹20 pool). Winner takes ₹18, platform keeps ₹2.
// Matchmaking + live state is stored in Firestore (dp_quiz_battles) so both
// players' devices stay in sync via the app's existing live-sync mechanism.
// ═══════════════════════════════════════════════════════════════════════════

export const QUIZ_BET = 10;
export const QUIZ_QUESTIONS_PER_BATTLE = 5;
export const QUIZ_SECONDS_PER_Q = 12;
export const QUIZ_WAIT_TIMEOUT_SEC = 45; // auto-refund if no opponent found

// Education-based GK / Math / Science / India-focused question bank.
export const QUIZ_QUESTION_BANK = [
  { subject: "GK", q: "What is the capital of India?", options: ["Mumbai", "New Delhi", "Kolkata", "Chennai"], correct: 1 },
  { subject: "GK", q: "Which is the largest state in India by area?", options: ["Maharashtra", "Madhya Pradesh", "Rajasthan", "Uttar Pradesh"], correct: 2 },
  { subject: "GK", q: "Who is known as the 'Father of the Nation' in India?", options: ["Jawaharlal Nehru", "Subhas Chandra Bose", "Mahatma Gandhi", "Sardar Patel"], correct: 2 },
  { subject: "GK", q: "Which river is known as the 'Ganga of the South'?", options: ["Krishna", "Godavari", "Kaveri", "Narmada"], correct: 1 },
  { subject: "GK", q: "What is the national animal of India?", options: ["Lion", "Elephant", "Bengal Tiger", "Leopard"], correct: 2 },
  { subject: "GK", q: "Which is the smallest state in India by area?", options: ["Sikkim", "Goa", "Tripura", "Nagaland"], correct: 1 },
  { subject: "GK", q: "The Sun Temple at Konark is located in which state?", options: ["Odisha", "West Bengal", "Bihar", "Jharkhand"], correct: 0 },
  { subject: "GK", q: "Which city is known as the 'Silicon Valley of India'?", options: ["Hyderabad", "Pune", "Bengaluru", "Chennai"], correct: 2 },
  { subject: "GK", q: "How many states does India currently have?", options: ["26", "28", "29", "27"], correct: 1 },
  { subject: "GK", q: "Which is the longest river in India?", options: ["Yamuna", "Godavari", "Brahmaputra", "Ganga"], correct: 3 },
  { subject: "Math", q: "What is 15 × 8?", options: ["110", "120", "130", "115"], correct: 1 },
  { subject: "Math", q: "What is the square root of 144?", options: ["11", "12", "13", "14"], correct: 1 },
  { subject: "Math", q: "What is 25% of 400?", options: ["50", "75", "100", "125"], correct: 2 },
  { subject: "Math", q: "What is 7² (7 squared)?", options: ["14", "49", "42", "56"], correct: 1 },
  { subject: "Math", q: "What is the value of π (pi) rounded to 2 decimals?", options: ["3.12", "3.14", "3.16", "3.18"], correct: 1 },
  { subject: "Math", q: "What is 100 ÷ 4?", options: ["20", "25", "30", "40"], correct: 1 },
  { subject: "Math", q: "How many sides does a hexagon have?", options: ["5", "6", "7", "8"], correct: 1 },
  { subject: "Math", q: "What is 9 × 9?", options: ["81", "72", "90", "99"], correct: 0 },
  { subject: "Science", q: "What is the chemical symbol for water?", options: ["H2O", "O2", "CO2", "HO2"], correct: 0 },
  { subject: "Science", q: "Which planet is known as the 'Red Planet'?", options: ["Venus", "Mars", "Jupiter", "Saturn"], correct: 1 },
  { subject: "Science", q: "What is the powerhouse of the cell?", options: ["Nucleus", "Ribosome", "Mitochondria", "Cytoplasm"], correct: 2 },
  { subject: "Science", q: "How many bones are there in the adult human body?", options: ["196", "206", "216", "226"], correct: 1 },
  { subject: "Science", q: "What gas do plants absorb from the atmosphere for photosynthesis?", options: ["Oxygen", "Nitrogen", "Carbon dioxide", "Hydrogen"], correct: 2 },
  { subject: "Science", q: "What is the boiling point of water at sea level (°C)?", options: ["90", "100", "110", "120"], correct: 1 },
  { subject: "Science", q: "Which organ pumps blood throughout the human body?", options: ["Lungs", "Liver", "Heart", "Kidney"], correct: 2 },
  { subject: "Science", q: "What is the closest star to Earth?", options: ["Proxima Centauri", "The Sun", "Sirius", "Alpha Centauri"], correct: 1 },
  { subject: "History", q: "In which year did India gain independence?", options: ["1945", "1946", "1947", "1948"], correct: 2 },
  { subject: "History", q: "Who was the first Prime Minister of India?", options: ["Jawaharlal Nehru", "Lal Bahadur Shastri", "Sardar Patel", "Rajendra Prasad"], correct: 0 },
  { subject: "History", q: "The Quit India Movement was launched in which year?", options: ["1930", "1942", "1945", "1920"], correct: 1 },
  { subject: "History", q: "Who built the Taj Mahal?", options: ["Akbar", "Humayun", "Shah Jahan", "Aurangzeb"], correct: 2 },
  { subject: "History", q: "Who was India's first President?", options: ["Dr. Rajendra Prasad", "Dr. S. Radhakrishnan", "Jawaharlal Nehru", "Zakir Hussain"], correct: 0 },
  { subject: "Geography", q: "Which is the highest mountain peak in the world?", options: ["K2", "Kangchenjunga", "Mount Everest", "Nanga Parbat"], correct: 2 },
  { subject: "Geography", q: "Which is the largest ocean in the world?", options: ["Atlantic", "Indian", "Arctic", "Pacific"], correct: 3 },
  { subject: "Geography", q: "Which is the largest continent by area?", options: ["Africa", "Asia", "North America", "Europe"], correct: 1 },
  { subject: "Geography", q: "Which desert is the largest hot desert in the world?", options: ["Thar", "Gobi", "Sahara", "Kalahari"], correct: 2 },
  { subject: "Geography", q: "Which country has the largest population in the world (as of recent data)?", options: ["China", "India", "USA", "Indonesia"], correct: 1 },
  { subject: "GK", q: "Which sport is associated with the term 'Yorker'?", options: ["Football", "Cricket", "Hockey", "Badminton"], correct: 1 },
  { subject: "GK", q: "What is the currency of Japan?", options: ["Yuan", "Won", "Yen", "Ringgit"], correct: 2 },
  { subject: "GK", q: "Who wrote the Indian National Anthem?", options: ["Bankim Chandra Chatterjee", "Rabindranath Tagore", "Sarojini Naidu", "Muhammad Iqbal"], correct: 1 },
  { subject: "GK", q: "Which is the national bird of India?", options: ["Parrot", "Peacock", "Sparrow", "Crane"], correct: 1 },
  { subject: "GK", q: "How many players are there in a cricket team on the field?", options: ["9", "10", "11", "12"], correct: 2 },
];

// Icons used when auto-seeding categories from the legacy hardcoded bank.
const QUIZ_CATEGORY_ICONS = { GK: "🧠", Math: "🔢", Science: "🔬", History: "🏛️", Geography: "🌍" };

// One-time migration: turns the old hardcoded QUIZ_QUESTION_BANK into real,
// admin-editable Firestore data (dp_quiz_categories / dp_quiz_questions).
// Safe to call repeatedly — only seeds if the collections don't exist yet.
export const ensureQuizDataSeeded = () => {
  if (!DB.get("dp_quiz_categories")) {
    const names = [...new Set(QUIZ_QUESTION_BANK.map(q => q.subject))];
    DB.set("dp_quiz_categories", names.map(name => ({
      id: name.toLowerCase(), name, icon: QUIZ_CATEGORY_ICONS[name] || "❓", active: true,
    })));
  }
  if (!DB.get("dp_quiz_questions")) {
    DB.set("dp_quiz_questions", QUIZ_QUESTION_BANK.map(q => ({
      id: tid(), categoryId: q.subject.toLowerCase(), question: q.q,
      options: q.options, correct: q.correct, active: true, difficulty: "medium", createdAt: new Date().toISOString(),
    })));
  }
};

// ── Daily difficulty scaling ──────────────────────────────────────────────────
// Once QUIZ_HARD_MODE_THRESHOLD battles have been played today, matchmaking
// switches to pulling from "hard" tagged questions only, and the pool resets
// again the next calendar day. Admin can override the threshold from the
// Quiz Battle admin panel (dp_platform_config.quizHardThreshold).
// Curated pack of tougher questions — used by the 1-click "Import Hard Pack"
// button in the admin Question Bank, since the game should draw only from
// Hard / Very Hard tagged content going forward (no Easy/Medium).
export const QUIZ_HARD_PACK = [
  { subject: "GK", difficulty: "hard", q: "Which Indian state has the longest coastline?", options: ["Tamil Nadu", "Gujarat", "Andhra Pradesh", "Maharashtra"], correct: 1 },
  { subject: "GK", difficulty: "hard", q: "The Bhakra Nangal Dam is built on which river?", options: ["Sutlej", "Beas", "Ravi", "Chenab"], correct: 0 },
  { subject: "GK", difficulty: "very_hard", q: "Which Indian classical dance form originated in Kerala?", options: ["Bharatanatyam", "Kathak", "Kathakali", "Odissi"], correct: 2 },
  { subject: "GK", difficulty: "very_hard", q: "The Chola dynasty was famous for its expertise in which field?", options: ["Naval power & maritime trade", "Desert warfare", "Mountain fortresses", "Glassmaking"], correct: 0 },
  { subject: "GK", difficulty: "hard", q: "Which is the second most spoken language in the world by native speakers?", options: ["English", "Hindi", "Mandarin Chinese", "Spanish"], correct: 3 },
  { subject: "GK", difficulty: "very_hard", q: "The 'Sentinel-2' is a satellite series operated by which space agency?", options: ["ISRO", "NASA", "ESA", "Roscosmos"], correct: 2 },
  { subject: "Math", difficulty: "hard", q: "What is the value of log₁₀(1000)?", options: ["2", "3", "10", "100"], correct: 1 },
  { subject: "Math", difficulty: "hard", q: "If a train travels 360 km in 4 hours, what is its speed in m/s?", options: ["25 m/s", "30 m/s", "90 m/s", "40 m/s"], correct: 1 },
  { subject: "Math", difficulty: "very_hard", q: "What is the sum of the interior angles of a regular decagon (10 sides)?", options: ["1260°", "1440°", "1620°", "1800°"], correct: 1 },
  { subject: "Math", difficulty: "very_hard", q: "What is the compound interest on ₹10,000 at 10% p.a. for 2 years?", options: ["₹2,000", "₹2,100", "₹2,200", "₹1,000"], correct: 1 },
  { subject: "Math", difficulty: "hard", q: "What is the LCM of 12 and 18?", options: ["24", "36", "48", "72"], correct: 1 },
  { subject: "Science", difficulty: "hard", q: "Which part of the human brain controls balance and coordination?", options: ["Cerebrum", "Cerebellum", "Medulla", "Hypothalamus"], correct: 1 },
  { subject: "Science", difficulty: "very_hard", q: "What is the SI unit of electrical resistance?", options: ["Volt", "Ampere", "Ohm", "Watt"], correct: 2 },
  { subject: "Science", difficulty: "hard", q: "Which gas is most abundant in Earth's atmosphere?", options: ["Oxygen", "Carbon dioxide", "Nitrogen", "Argon"], correct: 2 },
  { subject: "Science", difficulty: "very_hard", q: "Which vitamin is synthesized by the human skin on exposure to sunlight?", options: ["Vitamin A", "Vitamin C", "Vitamin D", "Vitamin K"], correct: 2 },
  { subject: "Science", difficulty: "hard", q: "What is the atomic number of Carbon?", options: ["4", "6", "8", "12"], correct: 1 },
  { subject: "Science", difficulty: "very_hard", q: "Which scientist proposed the theory of continental drift?", options: ["Charles Darwin", "Alfred Wegener", "Isaac Newton", "Nicolaus Copernicus"], correct: 1 },
  { subject: "History", difficulty: "hard", q: "The Battle of Plassey (1757) was fought between the British and which ruler?", options: ["Tipu Sultan", "Siraj-ud-Daulah", "Bahadur Shah Zafar", "Shivaji"], correct: 1 },
  { subject: "History", difficulty: "very_hard", q: "Who founded the Ahom dynasty in Assam?", options: ["Sukaphaa", "Ashoka", "Harsha", "Rudramadevi"], correct: 0 },
  { subject: "History", difficulty: "hard", q: "The Dandi March (Salt March) took place in which year?", options: ["1920", "1930", "1935", "1942"], correct: 1 },
  { subject: "History", difficulty: "very_hard", q: "Which Mughal emperor introduced the 'Din-i-Ilahi' religion?", options: ["Babur", "Humayun", "Akbar", "Jahangir"], correct: 2 },
  { subject: "Geography", difficulty: "hard", q: "Which strait separates India from Sri Lanka?", options: ["Malacca Strait", "Palk Strait", "Bering Strait", "Gibraltar Strait"], correct: 1 },
  { subject: "Geography", difficulty: "very_hard", q: "Which is the deepest point in the world's oceans?", options: ["Java Trench", "Puerto Rico Trench", "Mariana Trench", "Tonga Trench"], correct: 2 },
  { subject: "Geography", difficulty: "hard", q: "Which Indian state is known as the 'Spice Garden of India'?", options: ["Karnataka", "Kerala", "Tamil Nadu", "Goa"], correct: 1 },
  { subject: "Geography", difficulty: "very_hard", q: "The Tropic of Cancer does NOT pass through which of these Indian states?", options: ["Gujarat", "Madhya Pradesh", "Punjab", "West Bengal"], correct: 2 },
];

// One-click bulk import used by the admin Question Bank — adds the whole
// curated hard-question pack in a single call, skipping any question whose
// text already exists so it's safe to click more than once.
export const adminImportHardPack = () => {
  ensureQuizDataSeeded();
  const categories = DB.get("dp_quiz_categories") || [];
  const existing = DB.get("dp_quiz_questions") || [];
  const existingText = new Set(existing.map(q => q.question.trim().toLowerCase()));
  const catIdFor = (subjectName) => {
    const found = categories.find(c => c.name.toLowerCase() === subjectName.toLowerCase() || c.id === subjectName.toLowerCase());
    return found ? found.id : subjectName.toLowerCase();
  };
  const toAdd = QUIZ_HARD_PACK
    .filter(q => !existingText.has(q.q.trim().toLowerCase()))
    .map(q => ({
      id: tid(), categoryId: catIdFor(q.subject), question: q.q, options: q.options,
      correct: q.correct, active: true, difficulty: q.difficulty, createdAt: new Date().toISOString(),
    }));
  if (toAdd.length) DB.set("dp_quiz_questions", [...toAdd, ...existing]);
  return toAdd.length;
};

// ─── PDF QUESTION BANK IMPORT ───────────────────────────────────────────────
// Admin uploads a PDF of MCQs → we extract the raw text client-side (pdfjs)
// → parse it into {question, options[4], correctIndex} objects → admin
// reviews/edits the parsed list in AdminQuizQuestions before committing, and
// can choose to replace the whole bank or add to it.
//
// Recognised layout (very common for exam/question-bank PDFs):
//   1. Question text goes here?
//   A) option one          (also accepts a) / (a) / a. / a-)
//   B) option two
//   C) option three
//   D) option four
//   Answer: B               (also accepts Ans:, Correct Answer:, and 1-4 instead of A-D)
//
// This is a heuristic parser, not a guarantee — that's why the admin UI
// always shows a review/edit screen before anything is saved.
let _pdfjsLib = null;
export const extractTextFromPdf = async (file) => {
  if (!_pdfjsLib) {
    _pdfjsLib = await import("pdfjs-dist/build/pdf.mjs");
    _pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs";
  }
  const buf = await file.arrayBuffer();
  const pdf = await _pdfjsLib.getDocument({ data: buf }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Group by vertical position so wrapped lines don't glue together
    let lastY = null, line = "";
    content.items.forEach(item => {
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) { text += line + "\n"; line = ""; }
      line += item.str + " ";
      lastY = y;
    });
    text += line + "\n\n";
  }
  return text;
};

const OPTION_RE = /^\s*[\(\[]?([A-Da-d1-4])[\)\.\]\-:]\s+(.{1,300})$/;
const QSTART_RE = /^\s*(?:Q\.?\s*)?(\d{1,4})[\.\)\:]\s+(.{5,400})$/;
const ANSWER_RE = /^\s*(?:Ans(?:wer)?|Correct\s*Ans(?:wer)?|Correct\s*Option)\s*[:\-]?\s*\(?([A-Da-d1-4])\)?\.?\s*$/i;
const ANSWER_INLINE_RE = /(?:Ans(?:wer)?|Correct\s*Ans(?:wer)?)\s*[:\-]?\s*\(?([A-Da-d1-4])\)?/i;

const letterToIndex = (ch) => {
  const c = ch.toLowerCase();
  if (["a", "1"].includes(c)) return 0;
  if (["b", "2"].includes(c)) return 1;
  if (["c", "3"].includes(c)) return 2;
  if (["d", "4"].includes(c)) return 3;
  return -1;
};

export const parseQuizPdfText = (rawText) => {
  const lines = rawText.split("\n").map(l => l.trim()).filter(Boolean);
  const parsed = [];
  let unparsedCount = 0;
  let cur = null; // { question, options: [], answerIdx }

  const finalize = () => {
    if (!cur) return;
    if (cur.question && cur.options.length === 4 && cur.answerIdx >= 0 && cur.answerIdx <= 3) {
      parsed.push({ question: cur.question.trim(), options: cur.options.map(o => o.trim()), correct: cur.answerIdx });
    } else if (cur.question) {
      unparsedCount++;
    }
    cur = null;
  };

  for (const line of lines) {
    const ansInline = line.match(ANSWER_INLINE_RE);
    const qMatch = line.match(QSTART_RE);
    const optMatch = line.match(OPTION_RE);
    const ansMatch = line.match(ANSWER_RE);

    if (qMatch && !optMatch) {
      finalize();
      let qText = qMatch[2];
      let answerIdx = -1;
      if (ansInline) { answerIdx = letterToIndex(ansInline[1]); qText = qText.replace(ANSWER_INLINE_RE, "").trim(); }
      cur = { question: qText, options: [], answerIdx };
    } else if (optMatch && cur) {
      let optText = optMatch[2];
      let answerIdx = -1;
      if (ansInline) { answerIdx = letterToIndex(ansInline[1]); optText = optText.replace(ANSWER_INLINE_RE, "").trim(); }
      if (cur.options.length < 4) cur.options.push(optText);
      if (answerIdx >= 0) cur.answerIdx = answerIdx;
    } else if (ansMatch && cur) {
      cur.answerIdx = letterToIndex(ansMatch[1]);
    } else if (cur && cur.options.length === 0 && !qMatch) {
      // Question text wrapped onto a second line before any options appear
      cur.question += " " + line;
    }
  }
  finalize();
  return { parsed, unparsedCount };
};



const quizTodayKey = () => new Date().toISOString().slice(0, 10);

export const getQuizDailyStats = () => {
  const stats = DB.get("dp_quiz_daily_stats") || {};
  const key = quizTodayKey();
  const cfg = DB.get("dp_platform_config") || {};
  const threshold = cfg.quizHardThreshold || QUIZ_HARD_MODE_THRESHOLD;
  const count = stats[key] || 0;
  return { date: key, count, threshold, hardModeActive: count >= threshold };
};

const bumpQuizDailyCount = () => {
  const stats = DB.get("dp_quiz_daily_stats") || {};
  const key = quizTodayKey();
  // Keep only today + yesterday to avoid the object growing forever.
  const trimmed = {}; Object.keys(stats).slice(-2).forEach(k => trimmed[k] = stats[k]);
  trimmed[key] = (stats[key] || 0) + 1;
  DB.set("dp_quiz_daily_stats", trimmed);
};

// ── Daily question rotation ───────────────────────────────────────────────────
// Rather than the whole bank being "live" every single day (which feels
// repetitive once the bank is large from bulk PDF imports), each calendar
// day deterministically shuffles the active bank and exposes only the first
// `quizDailyPoolSize` questions as "today's pool". Same seed everywhere =
// every player's device agrees on today's pool without any extra storage,
// and it's a fresh mix again tomorrow.
const mulberry32 = (seed) => () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const seededShuffle = (arr, seed) => {
  const rand = mulberry32(seed);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const getDailyQuizPool = (source) => {
  const cfg = DB.get("dp_platform_config") || {};
  const poolSize = cfg.quizDailyPoolSize || 150;
  if (source.length <= poolSize) return source; // small bank — every question is "today's pool" anyway
  const seed = Number(quizTodayKey().replace(/-/g, "")); // e.g. 20260721 — same for every device today
  return seededShuffle(source, seed).slice(0, poolSize);
};

const pickQuizQuestions = () => {
  ensureQuizDataSeeded();
  const activeCatIds = (DB.get("dp_quiz_categories") || []).filter(c => c.active).map(c => c.id);
  const allQuestions = DB.get("dp_quiz_questions") || [];
  let source = allQuestions.filter(q => q.active && activeCatIds.includes(q.categoryId));
  if (source.length < QUIZ_QUESTIONS_PER_BATTLE) source = allQuestions.filter(q => q.active);

  // Daily rotation — only draw from today's pool, so the mix of questions
  // genuinely changes day to day instead of the same big bank forever.
  const dailyPool = getDailyQuizPool(source);
  if (dailyPool.length >= QUIZ_QUESTIONS_PER_BATTLE) source = dailyPool;

  // Daily difficulty scaling: past the daily play threshold, prefer hard
  // questions (falls back to the full pool if not enough hard ones exist yet).
  const { hardModeActive } = getQuizDailyStats();
  if (hardModeActive) {
    const hardSource = source.filter(q => ["hard", "very_hard"].includes(q.difficulty || "medium"));
    if (hardSource.length >= QUIZ_QUESTIONS_PER_BATTLE) source = hardSource;
  }

  const pool = [...source];
  const picked = [];
  for (let i = 0; i < QUIZ_QUESTIONS_PER_BATTLE && pool.length; i++) {
    const idx = rnd(0, pool.length - 1);
    const dbQ = pool.splice(idx, 1)[0];
    picked.push({ subject: dbQ.categoryId, q: dbQ.question, options: dbQ.options, correct: dbQ.correct, difficulty: dbQ.difficulty || "medium" });
  }
  return picked;
};

// Simple collusion heuristic for Match Monitoring / fraud review: if both
// players picked the exact same answer within a suspiciously tight time gap
// on most questions, it looks like they're playing together off-app (e.g.
// on a call), not competing genuinely.
const flagQuizCollusionIfSuspicious = (battle) => {
  const a = battle.playerA, b = battle.playerB;
  if (!a || !b || a.answers.length === 0) return;
  let tightMatches = 0;
  const n = Math.min(a.answers.length, b.answers.length);
  for (let i = 0; i < n; i++) {
    const aa = a.answers[i], ab = b.answers[i];
    if (aa && ab && aa.selected === ab.selected && Math.abs(aa.timeMs - ab.timeMs) < 150) tightMatches++;
  }
  if (n > 0 && tightMatches / n >= 0.8 && n >= 3) {
    logSuspiciousActivity(a.id, "quiz_collusion", `Battle ${battle.id} vs ${b.name}: ${tightMatches}/${n} answers matched within 150ms`);
  }
};

// Finds a waiting opponent to join, or creates a new waiting battle.
// Returns the battle id, or null if the user doesn't have enough diamonds.
export const findOrCreateQuizBattle = (user, showToast) => {
  const battles = DB.get("dp_quiz_battles") || [];

  // Resume any battle already in progress for this user.
  const existing = battles.find(b =>
    (b.playerA.id === user.id || (b.playerB && b.playerB.id === user.id)) &&
    (b.status === "waiting" || b.status === "active")
  );
  if (existing) return existing.id;

  if (user.diamonds < QUIZ_BET) { showToast(`Battle khelne ke liye kam se kam ${QUIZ_BET}💎 chahiye`, "error"); return null; }

  // Join someone else's open battle.
  const openBattle = battles.find(b => b.status === "waiting" && b.playerA.id !== user.id && !b.playerB);
  if (openBattle) {
    saveGameResult(user.id, -QUIZ_BET, "Quiz Battle Entry Fee");
    const now = new Date().toISOString();
    const updated = (DB.get("dp_quiz_battles") || []).map(b => b.id === openBattle.id ? {
      ...b,
      playerA: { ...b.playerA, qStartedAt: now },
      playerB: { id: user.id, name: user.name, answers: [], score: 0, finishedAt: null, qStartedAt: now },
      status: "active",
      startedAt: now,
    } : b);
    DB.set("dp_quiz_battles", updated);
    return openBattle.id;
  }

  // No one waiting — create a new battle and wait for an opponent.
  saveGameResult(user.id, -QUIZ_BET, "Quiz Battle Entry Fee");
  bumpQuizDailyCount();
  const battle = {
    id: tid(),
    status: "waiting",
    betAmount: QUIZ_BET,
    createdAt: new Date().toISOString(),
    questions: pickQuizQuestions(),
    playerA: { id: user.id, name: user.name, answers: [], score: 0, finishedAt: null, qStartedAt: null },
    playerB: null,
    startedAt: null,
    settled: false,
    status_: null,
  };
  DB.set("dp_quiz_battles", [battle, ...battles]);
  return battle.id;
};

// Cancels a still-waiting battle and refunds the entry fee.
export const cancelQuizBattle = (battleId, user, showToast) => {
  const battles = DB.get("dp_quiz_battles") || [];
  const b = battles.find(x => x.id === battleId);
  if (!b || b.status !== "waiting") return;
  saveGameResult(user.id, QUIZ_BET, "Quiz Battle Cancelled - Refund");
  DB.set("dp_quiz_battles", battles.filter(x => x.id !== battleId));
  showToast("Search cancel kar di, diamonds refund ho gaye", "info");
};

// Records one answer for a player, advances their question pointer, and
// triggers settlement once both players have finished all questions.
export const submitQuizAnswer = (battleId, userId, qIndex, selectedIndex, timeMs) => {
  const battles = DB.get("dp_quiz_battles") || [];
  const b = battles.find(x => x.id === battleId);
  if (!b || !b.playerB) return;
  const isA = b.playerA.id === userId;
  const player = isA ? b.playerA : b.playerB;
  if (!player || player.answers.length !== qIndex) return; // stale/duplicate call, ignore

  const q = b.questions[qIndex];
  const correct = selectedIndex === q.correct;
  const answers = [...player.answers, { qIndex, selected: selectedIndex, correct, timeMs }];
  const score = answers.filter(a => a.correct).length;
  const done = answers.length >= b.questions.length;
  const updatedPlayer = {
    ...player,
    answers,
    score,
    finishedAt: done ? new Date().toISOString() : null,
    qStartedAt: done ? player.qStartedAt : new Date().toISOString(),
  };
  const updated = battles.map(x => x.id === battleId ? { ...x, [isA ? "playerA" : "playerB"]: updatedPlayer } : x);
  DB.set("dp_quiz_battles", updated);

  const fresh = updated.find(x => x.id === battleId);
  if (fresh.playerA.finishedAt && fresh.playerB && fresh.playerB.finishedAt && !fresh.settled) {
    settleQuizBattle(battleId);
  }
};

// Decides the winner and pays out. Guards on `settled` so it only ever runs once.
export const settleQuizBattle = (battleId) => {
  const battles = DB.get("dp_quiz_battles") || [];
  const b = battles.find(x => x.id === battleId);
  if (!b || b.settled || b.status === "completed" || !b.playerB) return;

  const totalTime = (p) => p.answers.reduce((s, a) => s + a.timeMs, 0);
  let winnerId = null;
  if (b.playerA.score !== b.playerB.score) {
    winnerId = b.playerA.score > b.playerB.score ? b.playerA.id : b.playerB.id;
  } else {
    const tA = totalTime(b.playerA), tB = totalTime(b.playerB);
    if (tA !== tB) winnerId = tA < tB ? b.playerA.id : b.playerB.id; // faster player wins on a tie score
  }

  // Mark settled immediately so a race between both clients can't double-pay.
  DB.set("dp_quiz_battles", battles.map(x => x.id === battleId ? { ...x, settled: true, status: "completed", winnerId, completedAt: new Date().toISOString() } : x));
  flagQuizCollusionIfSuspicious(b);

  if (winnerId) {
    const winnerIsA = winnerId === b.playerA.id;
    const opponentName = winnerIsA ? b.playerB.name : b.playerA.name;
    saveGameResult(winnerId, b.betAmount * 2 - 2, `Quiz Battle Win vs ${opponentName}`); // ₹18 payout, ₹2 platform fee
  } else {
    // Perfect tie on both score and time — refund both entry fees, no fee taken.
    saveGameResult(b.playerA.id, b.betAmount, "Quiz Battle Draw - Refund");
    saveGameResult(b.playerB.id, b.betAmount, "Quiz Battle Draw - Refund");
  }
};

export const QUIZ_MAX_TAB_VIOLATIONS = 3; // auto-forfeit after this many tab-switches/app-minimizes

// Called when a player switches tabs / minimizes the app mid-question. Tracks
// the violation count on their side of the battle, and once the limit is hit,
// auto-forfeits the match in the opponent's favour (or cancels+refunds if no
// opponent has joined yet). This is the only real enforcement possible from a
// web app — we can't block the OS from switching apps, only detect + penalize it.
export const recordQuizTabViolation = (battleId, userId, showToast) => {
  const battles = DB.get("dp_quiz_battles") || [];
  const b = battles.find(x => x.id === battleId);
  if (!b || b.status === "completed" || b.status === "cancelled") return;
  const isA = b.playerA.id === userId;
  const player = isA ? b.playerA : b.playerB;
  if (!player) return;
  const violations = (player.tabSwitches || 0) + 1;
  const updatedPlayer = { ...player, tabSwitches: violations };
  const updated = battles.map(x => x.id === battleId ? { ...x, [isA ? "playerA" : "playerB"]: updatedPlayer } : x);
  DB.set("dp_quiz_battles", updated);

  if (violations >= QUIZ_MAX_TAB_VIOLATIONS) {
    forfeitQuizBattle(battleId, userId, "tab_switch");
    showToast("❌ Aap doosri tab/app par gaye — match forfeit ho gaya", "error");
  } else {
    showToast(`⚠️ Doosri tab/app khol na allowed nahi hai! Chetavani ${violations}/${QUIZ_MAX_TAB_VIOLATIONS} — agli baar match forfeit ho jaayega`, "error");
  }
};

// Ends the battle immediately because `forfeitingUserId` left the app/tab.
// If an opponent has joined, they win the full payout; otherwise it's just
// cancelled and refunded (nothing to forfeit against).
export const forfeitQuizBattle = (battleId, forfeitingUserId, reason = "forfeit") => {
  const battles = DB.get("dp_quiz_battles") || [];
  const b = battles.find(x => x.id === battleId);
  if (!b || b.settled || b.status === "completed" || b.status === "cancelled") return;

  if (!b.playerB) {
    // No opponent yet — just cancel and refund the one player who's paid in.
    saveGameResult(b.playerA.id, b.betAmount, "Quiz Battle Cancelled - Refund");
    DB.set("dp_quiz_battles", (DB.get("dp_quiz_battles") || []).map(x => x.id === battleId ? { ...x, status: "cancelled", settled: true, completedAt: new Date().toISOString() } : x));
    return;
  }

  const forfeiterIsA = forfeitingUserId === b.playerA.id;
  const winnerId = forfeiterIsA ? b.playerB.id : b.playerA.id;
  const winnerName = forfeiterIsA ? b.playerB.name : b.playerA.name;
  const forfeiterName = forfeiterIsA ? b.playerA.name : b.playerB.name;

  DB.set("dp_quiz_battles", (DB.get("dp_quiz_battles") || []).map(x => x.id === battleId ? { ...x, settled: true, status: "completed", winnerId, forfeitedBy: forfeitingUserId, forfeitReason: reason, completedAt: new Date().toISOString() } : x));
  saveGameResult(winnerId, b.betAmount * 2 - 2, `Quiz Battle Win — ${forfeiterName} forfeited (left app)`);
};


export const adminCancelQuizBattle = (battleId, showToast) => {
  const battles = DB.get("dp_quiz_battles") || [];
  const b = battles.find(x => x.id === battleId);
  if (!b || b.settled || b.status === "completed") return;
  if (b.playerA) saveGameResult(b.playerA.id, b.betAmount, "Quiz Battle Admin Cancelled - Refund");
  if (b.playerB) saveGameResult(b.playerB.id, b.betAmount, "Quiz Battle Admin Cancelled - Refund");
  DB.set("dp_quiz_battles", battles.map(x => x.id === battleId ? { ...x, status: "cancelled", settled: true, completedAt: new Date().toISOString() } : x));
  showToast && showToast("Battle cancel karke refund kar diya", "info");
};

// ─── QUIZ BATTLE GAME SCREEN ───────────────────────────────────────────────────
export const QuizBattleGame = ({ user, setUser, setPage, showToast }) => {
  const [battleId, setBattleId] = useState(null);
  const [, forceTick] = useState(0);
  const [matching, setMatching] = useState(false);

  // Re-tick every second so countdowns re-render even without a DB change.
  useEffect(() => {
    const iv = setInterval(() => forceTick(t => t + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  // On every mount (including the frequent app-wide live-sync remounts),
  // re-resolve which battle (if any) belongs to this user.
  useEffect(() => {
    const battles = DB.get("dp_quiz_battles") || [];
    const mine = battles.filter(b => b.playerA.id === user.id || (b.playerB && b.playerB.id === user.id));
    const active = mine.find(b => b.status === "waiting" || b.status === "active");
    if (active) { setBattleId(active.id); return; }
    const recentCompleted = mine
      .filter(b => b.status === "completed" && b.completedAt && (Date.now() - new Date(b.completedAt).getTime()) < 10 * 60 * 1000)
      .sort((a, b2) => new Date(b2.completedAt) - new Date(a.completedAt))[0];
    setBattleId(recentCompleted ? recentCompleted.id : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const battles = DB.get("dp_quiz_battles") || [];
  const battle = battleId ? battles.find(b => b.id === battleId) : null;
  const isA = battle && battle.playerA.id === user.id;
  const me = battle ? (isA ? battle.playerA : battle.playerB) : null;
  const opp = battle ? (isA ? battle.playerB : battle.playerA) : null;

  const handleFindMatch = async () => {
    if (matching) return;
    setMatching(true);
    const id = findOrCreateQuizBattle(user, showToast);
    if (id) {
      setUser(u => ({ ...u, diamonds: u.diamonds - QUIZ_BET }));
      setBattleId(id);
    }
    setMatching(false);
  };

  const handleCancel = () => {
    if (!battle) return;
    cancelQuizBattle(battle.id, user, showToast);
    setUser(u => ({ ...u, diamonds: u.diamonds + QUIZ_BET }));
    setBattleId(null);
  };

  const handleAnswer = (selIndex) => {
    if (!battle || !me) return;
    const qIdx = me.answers.length;
    if (qIdx >= battle.questions.length) return;
    const qStart = me.qStartedAt ? new Date(me.qStartedAt).getTime() : Date.now();
    const timeMs = Date.now() - qStart;
    submitQuizAnswer(battle.id, user.id, qIdx, selIndex, timeMs);
  };

  // Auto-submit (as wrong) when the per-question timer runs out.
  useEffect(() => {
    if (!battle || battle.status !== "active" || !me) return;
    if (me.answers.length >= battle.questions.length) return;
    const qStart = me.qStartedAt ? new Date(me.qStartedAt).getTime() : Date.now();
    const remainMs = Math.max(0, QUIZ_SECONDS_PER_Q * 1000 - (Date.now() - qStart));
    const to = setTimeout(() => handleAnswer(-1), remainMs + 50);
    return () => clearTimeout(to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battleId, battle?.status, me?.answers?.length]);

  // Refresh local diamond count whenever the settlement finishes (covers the
  // case where the OTHER player's client actually ran settleQuizBattle).
  useEffect(() => {
    if (battle?.status === "completed") {
      const users = DB.get("dp_users") || [];
      const fresh = users.find(u => u.id === user.id);
      if (fresh) setUser(u => ({ ...u, diamonds: fresh.diamonds }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battle?.status]);

  // ── ANTI-CHEAT: detect tab-switch / app-minimize during an active question ──
  // We can't block the OS from opening another app or tab (no website has that
  // power), so instead we detect when this tab loses visibility/focus while a
  // question is live, and forfeit the match after repeated violations.
  useEffect(() => {
    if (!battle || battle.status !== "active" || !me || me.answers.length >= battle.questions.length) return;
    let lastViolationAt = 0;
    const onViolation = () => {
      const now = Date.now();
      if (now - lastViolationAt < 1500) return; // debounce duplicate blur+hidden firing together
      lastViolationAt = now;
      recordQuizTabViolation(battle.id, user.id, showToast);
    };
    const onVisibility = () => { if (document.hidden) onViolation(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onViolation);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onViolation);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battleId, battle?.status, me?.answers?.length]);

  // Try to lock into fullscreen once the battle goes active — makes it harder
  // to see another app/window alongside the quiz. User can still exit (browsers
  // don't allow trapping fullscreen), but exiting fires the blur/visibility
  // handlers above and counts as a violation.
  useEffect(() => {
    if (battle?.status === "active" && document.documentElement.requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }, [battle?.status]);


  if (!battle) {
    return (
      <div style={S.page}>
        <TopBar title="🧠 Quiz Battle 1v1" onBack={() => setPage("games")} right={<DiamondChip amount={user.diamonds} />} />
        <div style={{ padding: 20 }}>
          <Card style={{ textAlign: "center", padding: 28, marginBottom: 16, background: "linear-gradient(135deg,rgba(0,212,255,0.1),rgba(181,55,242,0.1))" }}>
            <div style={{ fontSize: 56, marginBottom: 8 }}>🎓⚔️</div>
            <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 6 }}>Padhai ka Dum Dikhao!</div>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>Kisi bhi real player se 1v1 quiz battle mein bhidiye — GK, Math & Science ke {QUIZ_QUESTIONS_PER_BATTLE} sawaal, {QUIZ_SECONDS_PER_Q}s har ek ke liye.</div>
          </Card>

          <Card style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 800, marginBottom: 12, fontSize: 14 }}>💰 Battle Structure</div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6, color: "rgba(255,255,255,0.7)" }}><span>Player A Entry</span><span>₹{QUIZ_BET}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6, color: "rgba(255,255,255,0.7)" }}><span>Player B Entry</span><span>₹{QUIZ_BET}</span></div>
            <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "8px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6, color: "rgba(255,255,255,0.7)" }}><span>Total Pool</span><span>₹{QUIZ_BET * 2}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 800, color: S.neonGreen, marginBottom: 6 }}><span>Winner Gets</span><span>₹{QUIZ_BET * 2 - 2}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "rgba(255,255,255,0.4)" }}><span>Platform Fee</span><span>₹2</span></div>
          </Card>

          <Btn full onClick={handleFindMatch} disabled={matching || user.diamonds < QUIZ_BET}>
            {matching ? "Searching..." : user.diamonds < QUIZ_BET ? `Need ${QUIZ_BET}💎 to Play` : `⚔️ Find Opponent (${QUIZ_BET}💎)`}
          </Btn>
        </div>
      </div>
    );
  }

  // ── WAITING for an opponent ──
  if (battle.status === "waiting") {
    const elapsedSec = Math.floor((Date.now() - new Date(battle.createdAt).getTime()) / 1000);
    const timedOut = elapsedSec > QUIZ_WAIT_TIMEOUT_SEC;
    return (
      <div style={S.page}>
        <TopBar title="🧠 Quiz Battle 1v1" onBack={() => setPage("games")} right={<DiamondChip amount={user.diamonds} />} />
        <div style={{ padding: 20, textAlign: "center" }}>
          <Card style={{ padding: 36, marginBottom: 20 }}>
            <div style={{ fontSize: 52, marginBottom: 12, animation: "pulse 1.6s infinite" }}>🔍</div>
            <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 6 }}>{timedOut ? "Koi opponent nahi mila" : "Opponent dhoondh rahe hain..."}</div>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>{timedOut ? "Thodi der baad retry karo, ya cancel karke diamonds wapas le lo." : `Aapka ${QUIZ_BET}💎 lag chuka hai. Match milte hi battle shuru hogi.`}</div>
            {!timedOut && <div style={{ marginTop: 14, color: S.neonBlue, fontSize: 12, fontWeight: 700 }}>{elapsedSec}s / {QUIZ_WAIT_TIMEOUT_SEC}s</div>}
          </Card>
          <Btn full variant="outline" onClick={handleCancel}>✕ Cancel & Refund</Btn>
        </div>
      </div>
    );
  }

  // ── ACTIVE: question in progress or waiting for opponent to finish ──
  if (battle.status === "active") {
    const totalQ = battle.questions.length;
    const myDone = me.answers.length >= totalQ;

    if (myDone) {
      return (
        <div style={S.page}>
          <TopBar title="🧠 Quiz Battle 1v1" onBack={() => setPage("games")} right={<DiamondChip amount={user.diamonds} />} />
          <div style={{ padding: 20, textAlign: "center" }}>
            <Card style={{ padding: 32, marginBottom: 16 }}>
              <div style={{ fontSize: 48, marginBottom: 10 }}>✅</div>
              <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 4 }}>Aapke jawaab jama ho gaye!</div>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginBottom: 14 }}>Aapka score: {me.score}/{totalQ}</div>
              <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>{opp.name} abhi khel rahe hain — {opp.answers.length}/{totalQ}</div>
              <ProgressBar value={opp.answers.length} max={totalQ} color={S.neonPurple} />
            </Card>
          </div>
        </div>
      );
    }

    const qIdx = me.answers.length;
    const q = battle.questions[qIdx];
    const qStart = me.qStartedAt ? new Date(me.qStartedAt).getTime() : Date.now();
    const remainSec = Math.max(0, Math.ceil((QUIZ_SECONDS_PER_Q * 1000 - (Date.now() - qStart)) / 1000));

    const violations = me.tabSwitches || 0;

    return (
      <div style={S.page}>
        <TopBar title="🧠 Quiz Battle 1v1" right={<DiamondChip amount={user.diamonds} />} />
        <div style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 5 }}>
              {Array.from({ length: totalQ }).map((_, i) => (
                <div key={i} style={{ width: 22, height: 5, borderRadius: 3, background: i < qIdx ? S.neonGreen : i === qIdx ? S.neonBlue : "rgba(255,255,255,0.15)" }} />
              ))}
            </div>
            <Badge label={`⏱ ${remainSec}s`} color={remainSec <= 4 ? "#ff6b6b" : S.neonBlue} />
          </div>

          {violations > 0 && (
            <Card style={{ marginBottom: 12, background: "rgba(255,61,61,0.1)", border: "1px solid rgba(255,61,61,0.4)", padding: 10, textAlign: "center" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#ff6b6b" }}>⚠️ Tab/app switch chetavani: {violations}/{QUIZ_MAX_TAB_VIOLATIONS} — {QUIZ_MAX_TAB_VIOLATIONS - violations} baar aur karne par match forfeit ho jaayega</div>
            </Card>
          )}

          <Card style={{ marginBottom: 14, textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.4)", padding: 8 }}>
            You: {me.score} correct · {opp.name}: {opp.score} correct
          </Card>

          <Card
            style={{ marginBottom: 16, userSelect: "none" }}
            onCopy={e => e.preventDefault()}
            onContextMenu={e => e.preventDefault()}
          >
            <Badge label={q.subject} />
            <div style={{ fontWeight: 800, fontSize: 17, marginTop: 10, lineHeight: 1.4 }}>{q.q}</div>
          </Card>

          <div style={{ display: "grid", gap: 10 }}>
            {q.options.map((opt, i) => (
              <button key={i} onClick={() => handleAnswer(i)} style={{
                textAlign: "left", padding: "14px 16px", borderRadius: 12, cursor: "pointer",
                background: "rgba(255,255,255,0.06)", border: "1.5px solid rgba(255,255,255,0.12)",
                color: "#fff", fontSize: 14, fontWeight: 600, userSelect: "none",
              }}>{String.fromCharCode(65 + i)}.  {opt}</button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── COMPLETED: show the result ──
  if (battle.status === "completed") {
    const won = battle.winnerId === user.id;
    const draw = !battle.winnerId;
    return (
      <div style={S.page}>
        <TopBar title="🧠 Quiz Battle 1v1" onBack={() => setPage("games")} right={<DiamondChip amount={user.diamonds} />} />
        <div style={{ padding: 20, textAlign: "center" }}>
          <Card style={{ padding: 32, marginBottom: 16, background: won ? "rgba(0,255,136,0.1)" : draw ? "rgba(0,212,255,0.08)" : "rgba(255,61,154,0.1)" }}>
            <div style={{ fontSize: 56, marginBottom: 10 }}>{won ? "🏆" : draw ? "🤝" : "😔"}</div>
            <div style={{ fontWeight: 900, fontSize: 20, marginBottom: 6, color: won ? S.neonGreen : draw ? S.neonBlue : "#ff6b6b" }}>
              {won ? "Aap Jeet Gaye!" : draw ? "Match Draw!" : "Aap Haar Gaye"}
            </div>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginBottom: 12 }}>
              {won ? `+₹${QUIZ_BET * 2 - 2} jeete!` : draw ? `₹${QUIZ_BET} refund ho gaya` : `${opp?.name || "Opponent"} jeet gaye`}
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 24, fontSize: 13 }}>
              <div><div style={{ color: "rgba(255,255,255,0.4)" }}>You</div><div style={{ fontWeight: 800, fontSize: 18 }}>{me?.score}/{battle.questions.length}</div></div>
              <div><div style={{ color: "rgba(255,255,255,0.4)" }}>{opp?.name}</div><div style={{ fontWeight: 800, fontSize: 18 }}>{opp?.score}/{battle.questions.length}</div></div>
            </div>
          </Card>
          <Btn full onClick={() => setBattleId(null)}>⚔️ Play Again</Btn>
        </div>
      </div>
    );
  }

  return null;
};
