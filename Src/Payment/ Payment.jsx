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

// ─── WALLET / PAYMENT PAGE ────────────────────────────────────────────────────
export const WalletPage = ({ user, setUser, setPage, showToast }) => {
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
export const BuyPage = ({ user, setUser, setPage, showToast }) => {
  return <WalletPage user={user} setUser={setUser} setPage={setPage} showToast={showToast} />;
};

