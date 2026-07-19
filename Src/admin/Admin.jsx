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

// ─── ADMIN COLOR PAGE (Standalone — matches screenshot exactly) ───────────────
export const AdminColorPage = ({ showToast }) => {
  const colorMap  = { red: "#ff4444", green: "#00c853", violet: "#b537f2" };
  const colorGlow = { red: "rgba(255,68,68,0.55)", green: "rgba(0,200,83,0.55)", violet: "rgba(181,55,242,0.55)" };

  // ── Two fully independent controls: Color Prediction and Big/Small ──
  // Each has its own mode + force flag, so admin can operate/set both at the same time.
  const [colorMode, setColorMode] = useState(() => (DB.get("dp_platform_config") || {}).colorMode || "random");
  const [sizeMode,  setSizeMode]  = useState(() => (DB.get("dp_platform_config") || {}).sizeMode  || "random");
  const [nextColor, setNextColor] = useState(() => (DB.get("dp_platform_config") || {}).forcedColor || null);
  const [nextSize,  setNextSize]  = useState(() => (DB.get("dp_platform_config") || {}).forcedSize  || null);

  const getLiveBets = () => {
    const now = Date.now();
    const txns = (DB.get("dp_transactions") || [])
      .filter(t => t.type === "game_spend" && (t.note || "").includes("Color Bet") && now - new Date(t.date).getTime() < 60000);
    const bets = { red: 0, green: 0, violet: 0, big: 0, small: 0 };
    txns.forEach(t => {
      if ((t.note||"").includes("red"))    bets.red    += Math.abs(t.diamonds);
      if ((t.note||"").includes("green"))  bets.green  += Math.abs(t.diamonds);
      if ((t.note||"").includes("violet")) bets.violet += Math.abs(t.diamonds);
      if ((t.note||"").includes("big"))    bets.big    += Math.abs(t.diamonds);
      if ((t.note||"").includes("small"))  bets.small  += Math.abs(t.diamonds);
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
  const totalSizeBets = liveBets.big + liveBets.small;
  const pctSize = (c) => totalSizeBets > 0 ? Math.round((liveBets[c] / totalSizeBets) * 100) : 0;
  const smartColor = (() => {
    const b = getLiveBets();
    if (b.red <= b.green && b.red <= b.violet) return "red";
    if (b.green <= b.red && b.green <= b.violet) return "green";
    return "violet";
  })();
  const smartSize = (() => {
    const b = getLiveBets();
    return b.big <= b.small ? "big" : "small";
  })();

  // Color Prediction — force/smart/random, independent of Big/Small
  const applyColorMode = (m) => {
    const cfg = DB.get("dp_platform_config") || {};
    setColorMode(m);
    if (m === "random") {
      DB.set("dp_platform_config", { ...cfg, colorMode: "random", forcedColor: null });
      setNextColor(null);
      showToast("🎲 Color: Random mode active", "info");
    } else if (m === "smart") {
      DB.set("dp_platform_config", { ...cfg, colorMode: "smart", forcedColor: null });
      setNextColor(null);
      showToast("🤖 Color: Smart Auto ON — picks minimum payout color", "success");
    } else {
      DB.set("dp_platform_config", { ...cfg, colorMode: m, forcedColor: m });
      setNextColor(m);
      showToast(`✅ ${m.toUpperCase()} forced for next round`, "success");
    }
  };

  // Big/Small — force/smart/random, independent of Color
  const applySizeMode = (m) => {
    const cfg = DB.get("dp_platform_config") || {};
    setSizeMode(m);
    if (m === "random") {
      DB.set("dp_platform_config", { ...cfg, sizeMode: "random", forcedSize: null });
      setNextSize(null);
      showToast("🎲 Big/Small: Random mode active", "info");
    } else if (m === "smart") {
      DB.set("dp_platform_config", { ...cfg, sizeMode: "smart", forcedSize: null });
      setNextSize(null);
      showToast("🤖 Big/Small: Smart Auto ON", "success");
    } else {
      DB.set("dp_platform_config", { ...cfg, sizeMode: m, forcedSize: m });
      setNextSize(m);
      showToast(`✅ ${m.toUpperCase()} forced for next round`, "success");
    }
  };

  const sizeOpts = [
    { id: "small", label: "SMALL (0-4)", color: "#ff9d3d" },
    { id: "big",   label: "BIG (5-9)",   color: "#3d9dff" },
  ];

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
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>Color Prediction aur Big/Small — dono alag-alag, ek sath operate karo</div>
      </div>

      <div style={{ padding: "16px 20px 100px", display: "flex", flexDirection: "column", gap: 0 }}>

        {/* ══════════════════ SECTION 1: COLOR PREDICTION ══════════════════ */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 16 }}>🎨</span>
          <span style={{ fontSize: 12, fontWeight: 900, color: "#fff", letterSpacing: 1 }}>COLOR PREDICTION CONTROL</span>
        </div>

        {/* ── LIVE BETS: COLOR */}
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

        {/* ── STATUS CARD: COLOR */}
        <Card style={{
          marginBottom: 14, padding: "14px 16px",
          background: colorMode === "smart" ? "rgba(0,255,136,0.07)" : nextColor ? `${colorMap[nextColor]}10` : "rgba(255,255,255,0.04)",
          border: `1px solid ${colorMode === "smart" ? "rgba(0,255,136,0.25)" : nextColor ? colorMap[nextColor]+"40" : "rgba(255,255,255,0.1)"}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {colorMode === "smart" ? (
              <div style={{ width: 50, height: 50, borderRadius: 14, background: "rgba(0,255,136,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0 }}>🤖</div>
            ) : nextColor ? (
              <div style={{ width: 50, height: 50, borderRadius: "50%", background: colorMap[nextColor], boxShadow: `0 0 20px ${colorGlow[nextColor]}`, flexShrink: 0 }} />
            ) : (
              <div style={{ width: 50, height: 50, borderRadius: 14, background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0 }}>🎲</div>
            )}
            <div>
              <div style={{ fontSize: 18, fontWeight: 900, color: colorMode === "smart" ? "#00ff88" : nextColor ? colorMap[nextColor] : "rgba(255,255,255,0.55)", lineHeight: 1.2 }}>
                {colorMode === "smart" ? "SMART AUTO" : nextColor ? `${nextColor.toUpperCase()} FORCED` : "NOT SET"}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", marginTop: 4 }}>
                {colorMode === "smart"
                  ? `Will pick: ${smartColor.toUpperCase()} (least bets = min payout)`
                  : nextColor
                    ? "This color wins next round — one shot"
                    : "Choose below to control next round's color"}
              </div>
            </div>
          </div>
        </Card>

        {/* ── FORCE WIN BUTTONS: Red / Green / Violet */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
          {forceOpts.map(o => {
            const active = (colorMode === o.id);
            return (
              <button key={o.id} onClick={() => applyColorMode(o.id)} style={{
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

        {/* ── COLOR: SMART AUTO + RANDOM ROW */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
          <button onClick={() => applyColorMode("smart")} style={{
            borderRadius: 18, padding: "18px 12px",
            border: `2px solid ${colorMode === "smart" ? "#00ff88" : "rgba(255,255,255,0.1)"}`,
            background: colorMode === "smart" ? "linear-gradient(135deg,#00ff88,#00d4ff)" : "rgba(255,255,255,0.05)",
            cursor: "pointer", transition: "all 0.22s",
            boxShadow: colorMode === "smart" ? "0 0 28px rgba(0,255,136,0.55)" : "none",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 26, marginBottom: 5 }}>🤖</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: colorMode === "smart" ? "#000" : "#fff", lineHeight: 1.3 }}>
              Smart Auto<br />
              <span style={{ fontSize: 12, fontWeight: 700, color: colorMode === "smart" ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.5)" }}>(Min Payout)</span>
            </div>
          </button>

          <button onClick={() => applyColorMode("random")} style={{
            borderRadius: 18, padding: "18px 12px",
            border: `2px solid ${colorMode === "random" ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.1)"}`,
            background: colorMode === "random" ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)",
            cursor: "pointer", transition: "all 0.22s",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 26, marginBottom: 5 }}>🎲</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: colorMode === "random" ? "#fff" : "rgba(255,255,255,0.55)", lineHeight: 1.3 }}>
              Random
            </div>
          </button>
        </div>

        {/* ══════════════════ SECTION 2: BIG / SMALL ══════════════════ */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 16 }}>🔼🔽</span>
          <span style={{ fontSize: 12, fontWeight: 900, color: "#fff", letterSpacing: 1 }}>BIG / SMALL CONTROL</span>
        </div>

        {/* ── LIVE BETS: BIG / SMALL */}
        <Card style={{ marginBottom: 14, padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#00ff88", boxShadow: "0 0 7px #00ff88", animation: "pulse 1.2s infinite" }} />
            <span style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.45)", letterSpacing: 1.2 }}>LIVE BIG/SMALL BETS</span>
          </div>
          {sizeOpts.map(s => (
            <div key={s.id} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 11, height: 11, borderRadius: "50%", background: s.color, boxShadow: `0 0 6px ${s.color}` }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{s.label}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>{liveBets[s.id]} 💎</span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", minWidth: 28, textAlign: "right" }}>{pctSize(s.id)}%</span>
                </div>
              </div>
              <div style={{ height: 7, background: "rgba(255,255,255,0.07)", borderRadius: 99, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pctSize(s.id)}%`, background: s.color, borderRadius: 99, boxShadow: `0 0 6px ${s.color}88`, transition: "width 0.6s ease" }} />
              </div>
            </div>
          ))}
          <div style={{ paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.07)", display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>Total bets</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: S.neonBlue }}>{totalSizeBets} 💎</span>
          </div>
        </Card>

        {/* ── STATUS CARD: BIG/SMALL */}
        <Card style={{
          marginBottom: 14, padding: "14px 16px",
          background: sizeMode === "smart" ? "rgba(0,255,136,0.07)" : nextSize ? `${sizeOpts.find(s=>s.id===nextSize).color}10` : "rgba(255,255,255,0.04)",
          border: `1px solid ${sizeMode === "smart" ? "rgba(0,255,136,0.25)" : nextSize ? sizeOpts.find(s=>s.id===nextSize).color+"40" : "rgba(255,255,255,0.1)"}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {sizeMode === "smart" ? (
              <div style={{ width: 50, height: 50, borderRadius: 14, background: "rgba(0,255,136,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0 }}>🤖</div>
            ) : nextSize ? (
              <div style={{ width: 50, height: 50, borderRadius: 14, background: sizeOpts.find(s=>s.id===nextSize).color, boxShadow: `0 0 20px ${sizeOpts.find(s=>s.id===nextSize).color}88`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{nextSize === "big" ? "🔼" : "🔽"}</div>
            ) : (
              <div style={{ width: 50, height: 50, borderRadius: 14, background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0 }}>🎲</div>
            )}
            <div>
              <div style={{ fontSize: 18, fontWeight: 900, color: sizeMode === "smart" ? "#00ff88" : nextSize ? sizeOpts.find(s=>s.id===nextSize).color : "rgba(255,255,255,0.55)", lineHeight: 1.2 }}>
                {sizeMode === "smart" ? "SMART AUTO" : nextSize ? `${nextSize.toUpperCase()} FORCED` : "NOT SET"}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", marginTop: 4 }}>
                {sizeMode === "smart"
                  ? `Will pick: ${smartSize.toUpperCase()} (least bets = min payout)`
                  : nextSize
                    ? "This size wins next round — one shot"
                    : "Choose below to control next round's size"}
              </div>
            </div>
          </div>
        </Card>

        {/* ── FORCE WIN BUTTONS: Big / Small */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          {sizeOpts.map(o => {
            const active = (sizeMode === o.id);
            return (
              <button key={o.id} onClick={() => applySizeMode(o.id)} style={{
                borderRadius: 18, padding: "18px 6px",
                border: `2px solid ${active ? o.color : "rgba(255,255,255,0.1)"}`,
                background: active ? `${o.color}20` : "rgba(255,255,255,0.05)",
                cursor: "pointer", transition: "all 0.2s",
                boxShadow: active ? `0 0 20px ${o.color}88` : "none",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
              }}>
                <div style={{ fontSize: 26 }}>{o.id === "big" ? "🔼" : "🔽"}</div>
                <div style={{ fontSize: 13, fontWeight: 900, color: o.color, letterSpacing: 0.5 }}>{o.label}</div>
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

        {/* ── BIG/SMALL: SMART AUTO + RANDOM ROW */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          <button onClick={() => applySizeMode("smart")} style={{
            borderRadius: 18, padding: "18px 12px",
            border: `2px solid ${sizeMode === "smart" ? "#00ff88" : "rgba(255,255,255,0.1)"}`,
            background: sizeMode === "smart" ? "linear-gradient(135deg,#00ff88,#00d4ff)" : "rgba(255,255,255,0.05)",
            cursor: "pointer", transition: "all 0.22s",
            boxShadow: sizeMode === "smart" ? "0 0 28px rgba(0,255,136,0.55)" : "none",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 26, marginBottom: 5 }}>🤖</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: sizeMode === "smart" ? "#000" : "#fff", lineHeight: 1.3 }}>
              Smart Auto<br />
              <span style={{ fontSize: 12, fontWeight: 700, color: sizeMode === "smart" ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.5)" }}>(Min Payout)</span>
            </div>
          </button>

          <button onClick={() => applySizeMode("random")} style={{
            borderRadius: 18, padding: "18px 12px",
            border: `2px solid ${sizeMode === "random" ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.1)"}`,
            background: sizeMode === "random" ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)",
            cursor: "pointer", transition: "all 0.22s",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 26, marginBottom: 5 }}>🎲</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: sizeMode === "random" ? "#fff" : "rgba(255,255,255,0.55)", lineHeight: 1.3 }}>
              Random
            </div>
          </button>
        </div>

        {/* ── TIP */}
        <Card style={{ background: "rgba(255,215,0,0.04)", border: "1px solid rgba(255,215,0,0.14)", padding: "12px 14px" }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.75 }}>
            💡 <strong style={{ color: "#ffd700" }}>Admin Control:</strong><br />
            • Color Prediction aur Big/Small — <b>dono ek sath, alag-alag</b> operate ho sakte hain<br />
            • <b>Force Win</b> → next round guaranteed result (one-shot)<br />
            • <b>Smart Auto</b> → auto-picks the side with least bets (max revenue)<br />
            • <b>Random</b> → pure algorithm, no control<br />
            • Users ko kuch pata nahi chalta 🔒
          </div>
        </Card>
      </div>
    </div>
  );
};

// ─── ADMIN COLOR CONTROL PANEL ────────────────────────────────────────────────
export const AdminColorControl = ({ showToast }) => {
  // Delegates to the standalone AdminColorPage, which already gives Color
  // Prediction and Big/Small fully independent controls (separate mode,
  // separate force flag) so admin can operate both at the same time.
  return <AdminColorPage showToast={showToast} />;
};

// ─── ADMIN GAMES HUB (central place to manage all games) ─────────────────────
export const GameRateCard = ({ icon, title, desc, cfgKey, cfg, showToast, accent }) => {
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

// ─── ADMIN GAME MANAGEMENT (custom games — fully independent of the 4 built-in games) ──
// Lets admin define entirely new games from scratch: name/icon, on/off, round
// timer, min/max bet, payout multipliers per outcome, and how results are
// decided — either the Auto Result Engine (system randomly picks one of the
// configured outcomes) or Manual Override (admin types the result themselves
// every round). Every result — auto or manual — is logged to Result History.
export const newGameTemplate = () => ({
  id: tid(),
  name: "",
  icon: "🎮",
  enabled: true,
  timerSeconds: 30,
  minBet: 10,
  maxBet: 1000,
  multipliers: [{ label: "Option A", value: 2 }, { label: "Option B", value: 2 }],
  resultMode: "auto", // "auto" | "manual"
  createdAt: new Date().toISOString(),
});

export const AdminGameManagement = ({ showToast, onBack }) => {
  const [tick, setTick] = useState(0);
  const [view, setView] = useState("list"); // list | form | history
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(newGameTemplate());
  const [historyGameId, setHistoryGameId] = useState(null);
  const [manualResult, setManualResult] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const refresh = () => setTick(t => t + 1);
  const games = DB.get("dp_managed_games") || [];
  const results = DB.get("dp_game_results") || [];

  const saveGames = (updated) => { DB.set("dp_managed_games", updated); refresh(); };

  const openCreate = () => { setForm(newGameTemplate()); setEditingId(null); setView("form"); };
  const openEdit = (g) => { setForm({ ...g, multipliers: g.multipliers.map(m => ({ ...m })) }); setEditingId(g.id); setView("form"); };

  const saveForm = () => {
    if (!form.name.trim()) { showToast("Game ka naam daalo", "error"); return; }
    if (form.multipliers.length === 0) { showToast("Kam se kam ek outcome/multiplier add karo", "error"); return; }
    if (form.multipliers.some(m => !m.label.trim())) { showToast("Har outcome ka label bharna zaroori hai", "error"); return; }
    if (Number(form.minBet) <= 0 || Number(form.maxBet) < Number(form.minBet)) { showToast("Betting limit sahi nahi hai", "error"); return; }
    const updated = editingId
      ? games.map(g => g.id === editingId ? { ...form } : g)
      : [{ ...form }, ...games];
    saveGames(updated);
    showToast(editingId ? "✅ Game update ho gaya!" : "✅ Naya game create ho gaya!", "success");
    setView("list");
  };

  const deleteGame = (id) => {
    saveGames(games.filter(g => g.id !== id));
    setDeleteConfirm(null);
    showToast("🗑️ Game delete ho gaya", "success");
  };

  const toggleEnabled = (id) => {
    saveGames(games.map(g => g.id === id ? { ...g, enabled: !g.enabled } : g));
  };

  const addMultiplierRow = () => setForm(f => ({ ...f, multipliers: [...f.multipliers, { label: "", value: 2 }] }));
  const removeMultiplierRow = (i) => setForm(f => ({ ...f, multipliers: f.multipliers.filter((_, idx) => idx !== i) }));
  const updateMultiplierRow = (i, key, val) => setForm(f => ({ ...f, multipliers: f.multipliers.map((m, idx) => idx === i ? { ...m, [key]: val } : m) }));

  const logResult = (game, resultLabel, mode) => {
    const entry = { id: tid(), gameId: game.id, gameName: game.name, icon: game.icon, result: resultLabel, mode, time: new Date().toISOString() };
    const updatedResults = [entry, ...(DB.get("dp_game_results") || [])].slice(0, 300);
    DB.set("dp_game_results", updatedResults);
    const updatedGames = (DB.get("dp_managed_games") || []).map(g => g.id === game.id ? { ...g, lastResult: resultLabel, lastResultAt: entry.time } : g);
    saveGames(updatedGames);
  };

  const runAutoResult = (game) => {
    const pick = game.multipliers[Math.floor(Math.random() * game.multipliers.length)];
    logResult(game, pick.label, "auto");
    showToast(`🎲 Auto result: ${pick.label} (${pick.value}x)`, "success");
  };

  const pushManualResult = (game) => {
    if (!manualResult.trim()) { showToast("Result value daalo", "error"); return; }
    logResult(game, manualResult.trim(), "manual");
    showToast(`✅ Manual result set: ${manualResult.trim()}`, "success");
    setManualResult("");
  };

  // ── FORM VIEW ──────────────────────────────────────────────────────────────
  if (view === "form") {
    return (
      <div style={S.page}>
        <TopBar title={editingId ? "✏️ Edit Game" : "➕ Create Game"} onBack={() => setView("list")} />
        <div style={{ padding: "0 20px 100px" }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <div style={{ width: 70 }}>
              <Input label="Icon" value={form.icon} onChange={v => setForm(f => ({ ...f, icon: v.slice(0, 2) }))} icon="" />
            </div>
            <div style={{ flex: 1 }}>
              <Input label="Game Name" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} icon="🎮" />
            </div>
          </div>

          <Card style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>⏱️ Timer</div>
            <div style={{ display: "flex", gap: 8 }}>
              {[15, 30, 60, 180].map(s => (
                <button key={s} onClick={() => setForm(f => ({ ...f, timerSeconds: s }))} style={{
                  flex: 1, padding: "10px 4px", borderRadius: 10,
                  background: form.timerSeconds === s ? S.gradBlue : "rgba(255,255,255,0.06)",
                  border: `1px solid ${form.timerSeconds === s ? S.neonBlue : "rgba(255,255,255,0.1)"}`,
                  color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer",
                }}>{s < 60 ? `${s}s` : `${s / 60}min`}</button>
              ))}
            </div>
          </Card>

          <Card style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>💰 Betting Limit</div>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}><Input label="Min Bet 💎" value={String(form.minBet)} onChange={v => setForm(f => ({ ...f, minBet: v }))} type="number" icon="⬇️" /></div>
              <div style={{ flex: 1 }}><Input label="Max Bet 💎" value={String(form.maxBet)} onChange={v => setForm(f => ({ ...f, maxBet: v }))} type="number" icon="⬆️" /></div>
            </div>
          </Card>

          <Card style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontWeight: 800 }}>🎯 Outcomes & Multipliers</div>
              <button onClick={addMultiplierRow} style={{ background: "rgba(0,255,136,0.12)", border: `1px solid ${S.neonGreen}55`, color: S.neonGreen, borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>+ Add</button>
            </div>
            {form.multipliers.map((m, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                <input value={m.label} onChange={e => updateMultiplierRow(i, "label", e.target.value)} placeholder="e.g. Red / Big / Number 7"
                  style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "8px 10px", color: "#fff", fontSize: 13, outline: "none" }} />
                <input type="number" value={m.value} onChange={e => updateMultiplierRow(i, "value", e.target.value)} placeholder="x"
                  style={{ width: 64, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "8px 10px", color: "#fff", fontSize: 13, outline: "none" }} />
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>x</span>
                {form.multipliers.length > 1 && (
                  <button onClick={() => removeMultiplierRow(i)} style={{ background: "rgba(255,107,107,0.12)", border: "1px solid rgba(255,107,107,0.3)", color: "#ff6b6b", borderRadius: 8, width: 28, height: 30, cursor: "pointer" }}>✕</button>
                )}
              </div>
            ))}
          </Card>

          <Card style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>🎛️ Result Mode</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setForm(f => ({ ...f, resultMode: "auto" }))} style={{
                flex: 1, borderRadius: 14, padding: "14px 8px", textAlign: "center",
                border: `2px solid ${form.resultMode === "auto" ? S.neonGreen : "rgba(255,255,255,0.1)"}`,
                background: form.resultMode === "auto" ? "rgba(0,255,136,0.1)" : "rgba(255,255,255,0.05)", cursor: "pointer",
              }}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>🤖</div>
                <div style={{ fontWeight: 800, fontSize: 13, color: form.resultMode === "auto" ? S.neonGreen : "#fff" }}>Auto Result Engine</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>System randomly picks</div>
              </button>
              <button onClick={() => setForm(f => ({ ...f, resultMode: "manual" }))} style={{
                flex: 1, borderRadius: 14, padding: "14px 8px", textAlign: "center",
                border: `2px solid ${form.resultMode === "manual" ? S.neonBlue : "rgba(255,255,255,0.1)"}`,
                background: form.resultMode === "manual" ? "rgba(0,212,255,0.1)" : "rgba(255,255,255,0.05)", cursor: "pointer",
              }}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>✍️</div>
                <div style={{ fontWeight: 800, fontSize: 13, color: form.resultMode === "manual" ? S.neonBlue : "#fff" }}>Manual Override</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>Admin sets every result</div>
              </button>
            </div>
          </Card>

          <Btn full variant="green" onClick={saveForm}>{editingId ? "💾 Save Changes" : "✅ Create Game"}</Btn>
        </div>
      </div>
    );
  }

  // ── HISTORY VIEW ────────────────────────────────────────────────────────────
  if (view === "history") {
    const game = games.find(g => g.id === historyGameId);
    const gameResults = results.filter(r => r.gameId === historyGameId);
    return (
      <div style={S.page}>
        <TopBar title={`📋 ${game?.icon || ""} ${game?.name || "Result History"}`} onBack={() => setView("list")} />
        <div style={{ padding: "0 20px 100px" }}>
          {gameResults.length === 0 ? (
            <Card style={{ textAlign: "center", padding: 30, color: "rgba(255,255,255,0.35)" }}>Abhi tak koi result nahi hai</Card>
          ) : gameResults.map(r => (
            <Card key={r.id} style={{ marginBottom: 8, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{r.result}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{timeAgo(r.time)}</div>
              </div>
              <Badge label={r.mode === "auto" ? "🤖 Auto" : "✍️ Manual"} color={r.mode === "auto" ? S.neonGreen : S.neonBlue} />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // ── LIST VIEW ────────────────────────────────────────────────────────────────
  return (
    <div style={S.page}>
      <TopBar title="🛠️ Game Management" onBack={onBack} />
      <div style={{ padding: "0 20px 100px" }}>
        <Btn full variant="green" onClick={openCreate} style={{ marginBottom: 16 }}>➕ Create New Game</Btn>

        {games.length === 0 && (
          <Card style={{ textAlign: "center", padding: 30, color: "rgba(255,255,255,0.35)" }}>
            Abhi koi custom game nahi bana. "Create New Game" se shuru karo.
          </Card>
        )}

        {games.map(g => (
          <Card key={g.id} style={{ marginBottom: 12, opacity: g.enabled ? 1 : 0.55 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ fontSize: 26 }}>{g.icon}</div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{g.name}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                    ⏱️ {g.timerSeconds < 60 ? `${g.timerSeconds}s` : `${g.timerSeconds / 60}min`} · 💰 {g.minBet}–{g.maxBet}💎 · {g.resultMode === "auto" ? "🤖 Auto" : "✍️ Manual"}
                  </div>
                </div>
              </div>
              <Badge label={g.enabled ? "ON" : "OFF"} color={g.enabled ? S.neonGreen : "#ff6b6b"} />
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {g.multipliers.map((m, i) => (
                <span key={i} style={{ fontSize: 11, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "3px 8px", color: "rgba(255,255,255,0.6)" }}>
                  {m.label} · {m.value}x
                </span>
              ))}
            </div>

            {g.lastResult && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 10 }}>
                Last result: <strong style={{ color: S.neonGold }}>{g.lastResult}</strong> · {timeAgo(g.lastResultAt)}
              </div>
            )}

            {/* Result controls */}
            {g.resultMode === "auto" ? (
              <Btn sm full variant="primary" onClick={() => runAutoResult(g)} style={{ marginBottom: 8 }}>🎲 Run Auto Result</Btn>
            ) : (
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                <input value={manualResult} onChange={e => setManualResult(e.target.value)} placeholder="Result daalo (e.g. Red)"
                  style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "8px 10px", color: "#fff", fontSize: 13, outline: "none" }} />
                <Btn sm variant="green" onClick={() => pushManualResult(g)}>✅ Set</Btn>
              </div>
            )}

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Btn sm variant="ghost" onClick={() => openEdit(g)}>✏️ Edit</Btn>
              <Btn sm variant={g.enabled ? "danger" : "green"} onClick={() => toggleEnabled(g.id)}>{g.enabled ? "⏸ Disable" : "▶️ Enable"}</Btn>
              <Btn sm variant="ghost" onClick={() => { setHistoryGameId(g.id); setView("history"); }}>📋 History</Btn>
              {deleteConfirm === g.id ? (
                <>
                  <Btn sm variant="danger" onClick={() => deleteGame(g.id)}>Confirm Delete</Btn>
                  <Btn sm variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Btn>
                </>
              ) : (
                <Btn sm variant="danger" onClick={() => setDeleteConfirm(g.id)}>🗑️ Delete</Btn>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export const AdminGamesHub = ({ setPage, showToast }) => {
  const cfg = DB.get("dp_platform_config") || {};

  return (
    <div style={S.page}>
      <TopBar title="🎮 Games" onBack={() => setPage("admin")} />
      <div style={{ padding: "0 20px" }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 14 }}>
          Sabhi games ka admin control ek hi jagah. Color Prediction, Dice Roll aur Aviator apne dedicated panel (Smart Auto / Random / Force) se chalte hain. Baaki games ka win-chance yahin se set karo.
        </div>

        {/* Color Prediction — untouched, links to its existing full control page */}
        <Card onClick={() => setPage("admin_color")} style={{ marginBottom: 12, background: "rgba(181,55,242,0.08)", border: `1px solid ${S.neonPink}44` }} glow>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ fontSize: 28 }}>🎨</div>
              <div>
                <div style={{ fontWeight: 800 }}>Color Prediction</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>Color: {(cfg.colorMode || "random")} · Size: {(cfg.sizeMode || "random")}</div>
              </div>
            </div>
            <div style={{ color: S.neonBlue, fontWeight: 700 }}>Manage →</div>
          </div>
        </Card>

        {/* Dice Roll — Smart Auto / Random / Force number panel */}
        <Card onClick={() => setPage("admin_dice")} style={{ marginBottom: 12, background: "rgba(0,212,255,0.08)", border: `1px solid ${S.neonBlue}44` }} glow>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ fontSize: 28 }}>🎲</div>
              <div>
                <div style={{ fontWeight: 800 }}>Dice Roll</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>Mode: {cfg.diceMode === "smart" ? "Smart Auto" : cfg.diceMode === "random" ? "Random" : cfg.diceMode ? `${cfg.diceMode} Forced` : "Smart Auto"} · Smart/Random/Force control</div>
              </div>
            </div>
            <div style={{ color: S.neonBlue, fontWeight: 700 }}>Manage →</div>
          </div>
        </Card>

        {/* Aviator — Smart Auto / Random / Force crash-point panel */}
        <Card onClick={() => setPage("admin_aviator")} style={{ marginBottom: 16, background: "rgba(255,61,61,0.08)", border: "1px solid rgba(255,61,61,0.4)" }} glow>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ fontSize: 28 }}>✈️</div>
              <div>
                <div style={{ fontWeight: 800 }}>Aviator</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>Mode: {cfg.aviatorMode === "smart" ? "Smart Auto" : cfg.aviatorMode === "random" ? "Random" : cfg.aviatorMode === "force" ? "Forced" : "Smart Auto"} · Smart/Random/Force crash</div>
              </div>
            </div>
            <div style={{ color: "#ff6b6b", fontWeight: 700 }}>Manage →</div>
          </div>
        </Card>

        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 10 }}>Other Games</div>

        <GameRateCard icon="🔢" title="Number Pick" desc={`Cost ${cfg.gameCost || 5}💎 · Win 45💎 exact, 8💎 near-miss`} cfgKey="numberWinRate" cfg={cfg} showToast={showToast} />
        <GameRateCard icon="🃏" title="Scratch Card" desc={`Cost ${cfg.scratchCost || 10}💎 · Win up to 100💎`} cfgKey="scratchWinRate" cfg={cfg} showToast={showToast} />

        <div style={{ fontSize: 15, fontWeight: 800, margin: "18px 0 10px" }}>Custom Games</div>
        <Card onClick={() => setPage("admin_game_management")} style={{ marginBottom: 16, background: "rgba(255,215,0,0.07)", border: `1px solid ${S.neonGold}44` }} glow>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ fontSize: 28 }}>🛠️</div>
              <div>
                <div style={{ fontWeight: 800 }}>Game Management</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{(DB.get("dp_managed_games") || []).length} custom game{(DB.get("dp_managed_games") || []).length !== 1 ? "s" : ""} · Create, edit, timers, results</div>
              </div>
            </div>
            <div style={{ color: S.neonGold, fontWeight: 700 }}>Manage →</div>
          </div>
        </Card>
      </div>
    </div>
  );
};

// ─── ADMIN DICE CONTROL PANEL (Smart Auto / Random / Force number) ───────────
export const AdminDicePage = ({ showToast, onBack }) => {
  const [mode, setMode] = useState(() => (DB.get("dp_platform_config") || {}).diceMode || "smart");
  const [winRate, setWinRate] = useState(() => String((DB.get("dp_platform_config") || {}).diceWinRate ?? 17));

  const getStats = () => {
    const since = Date.now() - 24 * 3600000;
    const txns = (DB.get("dp_transactions") || []).filter(t => new Date(t.date).getTime() > since);
    const rolls = txns.filter(t => (t.note || "").includes("Dice Roll")).length;
    const wins = txns.filter(t => (t.note || "").includes("Dice Win")).length;
    return { rolls, wins, winPct: rolls > 0 ? Math.round((wins / rolls) * 100) : 0 };
  };
  const [stats, setStats] = useState(getStats);
  useEffect(() => {
    const iv = setInterval(() => setStats(getStats()), 3000);
    return () => clearInterval(iv);
  }, []);

  const saveWinRate = () => {
    const n = Number(winRate);
    if (isNaN(n) || n < 0 || n > 100) { showToast("Enter a valid % between 0-100", "error"); return; }
    const cfg = DB.get("dp_platform_config") || {};
    DB.set("dp_platform_config", { ...cfg, diceWinRate: n });
    showToast(`Smart Auto win chance set to ${n}%`, "success");
  };

  const applyMode = (m) => {
    const cfg = DB.get("dp_platform_config") || {};
    setMode(m);
    if (m === "random") {
      DB.set("dp_platform_config", { ...cfg, diceMode: "random" });
      showToast("🎲 Random mode active — no admin control", "info");
    } else if (m === "smart") {
      DB.set("dp_platform_config", { ...cfg, diceMode: "smart" });
      showToast("🤖 Smart Auto ON — controlled win %", "success");
    } else {
      DB.set("dp_platform_config", { ...cfg, diceMode: m });
      showToast(`✅ Number ${m} forced on every roll`, "success");
    }
  };

  const forcedNumber = !["smart", "random"].includes(mode) ? mode : null;

  return (
    <div style={{ ...S.page, background: "#0a0a1a" }}>
      <div style={{ padding: "16px 20px 10px", background: "linear-gradient(180deg,#0f0f2e,transparent)", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 20, fontWeight: 900 }}>🎲 Dice Game Admin</div>
        {onBack && <button onClick={onBack} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 13, cursor: "pointer" }}>← Back</button>}
      </div>

      <div style={{ padding: "16px 20px 100px" }}>

        {/* ── TODAY'S ACTIVITY */}
        <Card style={{ marginBottom: 14, padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#00ff88", boxShadow: "0 0 7px #00ff88", animation: "pulse 1.2s infinite" }} />
            <span style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.45)", letterSpacing: 1.2 }}>LAST 24 HOURS</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 900 }}>{stats.rolls}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Rolls</div>
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 900, color: S.neonGreen }}>{stats.wins}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Wins</div>
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 900, color: S.neonGold }}>{stats.winPct}%</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Win rate</div>
            </div>
          </div>
        </Card>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 16 }}>🎯</span>
          <span style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.42)", letterSpacing: 1.4 }}>NEXT ROLL CONTROL</span>
        </div>

        {/* ── STATUS CARD */}
        <Card style={{
          marginBottom: 14, padding: "14px 16px",
          background: mode === "smart" ? "rgba(0,255,136,0.07)" : forcedNumber ? "rgba(0,212,255,0.08)" : "rgba(255,255,255,0.04)",
          border: `1px solid ${mode === "smart" ? "rgba(0,255,136,0.25)" : forcedNumber ? S.neonBlue + "40" : "rgba(255,255,255,0.1)"}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {mode === "smart" ? (
              <div style={{ width: 50, height: 50, borderRadius: 14, background: "rgba(0,255,136,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0 }}>🤖</div>
            ) : forcedNumber ? (
              <div style={{ width: 50, height: 50, borderRadius: 14, background: S.gradBlue, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 900, flexShrink: 0 }}>{forcedNumber}</div>
            ) : (
              <div style={{ width: 50, height: 50, borderRadius: 14, background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0 }}>🎲</div>
            )}
            <div>
              <div style={{ fontSize: 18, fontWeight: 900, color: mode === "smart" ? "#00ff88" : forcedNumber ? S.neonBlue : "rgba(255,255,255,0.55)", lineHeight: 1.2 }}>
                {mode === "smart" ? "SMART AUTO" : forcedNumber ? `${forcedNumber} FORCED` : "NOT SET"}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", marginTop: 4 }}>
                {mode === "smart"
                  ? `~${(DB.get("dp_platform_config") || {}).diceWinRate ?? 17}% of rolls match the user's pick`
                  : forcedNumber
                    ? "Every roll lands on this number until changed"
                    : "Choose below to control every roll"}
              </div>
            </div>
          </div>

          {mode === "smart" && (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ flex: 1 }}>
                <Input label="Win chance %" value={winRate} onChange={setWinRate} type="number" icon="🎯" />
              </div>
              <Btn onClick={saveWinRate} variant="green" style={{ marginBottom: 14 }}>💾 Save</Btn>
            </div>
          )}
        </Card>

        {/* ── FORCE NUMBER BUTTONS 1-6 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
          {[1, 2, 3, 4, 5, 6].map(n => {
            const active = mode === String(n);
            return (
              <button key={n} onClick={() => applyMode(String(n))} style={{
                borderRadius: 18, padding: "18px 6px 14px",
                border: `2px solid ${active ? S.neonBlue : "rgba(255,255,255,0.1)"}`,
                background: active ? `${S.neonBlue}20` : "rgba(255,255,255,0.05)",
                cursor: "pointer", transition: "all 0.2s",
                boxShadow: active ? `0 0 20px rgba(0,212,255,0.5)` : "none",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
              }}>
                <div style={{ fontSize: 26, fontWeight: 900, color: active ? S.neonBlue : "#fff" }}>{n}</div>
                <div style={{
                  fontSize: 10, fontWeight: 800,
                  color: active ? S.neonBlue : "rgba(255,255,255,0.35)",
                  background: active ? `${S.neonBlue}18` : "rgba(255,255,255,0.06)",
                  border: `1px solid ${active ? S.neonBlue + "55" : "rgba(255,255,255,0.12)"}`,
                  borderRadius: 99, padding: "2px 10px",
                }}>Force</div>
              </button>
            );
          })}
        </div>

        {/* ── SMART AUTO + RANDOM ROW */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
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
              <span style={{ fontSize: 12, fontWeight: 700, color: mode === "smart" ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.5)" }}>(Win %)</span>
            </div>
          </button>

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

        <Card style={{ background: "rgba(255,215,0,0.04)", border: "1px solid rgba(255,215,0,0.14)", padding: "12px 14px" }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.75 }}>
            💡 <strong style={{ color: "#ffd700" }}>Admin Control:</strong><br />
            • <b>Force [1-6]</b> → every roll lands on this number (one tap, stays till changed)<br />
            • <b>Smart Auto</b> → algorithm controls win % (tune it above)<br />
            • <b>Random</b> → pure 1-in-6 chance, no control<br />
            • Users ko kuch pata nahi chalta 🔒
          </div>
        </Card>
      </div>
    </div>
  );
};

