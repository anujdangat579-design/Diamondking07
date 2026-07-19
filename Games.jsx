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
  const games = [
    { id: "color", name: "Color Prediction", emoji: "🎨", cost: cfg.gameCost || 5, desc: "Predict the next color and win 1.9x!", tag: "Popular" },
    { id: "aviator", name: "Aviator", emoji: "✈️", cost: cfg.gameCost || 5, desc: "Cash out before the plane flies away!", tag: "Trending" },
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



// ─── COLOR GAME UTILS ────────────────────────────────────────────────────────
// Number-based engine (0-9). Color and Big/Small are both derived from the
// same winning number, so both bet types share one fair draw per round.
//   Color:  0,5 → Violet · 1,3,7,9 → Green · 2,4,6,8 → Red
//   Size:   0-4 → Small · 5-9 → Big
export const numberToColor = (n) => (n === 0 || n === 5) ? "violet" : ([1,3,7,9].includes(n) ? "green" : "red");
export const numberToSize  = (n) => (n <= 4 ? "small" : "big");

export const getWinningNumber = () => {
  const cfg = DB.get("dp_platform_config") || {};
  const forcedColor = cfg.forcedColor || null;
  const forcedSize  = cfg.forcedSize  || null;

  if (forcedColor || forcedSize) {
    // Color Prediction and Big/Small are controlled independently, but both
    // draw from the same number engine — every color+size combo maps to at
    // least one digit (e.g. Red+Small → 2 or 4), so forcing both at once
    // always has a valid result.
    let pool = Array.from({ length: 10 }, (_, n) => n);
    if (forcedColor) pool = pool.filter(n => numberToColor(n) === forcedColor);
    if (forcedSize)  pool = pool.filter(n => numberToSize(n)  === forcedSize);
    // One-shot: clear whichever flags were set so this only affects the next round.
    const next = { ...cfg };
    if (forcedColor) next.forcedColor = null;
    if (forcedSize)  next.forcedSize = null;
    DB.set("dp_platform_config", next);
    return pool[Math.floor(Math.random() * pool.length)];
  }
  return Math.floor(Math.random() * 10);
};


// ─── COLOR GAME ───────────────────────────────────────────────────────────────
export const RESULT_SHOW_DURATION = 7; // seconds to show result before next round

// The 3 speed "rooms" a player can choose between. Each keeps its own round
// counter + history in DB, and only the selected room's countdown runs.
export const DURATIONS = [
  { id: "15",  label: "15 Sec", secs: 15, emoji: "⚡" },
  { id: "30",  label: "30 Sec", secs: 30, emoji: "🔥" },
  { id: "60",  label: "1 Min",  secs: 60, emoji: "🕐" },
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

