import { useState, useEffect, useRef, useCallback, useContext, createContext } from "react";
import {
  DB, S, fmt, fmtINR, rnd, sleep, uid, tid, timeAgo,
  pushAdminAlert, getOrCreateChatThread, sendChatMessage,
  hydrateFromFirebase, startLiveSync, initDB,
  useLang, LangProviderComp,
  Btn, Card, Badge, Input, Modal, Toast, Spinner, TopBar, DiamondChip,
  AviatorIcon, ProgressBar, BottomNav, NotifPanel, SplashScreen, SecurityGuard,
  getTournamentInfo, TOURNAMENT_PRIZES,
} from "./core.jsx";

import {
  LandingPage, AuthPage, HomePage, ProfilePage, UserSupportPage,
  LeaderboardPage, AgentHomePage, AgentSubordinatesPage,
  DailyCheckinPage, VIPPage, RedeemCodePage, GameStatsPage,
  AnnouncementsPage, SettingsPage, BeginnersGuidePage, AboutUsPage,
} from "./pages/Pages.jsx";

import {
  GamesPage, ColorGame, DiceGame, AviatorGame, NumberGame, ScratchGame, CustomGamePlay,
} from "./features/Games.jsx";

import { WalletPage, BuyPage } from "./payment/Payment.jsx";

import {
  AdminColorPage, AdminColorControl, AdminGamesHub, AdminGameManagement,
  AdminDicePage, AdminAviatorPage,
  AdminOverview, AdminUsers, AdminTxns, OperatorCenter, AdminDeposits,
  AdminWithdrawals, AdminWallet, AdminAgents, RoleManagement, AdminSupport,
  AdminAnalytics, AdminConfig, TournamentManagement,
  AdminGiftCodes, AdminAnnouncements, AdminSecurity,
} from "./admin/Admin.jsx";

