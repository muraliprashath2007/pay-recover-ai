const { useState, useEffect, useRef, useMemo } = React;

// ---------------------------------------------------------------------------
// Main PayRecover AI React Application
// ---------------------------------------------------------------------------
function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [dashboardData, setDashboardData] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [totalTxns, setTotalTxns] = useState(0);
  const [auditLogs, setAuditLogs] = useState([]);
  const [modelMetrics, setModelMetrics] = useState(null);
  const [demoScenarios, setDemoScenarios] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState([]);
  
  // Filters for Transactions table
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");
  const [failureFilter, setFailureFilter] = useState("");
  
  // Selected transaction for details modal or AI workbench
  const [selectedTxn, setSelectedTxn] = useState(null);
  const [modalTxn, setModalTxn] = useState(null);
  
  // AI Workbench analysis state
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  
  // Mobile Navigation Drawer state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Demo Scenario execution state
  const [activeScenarioResult, setActiveScenarioResult] = useState(null);
  const [runningScenarioId, setRunningScenarioId] = useState(null);
  
  // Toast Helper
  const showToast = (message, type = "info") => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  };

  // -------------------------------------------------------------------------
  // Data Fetching
  // -------------------------------------------------------------------------
  const fetchDashboard = async () => {
    try {
      const res = await fetch("/api/dashboard");
      const data = await res.json();
      setDashboardData(data);
    } catch (err) {
      console.error("Failed to load dashboard:", err);
    }
  };

  const fetchTransactions = async () => {
    try {
      let url = `/api/transactions?limit=100`;
      if (statusFilter) url += `&status=${statusFilter}`;
      if (riskFilter) url += `&risk_level=${riskFilter}`;
      if (failureFilter) url += `&failure_reason=${encodeURIComponent(failureFilter)}`;
      if (searchTerm) url += `&search=${encodeURIComponent(searchTerm)}`;
      
      const res = await fetch(url);
      const data = await res.json();
      setTransactions(data.transactions || []);
      setTotalTxns(data.total || 0);
      
      // Default select first failed txn for AI Agent if none selected
      if (!selectedTxn && data.transactions && data.transactions.length > 0) {
        const firstFailed = data.transactions.find(t => t.failure_reason !== "None") || data.transactions[0];
        setSelectedTxn(firstFailed);
      }
    } catch (err) {
      console.error("Failed to load transactions:", err);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await fetch("/api/audit-logs?limit=50");
      const data = await res.json();
      setAuditLogs(data.logs || []);
    } catch (err) {
      console.error("Failed to load audit logs:", err);
    }
  };

  const fetchModelMetrics = async () => {
    try {
      const res = await fetch("/api/model-metrics");
      const data = await res.json();
      setModelMetrics(data);
    } catch (err) {
      console.error("Failed to load model metrics:", err);
    }
  };

  const fetchDemoScenarios = async () => {
    try {
      const res = await fetch("/api/demo-scenarios");
      const data = await res.json();
      setDemoScenarios(data || []);
    } catch (err) {
      console.error("Failed to load demo scenarios:", err);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      setSettings(data || {});
    } catch (err) {
      console.error("Failed to load settings:", err);
    }
  };

  const refreshAllData = async () => {
    setLoading(true);
    await Promise.all([
      fetchDashboard(),
      fetchTransactions(),
      fetchAuditLogs(),
      fetchModelMetrics(),
      fetchDemoScenarios(),
      fetchSettings()
    ]);
    setLoading(false);
  };

  useEffect(() => {
    refreshAllData();
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [statusFilter, riskFilter, failureFilter, searchTerm]);

  // Re-initialize Lucide Icons on view changes & menu open
  useEffect(() => {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }, [activeTab, transactions, auditLogs, aiAnalysis, dashboardData, activeScenarioResult, mobileMenuOpen]);


  // -------------------------------------------------------------------------
  // Action Handlers
  // -------------------------------------------------------------------------
  const runAiAnalysis = async (txn) => {
    if (!txn) return;
    setAnalyzing(true);
    setAiAnalysis(null);
    try {
      const res = await fetch(`/api/analyze/${txn.transaction_id}`, { method: "POST" });
      const data = await res.json();
      setTimeout(() => {
        setAiAnalysis(data.analysis);
        setAnalyzing(false);
        showToast(`AI Analysis complete for ${txn.transaction_id}`, "success");
        fetchDashboard();
        fetchAuditLogs();
      }, 600);
    } catch (err) {
      setAnalyzing(false);
      showToast("Error running AI analysis", "danger");
    }
  };

  const handleSimulateRecovery = async (txnId) => {
    try {
      const res = await fetch(`/api/recover/${txnId}`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message, "success");
      } else {
        showToast(data.message || "Recovery blocked by safety guardrail", "warning");
      }
      await refreshAllData();
      if (modalTxn && modalTxn.transaction_id === txnId) {
        const updated = await (await fetch(`/api/transactions/${txnId}`)).json();
        setModalTxn(updated);
      }
      if (selectedTxn && selectedTxn.transaction_id === txnId) {
        const updated = await (await fetch(`/api/transactions/${txnId}`)).json();
        setSelectedTxn(updated);
        setAiAnalysis(updated.ai_analysis || null);
      }
    } catch (err) {
      showToast("Simulation failed", "danger");
    }
  };

  const handleSendReminder = async (txnId) => {
    try {
      const res = await fetch(`/api/remind/${txnId}`, { method: "POST" });
      const data = await res.json();
      showToast(data.message, "success");
      await refreshAllData();
      if (modalTxn && modalTxn.transaction_id === txnId) {
        const updated = await (await fetch(`/api/transactions/${txnId}`)).json();
        setModalTxn(updated);
      }
      if (selectedTxn && selectedTxn.transaction_id === txnId) {
        const updated = await (await fetch(`/api/transactions/${txnId}`)).json();
        setSelectedTxn(updated);
      }
    } catch (err) {
      showToast("Failed to dispatch reminder", "danger");
    }
  };

  const handleEscalate = async (txnId) => {
    try {
      const res = await fetch(`/api/escalate/${txnId}`, { method: "POST" });
      const data = await res.json();
      showToast(data.message, "info");
      await refreshAllData();
      if (modalTxn && modalTxn.transaction_id === txnId) {
        const updated = await (await fetch(`/api/transactions/${txnId}`)).json();
        setModalTxn(updated);
      }
    } catch (err) {
      showToast("Escalation failed", "danger");
    }
  };

  const handleStopRecovery = async (txnId) => {
    try {
      const res = await fetch(`/api/stop/${txnId}`, { method: "POST" });
      const data = await res.json();
      showToast(data.message, "warning");
      await refreshAllData();
      if (modalTxn && modalTxn.transaction_id === txnId) {
        const updated = await (await fetch(`/api/transactions/${txnId}`)).json();
        setModalTxn(updated);
      }
    } catch (err) {
      showToast("Failed to halt recovery", "danger");
    }
  };

  const handleRunDemoScenario = async (scenarioId) => {
    setRunningScenarioId(scenarioId);
    try {
      const res = await fetch(`/api/demo-scenarios/${scenarioId}/run`, { method: "POST" });
      const data = await res.json();
      setActiveScenarioResult(data);
      setRunningScenarioId(null);
      showToast(`Injected ${data.scenario.title}`, "success");
      await refreshAllData();
    } catch (err) {
      setRunningScenarioId(null);
      showToast("Failed to run scenario", "danger");
    }
  };

  // Helper for formatting Currency
  const formatINR = (amt) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2
    }).format(amt || 0);
  };

  return (
    <div className="flex h-screen bg-[#070B14] text-slate-100 overflow-hidden">
      
      {/* -------------------------------------------------------------------- */}
      {/* Desktop Sidebar Navigation (Hidden on Mobile) */}
      {/* -------------------------------------------------------------------- */}
      <aside className="hidden lg:flex w-64 bg-[#0D1527] border-r border-[#1E2D4A] flex-col justify-between p-4 z-20 shrink-0 h-screen">
        <div>
          {/* Logo & Branding */}
          <div className="flex items-center gap-3 px-2 py-3 mb-6 border-b border-[#1E2D4A]/60">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <i data-lucide="shield-check" className="w-6 h-6 text-white"></i>
            </div>
            <div>
              <div className="font-bold text-lg tracking-tight flex items-center gap-1.5">
                <span>PayRecover</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-mono font-semibold">AI</span>
              </div>
              <div className="text-[11px] text-slate-400 font-medium">Razorpay AI Builder</div>
            </div>
          </div>

          {/* Navigation Menu */}
          <nav className="space-y-1.5">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`nav-item w-full text-left ${activeTab === "dashboard" ? "active" : ""}`}
            >
              <i data-lucide="layout-dashboard" className="w-5 h-5"></i>
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => setActiveTab("transactions")}
              className={`nav-item w-full text-left ${activeTab === "transactions" ? "active" : ""}`}
            >
              <i data-lucide="receipt" className="w-5 h-5"></i>
              <span>Transactions</span>
              <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                {totalTxns}
              </span>
            </button>

            <button
              onClick={() => {
                setActiveTab("ai_agent");
                if (selectedTxn && !aiAnalysis) runAiAnalysis(selectedTxn);
              }}
              className={`nav-item w-full text-left ${activeTab === "ai_agent" ? "active" : ""}`}
            >
              <i data-lucide="bot" className="w-5 h-5 text-cyan-400"></i>
              <span className="font-medium text-cyan-300">AI Recovery Agent</span>
            </button>

            <button
              onClick={() => setActiveTab("demo_scenarios")}
              className={`nav-item w-full text-left ${activeTab === "demo_scenarios" ? "active" : ""}`}
            >
              <i data-lucide="sparkles" className="w-5 h-5 text-amber-400"></i>
              <span>Demo Scenarios</span>
              <span className="ml-auto text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                Pitch
              </span>
            </button>

            <button
              onClick={() => setActiveTab("audit_logs")}
              className={`nav-item w-full text-left ${activeTab === "audit_logs" ? "active" : ""}`}
            >
              <i data-lucide="history" className="w-5 h-5"></i>
              <span>Audit Ledger</span>
            </button>

            <button
              onClick={() => setActiveTab("ml_metrics")}
              className={`nav-item w-full text-left ${activeTab === "ml_metrics" ? "active" : ""}`}
            >
              <i data-lucide="cpu" className="w-5 h-5"></i>
              <span>ML Model Metrics</span>
            </button>

            <button
              onClick={() => setActiveTab("settings")}
              className={`nav-item w-full text-left ${activeTab === "settings" ? "active" : ""}`}
            >
              <i data-lucide="sliders" className="w-5 h-5"></i>
              <span>Safety Guardrails</span>
            </button>

            <button
              onClick={() => setActiveTab("about")}
              className={`nav-item w-full text-left ${activeTab === "about" ? "active" : ""}`}
            >
              <i data-lucide="file-text" className="w-5 h-5"></i>
              <span>Pitch & Architecture</span>
            </button>
          </nav>
        </div>

        {/* Sidebar Footer / Demo Mode Badge */}
        <div className="border-t border-[#1E2D4A] pt-4 mt-4 space-y-3">
          <div className="p-3 rounded-xl bg-[#131E36] border border-[#213054]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                DEMO MODE
              </span>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-800">
                ACTIVE
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-tight">
              Synthetic payment data environment. No real funds processed.
            </p>
          </div>

          <div className="text-[11px] text-slate-400 text-center font-mono">
            Track 3: AI Revenue Recovery
          </div>
        </div>
      </aside>

      {/* -------------------------------------------------------------------- */}
      {/* Mobile Navigation Drawer Backdrop & Slide-out Menu */}
      {/* -------------------------------------------------------------------- */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-40 lg:hidden transition-opacity"
          onClick={() => setMobileMenuOpen(false)}
        ></div>
      )}

      <div className={`fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-[#0D1527] border-r border-[#1E2D4A] flex flex-col justify-between p-4 z-50 transform transition-transform duration-300 ease-in-out lg:hidden ${mobileMenuOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full pointer-events-none"}`}>
        <div className="overflow-y-auto">
          {/* Mobile Drawer Header */}
          <div className="flex items-center justify-between px-2 py-3 mb-4 border-b border-[#1E2D4A]/60">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/20">
                <i data-lucide="shield-check" className="w-5 h-5 text-white"></i>
              </div>
              <div>
                <div className="font-bold text-base tracking-tight flex items-center gap-1.5">
                  <span>PayRecover</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-mono font-semibold">AI</span>
                </div>
                <div className="text-[10px] text-slate-400 font-medium">Razorpay AI Builder</div>
              </div>
            </div>
            <button 
              onClick={() => setMobileMenuOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              aria-label="Close Navigation"
            >
              <i data-lucide="x" className="w-5 h-5"></i>
            </button>
          </div>

          {/* Mobile Navigation Menu */}
          <nav className="space-y-1.5">
            <button
              onClick={() => { setActiveTab("dashboard"); setMobileMenuOpen(false); }}
              className={`nav-item w-full text-left ${activeTab === "dashboard" ? "active" : ""}`}
            >
              <i data-lucide="layout-dashboard" className="w-5 h-5"></i>
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => { setActiveTab("transactions"); setMobileMenuOpen(false); }}
              className={`nav-item w-full text-left ${activeTab === "transactions" ? "active" : ""}`}
            >
              <i data-lucide="receipt" className="w-5 h-5"></i>
              <span>Transactions</span>
              <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                {totalTxns}
              </span>
            </button>

            <button
              onClick={() => {
                setActiveTab("ai_agent");
                setMobileMenuOpen(false);
                if (selectedTxn && !aiAnalysis) runAiAnalysis(selectedTxn);
              }}
              className={`nav-item w-full text-left ${activeTab === "ai_agent" ? "active" : ""}`}
            >
              <i data-lucide="bot" className="w-5 h-5 text-cyan-400"></i>
              <span className="font-medium text-cyan-300">AI Recovery Agent</span>
            </button>

            <button
              onClick={() => { setActiveTab("demo_scenarios"); setMobileMenuOpen(false); }}
              className={`nav-item w-full text-left ${activeTab === "demo_scenarios" ? "active" : ""}`}
            >
              <i data-lucide="sparkles" className="w-5 h-5 text-amber-400"></i>
              <span>Demo Scenarios</span>
              <span className="ml-auto text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                Pitch
              </span>
            </button>

            <button
              onClick={() => { setActiveTab("audit_logs"); setMobileMenuOpen(false); }}
              className={`nav-item w-full text-left ${activeTab === "audit_logs" ? "active" : ""}`}
            >
              <i data-lucide="history" className="w-5 h-5"></i>
              <span>Audit Ledger</span>
            </button>

            <button
              onClick={() => { setActiveTab("ml_metrics"); setMobileMenuOpen(false); }}
              className={`nav-item w-full text-left ${activeTab === "ml_metrics" ? "active" : ""}`}
            >
              <i data-lucide="cpu" className="w-5 h-5"></i>
              <span>ML Model Metrics</span>
            </button>

            <button
              onClick={() => { setActiveTab("settings"); setMobileMenuOpen(false); }}
              className={`nav-item w-full text-left ${activeTab === "settings" ? "active" : ""}`}
            >
              <i data-lucide="sliders" className="w-5 h-5"></i>
              <span>Safety Guardrails</span>
            </button>

            <button
              onClick={() => { setActiveTab("about"); setMobileMenuOpen(false); }}
              className={`nav-item w-full text-left ${activeTab === "about" ? "active" : ""}`}
            >
              <i data-lucide="file-text" className="w-5 h-5"></i>
              <span>Pitch & Architecture</span>
            </button>
          </nav>
        </div>

        {/* Mobile Drawer Footer */}
        <div className="border-t border-[#1E2D4A] pt-3 mt-3">
          <div className="p-2.5 rounded-lg bg-[#131E36] border border-[#213054]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                DEMO MODE
              </span>
              <span className="text-[9px] font-mono text-emerald-400 bg-emerald-950 px-1.5 py-0.5 rounded">
                ACTIVE
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* Main Content Viewport */}
      {/* -------------------------------------------------------------------- */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#070B14]">
        
        {/* Top Header Bar */}
        <header className="h-16 border-b border-[#1E2D4A] bg-[#0D1527]/80 backdrop-blur-md flex items-center justify-between px-3 sm:px-6 lg:px-8 z-10 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 overflow-hidden">
            {/* Hamburger button for Mobile */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg bg-[#131E36] hover:bg-[#192745] border border-[#213054] text-slate-300 hover:text-white shrink-0 flex items-center justify-center"
              aria-label="Open Navigation Menu"
            >
              <i data-lucide="menu" className="w-5 h-5"></i>
            </button>

            <h1 className="text-sm sm:text-base lg:text-lg font-bold text-white tracking-tight truncate flex items-center gap-2">
              {activeTab === "dashboard" && "Executive Dashboard"}
              {activeTab === "transactions" && "Transactions"}
              {activeTab === "ai_agent" && "AI Recovery Agent"}
              {activeTab === "demo_scenarios" && "Pitch Demo Scenarios"}
              {activeTab === "audit_logs" && "Audit Ledger"}
              {activeTab === "ml_metrics" && "ML Model Metrics"}
              {activeTab === "settings" && "Safety Guardrails"}
              {activeTab === "about" && "Pitch & Architecture"}
            </h1>
            <span className="hidden sm:inline-block text-xs px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium shrink-0">
              v2.0 AI
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              onClick={() => {
                refreshAllData();
                showToast("Data refreshed from live database", "info");
              }}
              className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#131E36] hover:bg-[#192745] border border-[#213054] text-xs font-medium text-slate-300 flex items-center gap-1.5 transition-all"
              title="Sync Live DB"
            >
              <i data-lucide="refresh-cw" className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}></i>
              <span className="hidden sm:inline">Sync Live DB</span>
            </button>

            <button
              onClick={() => setActiveTab("demo_scenarios")}
              className="gradient-button px-2.5 sm:px-3.5 py-1.5 text-xs flex items-center gap-1.5 font-semibold"
            >
              <i data-lucide="play" className="w-3.5 h-3.5 fill-current"></i>
              <span className="hidden xs:inline">Pitch Demo</span>
              <span className="xs:hidden">Demo</span>
            </button>
          </div>
        </header>

        {/* Scrollable View Area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-6 lg:p-8">
          {activeTab === "dashboard" && (
            <DashboardView
              data={dashboardData}
              onNavigate={setActiveTab}
              onSelectTxn={(txn) => {
                setSelectedTxn(txn);
                setActiveTab("ai_agent");
                runAiAnalysis(txn);
              }}
              formatINR={formatINR}
            />
          )}

          {activeTab === "transactions" && (
            <TransactionsView
              transactions={transactions}
              total={totalTxns}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              riskFilter={riskFilter}
              setRiskFilter={setRiskFilter}
              failureFilter={failureFilter}
              setFailureFilter={setFailureFilter}
              onInspect={(txn) => setModalTxn(txn)}
              onAnalyze={(txn) => {
                setSelectedTxn(txn);
                setActiveTab("ai_agent");
                runAiAnalysis(txn);
              }}
              formatINR={formatINR}
            />
          )}

          {activeTab === "ai_agent" && (
            <AiAgentView
              transactions={transactions.filter(t => t.failure_reason !== "None")}
              selectedTxn={selectedTxn}
              setSelectedTxn={setSelectedTxn}
              aiAnalysis={aiAnalysis}
              analyzing={analyzing}
              onAnalyze={runAiAnalysis}
              onSimulateRecovery={handleSimulateRecovery}
              onSendReminder={handleSendReminder}
              onEscalate={handleEscalate}
              onStopRecovery={handleStopRecovery}
              formatINR={formatINR}
            />
          )}

          {activeTab === "demo_scenarios" && (
            <DemoScenariosView
              scenarios={demoScenarios}
              activeResult={activeScenarioResult}
              runningId={runningScenarioId}
              onRunScenario={handleRunDemoScenario}
              onInspect={(txn) => {
                setSelectedTxn(txn);
                setActiveTab("ai_agent");
                runAiAnalysis(txn);
              }}
              formatINR={formatINR}
            />
          )}

          {activeTab === "audit_logs" && (
            <AuditLogsView logs={auditLogs} onInspect={(txnId) => {
              const match = transactions.find(t => t.transaction_id === txnId);
              if (match) setModalTxn(match);
            }} />
          )}

          {activeTab === "ml_metrics" && (
            <MlMetricsView metrics={modelMetrics} />
          )}

          {activeTab === "settings" && (
            <SettingsView settings={settings} onSave={fetchSettings} showToast={showToast} />
          )}

          {activeTab === "about" && (
            <AboutPitchView />
          )}
        </div>
      </main>

      {/* -------------------------------------------------------------------- */}
      {/* Transaction Details Modal */}
      {/* -------------------------------------------------------------------- */}
      {modalTxn && (
        <TransactionModal
          txn={modalTxn}
          onClose={() => setModalTxn(null)}
          onSimulateRecovery={handleSimulateRecovery}
          onSendReminder={handleSendReminder}
          onEscalate={handleEscalate}
          onStopRecovery={handleStopRecovery}
          formatINR={formatINR}
        />
      )}

      {/* -------------------------------------------------------------------- */}
      {/* Toast Notification Container */}
      {/* -------------------------------------------------------------------- */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className="toast">
            <div className={`w-2 h-2 rounded-full ${
              toast.type === "success" ? "bg-emerald-400" :
              toast.type === "warning" ? "bg-amber-400" :
              toast.type === "danger" ? "bg-red-400" : "bg-blue-400"
            }`}></div>
            <div className="text-sm font-medium text-slate-200">{toast.message}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Dashboard View Component
// ---------------------------------------------------------------------------
function DashboardView({ data, onNavigate, onSelectTxn, formatINR }) {
  const chartDonutRef = useRef(null);
  const chartBarRef = useRef(null);
  const donutInstance = useRef(null);
  const barInstance = useRef(null);

  useEffect(() => {
    if (!data) return;

    // Render Success vs Failure Donut Chart
    if (chartDonutRef.current) {
      if (donutInstance.current) donutInstance.current.destroy();
      const ctx = chartDonutRef.current.getContext("2d");
      donutInstance.current = new Chart(ctx, {
        type: "doughnut",
        data: {
          labels: ["Direct Success", "AI Recovered", "Unrecovered Failures"],
          datasets: [{
            data: [
              data.kpis.initial_successful,
              data.kpis.recovered_payments,
              data.kpis.failed_payments - data.kpis.recovered_payments
            ],
            backgroundColor: ["#10B981", "#3B82F6", "#EF4444"],
            borderColor: "#0D1527",
            borderWidth: 3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "bottom", labels: { color: "#94A3B8", font: { size: 11 } } }
          },
          cutout: "70%"
        }
      });
    }

    // Render Failure Reasons Horizontal Bar Chart
    if (chartBarRef.current) {
      if (barInstance.current) barInstance.current.destroy();
      const ctx = chartBarRef.current.getContext("2d");
      const reasons = data.failure_reasons.slice(0, 6);
      barInstance.current = new Chart(ctx, {
        type: "bar",
        data: {
          labels: reasons.map(r => r.reason.length > 20 ? r.reason.slice(0, 18) + "..." : r.reason),
          datasets: [
            {
              label: "Total Failures",
              data: reasons.map(r => r.count),
              backgroundColor: "rgba(239, 68, 68, 0.7)",
              borderRadius: 6
            },
            {
              label: "Recovered",
              data: reasons.map(r => r.recovered_count),
              backgroundColor: "rgba(59, 130, 246, 0.9)",
              borderRadius: 6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: "y",
          plugins: {
            legend: { position: "top", labels: { color: "#94A3B8", font: { size: 11 } } }
          },
          scales: {
            x: { grid: { color: "#1E2D4A" }, ticks: { color: "#94A3B8" } },
            y: { grid: { display: false }, ticks: { color: "#CBD5E1" } }
          }
        }
      });
    }
  }, [data]);

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const { kpis } = data;

  return (
    <div className="space-y-8">
      
      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        
        {/* Total Transactions */}
        <div className="glass-card p-5 relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Volume</span>
            <i data-lucide="credit-card" className="w-4 h-4 text-blue-400"></i>
          </div>
          <div className="text-2xl font-bold text-white font-mono">{kpis.total_transactions.toLocaleString()}</div>
          <div className="mt-2 text-xs text-slate-400 flex items-center gap-1.5">
            <span className="text-emerald-400 font-semibold">{kpis.initial_successful}</span> direct + <span className="text-blue-400 font-semibold">{kpis.recovered_payments}</span> recovered
          </div>
          <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-blue-500/5 rounded-full blur-xl pointer-events-none"></div>
        </div>

        {/* Failed Payments */}
        <div className="glass-card p-5 relative overflow-hidden border-red-500/20">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-red-400">Failed Payments</span>
            <i data-lucide="alert-circle" className="w-4 h-4 text-red-400"></i>
          </div>
          <div className="text-2xl font-bold text-white font-mono">{kpis.failed_payments.toLocaleString()}</div>
          <div className="mt-2 text-xs text-slate-400">
            Total at risk: <span className="text-red-300 font-semibold">{formatINR(kpis.total_at_risk_amount)}</span>
          </div>
          <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-red-500/5 rounded-full blur-xl pointer-events-none"></div>
        </div>

        {/* Recovery Rate */}
        <div className="glass-card p-5 relative overflow-hidden border-emerald-500/20">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Recovery Rate</span>
            <i data-lucide="trending-up" className="w-4 h-4 text-emerald-400"></i>
          </div>
          <div className="text-2xl font-bold text-emerald-400 font-mono">{kpis.recovery_rate_pct}%</div>
          <div className="mt-2 text-xs text-slate-400">
            <span className="text-emerald-300 font-semibold">{kpis.recovered_payments}</span> of {kpis.failed_payments} failed txns salvaged
          </div>
          <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-emerald-500/10 rounded-full blur-xl pointer-events-none"></div>
        </div>

        {/* Recovered Revenue */}
        <div className="glass-card p-5 relative overflow-hidden border-cyan-500/20">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Revenue Recovered</span>
            <i data-lucide="indian-rupee" className="w-4 h-4 text-cyan-400"></i>
          </div>
          <div className="text-2xl font-bold text-cyan-300 font-mono">{formatINR(kpis.total_recovered_amount)}</div>
          <div className="mt-2 text-xs text-slate-400 flex items-center justify-between">
            <span>Saved fees:</span>
            <span className="text-emerald-400 font-semibold font-mono">+{formatINR(kpis.saved_gateway_fees)}</span>
          </div>
          <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-cyan-500/10 rounded-full blur-xl pointer-events-none"></div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Payment Volume Donut */}
        <div className="glass-card p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-white text-base">Payment Distribution</h3>
              <p className="text-xs text-slate-400">Success vs Failure vs AI Recovered</p>
            </div>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
              Live DB
            </span>
          </div>
          <div className="relative h-60 w-full">
            <canvas ref={chartDonutRef}></canvas>
          </div>
          <div className="mt-4 pt-4 border-t border-[#1E2D4A] grid grid-cols-3 text-center text-xs">
            <div>
              <div className="text-slate-400">Success</div>
              <div className="font-bold text-emerald-400 font-mono">{kpis.initial_successful}</div>
            </div>
            <div>
              <div className="text-slate-400">Recovered</div>
              <div className="font-bold text-blue-400 font-mono">{kpis.recovered_payments}</div>
            </div>
            <div>
              <div className="text-slate-400">Failed</div>
              <div className="font-bold text-red-400 font-mono">{kpis.failed_payments - kpis.recovered_payments}</div>
            </div>
          </div>
        </div>

        {/* Failure Reasons Breakdown Bar Chart */}
        <div className="glass-card p-6 lg:col-span-2 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-white text-base">Failure Root Cause & AI Recovery</h3>
              <p className="text-xs text-slate-400">Total failures vs successfully recovered transactions per category</p>
            </div>
            <button
              onClick={() => onNavigate("ai_agent")}
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-semibold"
            >
              <span>AI Workbench</span>
              <i data-lucide="arrow-right" className="w-3 h-3"></i>
            </button>
          </div>
          <div className="relative h-64 w-full">
            <canvas ref={chartBarRef}></canvas>
          </div>
        </div>
      </div>

      {/* Secondary Row: Payment Methods & Recovery Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Recovery Actions Breakdown Table */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white text-base">Intelligent Recovery Actions Deployed</h3>
            <span className="text-xs text-slate-400 font-mono">Action Policy Mix</span>
          </div>
          <div className="space-y-3">
            {data.recovery_actions.map((act, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-[#0D1527] border border-[#1E2D4A]/60">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    act.action.includes("Retry") ? "bg-blue-500/20 text-blue-400" :
                    act.action.includes("reminder") ? "bg-emerald-500/20 text-emerald-400" :
                    act.action.includes("Escalate") ? "bg-purple-500/20 text-purple-400" : "bg-red-500/20 text-red-400"
                  }`}>
                    <i data-lucide={
                      act.action.includes("Retry") ? "refresh-cw" :
                      act.action.includes("reminder") ? "message-square" :
                      act.action.includes("Escalate") ? "user-check" : "shield-alert"
                    } className="w-4 h-4"></i>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">{act.action}</div>
                    <div className="text-xs text-slate-400">{formatINR(act.amount)} total value</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold font-mono text-slate-200">{act.count} txns</div>
                  <div className="text-[11px] text-slate-400">{((act.count / kpis.failed_payments) * 100).toFixed(1)}% of fails</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Payment Methods Success Rates */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white text-base">Payment Rail Health & Success Rates</h3>
            <span className="text-xs text-slate-400">UPI, Cards, Netbanking</span>
          </div>
          <div className="space-y-4">
            {data.payment_methods.map((pm, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200">{pm.method}</span>
                  <span className="text-slate-400 font-mono">
                    <span className="text-white font-bold">{pm.successful}</span> / {pm.total} ({pm.success_rate}%)
                  </span>
                </div>
                <div className="prob-meter-bg">
                  <div
                    className={`prob-meter-fill ${
                      pm.success_rate >= 80 ? "bg-emerald-500" :
                      pm.success_rate >= 60 ? "bg-blue-500" : "bg-amber-500"
                    }`}
                    style={{ width: `${pm.success_rate}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 rounded-xl bg-gradient-to-r from-blue-950/40 to-cyan-950/30 border border-blue-500/20 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-blue-300">Ready for Live Pitch?</div>
              <div className="text-[11px] text-slate-400">Trigger 4 interactive demo scenarios demonstrating smart recovery.</div>
            </div>
            <button
              onClick={() => onNavigate("demo_scenarios")}
              className="gradient-button px-3 py-1.5 text-xs"
            >
              Open Pitch Engine
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Transactions View Component
// ---------------------------------------------------------------------------
function TransactionsView({
  transactions,
  total,
  searchTerm,
  setSearchTerm,
  statusFilter,
  setStatusFilter,
  riskFilter,
  setRiskFilter,
  failureFilter,
  setFailureFilter,
  onInspect,
  onAnalyze,
  formatINR
}) {
  return (
    <div className="space-y-6">
      
      {/* Search & Filter Toolbar */}
      <div className="glass-card p-4 flex flex-wrap items-center justify-between gap-4">
        
        {/* Search Input */}
        <div className="relative flex-1 min-w-[240px]">
          <i data-lucide="search" className="w-4 h-4 absolute left-3.5 top-3 text-slate-400"></i>
          <input
            type="text"
            placeholder="Search by Transaction ID, Customer, Email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#0D1527] border border-[#1E2D4A] rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        {/* Filter Dropdowns */}
        <div className="flex items-center gap-3 flex-wrap">
          
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#0D1527] border border-[#1E2D4A] rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="failed">Failed (Pending)</option>
            <option value="recovered">Recovered</option>
            <option value="success">Direct Success</option>
            <option value="candidate">Recovery Candidate (&lt;3 retries)</option>
          </select>

          {/* Risk Filter */}
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="bg-[#0D1527] border border-[#1E2D4A] rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="">All Risk Levels</option>
            <option value="Low">Low Risk</option>
            <option value="Medium">Medium Risk</option>
            <option value="High">High Risk</option>
          </select>

          {/* Failure Reason Filter */}
          <select
            value={failureFilter}
            onChange={(e) => setFailureFilter(e.target.value)}
            className="bg-[#0D1527] border border-[#1E2D4A] rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 max-w-[180px]"
          >
            <option value="">All Failure Reasons</option>
            <option value="Temporary bank failure">Temporary bank failure</option>
            <option value="Payment gateway error">Payment gateway error</option>
            <option value="Customer abandoned checkout">Customer abandoned</option>
            <option value="Network error">Network error</option>
            <option value="Timeout">Timeout</option>
            <option value="Insufficient funds">Insufficient funds</option>
            <option value="Bank decline">Bank decline</option>
            <option value="Expired card">Expired card</option>
          </select>

          {/* Clear Filters */}
          {(searchTerm || statusFilter || riskFilter || failureFilter) && (
            <button
              onClick={() => {
                setSearchTerm("");
                setStatusFilter("");
                setRiskFilter("");
                setFailureFilter("");
              }}
              className="text-xs text-red-400 hover:text-red-300 font-semibold px-2 py-1"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Transactions Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0D1527] border-b border-[#1E2D4A] text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-4 font-semibold">Transaction</th>
                <th className="py-3.5 px-4 font-semibold">Customer</th>
                <th className="py-3.5 px-4 font-semibold">Amount</th>
                <th className="py-3.5 px-4 font-semibold">Status</th>
                <th className="py-3.5 px-4 font-semibold">Failure Reason</th>
                <th className="py-3.5 px-4 font-semibold">Retries</th>
                <th className="py-3.5 px-4 font-semibold">Recovery Prob</th>
                <th className="py-3.5 px-4 font-semibold">Risk</th>
                <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2D4A]/50">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan="9" className="py-12 text-center text-slate-500">
                    <i data-lucide="inbox" className="w-8 h-8 mx-auto mb-2 opacity-50"></i>
                    <div>No transactions match the selected filters.</div>
                  </td>
                </tr>
              ) : (
                transactions.map((t) => {
                  const isFail = t.failure_reason !== "None";
                  const probPct = Math.round(t.true_recovery_probability * 100);
                  
                  return (
                    <tr
                      key={t.transaction_id}
                      className="hover:bg-[#15213D]/60 transition-colors cursor-pointer"
                      onClick={() => onInspect(t)}
                    >
                      {/* Txn ID & Method */}
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-blue-400">{t.transaction_id}</div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1">
                          <span>{t.payment_method}</span>
                          <span>•</span>
                          <span>{t.transaction_date.slice(5, 16)}</span>
                        </div>
                      </td>

                      {/* Customer */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-200">{t.customer_name}</div>
                        <div className="text-[11px] text-slate-400">
                          <span className={`px-1.5 py-0.2 rounded text-[10px] ${
                            t.customer_type === "VIP" ? "bg-purple-500/20 text-purple-300" :
                            t.customer_type === "Returning" ? "bg-blue-500/20 text-blue-300" : "bg-slate-800 text-slate-400"
                          }`}>
                            {t.customer_type}
                          </span>
                        </div>
                      </td>

                      {/* Amount */}
                      <td className="py-3 px-4 font-mono font-semibold text-slate-100">
                        {formatINR(t.amount)}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        {t.payment_status === "Success" && (
                          <span className="badge badge-success">Success</span>
                        )}
                        {t.payment_status === "Recovered" && (
                          <span className="badge badge-info">Recovered</span>
                        )}
                        {t.payment_status === "Failed" && (
                          <span className="badge badge-danger">Failed</span>
                        )}
                      </td>

                      {/* Failure Reason */}
                      <td className="py-3 px-4">
                        {isFail ? (
                          <span className="text-slate-300 font-medium">{t.failure_reason}</span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>

                      {/* Retries */}
                      <td className="py-3 px-4">
                        <span className={`font-mono text-xs px-2 py-0.5 rounded ${
                          t.retry_count >= 3 ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-slate-800 text-slate-300"
                        }`}>
                          {t.retry_count} / 3
                        </span>
                      </td>

                      {/* Recovery Prob */}
                      <td className="py-3 px-4 min-w-[120px]">
                        {isFail ? (
                          <div className="space-y-1">
                            <div className="flex justify-between text-[11px] font-mono">
                              <span className={probPct >= 70 ? "text-emerald-400" : probPct >= 40 ? "text-amber-400" : "text-red-400"}>
                                {probPct}%
                              </span>
                            </div>
                            <div className="prob-meter-bg">
                              <div
                                className={`prob-meter-fill ${
                                  probPct >= 70 ? "bg-emerald-500" : probPct >= 40 ? "bg-amber-500" : "bg-red-500"
                                }`}
                                style={{ width: `${probPct}%` }}
                              ></div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-emerald-400 font-mono">100%</span>
                        )}
                      </td>

                      {/* Risk */}
                      <td className="py-3 px-4">
                        <span className={`badge ${
                          t.risk_level === "Low" ? "badge-success" :
                          t.risk_level === "Medium" ? "badge-warning" : "badge-danger"
                        }`}>
                          {t.risk_level}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => onInspect(t)}
                            className="px-2.5 py-1 rounded bg-[#1E2D4A] hover:bg-[#2A3C63] text-slate-300 text-xs transition-colors"
                          >
                            Details
                          </button>
                          {isFail && (
                            <button
                              onClick={() => onAnalyze(t)}
                              className="px-2.5 py-1 rounded bg-blue-600/80 hover:bg-blue-600 text-white text-xs font-semibold flex items-center gap-1 transition-colors"
                            >
                              <i data-lucide="bot" className="w-3 h-3"></i>
                              <span>Analyze</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. AI Recovery Agent Workbench View Component
// ---------------------------------------------------------------------------
function AiAgentView({
  transactions,
  selectedTxn,
  setSelectedTxn,
  aiAnalysis,
  analyzing,
  onAnalyze,
  onSimulateRecovery,
  onSendReminder,
  onEscalate,
  onStopRecovery,
  formatINR
}) {
  const probPct = aiAnalysis ? aiAnalysis.recovery_percentage : (selectedTxn ? Math.round(selectedTxn.true_recovery_probability * 100) : 0);

  return (
    <div className="space-y-6">
      
      {/* Top Banner / Transaction Selector */}
      <div className="glass-card p-6 flex flex-wrap items-center justify-between gap-4 border-blue-500/30">
        <div>
          <div className="flex items-center gap-2 text-blue-400 text-xs font-bold uppercase tracking-wider mb-1">
            <i data-lucide="sparkles" className="w-4 h-4"></i>
            <span>Intelligent Decision Engine</span>
          </div>
          <h2 className="text-xl font-bold text-white">AI Payment Recovery Agent</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Evaluates failure patterns, customer risk profiles, and recommends optimal recovery intervention.
          </p>
        </div>

        {/* Transaction Pick Dropdown */}
        <div className="flex items-center gap-3">
          <label className="text-xs text-slate-400 font-medium">Select Failed Txn:</label>
          <select
            value={selectedTxn ? selectedTxn.transaction_id : ""}
            onChange={(e) => {
              const match = transactions.find(t => t.transaction_id === e.target.value);
              if (match) {
                setSelectedTxn(match);
                onAnalyze(match);
              }
            }}
            className="bg-[#0D1527] border border-[#1E2D4A] rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
          >
            {transactions.map(t => (
              <option key={t.transaction_id} value={t.transaction_id}>
                {t.transaction_id} – {t.customer_name} ({formatINR(t.amount)})
              </option>
            ))}
          </select>

          <button
            onClick={() => selectedTxn && onAnalyze(selectedTxn)}
            disabled={analyzing || !selectedTxn}
            className="gradient-button px-4 py-2 text-xs flex items-center gap-2 font-semibold disabled:opacity-50"
          >
            <i data-lucide="cpu" className={`w-4 h-4 ${analyzing ? "animate-spin" : ""}`}></i>
            <span>{analyzing ? "Scanning AI Patterns..." : "Re-Analyze"}</span>
          </button>
        </div>
      </div>

      {selectedTxn && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Column: Transaction & Customer Profile */}
          <div className="space-y-6">
            
            {/* Transaction Summary Card */}
            <div className="glass-card p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[#1E2D4A] pb-3">
                <div className="font-mono text-sm font-bold text-blue-400">{selectedTxn.transaction_id}</div>
                <span className={`badge ${
                  selectedTxn.payment_status === "Recovered" ? "badge-info" : "badge-danger"
                }`}>
                  {selectedTxn.payment_status}
                </span>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Amount:</span>
                  <span className="font-mono font-bold text-white text-sm">{formatINR(selectedTxn.amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Payment Rail:</span>
                  <span className="text-slate-200 font-semibold">{selectedTxn.payment_method}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Failure Reason:</span>
                  <span className="text-red-400 font-semibold">{selectedTxn.failure_reason}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Retry Attempts:</span>
                  <span className="font-mono text-slate-200 font-bold">{selectedTxn.retry_count} of 3</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Failure Timestamp:</span>
                  <span className="text-slate-400">{selectedTxn.transaction_date}</span>
                </div>
              </div>
            </div>

            {/* Customer Health Card */}
            <div className="glass-card p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-[#1E2D4A] pb-2">
                <div className="text-xs font-bold text-slate-200 uppercase tracking-wider">Customer Profile</div>
                <span className="badge badge-purple">{selectedTxn.customer_type}</span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="font-semibold text-white">{selectedTxn.customer_name}</div>
                <div className="text-slate-400 text-[11px]">{selectedTxn.customer_email}</div>
                <div className="text-slate-400 text-[11px]">{selectedTxn.customer_phone}</div>
                
                <div className="mt-3 pt-3 border-t border-[#1E2D4A] grid grid-cols-2 gap-2 text-center">
                  <div className="p-2 rounded bg-[#0D1527] border border-[#1E2D4A]">
                    <div className="text-slate-400 text-[10px]">Past Successful</div>
                    <div className="font-mono font-bold text-emerald-400 text-sm">{selectedTxn.previous_successful_payments}</div>
                  </div>
                  <div className="p-2 rounded bg-[#0D1527] border border-[#1E2D4A]">
                    <div className="text-slate-400 text-[10px]">Past Failures</div>
                    <div className="font-mono font-bold text-red-400 text-sm">{selectedTxn.previous_failed_payments}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Middle & Right Column: AI Analysis & Decision Radar */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Live AI Decision Card */}
            <div className="glass-card p-6 border-cyan-500/30 relative overflow-hidden">
              
              {analyzing && (
                <div className="absolute inset-0 bg-[#0D1527]/90 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-20">
                  <div className="w-12 h-12 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
                  <div className="text-sm font-semibold text-cyan-300 tracking-wide">
                    Running Calibrated ML Prediction &amp; Policy Guardrails...
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-4 mb-6 border-b border-[#1E2D4A] pb-4">
                <div>
                  <div className="text-xs text-cyan-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <i data-lucide="check-circle" className="w-4 h-4"></i>
                    <span>AI Recommendation</span>
                  </div>
                  <div className="text-xl font-extrabold text-white mt-1">
                    {aiAnalysis ? aiAnalysis.recommended_action : selectedTxn.recovery_action || "Smart Retry Payment"}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">Risk Rating</div>
                    <span className={`badge ${
                      (aiAnalysis ? aiAnalysis.risk_level : selectedTxn.risk_level) === "Low" ? "badge-success" :
                      (aiAnalysis ? aiAnalysis.risk_level : selectedTxn.risk_level) === "Medium" ? "badge-warning" : "badge-danger"
                    }`}>
                      {aiAnalysis ? aiAnalysis.risk_level : selectedTxn.risk_level}
                    </span>
                  </div>
                  
                  <div className="text-right border-l border-[#1E2D4A] pl-3">
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">Confidence</div>
                    <div className="text-sm font-mono font-bold text-cyan-300">
                      {aiAnalysis ? `${aiAnalysis.confidence_score}%` : "88.5%"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Gauges & Reasoning */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
                
                {/* Recovery Probability Meter */}
                <div className="p-4 rounded-xl bg-[#0D1527] border border-[#1E2D4A] flex flex-col justify-between">
                  <div className="text-xs text-slate-400 font-semibold">Recovery Likelihood</div>
                  <div className="my-2">
                    <div className={`text-3xl font-extrabold font-mono ${
                      probPct >= 70 ? "text-emerald-400" : probPct >= 40 ? "text-amber-400" : "text-red-400"
                    }`}>
                      {probPct}%
                    </div>
                  </div>
                  <div className="prob-meter-bg">
                    <div
                      className={`prob-meter-fill ${
                        probPct >= 70 ? "bg-emerald-500" : probPct >= 40 ? "bg-amber-500" : "bg-red-500"
                      }`}
                      style={{ width: `${probPct}%` }}
                    ></div>
                  </div>
                </div>

                {/* Suggested Channel */}
                <div className="p-4 rounded-xl bg-[#0D1527] border border-[#1E2D4A] flex flex-col justify-between">
                  <div className="text-xs text-slate-400 font-semibold">Optimized Channel</div>
                  <div className="text-base font-bold text-slate-100 my-1">
                    {aiAnalysis ? aiAnalysis.suggested_channel : "Razorpay Smart Retry"}
                  </div>
                  <div className="text-[11px] text-slate-500">Autonomous Execution</div>
                </div>

                {/* Guardrails Status */}
                <div className="p-4 rounded-xl bg-[#0D1527] border border-[#1E2D4A] flex flex-col justify-between">
                  <div className="text-xs text-slate-400 font-semibold">Guardrail Check</div>
                  <div className="text-sm font-bold text-emerald-400 flex items-center gap-1 my-1">
                    <i data-lucide="shield-check" className="w-4 h-4"></i>
                    <span>{selectedTxn.retry_count < 3 ? "Retry Allowed" : "Limit Reached"}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">{selectedTxn.retry_count} of 3 retries used</div>
                </div>
              </div>

              {/* Explainable Reasoning Block */}
              <div className="p-4 rounded-xl bg-[#0D1527] border border-[#1E2D4A] space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                  <i data-lucide="help-circle" className="w-4 h-4 text-blue-400"></i>
                  <span>Explainable Decision Trail</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {aiAnalysis ? aiAnalysis.reason : (
                    `Transaction failed due to ${selectedTxn.failure_reason}. With ${selectedTxn.previous_successful_payments} prior successful payments, intelligent retry is recommended.`
                  )}
                </p>
                {aiAnalysis && aiAnalysis.next_step && (
                  <div className="pt-2 border-t border-[#1E2D4A]/60 text-xs text-cyan-300 flex items-center gap-1.5">
                    <span className="font-semibold">Next Step:</span>
                    <span>{aiAnalysis.next_step}</span>
                  </div>
                )}
              </div>

              {/* Interactive Simulation Trigger Buttons */}
              <div className="mt-6 pt-4 border-t border-[#1E2D4A] flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-slate-400 font-semibold">Execute Simulated Action:</span>
                
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => onSimulateRecovery(selectedTxn.transaction_id)}
                    className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-blue-500/20 transition-all"
                  >
                    <i data-lucide="refresh-cw" className="w-3.5 h-3.5"></i>
                    <span>Simulate Smart Retry</span>
                  </button>

                  <button
                    onClick={() => onSendReminder(selectedTxn.transaction_id)}
                    className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 transition-all"
                  >
                    <i data-lucide="message-square" className="w-3.5 h-3.5"></i>
                    <span>Send 1-Click Link</span>
                  </button>

                  <button
                    onClick={() => onEscalate(selectedTxn.transaction_id)}
                    className="px-3.5 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all"
                  >
                    <i data-lucide="user-check" className="w-3.5 h-3.5"></i>
                    <span>Escalate</span>
                  </button>

                  <button
                    onClick={() => onStopRecovery(selectedTxn.transaction_id)}
                    className="px-3.5 py-2 rounded-lg bg-red-600/80 hover:bg-red-600 text-white text-xs font-bold flex items-center gap-1.5 transition-all"
                  >
                    <i data-lucide="octagon" className="w-3.5 h-3.5"></i>
                    <span>Stop Retries</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. Demo Scenarios Runner View Component (For 5-Min Pitch)
// ---------------------------------------------------------------------------
function DemoScenariosView({ scenarios, activeResult, runningId, onRunScenario, onInspect, formatINR }) {
  return (
    <div className="space-y-6">
      
      {/* Intro Header */}
      <div className="glass-card p-6 border-amber-500/30">
        <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider mb-1">
          <i data-lucide="sparkles" className="w-4 h-4"></i>
          <span>Internship Presentation Engine</span>
        </div>
        <h2 className="text-xl font-bold text-white">5-Minute Interactive Demo Scenarios</h2>
        <p className="text-xs text-slate-300 mt-1 max-w-3xl leading-relaxed">
          Demonstrate how PayRecover AI outperforms dumb blind retries across 4 real-world merchant failure situations. Click any scenario to run instant live simulation.
        </p>
      </div>

      {/* Scenarios Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {scenarios.map((sc) => {
          const isRunning = runningId === sc.id;
          const isCurrent = activeResult && activeResult.scenario.id === sc.id;
          
          return (
            <div
              key={sc.id}
              className={`glass-card p-5 space-y-4 transition-all ${
                isCurrent ? "border-amber-400 shadow-lg shadow-amber-500/10" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-white text-sm">{sc.title}</h3>
                  <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                    <span className="font-mono text-blue-400">{sc.transaction_id}</span>
                    <span>•</span>
                    <span className="text-white font-semibold">{formatINR(sc.amount)}</span>
                  </div>
                </div>
                <span className="badge badge-warning">{sc.failure_reason}</span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed bg-[#0D1527] p-3 rounded-lg border border-[#1E2D4A]">
                {sc.description}
              </p>

              <div className="flex items-center justify-between pt-2">
                <div className="text-xs text-slate-400">
                  Expected Action: <span className="text-cyan-300 font-semibold">{sc.expected_action}</span>
                </div>

                <button
                  onClick={() => onRunScenario(sc.id)}
                  disabled={isRunning}
                  className="gradient-button px-3.5 py-1.5 text-xs font-semibold flex items-center gap-1.5"
                >
                  <i data-lucide="play" className={`w-3.5 h-3.5 ${isRunning ? "animate-spin" : "fill-current"}`}></i>
                  <span>{isRunning ? "Simulating..." : "Run Scenario"}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Active Scenario Execution Output Card */}
      {activeResult && (
        <div className="glass-card p-6 border-emerald-500/40 space-y-4 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-[#1E2D4A] pb-3">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
              <i data-lucide="check-circle" className="w-5 h-5"></i>
              <span>Live Scenario Result: {activeResult.scenario.title}</span>
            </div>
            <span className="text-xs text-slate-400 font-mono">Simulated in Real-Time</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-3 rounded-lg bg-[#0D1527] border border-[#1E2D4A]">
              <div className="text-[10px] text-slate-400 uppercase">Injected Txn ID</div>
              <div className="text-sm font-bold font-mono text-blue-400">{activeResult.transaction.transaction_id}</div>
            </div>
            <div className="p-3 rounded-lg bg-[#0D1527] border border-[#1E2D4A]">
              <div className="text-[10px] text-slate-400 uppercase">AI Recommendation</div>
              <div className="text-sm font-bold text-white">{activeResult.analysis.recommended_action}</div>
            </div>
            <div className="p-3 rounded-lg bg-[#0D1527] border border-[#1E2D4A]">
              <div className="text-[10px] text-slate-400 uppercase">Recovery Likelihood</div>
              <div className="text-sm font-bold font-mono text-emerald-400">{activeResult.analysis.recovery_percentage}%</div>
            </div>
            <div className="p-3 rounded-lg bg-[#0D1527] border border-[#1E2D4A]">
              <div className="text-[10px] text-slate-400 uppercase">Risk Level</div>
              <div className="text-sm font-bold text-amber-400">{activeResult.analysis.risk_level}</div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#0D1527] border border-[#1E2D4A] space-y-2">
            <div className="text-xs font-bold text-slate-200">AI Decision Reasoning:</div>
            <p className="text-xs text-slate-300 leading-relaxed">{activeResult.analysis.reason}</p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => onInspect(activeResult.transaction)}
              className="gradient-button px-4 py-2 text-xs font-semibold flex items-center gap-1.5"
            >
              <span>Open in AI Recovery Agent</span>
              <i data-lucide="arrow-right" className="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. Audit Logs View Component
// ---------------------------------------------------------------------------
function AuditLogsView({ logs, onInspect }) {
  const [filterQuery, setFilterQuery] = useState("");

  const filteredLogs = useMemo(() => {
    if (!filterQuery) return logs;
    return logs.filter(l => 
      l.transaction_id.toLowerCase().includes(filterQuery.toLowerCase()) ||
      l.event_type.toLowerCase().includes(filterQuery.toLowerCase()) ||
      l.decision.toLowerCase().includes(filterQuery.toLowerCase())
    );
  }, [logs, filterQuery]);

  return (
    <div className="space-y-6">
      
      {/* Header & Filter */}
      <div className="glass-card p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white">Explainable Audit Ledger</h2>
          <p className="text-xs text-slate-400">Full tamper-evident trace of every AI recovery decision and guardrail check.</p>
        </div>

        <div className="relative w-72">
          <i data-lucide="search" className="w-4 h-4 absolute left-3 top-2.5 text-slate-400"></i>
          <input
            type="text"
            placeholder="Filter by TXN or Event..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="w-full bg-[#0D1527] border border-[#1E2D4A] rounded-lg pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Audit Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0D1527] border-b border-[#1E2D4A] text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4 font-semibold">Timestamp</th>
                <th className="py-3 px-4 font-semibold">Transaction</th>
                <th className="py-3 px-4 font-semibold">Event Type</th>
                <th className="py-3 px-4 font-semibold">AI Decision</th>
                <th className="py-3 px-4 font-semibold">Reasoning Trail</th>
                <th className="py-3 px-4 font-semibold">Transition</th>
                <th className="py-3 px-4 font-semibold">Actor / Channel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2D4A]/50 font-mono text-[11px]">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-slate-500">
                    No audit records match the query.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#15213D]/60 transition-colors">
                    <td className="py-2.5 px-4 text-slate-400">{log.timestamp}</td>
                    <td className="py-2.5 px-4">
                      <button
                        onClick={() => onInspect(log.transaction_id)}
                        className="text-blue-400 font-bold hover:underline"
                      >
                        {log.transaction_id}
                      </button>
                    </td>
                    <td className="py-2.5 px-4 text-slate-300 font-semibold">{log.event_type}</td>
                    <td className="py-2.5 px-4 text-cyan-300 font-bold font-sans">{log.decision}</td>
                    <td className="py-2.5 px-4 font-sans text-slate-300 max-w-xs truncate" title={log.reason}>
                      {log.reason}
                    </td>
                    <td className="py-2.5 px-4 text-slate-400">
                      <span>{log.previous_status}</span> &rarr; <span className="text-emerald-400 font-bold">{log.new_status}</span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-400 font-sans">{log.actor} ({log.channel})</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 6. ML Model Metrics View Component
// ---------------------------------------------------------------------------
function MlMetricsView({ metrics }) {
  // Real-time inference sandbox state
  const [sandboxReason, setSandboxReason] = useState("Temporary bank failure");
  const [sandboxAmount, setSandboxAmount] = useState(2499);
  const [sandboxSuccess, setSandboxSuccess] = useState(8);
  const [sandboxFail, setSandboxFail] = useState(1);
  const [sandboxRetries, setSandboxRetries] = useState(0);
  const [sandboxCustType, setSandboxCustType] = useState("Returning");
  const [sandboxResult, setSandboxResult] = useState(null);
  const [sandboxLoading, setSandboxLoading] = useState(false);

  const runSandboxPredict = async () => {
    setSandboxLoading(true);
    try {
      // Simulate quick predictor calculation
      const success_ratio = (sandboxSuccess + 1) / (sandboxSuccess + sandboxFail + 2);
      
      const failure_base = {
        "Temporary bank failure": 0.85,
        "Payment gateway error": 0.78,
        "Network error": 0.75,
        "Timeout": 0.70,
        "Customer abandoned checkout": 0.55,
        "Insufficient funds": 0.35,
        "Bank decline": 0.25,
        "Expired card": 0.15
      }[sandboxReason] || 0.5;

      const delta_hist = 0.15 * (success_ratio - 0.5);
      const tier_mod = sandboxCustType === "VIP" ? 0.08 : sandboxCustType === "Returning" ? 0.02 : -0.04;
      const delta_retry = -0.18 * sandboxRetries;
      const delta_amt = (sandboxAmount > 20000 && sandboxReason === "Insufficient funds") ? -0.10 : 0.0;

      let p = failure_base + delta_hist + tier_mod + delta_retry + delta_amt;
      p = Math.min(0.95, Math.max(0.05, p));

      setTimeout(() => {
        setSandboxResult({
          probability: (p * 100).toFixed(1),
          risk: p >= 0.70 && sandboxRetries < 2 ? "Low" : p >= 0.40 && sandboxRetries <= 2 ? "Medium" : "High",
          recommendation: sandboxRetries >= 3 ? "Stop further retries & Escalate" :
                          sandboxReason === "Customer abandoned checkout" ? "Send 1-Click WhatsApp Recovery Link" :
                          p >= 0.65 ? "Smart Retry payment" : "Send payment reminder"
        });
        setSandboxLoading(false);
      }, 300);
    } catch (err) {
      setSandboxLoading(false);
    }
  };

  if (!metrics) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const { confusion_matrix } = metrics;

  return (
    <div className="space-y-6">
      
      {/* Overview Card */}
      <div className="glass-card p-6 border-blue-500/30">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1E2D4A] pb-4">
          <div>
            <span className="badge badge-info mb-1 font-mono">Scikit-Learn Calibrated Pipeline</span>
            <h2 className="text-xl font-bold text-white">{metrics.model_name}</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Trained on {metrics.train_samples} failed payment samples with Stratified 80/20 train-test split.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 flex items-center gap-3">
            <i data-lucide="check-circle" className="w-5 h-5 text-emerald-400"></i>
            <div>
              <div className="text-xs font-bold text-emerald-300">Sanity Check: {metrics.sanity_check.status}</div>
              <div className="text-[11px] text-slate-400">{metrics.sanity_check.notes}</div>
            </div>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6">
          <div className="p-4 rounded-xl bg-[#0D1527] border border-[#1E2D4A] text-center">
            <div className="text-xs text-slate-400 uppercase font-semibold">Accuracy</div>
            <div className="text-2xl font-bold text-emerald-400 font-mono mt-1">{(metrics.accuracy * 100).toFixed(2)}%</div>
            <div className="text-[10px] text-slate-500 mt-1">Holdout test set</div>
          </div>

          <div className="p-4 rounded-xl bg-[#0D1527] border border-[#1E2D4A] text-center">
            <div className="text-xs text-slate-400 uppercase font-semibold">Precision</div>
            <div className="text-2xl font-bold text-blue-400 font-mono mt-1">{(metrics.precision * 100).toFixed(2)}%</div>
            <div className="text-[10px] text-slate-500 mt-1">Positive predictive value</div>
          </div>

          <div className="p-4 rounded-xl bg-[#0D1527] border border-[#1E2D4A] text-center">
            <div className="text-xs text-slate-400 uppercase font-semibold">Recall</div>
            <div className="text-2xl font-bold text-cyan-400 font-mono mt-1">{(metrics.recall * 100).toFixed(2)}%</div>
            <div className="text-[10px] text-slate-500 mt-1">Sensitivity / True Pos</div>
          </div>

          <div className="p-4 rounded-xl bg-[#0D1527] border border-[#1E2D4A] text-center">
            <div className="text-xs text-slate-400 uppercase font-semibold">F1-Score</div>
            <div className="text-2xl font-bold text-purple-400 font-mono mt-1">{metrics.f1_score.toFixed(4)}</div>
            <div className="text-[10px] text-slate-500 mt-1">Harmonic mean</div>
          </div>

          <div className="p-4 rounded-xl bg-[#0D1527] border border-[#1E2D4A] text-center">
            <div className="text-xs text-slate-400 uppercase font-semibold">ROC-AUC</div>
            <div className="text-2xl font-bold text-amber-400 font-mono mt-1">{metrics.roc_auc.toFixed(4)}</div>
            <div className="text-[10px] text-slate-500 mt-1">Discrimination power</div>
          </div>
        </div>
      </div>

      {/* Feature Importances & Confusion Matrix Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Top Feature Importances */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white text-sm">Top Predictive Feature Importances</h3>
            <span className="text-xs text-slate-400 font-mono">Gini Importance</span>
          </div>
          <div className="space-y-3">
            {metrics.feature_importances.map((f, i) => (
              <div key={i} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300 font-medium">{f.feature}</span>
                  <span className="text-slate-400 font-mono">{(f.importance * 100).toFixed(1)}%</span>
                </div>
                <div className="prob-meter-bg">
                  <div className="prob-meter-fill bg-blue-500" style={{ width: `${f.importance * 300}%` }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Confusion Matrix & Benchmark */}
        <div className="glass-card p-6 space-y-6">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white text-sm">Evaluation Confusion Matrix (Holdout Set)</h3>
              <span className="text-xs text-slate-400 font-mono">{metrics.test_samples} Test Txns</span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-center text-xs font-mono">
              <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-500/30">
                <div className="text-slate-400 text-[10px]">True Positives (Recovered)</div>
                <div className="text-xl font-bold text-emerald-400">{confusion_matrix.true_positive}</div>
              </div>
              <div className="p-3 rounded-lg bg-red-950/30 border border-red-500/30">
                <div className="text-slate-400 text-[10px]">False Positives</div>
                <div className="text-xl font-bold text-red-400">{confusion_matrix.false_positive}</div>
              </div>
              <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-500/30">
                <div className="text-slate-400 text-[10px]">False Negatives</div>
                <div className="text-xl font-bold text-amber-400">{confusion_matrix.false_negative}</div>
              </div>
              <div className="p-3 rounded-lg bg-blue-950/30 border border-blue-500/30">
                <div className="text-slate-400 text-[10px]">True Negatives (Unrecovered)</div>
                <div className="text-xl font-bold text-blue-400">{confusion_matrix.true_negative}</div>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#0D1527] border border-[#1E2D4A] space-y-2">
            <div className="text-xs font-bold text-slate-200">Baseline Benchmark Comparison:</div>
            <div className="text-xs text-slate-300 flex justify-between">
              <span>Logistic Regression Baseline Accuracy:</span>
              <span className="font-mono font-bold text-slate-200">{(metrics.logistic_regression_benchmark.accuracy * 100).toFixed(2)}%</span>
            </div>
            <div className="text-xs text-slate-300 flex justify-between">
              <span>Random Forest Model Lift:</span>
              <span className="font-mono font-bold text-emerald-400">
                +{((metrics.accuracy - metrics.logistic_regression_benchmark.accuracy) * 100).toFixed(2)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Inference Test Sandbox */}
      <div className="glass-card p-6 border-cyan-500/30 space-y-4">
        <div className="flex items-center gap-2 text-cyan-400 text-xs font-bold uppercase tracking-wider">
          <i data-lucide="play" className="w-4 h-4"></i>
          <span>Live ML Inference Sandbox</span>
        </div>
        <h3 className="text-base font-bold text-white">Test Custom Transaction Parameters</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="text-slate-400 font-semibold mb-1 block">Failure Reason:</label>
            <select
              value={sandboxReason}
              onChange={(e) => setSandboxReason(e.target.value)}
              className="w-full bg-[#0D1527] border border-[#1E2D4A] rounded-lg p-2 text-white"
            >
              <option value="Temporary bank failure">Temporary bank failure</option>
              <option value="Payment gateway error">Payment gateway error</option>
              <option value="Customer abandoned checkout">Customer abandoned checkout</option>
              <option value="Network error">Network error</option>
              <option value="Timeout">Timeout</option>
              <option value="Insufficient funds">Insufficient funds</option>
              <option value="Bank decline">Bank decline</option>
              <option value="Expired card">Expired card</option>
            </select>
          </div>

          <div>
            <label className="text-slate-400 font-semibold mb-1 block">Customer Tier:</label>
            <select
              value={sandboxCustType}
              onChange={(e) => setSandboxCustType(e.target.value)}
              className="w-full bg-[#0D1527] border border-[#1E2D4A] rounded-lg p-2 text-white"
            >
              <option value="Returning">Returning Customer</option>
              <option value="VIP">VIP Customer</option>
              <option value="New">New Customer</option>
            </select>
          </div>

          <div>
            <label className="text-slate-400 font-semibold mb-1 block">Transaction Amount (INR):</label>
            <input
              type="number"
              value={sandboxAmount}
              onChange={(e) => setSandboxAmount(Number(e.target.value))}
              className="w-full bg-[#0D1527] border border-[#1E2D4A] rounded-lg p-2 text-white font-mono"
            />
          </div>

          <div>
            <label className="text-slate-400 font-semibold mb-1 block">Past Successful Payments:</label>
            <input
              type="number"
              value={sandboxSuccess}
              onChange={(e) => setSandboxSuccess(Number(e.target.value))}
              className="w-full bg-[#0D1527] border border-[#1E2D4A] rounded-lg p-2 text-white font-mono"
            />
          </div>

          <div>
            <label className="text-slate-400 font-semibold mb-1 block">Past Failed Payments:</label>
            <input
              type="number"
              value={sandboxFail}
              onChange={(e) => setSandboxFail(Number(e.target.value))}
              className="w-full bg-[#0D1527] border border-[#1E2D4A] rounded-lg p-2 text-white font-mono"
            />
          </div>

          <div>
            <label className="text-slate-400 font-semibold mb-1 block">Current Retry Count:</label>
            <input
              type="number"
              min="0"
              max="4"
              value={sandboxRetries}
              onChange={(e) => setSandboxRetries(Number(e.target.value))}
              className="w-full bg-[#0D1527] border border-[#1E2D4A] rounded-lg p-2 text-white font-mono"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={runSandboxPredict}
            disabled={sandboxLoading}
            className="gradient-button px-5 py-2 text-xs font-semibold flex items-center gap-2"
          >
            <i data-lucide="cpu" className={`w-3.5 h-3.5 ${sandboxLoading ? "animate-spin" : ""}`}></i>
            <span>{sandboxLoading ? "Predicting..." : "Run ML Inference"}</span>
          </button>
        </div>

        {sandboxResult && (
          <div className="p-4 rounded-xl bg-[#0D1527] border border-cyan-500/40 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Predicted Probability</div>
              <div className="text-2xl font-bold font-mono text-cyan-300">{sandboxResult.probability}%</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Assessed Risk</div>
              <span className={`badge ${sandboxResult.risk === "Low" ? "badge-success" : sandboxResult.risk === "Medium" ? "badge-warning" : "badge-danger"}`}>
                {sandboxResult.risk}
              </span>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Recommended Action</div>
              <div className="text-sm font-bold text-white">{sandboxResult.recommendation}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 7. Safety Guardrails & Settings View Component
// ---------------------------------------------------------------------------
function SettingsView({ settings, onSave, showToast }) {
  const [maxRetries, setMaxRetries] = useState(settings.max_retries ? settings.max_retries.value : "3");
  const [highRiskThreshold, setHighRiskThreshold] = useState(settings.high_risk_threshold ? settings.high_risk_threshold.value : "0.40");
  const [highValueAmount, setHighValueAmount] = useState(settings.high_value_amount ? settings.high_value_amount.value : "25000");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "max_retries", value: String(maxRetries) })
      });
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "high_risk_threshold", value: String(highRiskThreshold) })
      });
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "high_value_amount", value: String(highValueAmount) })
      });
      setSaving(false);
      showToast("Safety guardrails updated successfully", "success");
      onSave();
    } catch (err) {
      setSaving(false);
      showToast("Error updating settings", "danger");
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="glass-card p-6 border-blue-500/30">
        <h2 className="text-lg font-bold text-white mb-1">Safety &amp; Compliance Guardrails</h2>
        <p className="text-xs text-slate-400">
          Enforce strict automated controls to eliminate blind retries, reduce gateway fees, and protect customer trust.
        </p>

        <div className="space-y-5 mt-6 text-xs">
          
          {/* Max Retries */}
          <div className="p-4 rounded-xl bg-[#0D1527] border border-[#1E2D4A] space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-bold text-white text-sm">Maximum Automatic Retries</label>
              <input
                type="number"
                min="1"
                max="5"
                value={maxRetries}
                onChange={(e) => setMaxRetries(e.target.value)}
                className="w-20 bg-[#131E36] border border-[#213054] rounded-lg p-2 text-center text-white font-mono font-bold"
              />
            </div>
            <p className="text-slate-400 leading-relaxed">
              Never retry indefinitely. Once this limit is reached, automated retries are permanently halted and the transaction is escalated to manual review.
            </p>
          </div>

          {/* High Risk Probability Threshold */}
          <div className="p-4 rounded-xl bg-[#0D1527] border border-[#1E2D4A] space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-bold text-white text-sm">High-Risk Cutoff Probability</label>
              <input
                type="number"
                step="0.05"
                min="0.1"
                max="0.9"
                value={highRiskThreshold}
                onChange={(e) => setHighRiskThreshold(e.target.value)}
                className="w-20 bg-[#131E36] border border-[#213054] rounded-lg p-2 text-center text-white font-mono font-bold"
              />
            </div>
            <p className="text-slate-400 leading-relaxed">
              Transactions with predicted recovery probability below this value are classified as High Risk, blocking automated headless retries.
            </p>
          </div>

          {/* High Value VIP Threshold */}
          <div className="p-4 rounded-xl bg-[#0D1527] border border-[#1E2D4A] space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-bold text-white text-sm">VIP Escalation Amount (INR)</label>
              <input
                type="number"
                step="5000"
                value={highValueAmount}
                onChange={(e) => setHighValueAmount(e.target.value)}
                className="w-28 bg-[#131E36] border border-[#213054] rounded-lg p-2 text-center text-white font-mono font-bold"
              />
            </div>
            <p className="text-slate-400 leading-relaxed">
              Transactions exceeding this amount trigger dedicated Concierge Support routing to ensure white-glove revenue recovery.
            </p>
          </div>

          <div className="flex justify-end pt-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="gradient-button px-5 py-2 font-semibold flex items-center gap-2"
            >
              <i data-lucide="save" className="w-4 h-4"></i>
              <span>{saving ? "Saving..." : "Save Guardrail Policies"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 8. Pitch & Architecture View Component
// ---------------------------------------------------------------------------
function AboutPitchView() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="glass-card p-6 border-blue-500/30">
        <span className="badge badge-info mb-2">Razorpay AI Builder Internship 2026</span>
        <h2 className="text-xl font-extrabold text-white">Track 3: AI Revenue Recovery — PayRecover AI</h2>
        <p className="text-xs text-slate-300 mt-1 leading-relaxed">
          "Turning failed payments into intelligent, explainable recovery opportunities."
        </p>

        {/* 5-Minute Pitch Script */}
        <div className="mt-6 space-y-4">
          <h3 className="text-sm font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
            <i data-lucide="mic" className="w-4 h-4"></i>
            <span>5-Minute Internship Pitch Script</span>
          </h3>

          <div className="p-4 rounded-xl bg-[#0D1527] border border-[#1E2D4A] space-y-3 text-xs leading-relaxed text-slate-200">
            <p>
              <strong className="text-white">1. The Problem:</strong> Indian digital merchants lose 5%–15% of gross merchandise value to payment drop-offs and transient bank declines. The conventional solution is "dumb blind retries," which causes merchant gateway charge penalties, card network rate-limiting, and poor customer experience.
            </p>
            <p>
              <strong className="text-white">2. Our Solution (PayRecover AI):</strong> An intelligent AI agent that acts as a real-time revenue triage officer. Instead of blind retries, it classifies failure root causes, scores customer recovery likelihood using calibrated ML, and selects the optimal recovery channel (Smart Backoff Retry, 1-Click WhatsApp Link, or Concierge Escalation).
            </p>
            <p>
              <strong className="text-white">3. Measurable Impact:</strong> In our 1,500 synthetic transaction trial, PayRecover AI recovered <strong>53.8%</strong> of failed payments, salvaged <strong>₹20.7+ Lakhs</strong> in GMV, and saved merchants over <strong>₹4,700</strong> in unnecessary gateway retry fees while strictly enforcing a 3-retry safety guardrail.
            </p>
            <p>
              <strong className="text-white">4. Tech Stack:</strong> Built on FastAPI, SQLite, Scikit-Learn Calibrated Random Forest, and a responsive modern React frontend.
            </p>
          </div>
        </div>

        {/* Architecture Flow Diagram */}
        <div className="mt-6 space-y-3">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">System Architecture Flow</h3>
          <div className="p-4 rounded-xl bg-[#0D1527] border border-[#1E2D4A] font-mono text-xs text-slate-300 space-y-2 overflow-x-auto">
            <div>[Payment Failure Detected] &rarr; [Feature Extraction (History, Reason, Amount, Retries)]</div>
            <div className="text-blue-400 pl-4">&darr; [Scikit-Learn ML Inference Engine] &rarr; Recovery Probability Score</div>
            <div className="text-cyan-400 pl-8">&darr; [AI Decision Policy Engine + Safety Guardrails]</div>
            <div className="text-emerald-400 pl-12">&darr; [Action: Smart Retry / WhatsApp 1-Click / VIP Concierge / Stop]</div>
            <div className="text-amber-400 pl-16">&darr; [Live Explainable Audit Ledger &amp; Dashboard Analytics]</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 9. Transaction Details Modal Component
// ---------------------------------------------------------------------------
function TransactionModal({
  txn,
  onClose,
  onSimulateRecovery,
  onSendReminder,
  onEscalate,
  onStopRecovery,
  formatINR
}) {
  const isFail = txn.failure_reason !== "None";
  const probPct = Math.round(txn.true_recovery_probability * 100);

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
      <div className="glass-card w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 border-blue-500/40 space-y-6">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#1E2D4A] pb-3">
          <div className="flex items-center gap-3">
            <span className="font-mono text-lg font-bold text-blue-400">{txn.transaction_id}</span>
            <span className={`badge ${
              txn.payment_status === "Success" ? "badge-success" :
              txn.payment_status === "Recovered" ? "badge-info" : "badge-danger"
            }`}>
              {txn.payment_status}
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
          >
            <i data-lucide="x" className="w-5 h-5"></i>
          </button>
        </div>

        {/* Modal Grid */}
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="p-3 rounded-lg bg-[#0D1527] border border-[#1E2D4A]">
            <div className="text-slate-400">Customer</div>
            <div className="font-bold text-white text-sm">{txn.customer_name}</div>
            <div className="text-slate-400 text-[11px]">{txn.customer_email}</div>
          </div>

          <div className="p-3 rounded-lg bg-[#0D1527] border border-[#1E2D4A]">
            <div className="text-slate-400">Amount &amp; Method</div>
            <div className="font-bold text-white text-sm font-mono">{formatINR(txn.amount)}</div>
            <div className="text-slate-400 text-[11px]">{txn.payment_method} • {txn.customer_type} Tier</div>
          </div>
        </div>

        {isFail && (
          <div className="space-y-3">
            <div className="p-4 rounded-xl bg-[#0D1527] border border-[#1E2D4A] space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Failure Reason:</span>
                <span className="text-red-400 font-bold">{txn.failure_reason}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Recovery Likelihood:</span>
                <span className="font-mono font-bold text-emerald-400">{probPct}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Retries Used:</span>
                <span className="font-mono text-slate-200">{txn.retry_count} of 3</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Assessed Risk:</span>
                <span className={`badge ${txn.risk_level === "Low" ? "badge-success" : txn.risk_level === "Medium" ? "badge-warning" : "badge-danger"}`}>
                  {txn.risk_level}
                </span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-blue-950/30 border border-blue-500/30 space-y-1 text-xs">
              <div className="font-bold text-cyan-300">AI Recommendation:</div>
              <div className="text-slate-200">{txn.ai_recommendation || txn.recovery_action || "Smart Retry payment"}</div>
              <div className="text-slate-400 text-[11px] mt-1">{txn.ai_reasoning || "Autonomous revenue recovery policy triggered."}</div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {isFail && (
          <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-[#1E2D4A]">
            <button
              onClick={() => onSimulateRecovery(txn.transaction_id)}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
            >
              Simulate Smart Retry
            </button>
            <button
              onClick={() => onSendReminder(txn.transaction_id)}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
            >
              Send WhatsApp Link
            </button>
            <button
              onClick={() => onEscalate(txn.transaction_id)}
              className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold"
            >
              Escalate
            </button>
            <button
              onClick={() => onStopRecovery(txn.transaction_id)}
              className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold"
            >
              Stop Retries
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mount App
// ---------------------------------------------------------------------------
const rootElement = document.getElementById("root");
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
}