// ─── ADMIN AVIATOR CONTROL PANEL (Smart Auto / Random / Force crash point) ────
export const AdminAviatorPage = ({ showToast, onBack }) => {
  const [mode, setMode] = useState(() => (DB.get("dp_platform_config") || {}).aviatorMode || "smart");
  const [avgCrash, setAvgCrash] = useState(() => String((DB.get("dp_platform_config") || {}).aviatorAvgCrash ?? 2.0));
  const [forceVal, setForceVal] = useState("2.00");

  const getStats = () => {
    const since = Date.now() - 24 * 3600000;
    const hist = (DB.get("dp_aviator_history") || []).filter(h => new Date(h.time).getTime() > since);
    const rounds = hist.length;
    const cashedOut = hist.filter(h => h.userCashedOut).length;
    const avg = rounds > 0 ? (hist.reduce((s, h) => s + h.crash, 0) / rounds).toFixed(2) : "0.00";
    return { rounds, cashedOut, avg };
  };
  const [stats, setStats] = useState(getStats);
  useEffect(() => {
    const iv = setInterval(() => setStats(getStats()), 3000);
    return () => clearInterval(iv);
  }, []);

  const saveAvgCrash = () => {
    const n = Number(avgCrash);
    if (isNaN(n) || n < 1.01 || n > 50) { showToast("Enter a valid average between 1.01 and 50", "error"); return; }
    const cfg = DB.get("dp_platform_config") || {};
    DB.set("dp_platform_config", { ...cfg, aviatorAvgCrash: n });
    showToast(`Smart Auto target average set to ${n}x`, "success");
  };

  const applyMode = (m) => {
    const cfg = DB.get("dp_platform_config") || {};
    setMode(m);
    if (m === "random") {
      DB.set("dp_platform_config", { ...cfg, aviatorMode: "random" });
      showToast("🎲 Random mode active — natural house-edge odds", "info");
    } else if (m === "smart") {
      DB.set("dp_platform_config", { ...cfg, aviatorMode: "smart" });
      showToast("🤖 Smart Auto ON — tuned average crash", "success");
    }
  };

  const applyForce = () => {
    const n = Number(forceVal);
    if (isNaN(n) || n < 1.00) { showToast("Enter a valid crash multiplier (e.g. 2.50)", "error"); return; }
    const cfg = DB.get("dp_platform_config") || {};
    DB.set("dp_platform_config", { ...cfg, aviatorMode: "force", aviatorForcedCrash: Math.round(n * 100) / 100 });
    setMode("force");
    showToast(`✅ Next round will crash exactly at ${n.toFixed(2)}x`, "success");
  };

  return (
    <div style={{ ...S.page, background: "#1a0505" }}>
      <div style={{ padding: "16px 20px 10px", background: "linear-gradient(180deg,#2e0f0f,transparent)", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 20, fontWeight: 900 }}>✈️ Aviator Admin</div>
        {onBack && <button onClick={onBack} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 13, cursor: "pointer" }}>← Back</button>}
      </div>

      <div style={{ padding: "16px 20px 100px" }}>

        {/* ── STATS */}
        <Card style={{ marginBottom: 14, padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ff3d3d", boxShadow: "0 0 7px #ff3d3d", animation: "pulse 1.2s infinite" }} />
            <span style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.45)", letterSpacing: 1.2 }}>LAST 24 HOURS</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 900 }}>{stats.rounds}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Rounds</div>
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 900, color: S.neonGreen }}>{stats.cashedOut}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Cashed out</div>
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 900, color: S.neonGold }}>{stats.avg}x</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Avg crash</div>
            </div>
          </div>
        </Card>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 16 }}>🎯</span>
          <span style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.42)", letterSpacing: 1.4 }}>NEXT ROUND CONTROL</span>
        </div>

        {/* ── STATUS CARD */}
        <Card style={{
          marginBottom: 14, padding: "14px 16px",
          background: mode === "smart" ? "rgba(0,255,136,0.07)" : mode === "force" ? "rgba(255,61,61,0.08)" : "rgba(255,255,255,0.04)",
          border: `1px solid ${mode === "smart" ? "rgba(0,255,136,0.25)" : mode === "force" ? "rgba(255,61,61,0.4)" : "rgba(255,255,255,0.1)"}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {mode === "smart" ? (
              <div style={{ width: 50, height: 50, borderRadius: 14, background: "rgba(0,255,136,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0 }}>🤖</div>
            ) : mode === "force" ? (
              <div style={{ width: 50, height: 50, borderRadius: 14, background: "linear-gradient(135deg,#ff3d3d,#cc0000)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 900, flexShrink: 0 }}>✈️</div>
            ) : (
              <div style={{ width: 50, height: 50, borderRadius: 14, background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0 }}>🎲</div>
            )}
            <div>
              <div style={{ fontSize: 18, fontWeight: 900, color: mode === "smart" ? "#00ff88" : mode === "force" ? "#ff3d3d" : "rgba(255,255,255,0.55)", lineHeight: 1.2 }}>
                {mode === "smart" ? "SMART AUTO" : mode === "force" ? `${((DB.get("dp_platform_config") || {}).aviatorForcedCrash ?? "—")}x FORCED` : "RANDOM"}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", marginTop: 4 }}>
                {mode === "smart"
                  ? `Rounds average out near ${(DB.get("dp_platform_config") || {}).aviatorAvgCrash ?? 2.0}x over time`
                  : mode === "force"
                    ? "Plane will crash at exactly this multiplier next round"
                    : "Natural house-edge distribution, no tuning"}
              </div>
            </div>
          </div>

          {mode === "smart" && (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ flex: 1 }}>
                <Input label="Target average crash (x)" value={avgCrash} onChange={setAvgCrash} type="number" icon="📈" />
              </div>
              <Btn onClick={saveAvgCrash} variant="green" style={{ marginBottom: 14 }}>💾 Save</Btn>
            </div>
          )}
        </Card>

        {/* ── FORCE EXACT CRASH POINT */}
        <Card style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 8, fontSize: 13 }}>🔒 Force Exact Crash Point</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input type="number" step="0.01" value={forceVal} onChange={e => setForceVal(e.target.value)} placeholder="e.g. 2.50"
              style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "10px 12px", color: "#fff", fontSize: 14, outline: "none" }} />
            <Btn onClick={applyForce} variant="danger">✈️ Force</Btn>
          </div>
        </Card>

        {/* ── SMART AUTO + RANDOM ROW */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
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
              <span style={{ fontSize: 12, fontWeight: 700, color: mode === "smart" ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.5)" }}>(Avg Crash)</span>
            </div>
          </button>

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

        <Card style={{ background: "rgba(255,215,0,0.04)", border: "1px solid rgba(255,215,0,0.14)", padding: "12px 14px" }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.75 }}>
            💡 <strong style={{ color: "#ffd700" }}>Admin Control:</strong><br />
            • <b>Force</b> → next round's plane crashes at exactly this multiplier (one-shot)<br />
            • <b>Smart Auto</b> → algorithm keeps the long-run average near your target<br />
            • <b>Random</b> → pure house-edge math, no manual control<br />
            • Users ko kuch pata nahi chalta 🔒
          </div>
        </Card>
      </div>
    </div>
  );
};


export const AdminOverview = ({ setPage, onLogout }) => {
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

  const alertIcon = { login:"🔓", new_user:"👤", deposit:"💰", deposit_pending:"⏳", withdrawal:"⬆️", agent_request:"🙋", support_ticket:"🎧", password_reset_request:"🔐" };

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
                  {a.type==="password_reset_request" && `🔐 Password Reset: ${a.data?.userName} (${a.data?.phone})`}
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

export const AdminUsers = ({ showToast }) => {
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
    const reqs = DB.get("dp_password_reset_requests") || [];
    DB.set("dp_password_reset_requests", reqs.map(r => (r.userId === id && r.status === "pending") ? { ...r, status: "handled" } : r));
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

        {/* Pending Password Reset Requests */}
        {(() => {
          const resetReqs = (DB.get("dp_password_reset_requests") || []).filter(r => r.status === "pending");
          if (resetReqs.length === 0) return null;
          return (
            <Card style={{marginBottom:12,background:"rgba(0,212,255,0.06)",border:`1px solid ${S.neonBlue}33`}}>
              <div style={{fontWeight:800,fontSize:13,marginBottom:8}}>🔐 Password Reset Requests ({resetReqs.length})</div>
              {resetReqs.map(r => {
                const u = allUsers.find(x => x.id === r.userId);
                return (
                  <div key={r.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:13}}>{r.userName}</div>
                      <div style={{fontSize:11,color:"rgba(255,255,255,0.4)"}}>📱 {r.phone} · {timeAgo(r.createdAt)}</div>
                    </div>
                    <div style={{display:"flex",gap:6}}>
                      {u && <Btn sm variant="primary" onClick={() => { setSelectedUser(u); setActiveTab("profile"); }}>Reset</Btn>}
                      <Btn sm variant="ghost" onClick={() => {
                        const all = DB.get("dp_password_reset_requests") || [];
                        DB.set("dp_password_reset_requests", all.map(x => x.id === r.id ? { ...x, status: "handled" } : x));
                        showToast("Marked as handled", "success");
                        refresh();
                      }}>✓</Btn>
                    </div>
                  </div>
                );
              })}
            </Card>
          );
        })()}

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



export const AdminTxns = () => {
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
export const OperatorCenter = ({ user, showToast, onLogout }) => {
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

export const AdminDeposits = ({ showToast }) => {
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

export const AdminWithdrawals = ({ showToast }) => {  const [tick, setTick] = useState(0);
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
export const AdminWallet = ({ showToast }) => {
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
export const AdminAgents = ({ showToast, onBack }) => {
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
export const ROLE_PRESETS = [
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

export const PERMISSION_GROUPS = [
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

export const RoleManagement = ({ showToast }) => {
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
export const AdminSupport = ({ showToast, onBack }) => {
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
export const AdminAnalytics = ({ onBack }) => {
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
export const AdminConfig = ({ showToast }) => {
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
export const ALL_GAMES = [
  { id: "color",   name: "Color Prediction", emoji: "🎨" },
  { id: "dice",    name: "Dice Roll",        emoji: "🎲" },
  { id: "number",  name: "Number Pick",      emoji: "🔢" },
  { id: "scratch", name: "Scratch Card",     emoji: "🃏" },
];

export const TournamentManagement = ({ cfg, setCfg, saveCfg, showToast }) => {
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

