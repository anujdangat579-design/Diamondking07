import { useState, useEffect, useRef, useCallback, useContext, createContext } from "react";
import {
  DB, S, fmt, fmtINR, rnd, sleep, uid, tid, timeAgo, creditBonus,
  pushAdminAlert, getOrCreateChatThread, sendChatMessage,
  hydrateFromFirebase, startLiveSync, initDB,
  useLang, LangProviderComp,
  Btn, Card, Badge, Input, Modal, Toast, Spinner, TopBar, DiamondChip, PromoBanner,
  AviatorIcon, ProgressBar, BottomNav, NotifPanel, SplashScreen,
  getTournamentInfo, TOURNAMENT_PRIZES,
} from "../core.jsx";

export const LandingPage = ({ setPage, setAuthMode }) => {
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

// ─── AUTH PAGE (Login / Register with Password — 91club-style) ───────────────
// Phone + Password auth. No SMS/OTP gateway needed. "Remember password" just
// remembers the phone number locally so it's prefilled next visit. Forgot
// Password routes to WhatsApp/Email support since resets are admin-mediated
// (see AdminUsers → password reset).

export const AuthPage = ({ mode, setUser, setPage, showToast }) => {
  const { t } = useLang();
  const [isRegisterTab, setIsRegisterTab] = useState(mode === "register");
  const [phone, setPhone] = useState(() => { try { return window.localStorage.getItem("dp_remember_phone") || ""; } catch { return ""; } });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberPassword, setRememberPassword] = useState(() => { try { return !!window.localStorage.getItem("dp_remember_phone"); } catch { return false; } });
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [shakeKey, setShakeKey] = useState(0);
  const [authView, setAuthView] = useState("form"); // form | forgot
  const [forgotPhone, setForgotPhone] = useState("");
  const [forgotError, setForgotError] = useState("");
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotDone, setForgotDone] = useState(false);
  const cfg = DB.get("dp_platform_config") || {};

  const switchTab = (toRegister) => {
    setIsRegisterTab(toRegister);
    setError("");
    setPassword(""); setConfirmPassword(""); setAgreeTerms(false);
  };

  const failWith = (msg) => {
    setError(msg);
    setShakeKey(k => k + 1);
  };

  const finishLogin = (user) => {
    const users = DB.get("dp_users") || [];
    const updated = users.map(u => u.phone === phone ? { ...u, lastLogin: new Date().toISOString() } : u);
    DB.set("dp_users", updated);
    DB.set("dp_session", { userId: user.id, loginTime: new Date().toISOString() });
    pushAdminAlert("login", { userName: user.name, phone: user.phone, time: new Date().toISOString() });
    // Security: log login event
    const loginLogs = DB.get("dp_login_logs") || [];
    DB.set("dp_login_logs", [{ phone: user.phone, userId: user.id, ip: "client-side", success: true, time: new Date().toISOString(), device: navigator.userAgent.slice(0,60) }, ...loginLogs].slice(0, 200));
    // Security: capture device fingerprint
    const deviceId = [navigator.userAgent.slice(0,30), screen.width, screen.height, navigator.language].join("|");
    const allUsers = DB.get("dp_users") || [];
    DB.set("dp_users", allUsers.map(u => u.phone === phone ? { ...u, lastLogin: new Date().toISOString(), deviceId, ipAddress: "client" } : u));
    try {
      if (rememberPassword) window.localStorage.setItem("dp_remember_phone", phone);
      else window.localStorage.removeItem("dp_remember_phone");
    } catch {}
    setUser({ ...user, lastLogin: new Date().toISOString() });
    setPage(user.isAdmin ? "admin" : user.isDepositOperator ? "operator_center" : "home");
  };

  const handleLogin = async () => {
    if (phone.length !== 10) { failWith("Enter valid 10-digit number"); return; }
    if (!password) { failWith("Enter your password"); return; }
    setError("");
    setLoading(true);
    await sleep(550);
    const users = DB.get("dp_users") || [];
    const existing = users.find(u => u.phone === phone);
    if (!existing) {
      setLoading(false);
      failWith("No account found. Please register.");
      return;
    }
    if (existing.password !== password) {
      setLoading(false);
      failWith("Incorrect password. Try again.");
      return;
    }
    setLoading(false);
    finishLogin(existing);
  };

  const handleRegister = async () => {
    if (phone.length !== 10) { failWith("Enter valid 10-digit number"); return; }
    if (password.length < 6) { failWith("Password must be at least 6 characters"); return; }
    if (password !== confirmPassword) { failWith("Passwords don't match"); return; }
    if (!agreeTerms) { failWith("Please agree to the Privacy Agreement"); return; }
    const users = DB.get("dp_users") || [];
    if (users.find(u => u.phone === phone)) { failWith("Account already exists. Please login."); return; }
    setError("");
    setLoading(true);
    await sleep(800);
    const refCode = `DP${phone.slice(-6)}`;
    const referrer = inviteCode ? users.find(u => u.referralCode === inviteCode.toUpperCase()) : null;
    const welcomeBonus = cfg.welcomeBonus || 50;
    const newUser = {
      id: uid(), name: `Player${phone.slice(-4)}`, phone, email: "",
      password, diamonds: welcomeBonus,
      referralCode: refCode,
      referredBy: referrer ? inviteCode.toUpperCase() : null,
      totalDeposited: 0, totalWithdrawn: 0, gamesPlayed: 0,
      joinedAt: new Date().toISOString(), isAdmin: false,
      lastLogin: new Date().toISOString(), phoneVerified: true,
      isAgent: false, commissionPaid: 0, customCommissionPercent: null,
      isDepositOperator: false,
      frozen: false, frozenReason: null, bonusDiamonds: 0, cashbackDiamonds: 0,
    };
    DB.set("dp_users", [...users, newUser]);
    if (referrer) {
      const updatedUsers = DB.get("dp_users").map(u => u.id === referrer.id ? { ...u, diamonds: u.diamonds + 30 } : u);
      DB.set("dp_users", updatedUsers);
    }
    const txns = DB.get("dp_transactions") || [];
    DB.set("dp_transactions", [{ id: tid(), userId: newUser.id, type: "bonus", amount: 0, diamonds: welcomeBonus, status: "success", date: new Date().toISOString(), method: "system", note: "Welcome Bonus" }, ...txns]);
    DB.set("dp_session", { userId: newUser.id, loginTime: new Date().toISOString() });
    pushAdminAlert("new_user", { userName: newUser.name, phone: newUser.phone, time: new Date().toISOString() });
    setLoading(false);
    setUser(newUser);
    setPage("home");
    showToast(`Welcome! 💎 ${welcomeBonus} Diamonds credited!`, "success");
  };

  const contactSupport = () => {
    if ((cfg.whatsappEnabled ?? true) && cfg.supportWhatsapp) {
      window.open(`https://wa.me/${cfg.supportWhatsapp.replace(/\D/g, "")}?text=${encodeURIComponent("Hi DiamondPlay Support, I need help with my account.")}`, "_blank");
      return;
    }
    if ((cfg.emailSupportEnabled ?? true) && cfg.supportEmail) {
      window.open(`mailto:${cfg.supportEmail}?subject=${encodeURIComponent("DiamondPlay Support Request")}`, "_blank");
      return;
    }
    showToast("Support contact not configured yet — please try again later.", "info");
  };

  const openForgotPassword = () => {
    setAuthView("forgot");
    setForgotPhone(phone);
    setForgotError("");
    setForgotDone(false);
  };

  const submitForgotPassword = async () => {
    if (forgotPhone.length !== 10) { setForgotError("Enter a valid 10-digit number"); return; }
    setForgotSubmitting(true);
    await sleep(600);
    const users = DB.get("dp_users") || [];
    const existing = users.find(u => u.phone === forgotPhone);
    if (!existing) {
      setForgotSubmitting(false);
      setForgotError("No account found with this number.");
      return;
    }
    const requests = DB.get("dp_password_reset_requests") || [];
    DB.set("dp_password_reset_requests", [{
      id: `pr_${Date.now()}`, userId: existing.id, userName: existing.name, phone: existing.phone,
      status: "pending", createdAt: new Date().toISOString(),
    }, ...requests]);
    pushAdminAlert("password_reset_request", { userName: existing.name, phone: existing.phone, time: new Date().toISOString() });
    setForgotSubmitting(false);
    setForgotError("");
    setForgotDone(true);
  };

  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(ellipse at 50% 0%,#1a0a3e,#0a0a1a)", display: "flex", flexDirection: "column", padding: 24, overflowY: "auto" }}>
      <button onClick={() => authView === "forgot" ? setAuthView("form") : setPage("landing")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 24, cursor: "pointer", alignSelf: "flex-start", marginBottom: 18, transition: "transform 0.15s" }} onMouseDown={e => e.currentTarget.style.transform = "scale(0.85)"} onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}>←</button>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        <div style={{ fontSize: 22, animation: "splashGlow 2.5s ease-in-out infinite" }}>🌐</div>
        <div style={{ fontSize: 19, fontWeight: 900, background: S.gradBlue, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: 0.5 }}>DIAMONDPLAY</div>
      </div>

      {authView === "forgot" ? (
        <div key="forgot-view" style={{ animation: "resultSlide 0.3s ease" }}>
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 26, fontWeight: 900, marginBottom: 6 }}>🔐 Reset Password</div>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13.5 }}>
              {forgotDone ? "Your request has been sent to our team." : "Enter your registered phone number — our support team will verify and reset your password."}
            </div>
          </div>

          {!forgotDone ? (
            <>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.55)", marginBottom: 6, fontWeight: 700 }}>📱 Registered Phone Number</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "13px 14px" }}>
                  <span style={{ color: "rgba(255,255,255,0.6)", fontWeight: 600 }}>🇮🇳 +91</span>
                  <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.15)" }} />
                  <input type="tel" placeholder="Enter 10-digit number" value={forgotPhone} onChange={e => setForgotPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    onKeyDown={e => { if (e.key === "Enter") submitForgotPassword(); }}
                    style={{ flex: 1, background: "none", border: "none", color: "#fff", fontSize: 15.5, outline: "none" }} />
                </div>
              </div>

              {forgotError && (
                <div key={forgotError} style={{ color: "#ff6b6b", fontSize: 13, marginBottom: 12, fontWeight: 600, animation: "otpShake 0.4s" }}>⚠️ {forgotError}</div>
              )}

              <Btn full onClick={submitForgotPassword} disabled={forgotSubmitting} style={{ marginBottom: 14 }}>
                {forgotSubmitting ? "Sending request…" : "📨 Send Reset Request"}
              </Btn>

              <div style={{ textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 18 }}>Need it faster? Reach us directly below.</div>
            </>
          ) : (
            <Card style={{ marginBottom: 18, background: "rgba(0,255,136,0.06)", border: `1px solid ${S.neonGreen}33`, textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 8, animation: "otpPop 0.4s ease" }}>✅</div>
              <div style={{ fontWeight: 800, marginBottom: 4 }}>Request Sent!</div>
              <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.55)" }}>Our team will verify your identity and reset your password shortly. Contact support below if it's urgent.</div>
            </Card>
          )}

          <div style={{ display: "flex", justifyContent: "center", gap: 36, marginBottom: 22 }}>
            <div onClick={contactSupport} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(0,255,136,0.1)", border: `1.5px solid ${S.neonGreen}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🟢</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>WhatsApp Us</div>
            </div>
            <div onClick={contactSupport} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <div style={{ position: "relative", width: 48, height: 48, borderRadius: "50%", background: "rgba(0,212,255,0.1)", border: `1.5px solid ${S.neonBlue}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
                🎧
                <div style={{ position: "absolute", top: 1, right: 1, width: 9, height: 9, borderRadius: "50%", background: S.neonGreen, border: "1.5px solid #0a0a1a", animation: "pulse 2s infinite" }} />
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>Customer Service</div>
            </div>
          </div>

          <Btn full variant="ghost" onClick={() => setAuthView("form")}>← Back to Login</Btn>
        </div>
      ) : (
      <>
      <div key={isRegisterTab ? "reg-head" : "log-head"} style={{ marginBottom: 22, animation: "resultSlide 0.3s ease" }}>
        <div style={{ fontSize: 26, fontWeight: 900, marginBottom: 6 }}>
          {isRegisterTab ? "🚀 Create Account" : "👋 Welcome Back"}
        </div>
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13.5 }}>
          {isRegisterTab ? "Register with your mobile number to start playing" : "Login with your phone number and password"}
        </div>
      </div>

      {/* ── Sliding tab pill ── */}
      <div style={{ position: "relative", display: "flex", background: "rgba(255,255,255,0.06)", borderRadius: 14, padding: 4, marginBottom: 20 }}>
        <div style={{
          position: "absolute", top: 4, bottom: 4, left: 4, width: "calc(50% - 4px)",
          background: S.gradBlue, borderRadius: 11,
          transform: isRegisterTab ? "translateX(100%)" : "translateX(0)",
          transition: "transform 0.32s cubic-bezier(.4,0,.2,1)", boxShadow: "0 2px 14px rgba(0,212,255,0.35)",
        }} />
        <button onClick={() => switchTab(false)} style={{ position: "relative", zIndex: 1, flex: 1, background: "none", border: "none", color: !isRegisterTab ? "#fff" : "rgba(255,255,255,0.5)", fontWeight: 800, fontSize: 14, padding: "10px 0", cursor: "pointer", transition: "color 0.2s" }}>🔑 Login</button>
        <button onClick={() => switchTab(true)} style={{ position: "relative", zIndex: 1, flex: 1, background: "none", border: "none", color: isRegisterTab ? "#fff" : "rgba(255,255,255,0.5)", fontWeight: 800, fontSize: 14, padding: "10px 0", cursor: "pointer", transition: "color 0.2s" }}>✨ Register</button>
      </div>

      <div key={isRegisterTab ? "reg-form" : "log-form"} style={{ animation: "resultSlide 0.35s ease" }}>
        {/* Phone Number */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.55)", marginBottom: 6, fontWeight: 700 }}>📱 Phone Number</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "13px 14px", transition: "border-color 0.2s" }}>
            <span style={{ color: "rgba(255,255,255,0.6)", fontWeight: 600 }}>🇮🇳 +91</span>
            <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.15)" }} />
            <input type="tel" placeholder="Enter 10-digit number" value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              style={{ flex: 1, background: "none", border: "none", color: "#fff", fontSize: 15.5, outline: "none" }} />
          </div>
        </div>

        {/* Password */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.55)", marginBottom: 6, fontWeight: 700 }}>🔒 {isRegisterTab ? "Set Password" : "Password"}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "13px 14px" }}>
            <input
              type={showPassword ? "text" : "password"}
              placeholder={isRegisterTab ? "Min 6 characters" : "Enter your password"}
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !isRegisterTab) handleLogin(); }}
              style={{ flex: 1, background: "none", border: "none", color: "#fff", fontSize: 15.5, outline: "none" }}
            />
            <span onClick={() => setShowPassword(v => !v)} style={{ cursor: "pointer", fontSize: 18, userSelect: "none", transition: "transform 0.15s" }}>{showPassword ? "🐵" : "🙈"}</span>
          </div>
        </div>

        {isRegisterTab && (
          <>
            {/* Confirm Password */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.55)", marginBottom: 6, fontWeight: 700 }}>🔒 Confirm Password</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "13px 14px" }}>
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Repeat your password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  style={{ flex: 1, background: "none", border: "none", color: "#fff", fontSize: 15.5, outline: "none" }}
                />
                <span onClick={() => setShowConfirmPassword(v => !v)} style={{ cursor: "pointer", fontSize: 18, userSelect: "none" }}>{showConfirmPassword ? "🐵" : "🙈"}</span>
              </div>
            </div>

            {/* Invite Code */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.55)", marginBottom: 6, fontWeight: 700 }}>🎁 Invite Code (Optional)</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "13px 14px" }}>
                <input type="text" placeholder="Enter referral code for bonus 💎" value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())}
                  style={{ flex: 1, background: "none", border: "none", color: "#fff", fontSize: 14.5, outline: "none" }} />
              </div>
            </div>

            <label style={{ display: "flex", alignItems: "flex-start", gap: 9, marginBottom: 18, cursor: "pointer", fontSize: 12.5, color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}>
              <input type="checkbox" checked={agreeTerms} onChange={e => setAgreeTerms(e.target.checked)} style={{ marginTop: 2, width: 16, height: 16, accentColor: S.neonBlue, flexShrink: 0 }} />
              <span>I have read and agree <span style={{ color: S.neonBlue, fontWeight: 700 }}>[Privacy Agreement]</span></span>
            </label>
          </>
        )}

        {!isRegisterTab && (
          <label style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 18, cursor: "pointer", fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
            <input type="checkbox" checked={rememberPassword} onChange={e => setRememberPassword(e.target.checked)} style={{ width: 16, height: 16, accentColor: S.neonBlue }} />
            Remember password
          </label>
        )}

        {error && (
          <div key={shakeKey} style={{ color: "#ff6b6b", fontSize: 13, marginBottom: 12, fontWeight: 600, animation: "otpShake 0.4s" }}>⚠️ {error}</div>
        )}

        <Btn full onClick={isRegisterTab ? handleRegister : handleLogin} disabled={loading} style={{ marginBottom: 12 }}>
          {loading ? "Please wait..." : isRegisterTab ? "🚀 Register" : "🔑 Login"}
        </Btn>

        <Btn full variant="ghost" onClick={() => switchTab(!isRegisterTab)} style={{ marginBottom: 22 }}>
          {isRegisterTab ? "Already have an account? 🔑 Login" : "Don't have an account? ✨ Register"}
        </Btn>

        <div style={{ display: "flex", justifyContent: "center", gap: 36, marginBottom: isRegisterTab ? 20 : 0 }}>
          <div onClick={openForgotPassword} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(255,215,0,0.1)", border: `1.5px solid ${S.neonGold}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, transition: "transform 0.15s" }} onMouseDown={e => e.currentTarget.style.transform = "scale(0.9)"} onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}>🔑</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>Forgot Password</div>
          </div>
          <div onClick={contactSupport} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <div style={{ position: "relative", width: 48, height: 48, borderRadius: "50%", background: "rgba(0,212,255,0.1)", border: `1.5px solid ${S.neonBlue}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, transition: "transform 0.15s" }} onMouseDown={e => e.currentTarget.style.transform = "scale(0.9)"} onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}>
              🎧
              <div style={{ position: "absolute", top: 1, right: 1, width: 9, height: 9, borderRadius: "50%", background: S.neonGreen, border: "1.5px solid #0a0a1a", animation: "pulse 2s infinite" }} />
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>Customer Service</div>
          </div>
        </div>

        {isRegisterTab && (
          <Card style={{ textAlign: "center", background: "rgba(255,215,0,0.06)", border: "1px solid rgba(255,215,0,0.2)" }}>
            <div style={{ color: S.neonGold, fontWeight: 700 }}>🎁 Welcome Bonus!</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>Get 💎{cfg.welcomeBonus || 50} FREE Diamonds on signup</div>
          </Card>
        )}
      </div>
      </>
      )}
    </div>
  );
};


// ─── HOME PAGE ────────────────────────────────────────────────────────────────
export const HomePage = ({ user, setUser, setPage, setNotifOpen, notifications }) => {
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
    { id: "aviator", name: "Aviator",       emoji: "✈️", cost: cfg.gameCost || 5,    hot: true  },
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
              {g.id === "aviator"
                ? <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}><AviatorIcon size={54} /></div>
                : <div style={{ fontSize: 38, marginBottom: 8 }}>{g.emoji}</div>}
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


export const ProfilePage = ({ user, setUser, setPage, showToast, onLogout, setNotifOpen }) => {
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
    { icon: "📅", label: t("profile_checkin"), action: () => setPage("checkin") },
    { icon: "🎁", label: t("profile_gifts"), action: () => setPage("redeem") },
    { icon: "📊", label: t("profile_game_stats"), action: () => setPage("game_stats") },
    { icon: "🌐", label: t("profile_language"), value: currentLangNative, action: () => setLangModalOpen(true) },
  ];

  const myTicketsUnread = (DB.get("dp_support_tickets") || []).filter(t => t.userId === user.id && t.unreadForUser).length;

  const serviceItems = [
    { icon: "⚙️", label: t("profile_settings"), action: () => setPage("settings") },
    { icon: "📝", label: t("profile_feedback"), action: () => setPage("support") },
    { icon: "📢", label: t("profile_announcement"), action: () => setPage("announcements") },
    { icon: "🎧", label: t("profile_customer_service"), action: () => setPage("support"), badge: myTicketsUnread },
    { icon: "📘", label: t("profile_beginners_guide"), action: () => setPage("guide") },
    { icon: "ℹ️", label: t("profile_about"), action: () => setPage("about") },
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, width: "100%", maxWidth: "100%", flexWrap: "wrap" }}>
            <div style={{ minWidth: 0, flex: "1 1 120px" }}>
              <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.5)" }}>{t("profile_total_balance")}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, minWidth: 0 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>💎{fmt(freshUser.diamonds)}</span>
                <span onClick={() => setTick(t => t + 1)} style={{ cursor: "pointer", color: "rgba(255,255,255,0.5)", flexShrink: 0 }}>🔄</span>
              </div>
            </div>
            <button onClick={() => goToWallet(null)} style={{ background: S.gradPink, color: "#fff", border: "none", borderRadius: 20, padding: "10px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, marginLeft: "auto" }}>{t("profile_enter_wallet")}</button>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            {[
              { icon: "👛", bg: "rgba(255,61,154,0.15)", label: t("profile_ar_wallet"), action: () => goToWallet(null) },
              { icon: "📥", bg: "rgba(255,215,0,0.15)", label: t("profile_deposit"), action: () => goToWallet("depositHistory") },
              { icon: "💳", bg: "rgba(0,212,255,0.15)", label: t("profile_withdraw"), action: () => goToWallet("withdrawHistory") },
              { icon: "🛡️", bg: "rgba(0,255,136,0.15)", label: t("profile_vip"), action: () => setPage("vip") },
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
export const UserSupportPage = ({ user, setPage, showToast, onBack }) => {
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

export const LeaderboardPage = ({ user }) => {
  const { t } = useLang();
  const cfg = DB.get("dp_platform_config") || {};
  const users = (DB.get("dp_users") || []).filter(u => !u.isAdmin).sort((a, b) => b.diamonds - a.diamonds).slice(0, 10);
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <div style={S.page}>
      <TopBar title={t("leaderboard_title")} />
      <div style={{ padding: "0 20px" }}>
        <PromoBanner banner={cfg.promoBanner} />
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


export const AgentHomePage = ({ user, setPage, showToast }) => {
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
export const AgentSubordinatesPage = ({ user, setPage, showToast }) => {
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

// ─── DAILY CHECK-IN (7-day streak bonus) ─────────────────────────────────────
export const DailyCheckinPage = ({ user, setUser, setPage, showToast }) => {
  const [tick, setTick] = useState(0);
  const cfg = DB.get("dp_platform_config") || {};
  const freshUser = (DB.get("dp_users") || []).find(u => u.id === user.id) || user;
  const REWARD_MULT = [1, 1.5, 2, 2.5, 3, 4, 6]; // day1..day7, day7 = jackpot
  const base = cfg.dailyReward || 25;

  const today0 = new Date(); today0.setHours(0, 0, 0, 0);
  const last = freshUser.lastCheckinAt ? new Date(freshUser.lastCheckinAt) : null;
  const last0 = last ? new Date(last.getFullYear(), last.getMonth(), last.getDate()) : null;
  const daysSince = last0 ? Math.round((today0 - last0) / 86400000) : null;

  const alreadyClaimedToday = daysSince === 0;
  const streakBroken = daysSince !== null && daysSince > 1;
  // Which streak day would be claimed if the user claims right now
  const nextStreak = !last0 ? 1 : daysSince === 1 ? (freshUser.checkinStreak >= 7 ? 1 : (freshUser.checkinStreak || 0) + 1) : daysSince === 0 ? (freshUser.checkinStreak || 1) : 1;
  const currentStreak = streakBroken ? 0 : (freshUser.checkinStreak || 0);

  const claim = () => {
    if (alreadyClaimedToday) { showToast("Aaj ka check-in already ho chuka hai!", "info"); return; }
    const reward = Math.round(base * REWARD_MULT[nextStreak - 1]);
    const updated = creditBonus(freshUser.id, reward, `Daily Check-in — Day ${nextStreak}`, {
      lastCheckinAt: new Date().toISOString(),
      checkinStreak: nextStreak,
    });
    setUser(u => ({ ...u, diamonds: updated.diamonds, lastCheckinAt: updated.lastCheckinAt, checkinStreak: updated.checkinStreak }));
    setTick(t => t + 1);
    showToast(`🎉 Day ${nextStreak} bonus: +${reward}💎 !`, "success");
  };

  return (
    <div style={{ minHeight: "100vh", background: S.bg1, paddingBottom: 100 }}>
      <TopBar title="📅 Daily Check-in" onBack={() => setPage("profile")} />
      <div style={{ padding: "0 18px" }}>
        <Card style={{ marginBottom: 16, textAlign: "center", padding: "20px 14px", background: "linear-gradient(135deg, rgba(0,212,255,0.08), rgba(181,55,242,0.08))" }}>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>Current Streak</div>
          <div style={{ fontSize: 34, fontWeight: 900, background: S.gradBlue, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            {currentStreak} / 7 Days
          </div>
        </Card>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 18 }}>
          {REWARD_MULT.map((mult, i) => {
            const day = i + 1;
            const isJackpot = day === 7;
            const claimed = day <= currentStreak;
            const isNext = day === nextStreak && !alreadyClaimedToday;
            const reward = Math.round(base * mult);
            return (
              <div key={day} style={{
                borderRadius: 14, padding: "12px 6px", textAlign: "center",
                background: isJackpot ? "rgba(255,215,0,0.1)" : claimed ? "rgba(0,255,136,0.08)" : "rgba(255,255,255,0.04)",
                border: `1.5px solid ${isNext ? S.neonBlue : isJackpot ? "rgba(255,215,0,0.4)" : claimed ? "rgba(0,255,136,0.3)" : "rgba(255,255,255,0.08)"}`,
                boxShadow: isNext ? `0 0 16px ${S.neonBlue}55` : "none",
              }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>DAY {day}</div>
                <div style={{ fontSize: 20, marginBottom: 4 }}>{isJackpot ? "🎰" : claimed ? "✅" : "🎁"}</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: isJackpot ? S.neonGold : "#fff" }}>+{reward}💎</div>
              </div>
            );
          })}
        </div>

        <Btn full onClick={claim} disabled={alreadyClaimedToday} style={{ opacity: alreadyClaimedToday ? 0.5 : 1 }}>
          {alreadyClaimedToday ? "✅ Aaj Claim Ho Gaya — Kal Aana" : `🎁 Claim Day ${nextStreak} Bonus`}
        </Btn>

        <Card style={{ marginTop: 16, background: "rgba(255,255,255,0.03)" }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.7 }}>
            💡 Har din check-in karo — reward badhta jaata hai. Ek din miss kiya to streak Day 1 se restart hogi. Day 7 = Jackpot bonus!
          </div>
        </Card>
      </div>
    </div>
  );
};

// ─── VIP LEVELS (deposit-based tiers with daily claimable bonus) ────────────
export const VIPPage = ({ user, setUser, setPage, showToast }) => {
  const [tick, setTick] = useState(0);
  const cfg = DB.get("dp_platform_config") || {};
  const levels = cfg.vipLevels || [];
  const freshUser = (DB.get("dp_users") || []).find(u => u.id === user.id) || user;
  const deposited = freshUser.totalDeposited || 0;

  const sorted = [...levels].sort((a, b) => a.level - b.level);
  const current = [...sorted].reverse().find(v => deposited >= v.minDeposit) || sorted[0];
  const next = sorted.find(v => v.level === current.level + 1);
  const progressPct = next ? Math.min(100, Math.round(((deposited - current.minDeposit) / (next.minDeposit - current.minDeposit)) * 100)) : 100;

  const today0 = new Date(); today0.setHours(0, 0, 0, 0);
  const lastClaim = freshUser.lastVipClaimAt ? new Date(freshUser.lastVipClaimAt) : null;
  const lastClaim0 = lastClaim ? new Date(lastClaim.getFullYear(), lastClaim.getMonth(), lastClaim.getDate()) : null;
  const alreadyClaimedToday = lastClaim0 && lastClaim0.getTime() === today0.getTime();

  const claimVip = () => {
    if (alreadyClaimedToday) { showToast("Aaj ka VIP bonus already claim ho chuka hai!", "info"); return; }
    if (!current.dailyBonus) { showToast("Is level par koi daily bonus nahi hai — deposit badhao!", "info"); return; }
    const updated = creditBonus(freshUser.id, current.dailyBonus, `VIP Daily Bonus — ${current.name}`, {
      lastVipClaimAt: new Date().toISOString(),
    });
    setUser(u => ({ ...u, diamonds: updated.diamonds, lastVipClaimAt: updated.lastVipClaimAt }));
    setTick(t => t + 1);
    showToast(`👑 VIP Daily Bonus: +${current.dailyBonus}💎 !`, "success");
  };

  const levelIcon = ["🥉", "🥈", "🥇", "💠", "💎", "👑"];

  return (
    <div style={{ minHeight: "100vh", background: S.bg1, paddingBottom: 100 }}>
      <TopBar title="🛡️ VIP Levels" onBack={() => setPage("profile")} />
      <div style={{ padding: "0 18px" }}>
        {/* Current level card */}
        <Card style={{ marginBottom: 16, padding: "20px 16px", textAlign: "center", background: "linear-gradient(135deg, rgba(255,215,0,0.08), rgba(0,255,136,0.05))", border: "1px solid rgba(255,215,0,0.25)" }}>
          <div style={{ fontSize: 40, marginBottom: 6 }}>{levelIcon[current.level] || "🛡️"}</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: S.neonGold }}>{current.name}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>Total Deposited: ₹{fmt(deposited)}</div>

          {next && (
            <div style={{ marginTop: 14 }}>
              <div style={{ height: 8, background: "rgba(255,255,255,0.08)", borderRadius: 99, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${progressPct}%`, background: S.gradBlue, borderRadius: 99, transition: "width 0.5s" }} />
              </div>
              <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>
                ₹{fmt(Math.max(0, next.minDeposit - deposited))} aur deposit karo <b style={{ color: "#fff" }}>{next.name}</b> unlock karne ke liye
              </div>
            </div>
          )}
          {!next && <div style={{ fontSize: 12, color: S.neonGreen, marginTop: 10, fontWeight: 700 }}>🎉 Max VIP Level Achieved!</div>}
        </Card>

        {/* Daily VIP bonus claim */}
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14 }}>Daily VIP Bonus</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>{current.name} level → +{current.dailyBonus}💎/day</div>
            </div>
            <Btn sm onClick={claimVip} disabled={alreadyClaimedToday} style={{ opacity: alreadyClaimedToday ? 0.5 : 1 }}>
              {alreadyClaimedToday ? "✅ Claimed" : "Claim"}
            </Btn>
          </div>
        </Card>

        {/* All levels list */}
        <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.4)", letterSpacing: 1, marginBottom: 8 }}>ALL VIP LEVELS</div>
        {sorted.map(lv => {
          const unlocked = deposited >= lv.minDeposit;
          return (
            <Card key={lv.level} style={{
              marginBottom: 8, opacity: unlocked ? 1 : 0.55,
              border: lv.level === current.level ? `1.5px solid ${S.neonGold}` : "1px solid rgba(255,255,255,0.07)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 26 }}>{levelIcon[lv.level] || "🛡️"}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{lv.name}</div>
                  <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.4)" }}>Min deposit ₹{fmt(lv.minDeposit)} · +{lv.dailyBonus}💎/day · {lv.rebatePercent}% rebate</div>
                </div>
                {!unlocked && <span style={{ fontSize: 16 }}>🔒</span>}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
// ═══════════════════════════════════════════════════════════════════════════════

// ─── REDEEM / GIFT CODE ───────────────────────────────────────────────────────
export const RedeemCodePage = ({ user, setUser, setPage, showToast }) => {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const freshUser = (DB.get("dp_users") || []).find(u => u.id === user.id) || user;

  const redeem = () => {
    const code = input.trim().toUpperCase();
    if (!code) { showToast("Code enter karo", "error"); return; }
    setBusy(true);
    const codes = DB.get("dp_gift_codes") || [];
    const gc = codes.find(c => c.code === code);
    if (!gc || !gc.active) { showToast("❌ Invalid ya inactive code", "error"); setBusy(false); return; }
    if (gc.expiresAt && new Date(gc.expiresAt) < new Date()) { showToast("❌ Yeh code expire ho chuka hai", "error"); setBusy(false); return; }
    if (gc.usedBy.includes(freshUser.id)) { showToast("⚠️ Aap yeh code pehle hi use kar chuke ho", "info"); setBusy(false); return; }
    if (gc.maxUses > 0 && gc.usedBy.length >= gc.maxUses) { showToast("❌ Yeh code fully redeem ho chuka hai", "error"); setBusy(false); return; }

    const updatedCodes = codes.map(c => c.id === gc.id ? { ...c, usedBy: [...c.usedBy, freshUser.id] } : c);
    DB.set("dp_gift_codes", updatedCodes);
    const updatedUser = creditBonus(freshUser.id, gc.diamonds, `Gift Code Redeemed — ${gc.code}`);
    setUser(u => ({ ...u, diamonds: updatedUser.diamonds }));
    setBusy(false);
    setInput("");
    showToast(`🎉 +${gc.diamonds}💎 credited!`, "success");
  };

  return (
    <div style={{ minHeight: "100vh", background: S.bg1, paddingBottom: 100 }}>
      <TopBar title="🎁 Redeem Gift Code" onBack={() => setPage("profile")} />
      <div style={{ padding: "0 18px" }}>
        <Card style={{ marginBottom: 16, textAlign: "center", padding: "24px 16px", background: "linear-gradient(135deg, rgba(255,61,154,0.08), rgba(0,212,255,0.06))" }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🎁</div>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>Have a Gift Code?</div>
          <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.45)" }}>Enter it below for free diamonds</div>
        </Card>

        <input
          value={input} onChange={e => setInput(e.target.value.toUpperCase())}
          placeholder="e.g. DIWALI2026"
          style={{
            width: "100%", padding: "14px 16px", borderRadius: 14, marginBottom: 12,
            background: "rgba(255,255,255,0.06)", border: "1.5px solid rgba(255,255,255,0.15)",
            color: "#fff", fontSize: 16, fontWeight: 800, letterSpacing: 1.5, textAlign: "center",
            boxSizing: "border-box", outline: "none",
          }}
        />
        <Btn full onClick={redeem} disabled={busy || !input.trim()}>{busy ? "Checking..." : "🎁 Redeem Code"}</Btn>
      </div>
    </div>
  );
};

// ─── GAME STATISTICS (personal performance summary) ──────────────────────────
export const GameStatsPage = ({ user, setPage }) => {
  const txns = (DB.get("dp_transactions") || []).filter(t => t.userId === user.id);
  const gameTxns = txns.filter(t => t.type === "game_win" || t.type === "game_spend");
  const wins = gameTxns.filter(t => t.type === "game_win");
  const spends = gameTxns.filter(t => t.type === "game_spend");
  const totalWagered = spends.reduce((s, t) => s + Math.abs(t.diamonds), 0);
  const totalWon = wins.reduce((s, t) => s + t.diamonds, 0);
  const netPL = totalWon - totalWagered;
  const winRate = spends.length ? Math.round((wins.length / spends.length) * 100) : 0;
  const biggestWin = wins.reduce((m, t) => Math.max(m, t.diamonds), 0);

  const byGame = {};
  gameTxns.forEach(t => {
    const g = (t.note || "").split(" ")[0] || "Other";
    byGame[g] = byGame[g] || { played: 0, won: 0 };
    if (t.type === "game_spend") byGame[g].played += 1;
    if (t.type === "game_win") byGame[g].won += t.diamonds;
  });

  return (
    <div style={{ minHeight: "100vh", background: S.bg1, paddingBottom: 100 }}>
      <TopBar title="📊 Game Statistics" onBack={() => setPage("profile")} />
      <div style={{ padding: "0 18px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          <Card style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: S.neonBlue }}>{spends.length}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Games Played</div>
          </Card>
          <Card style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: S.neonGreen }}>{winRate}%</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Win Rate</div>
          </Card>
          <Card style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: netPL >= 0 ? S.neonGreen : "#ff6b6b" }}>{netPL >= 0 ? "+" : ""}{fmt(netPL)}💎</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Net P&L</div>
          </Card>
          <Card style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: S.neonGold }}>{fmt(biggestWin)}💎</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Biggest Win</div>
          </Card>
        </div>

        <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.4)", letterSpacing: 1, marginBottom: 8 }}>BY GAME</div>
        {Object.keys(byGame).length === 0 && <Card style={{ textAlign: "center", padding: 24, color: "rgba(255,255,255,0.3)" }}>Abhi koi game khela nahi hai</Card>}
        {Object.entries(byGame).map(([name, s]) => (
          <Card key={name} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 700 }}>{name}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{s.played} played · +{fmt(s.won)}💎 won</div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

// ─── ANNOUNCEMENTS (user-facing notice board) ────────────────────────────────
export const AnnouncementsPage = ({ setPage }) => {
  const items = (DB.get("dp_announcements") || []).sort((a, b) => (b.pinned - a.pinned) || b.createdAt.localeCompare(a.createdAt));
  return (
    <div style={{ minHeight: "100vh", background: S.bg1, paddingBottom: 100 }}>
      <TopBar title="📢 Announcements" onBack={() => setPage("profile")} />
      <div style={{ padding: "0 18px" }}>
        {items.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "rgba(255,255,255,0.3)" }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>📭</div>
            Abhi koi announcement nahi hai
          </div>
        )}
        {items.map(i => (
          <Card key={i.id} style={{ marginBottom: 10, border: i.pinned ? `1px solid ${S.neonGold}55` : undefined }}>
            <div style={{ fontWeight: 800, fontSize: 14.5 }}>{i.pinned && "📌 "}{i.title}</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 6, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{i.body}</div>
            <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.3)", marginTop: 8 }}>{timeAgo(i.createdAt)}</div>
          </Card>
        ))}
      </div>
    </div>
  );
};