function AppInner() {
  const [page, setPage] = useState("landing");
  const [user, setUser] = useState(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [toast, setToast] = useState({ msg: "", type: "info" });
  const [showSplash, setShowSplash] = useState(true);
  const [cloudReady, setCloudReady] = useState(false);
  const [syncTick, setSyncTick] = useState(0);
  const toastRef = useRef(null);

  // Boot sequence: pull latest data from the shared Firebase collection first,
  // THEN seed any missing defaults, so we never overwrite real cloud data
  // with fresh local defaults on a second device.
  useEffect(() => {
    (async () => {
      await hydrateFromFirebase();
      initDB();
      setCloudReady(true);
    })();
  }, []);

  // Show logo/name splash animation on app open (minimum time, but also
  // waits for the cloud hydration above so we don't flash empty data)
  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 2200);
    return () => clearTimeout(t);
  }, []);

  // Live sync: any write from ANY device (deposit approved, bet placed,
  // admin force-win set, etc.) lands here in real time. Bumping syncTick
  // remounts the current page below so it re-reads the fresh cache.
  useEffect(() => {
    if (!cloudReady) return;
    startLiveSync(() => {
      setSyncTick(t => t + 1);
      // Keep the logged-in user's own record (diamonds, KYC status, etc.)
      // fresh too, since it lives in its own state outside the remounted page.
      setUser(prevUser => {
        if (!prevUser) return prevUser;
        const users = DB.get("dp_users") || [];
        const fresh = users.find(u => u.id === prevUser.id);
        return fresh ? fresh : prevUser;
      });
    });
  }, [cloudReady]);

  // Restore session on reload
  useEffect(() => {
    if (!cloudReady) return;
    const session = DB.get("dp_session");
    if (session) {
      const users = DB.get("dp_users") || [];
      const u = users.find(x => x.id === session.userId);
      if (u) { setUser(u); setPage(u.isAdmin ? "admin" : u.isDepositOperator ? "operator_center" : "home"); }
    }
  }, [cloudReady]);

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
  if (showSplash || !cloudReady) {
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
      if (page === "admin_dice")     return <AdminDicePage showToast={showToast} onBack={() => setPage("admin_games")} />;
      if (page === "admin_aviator")  return <AdminAviatorPage showToast={showToast} onBack={() => setPage("admin_games")} />;
      if (page === "admin_games")    return <AdminGamesHub setPage={setPage} showToast={showToast} />;
      if (page === "admin_game_management") return <AdminGameManagement showToast={showToast} onBack={() => setPage("admin_games")} />;
      if (page === "admin_users")    return <AdminUsers />;
      if (page === "admin_txn")      return <AdminTxns />;
      if (page === "admin_deposits") return <AdminDeposits showToast={showToast} />;
      if (page === "admin_withdraw") return <AdminWithdrawals showToast={showToast} />;
      if (page === "admin_wallet")   return <AdminWallet showToast={showToast} />;
      if (page === "admin_config")   return <AdminConfig showToast={showToast} />;
      if (page === "admin_agents")   return <AdminAgents showToast={showToast} onBack={() => setPage("admin")} />;
      if (page === "admin_support")  return <AdminSupport showToast={showToast} onBack={() => setPage("admin")} />;
      if (page === "admin_analytics") return <AdminAnalytics onBack={() => setPage("admin")} />;
      if (page === "admin_giftcodes") return <AdminGiftCodes showToast={showToast} onBack={() => setPage("admin")} />;
      if (page === "admin_announcements") return <AdminAnnouncements showToast={showToast} onBack={() => setPage("admin")} />;
      if (page === "admin_security")     return <AdminSecurity showToast={showToast} onBack={() => setPage("admin")} />;
      return <AdminOverview setPage={setPage} onLogout={logout} />;
    }
    const props = { user, setUser, setPage, showToast };
    if (page.startsWith("game_custom_")) {
      return <CustomGamePlay {...props} gameId={page.replace("game_custom_", "")} />;
    }
    switch (page) {
      case "home": return <HomePage {...props} setNotifOpen={setNotifOpen} notifications={[]} />;
      case "games": return <GamesPage setPage={setPage} />;
      case "game_color": return <ColorGame {...props} />;
      case "game_aviator": return <AviatorGame {...props} />;
      case "game_dice": return <DiceGame {...props} />;
      case "game_number": return <NumberGame {...props} />;
      case "game_scratch": return <ScratchGame {...props} />;
      case "wallet": case "buy": return <WalletPage {...props} />;
      case "profile": return <ProfilePage {...props} onLogout={logout} setNotifOpen={setNotifOpen} />;
      case "support": return <UserSupportPage {...props} onBack={() => setPage("profile")} />;
      case "agent_home": return <AgentHomePage {...props} />;
      case "agent_subordinates": return <AgentSubordinatesPage {...props} />;
      case "leaderboard": return <LeaderboardPage user={user} />;
      case "checkin": return <DailyCheckinPage {...props} />;
      case "vip": return <VIPPage {...props} />;
      case "redeem": return <RedeemCodePage {...props} />;
      case "game_stats": return <GameStatsPage user={user} setPage={setPage} />;
      case "announcements": return <AnnouncementsPage setPage={setPage} />;
      case "settings": return <SettingsPage user={user} setPage={setPage} showToast={showToast} onLogout={logout} />;
      case "guide": return <BeginnersGuidePage setPage={setPage} />;
      case "about": return <AboutUsPage setPage={setPage} />;
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
    @keyframes aviatorShake { 0%,100%{transform:translate(0,0)} 15%{transform:translate(-6px,3px)} 30%{transform:translate(6px,-3px)} 45%{transform:translate(-5px,-2px)} 60%{transform:translate(5px,2px)} 75%{transform:translate(-3px,1px)} 90%{transform:translate(3px,-1px)} }
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
      <SecurityGuard />
      <div style={S.app}>
        <div style={{ background: S.gradDark, minHeight: "100vh" }}>
          {!user ? (
            page === "auth"
              ? <AuthPage mode={window.__authMode || "login"} setUser={setUser} setPage={setPage} showToast={showToast} />
              : <LandingPage setPage={handleSetPage} setAuthMode={m => { window.__authMode = m; setPage("auth"); }} />
          ) : (
            <>
              <div key={syncTick}>{renderPage()}</div>
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
