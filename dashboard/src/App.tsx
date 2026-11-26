import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  CheckCircle2,
  FileCode2,
  Lock,
  Menu,
  PanelLeft,
  Power,
  ShieldAlert,
  X,
} from "lucide-react";
import type {
  AuditLogItem,
  FirewallStats,
  PendingApproval,
  PluginInfo,
  SimulationResult,
} from "./types";
import { SPRING_GENTLE, SPRING_SNAPPY } from "./utils";
import { Sidebar, type NavSectionId } from "./components/Sidebar";
import { OverviewPage } from "./components/OverviewPage";
import { TimelineCard } from "./components/TimelineCard";
import { ApprovalsPage } from "./components/ApprovalsPage";
import {
  SimulatorPage,
  type SimulationHistoryItem,
} from "./components/SimulatorPage";
import { PolicyView } from "./components/PolicyView";
import { PluginsPage } from "./components/PluginsPage";
import { ApprovalDock } from "./components/ApprovalDock";
import logoUrl from "./assets/agenve2.logo.png";

interface ToastNotice {
  id: number;
  tone: "ok" | "warn" | "danger";
  title: string;
  detail?: string;
}

export default function App() {
  const [section, setSection] = useState<NavSectionId>("overview");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [wsConnected, setWsConnected] = useState(false);
  const [killSwitch, setKillSwitch] = useState(false);
  const [mode, setMode] = useState<"enforce" | "dry_run">("enforce");
  const [policyPath, setPolicyPath] = useState("policy.yaml");
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [stats, setStats] = useState<FirewallStats>({
    total: 0,
    allowed: 0,
    blocked: 0,
    pending: 0,
    avg_latency_ms: 0,
  });

  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [pending, setPending] = useState<PendingApproval[]>([]);
  const [filterDecision, setFilterDecision] = useState("ALL");
  const [searchText, setSearchText] = useState("");

  const [policyYaml, setPolicyYaml] = useState("");
  const [policyMsg, setPolicyMsg] = useState<{ ok: boolean; text: string } | null>(
    null
  );
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [generatingPolicy, setGeneratingPolicy] = useState(false);

  const [simTool, setSimTool] = useState("postgres_query");
  const [simArgs, setSimArgs] = useState(
    JSON.stringify({ query: "DROP TABLE orders;" }, null, 2)
  );
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [simError, setSimError] = useState<string | null>(null);
  const [simBusy, setSimBusy] = useState(false);
  const [simHistory, setSimHistory] = useState<SimulationHistoryItem[]>([]);

  const [toast, setToast] = useState<ToastNotice | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (tone: ToastNotice["tone"], title: string, detail?: string) => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setToast({ id: Date.now(), tone, title, detail });
      toastTimerRef.current = setTimeout(() => {
        setToast(null);
      }, 4500);
    },
    []
  );

  const fetchAll = useCallback(async () => {
    const [stateRes, logsRes, approvalsRes, policyRes] = await Promise.all([
      fetch("/api/state"),
      fetch("/api/logs?limit=150"),
      fetch("/api/approvals"),
      fetch("/api/policy"),
    ]);
    if (stateRes.ok) {
      const s = await stateRes.json();
      setKillSwitch(Boolean(s.kill_switch));
      setMode(s.mode === "dry_run" ? "dry_run" : "enforce");
      setPolicyPath(s.policy_path || "policy.yaml");
      setPlugins(s.plugins || []);
      if (s.stats) setStats(s.stats);
    }
    if (logsRes.ok) {
      const l = await logsRes.json();
      setLogs(l.logs || []);
      if (l.stats) setStats(l.stats);
    }
    if (approvalsRes.ok) {
      const a = await approvalsRes.json();
      setPending(a.pending || []);
    }
    if (policyRes.ok) {
      const p = await policyRes.json();
      setPolicyYaml(p.yaml_content || "");
    }
  }, []);

  useEffect(() => {
    fetchAll().catch(() => {});

    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${proto}://${window.location.host}/ws`;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => setWsConnected(true);
      ws.onclose = () => {
        setWsConnected(false);
        reconnectTimer = setTimeout(connect, 2500);
      };
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === "init" && msg.data) {
            setKillSwitch(Boolean(msg.data.kill_switch));
            setMode(msg.data.mode === "dry_run" ? "dry_run" : "enforce");
            if (msg.data.stats) setStats(msg.data.stats);
            if (msg.data.pending) setPending(msg.data.pending);
          } else if (msg.type === "audit_event" && msg.data) {
            setLogs((prev) => [msg.data as AuditLogItem, ...prev].slice(0, 250));
          } else if (msg.type === "stats_update" && msg.data) {
            setStats(msg.data);
          } else if (msg.type === "state_update" && msg.data) {
            setKillSwitch(Boolean(msg.data.kill_switch));
            setMode(msg.data.mode === "dry_run" ? "dry_run" : "enforce");
          } else if (msg.type === "approval_created" && msg.data) {
            setPending((prev) => [msg.data as PendingApproval, ...prev]);
          } else if (msg.type === "approval_resolved" && msg.data) {
            setPending((prev) =>
              prev.filter((item) => item.id !== msg.data.id)
            );
          }
        } catch {
          // ignore malformed event
        }
      };
    };

    connect();
    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [fetchAll]);

  const toggleKillSwitch = async () => {
    const next = !killSwitch;
    const res = await fetch("/api/state/kill-switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next }),
    });
    if (res.ok) {
      const data = await res.json();
      const engaged = Boolean(data.kill_switch);
      setKillSwitch(engaged);
      showToast(
        engaged ? "danger" : "ok",
        engaged ? "Kill switch engaged" : "Kill switch released",
        engaged ? "All tool calls blocked" : "Policy enforcement resumed"
      );
    }
  };

  const setFirewallMode = async (next: "enforce" | "dry_run") => {
    if (next === mode) return;
    const res = await fetch("/api/state/mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: next }),
    });
    if (res.ok) {
      const data = await res.json();
      setMode(data.mode);
      showToast(
        data.mode === "dry_run" ? "warn" : "ok",
        data.mode === "dry_run" ? "Dry-run mode active" : "Enforce mode active",
        data.mode === "dry_run"
          ? "Blocks logged only"
          : "Dangerous calls blocked"
      );
    }
  };

  const handleApprovalDecision = async (
    id: string,
    approved: boolean,
    feedback: string
  ) => {
    const ticket = pending.find((item) => item.id === id);
    const res = await fetch(`/api/approvals/${id}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        approved,
        decided_by: "dashboard-operator",
        feedback: feedback.trim() || null,
      }),
    });
    if (res.ok) {
      setPending((prev) => prev.filter((item) => item.id !== id));
      showToast(
        approved ? "ok" : "warn",
        `${approved ? "Allowed" : "Denied"} ${ticket?.tool_name || "tool call"}`,
        feedback.trim() ? "Feedback delivered" : "Agent resumed"
      );
    }
  };

  const handleSavePolicy = async () => {
    setPolicyMsg(null);
    setSavingPolicy(true);
    try {
      const res = await fetch("/api/policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yaml_content: policyYaml }),
      });
      if (res.ok) {
        setPolicyMsg({ ok: true, text: "Policy validated and hot-reloaded." });
        showToast("ok", "Policy hot-reloaded", policyPath);
      } else {
        const err = await res.json();
        setPolicyMsg({ ok: false, text: err.detail || "Invalid YAML policy." });
      }
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleGeneratePolicy = async () => {
    setPolicyMsg(null);
    setGeneratingPolicy(true);
    try {
      const res = await fetch("/api/policy/generate", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setPolicyYaml(data.yaml_content);
        setPolicyMsg({
          ok: true,
          text: `Drafted starter policy from ${data.tool_count} observed tool(s). Review and click Save & hot-reload.`,
        });
      } else {
        const err = await res.json();
        setPolicyMsg({
          ok: false,
          text: err.detail || "No audit logs available to generate policy.",
        });
      }
    } finally {
      setGeneratingPolicy(false);
    }
  };

  const handleSimulate = async (
    overrideTool?: string,
    overrideArgs?: string
  ) => {
    const targetTool = overrideTool ?? simTool;
    const targetArgs = overrideArgs ?? simArgs;
    setSimError(null);
    setSimBusy(true);

    let parsedArgs: Record<string, unknown> = {};
    try {
      parsedArgs = JSON.parse(targetArgs);
    } catch {
      setSimResult(null);
      setSimError("Arguments must be valid JSON.");
      setSimBusy(false);
      return;
    }

    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool_name: targetTool, arguments: parsedArgs }),
      });
      if (res.ok) {
        const verdict: SimulationResult = await res.json();
        setSimResult(verdict);
        setSimHistory((prev) =>
          [
            {
              id: Date.now(),
              tool: targetTool,
              args: parsedArgs,
              result: verdict,
            },
            ...prev,
          ].slice(0, 12)
        );
      } else {
        setSimResult(null);
        setSimError("Simulation request failed.");
      }
    } finally {
      setSimBusy(false);
    }
  };

  const verifyAuditChain = async () => {
    const res = await fetch("/api/audit/verify");
    if (res.ok) {
      const data = await res.json();
      showToast(
        data.valid ? "ok" : "danger",
        data.valid ? "Hash chain intact" : "Hash chain mismatch",
        data.message
      );
    }
  };

  const filteredLogs = useMemo(() => {
    return logs.filter((item) => {
      if (
        filterDecision !== "ALL" &&
        item.effective_decision !== filterDecision
      ) {
        return false;
      }
      if (searchText.trim()) {
        const q = searchText.toLowerCase();
        return (
          item.tool_name.toLowerCase().includes(q) ||
          item.agent_name.toLowerCase().includes(q) ||
          item.reason.toLowerCase().includes(q) ||
          JSON.stringify(item.arguments).toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [logs, filterDecision, searchText]);

  const handleRetestFromTimeline = (
    toolName: string,
    toolArgs: Record<string, unknown>
  ) => {
    const formatted = JSON.stringify(toolArgs, null, 2);
    setSimTool(toolName);
    setSimArgs(formatted);
    setSection("simulator");
    handleSimulate(toolName, formatted);
  };

  const handleQuickSimulateFromOverview = (toolName: string, argsStr: string) => {
    setSimTool(toolName);
    setSimArgs(argsStr);
    setSection("simulator");
    handleSimulate(toolName, argsStr);
  };

  const showFloatingApprovals =
    pending.length > 0 && section !== "overview" && section !== "approvals";

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-[#171717]">
      {/* Top Console Bar (56px) — Quiet chrome, hairline border */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-4 border-b border-black/[0.08] bg-white px-4 sm:px-6">
        {/* Left: Sidebar Toggle + Brand + Active Policy Context */}
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open navigation menu"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 md:hidden cursor-pointer"
          >
            <Menu size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => setSidebarCollapsed((v) => !v)}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 md:flex cursor-pointer"
          >
            <PanelLeft size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => setSection("overview")}
            className="flex items-center gap-2.5 cursor-pointer"
          >
            <img
              src={logoUrl}
              alt="AgenVe2"
              className="h-6 w-6 rounded-md object-contain"
            />
            <span className="text-sm font-semibold tracking-tight text-neutral-900">
              AgenVe2
            </span>
          </button>

          <span className="hidden h-4 w-[1px] bg-black/[0.08] sm:block mx-0.5" />

          {/* Policy Context Tag */}
          <button
            type="button"
            onClick={() => setSection("policy")}
            title="Edit policy"
            className="hidden items-center gap-1.5 rounded-md border border-black/[0.08] bg-white px-2 py-1 text-xs text-neutral-600 transition-colors hover:border-black/[0.16] hover:text-neutral-900 sm:inline-flex cursor-pointer"
          >
            <FileCode2 size={14} strokeWidth={1.75} aria-hidden="true" className="icon-optical text-neutral-400" />
            <span className="max-w-[160px] truncate font-mono">
              {policyPath}
            </span>
          </button>
        </div>

        {/* Right: Mode Switch · Verify Chain · Kill Switch */}
        <div className="flex shrink-0 items-center gap-2">
          {/* Segmented Mode Control — 8px outer radius, 6px inner pill */}
          <div className="hidden items-center rounded-lg bg-neutral-100 p-0.5 sm:flex">
            {(["enforce", "dry_run"] as const).map((m) => {
              const active = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setFirewallMode(m)}
                  className={`relative rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                    active
                      ? m === "dry_run"
                        ? "text-amber-800"
                        : "text-neutral-900"
                      : "text-neutral-500 hover:text-neutral-800"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="top-mode-pill"
                      transition={SPRING_SNAPPY}
                      className={`absolute inset-0 rounded-md ${
                        m === "dry_run"
                          ? "bg-amber-50 ring-1 ring-amber-200"
                          : "bg-white shadow-xs"
                      }`}
                    />
                  )}
                  <span className="relative z-10">
                    {m === "enforce" ? "Enforce" : "Dry-run"}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={verifyAuditChain}
            title="Verify SHA-256 chain"
            className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 cursor-pointer"
          >
            <Lock size={14} strokeWidth={1.75} aria-hidden="true" className="icon-optical text-neutral-400" />
            <span className="hidden sm:inline">Verify chain</span>
          </button>

          <button
            type="button"
            onClick={toggleKillSwitch}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
              killSwitch
                ? "bg-rose-600 text-white hover:bg-rose-700"
                : "border border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
            }`}
          >
            {killSwitch ? (
              <>
                <ShieldAlert size={14} strokeWidth={1.75} aria-hidden="true" className="icon-optical" />
                <span>Resume</span>
              </>
            ) : (
              <>
                <Power size={14} strokeWidth={1.75} aria-hidden="true" className="icon-optical" />
                <span>Kill switch</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Console Shell: Collapsible Sidebar + Content Workspace */}
      <div className="flex min-h-[calc(100vh-4rem)]">
        <Sidebar
          active={section}
          collapsed={sidebarCollapsed}
          mobileOpen={mobileMenuOpen}
          pendingCount={pending.length}
          pluginCount={plugins.length}
          wsConnected={wsConnected}
          killSwitch={killSwitch}
          onSelect={setSection}
          onCloseMobile={() => setMobileMenuOpen(false)}
        />

        <main
          className={`relative flex-1 overflow-x-hidden px-4 py-5 sm:px-8 transition-[margin] duration-200 ease-out ${
            sidebarCollapsed ? "md:ml-[60px]" : "md:ml-[210px]"
          }`}
        >
          <div className="mx-auto max-w-[1060px] pb-20">
            <AnimatePresence mode="wait">
              {section === "overview" && (
                <OverviewPage
                  key="page-overview"
                  logs={logs}
                  stats={stats}
                  plugins={plugins}
                  pending={pending}
                  killSwitch={killSwitch}
                  mode={mode}
                  onNavigate={setSection}
                  onDecideApproval={handleApprovalDecision}
                  onQuickSimulate={handleQuickSimulateFromOverview}
                  onRetestInSimulator={handleRetestFromTimeline}
                  onCopyHash={(hash) =>
                    showToast("ok", "Audit hash copied", hash.slice(0, 12))
                  }
                />
              )}

              {section === "timeline" && (
                <motion.div
                  key="page-timeline"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={SPRING_GENTLE}
                >
                  <TimelineCard
                    logs={filteredLogs}
                    stats={stats}
                    plugins={plugins}
                    pendingCount={pending.length}
                    killSwitch={killSwitch}
                    mode={mode}
                    filterDecision={filterDecision}
                    onFilterChange={setFilterDecision}
                    searchText={searchText}
                    onSearchChange={setSearchText}
                    onRetestInSimulator={handleRetestFromTimeline}
                    onCopyHash={(hash) =>
                      showToast("ok", "Audit hash copied", hash.slice(0, 12))
                    }
                  />
                </motion.div>
              )}

              {section === "approvals" && (
                <ApprovalsPage
                  key="page-approvals"
                  pending={pending}
                  logs={logs}
                  onDecide={handleApprovalDecision}
                />
              )}

              {section === "simulator" && (
                <SimulatorPage
                  key="page-simulator"
                  tool={simTool}
                  args={simArgs}
                  policyPath={policyPath}
                  result={simResult}
                  error={simError}
                  busy={simBusy}
                  history={simHistory}
                  onToolChange={setSimTool}
                  onArgsChange={setSimArgs}
                  onSimulate={handleSimulate}
                />
              )}

              {section === "policy" && (
                <PolicyView
                  key="page-policy"
                  policyPath={policyPath}
                  policyYaml={policyYaml}
                  policyMsg={policyMsg}
                  saving={savingPolicy}
                  generating={generatingPolicy}
                  onPolicyChange={setPolicyYaml}
                  onSavePolicy={handleSavePolicy}
                  onGeneratePolicy={handleGeneratePolicy}
                />
              )}

              {section === "plugins" && (
                <PluginsPage
                  key="page-plugins"
                  plugins={plugins}
                  logs={logs}
                />
              )}
            </AnimatePresence>
          </div>

          {/* Persistent Floating Approval Dock when working on another console page */}
          {showFloatingApprovals && (
            <div className="pointer-events-none fixed right-5 bottom-5 left-5 z-30 md:left-auto md:w-[540px]">
              <div className="pointer-events-auto">
                <ApprovalDock
                  pending={pending}
                  onDecide={handleApprovalDecision}
                />
              </div>
            </div>
          )}

          {/* Quiet Floating Status Toast Pill (2.design.mp4 style) */}
          <div className="pointer-events-none fixed bottom-5 left-1/2 z-40 -translate-x-1/2">
            <AnimatePresence>
              {toast && (
                <motion.div
                  key={toast.id}
                  initial={{ opacity: 0, y: 10, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.96 }}
                  transition={SPRING_SNAPPY}
                  className="agenve2-pill pointer-events-auto inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px]"
                >
                  {toast.tone === "ok" ? (
                    <CheckCircle2 size={16} strokeWidth={1.75} aria-hidden="true" className="icon-optical text-emerald-600" />
                  ) : toast.tone === "warn" ? (
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                  )}
                  <span className="font-medium text-neutral-800">
                    {toast.title}
                  </span>
                  {toast.detail && (
                    <span className="text-neutral-400">{toast.detail}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setToast(null)}
                    aria-label="Dismiss notice"
                    className="ml-1 text-neutral-300 hover:text-neutral-600 cursor-pointer"
                  >
                    <X size={14} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}