// ─── SETTINGS (local app preferences) ────────────────────────────────────────
export const SettingsPage = ({ user, setPage, showToast, onLogout }) => {
  const [prefs, setPrefs] = useState(() => DB.get(`dp_prefs_${user.id}`) || { sound: true, vibration: true, oddsAlert: true });

  const update = (key, val) => {
    const next = { ...prefs, [key]: val };
    setPrefs(next);
    DB.set(`dp_prefs_${user.id}`, next);
  };

  const Toggle = ({ label, sub, checked, onChange }) => (
    <Card style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{label}</div>
          {sub && <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{sub}</div>}
        </div>
        <button onClick={() => onChange(!checked)} style={{ width: 48, height: 26, borderRadius: 13, background: checked ? S.neonGreen : "rgba(255,255,255,0.15)", border: "none", cursor: "pointer", position: "relative" }}>
          <div style={{ position: "absolute", top: 3, left: checked ? 25 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
        </button>
      </div>
    </Card>
  );

  return (
    <div style={{ minHeight: "100vh", background: S.bg1, paddingBottom: 100 }}>
      <TopBar title="⚙️ Settings" onBack={() => setPage("profile")} />
      <div style={{ padding: "0 18px" }}>
        <Toggle label="Sound Effects" sub="Game sounds and button clicks" checked={prefs.sound} onChange={v => update("sound", v)} />
        <Toggle label="Vibration" sub="Haptic feedback on wins/bets" checked={prefs.vibration} onChange={v => update("vibration", v)} />
        <Toggle label="Odds Change Alerts" sub="Notify when game multipliers update" checked={prefs.oddsAlert} onChange={v => update("oddsAlert", v)} />

        <div style={{ marginTop: 20 }}>
          <Btn full variant="danger" onClick={onLogout}>🚪 Log Out</Btn>
        </div>
      </div>
    </div>
  );
};

// ─── BEGINNER'S GUIDE ─────────────────────────────────────────────────────────
export const BeginnersGuidePage = ({ setPage }) => {
  const steps = [
    { icon: "💰", title: "1. Add Diamonds", body: "Profile → Deposit se UPI ke through diamonds add karo. Yeh aapki in-app currency hai." },
    { icon: "🎮", title: "2. Pick a Game", body: "Home se koi bhi game choose karo — Color Prediction, Dice, Aviator, Number ya Scratch Card." },
    { icon: "🎯", title: "3. Place Your Bet", body: "Round shuru hone se pehle apna prediction/bet lagao. Round timer khatam hote hi result declare hota hai." },
    { icon: "🏆", title: "4. Collect Winnings", body: "Jeetne par diamonds turant aapke wallet mein add ho jaate hain — Wallet page pe dekh sakte ho." },
    { icon: "📤", title: "5. Withdraw", body: "Jab chaho, Wallet → Withdraw se apne diamonds ko real cash mein convert karke bank/UPI mein le sakte ho." },
    { icon: "🛡️", title: "6. Level Up", body: "Jitna deposit karoge utna VIP level badhega — har level ke saath extra daily bonus aur rebate milta hai." },
  ];
  return (
    <div style={{ minHeight: "100vh", background: S.bg1, paddingBottom: 100 }}>
      <TopBar title="📘 Beginner's Guide" onBack={() => setPage("profile")} />
      <div style={{ padding: "0 18px" }}>
        {steps.map(s => (
          <Card key={s.title} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ fontSize: 26 }}>{s.icon}</div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{s.title}</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 4, lineHeight: 1.5 }}>{s.body}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

// ─── ABOUT US ─────────────────────────────────────────────────────────────────
export const AboutUsPage = ({ setPage }) => {
  const cfg = DB.get("dp_platform_config") || {};
  return (
    <div style={{ minHeight: "100vh", background: S.bg1, paddingBottom: 100 }}>
      <TopBar title="ℹ️ About Us" onBack={() => setPage("profile")} />
      <div style={{ padding: "0 18px" }}>
        <Card style={{ textAlign: "center", padding: "24px 16px", marginBottom: 16 }}>
          <div style={{ fontSize: 40, marginBottom: 8, background: S.gradBlue, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontWeight: 900 }}>💎</div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>{cfg.siteName || "DiamondPlay"}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>Version 1.0.0</div>
        </Card>
        <Card style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.7 }}>
            {cfg.siteName || "DiamondPlay"} ek mobile-first prediction & mini-games platform hai jahan aap Color Prediction, Dice, Aviator aur aur bhi games khel sakte ho, diamonds jeet sakte ho, aur unhe real cash mein withdraw kar sakte ho.
          </div>
        </Card>
        <Card style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>📧 Contact</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>{cfg.supportEmail || "support@diamondplay.in"}</div>
        </Card>
        <Card>
          <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.35)", lineHeight: 1.6 }}>
            ⚠️ 18+ only. Please play responsibly. This app involves financial risk — bet only what you can afford to lose.
          </div>
        </Card>
      </div>
    </div>
  );
};
