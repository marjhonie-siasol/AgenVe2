import { motion } from "motion/react";
import { ArrowRight, FlaskConical } from "lucide-react";
import type {
  AuditLogItem,
  FirewallStats,
  PendingApproval,
  PluginInfo,
} from "../types";
import { QUICK_TESTS, SPRING_GENTLE } from "../utils";
import { ApprovalDock } from "./ApprovalDock";
import { TimelineCard } from "./TimelineCard";
import type { NavSectionId } from "./Sidebar";

interface OverviewPageProps {
  logs: AuditLogItem[];
  stats: FirewallStats;
  plugins: PluginInfo[];
  pending: PendingApproval[];
  killSwitch: boolean;
  mode: "enforce" | "dry_run";
  onNavigate: (section: NavSectionId) => void;
  onDecideApproval: (
    id: string,
    approved: boolean,
    feedback: string
  ) => Promise<void>;
  onQuickSimulate: (tool: string, args: string) => void;
  onRetestInSimulator: (tool: string, args: Record<string, unknown>) => void;
  onCopyHash: (hash: string) => void;
}

export function OverviewPage({
  logs,
  stats,
  plugins,
  pending,
  killSwitch,
  mode,
  onNavigate,
  onDecideApproval,
  onQuickSimulate,
  onRetestInSimulator,
  onCopyHash,
}: OverviewPageProps) {
  const recentLogs = logs.slice(0, 10);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={SPRING_GENTLE}
      className="space-y-4"
    >
      {/* Page Header */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-[18px] font-semibold tracking-[-0.02em] text-neutral-900">
            Overview
          </h1>
          <p className="mt-0.5 text-[12.5px] text-neutral-500">
            Real-time tool call interception, approvals, and policy health.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate("timeline")}
          className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-[12px] font-medium text-neutral-600 ring-1 ring-black/[0.075] transition-colors hover:bg-neutral-50 hover:text-neutral-900 cursor-pointer"
        >
          Full timeline
          <ArrowRight className="h-3.5 w-3.5 text-neutral-400" />
        </button>
      </div>

      {/* Unified Hairline Metric Strip (refined GCP-style summary bar, zero chunky cards) */}
      <section className="veto-card grid grid-cols-2 divide-y divide-black/[0.055] overflow-hidden rounded-[18px] sm:grid-cols-5 sm:divide-x sm:divide-y-0">
        <div className="px-4 py-3.5">
          <div className="text-[11.5px] font-medium text-neutral-400">
            Total intercepted
          </div>
          <div className="mt-1 font-mono text-[20px] font-semibold tracking-tight text-neutral-900">
            {stats.total}
          </div>
        </div>

        <div className="px-4 py-3.5">
          <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-neutral-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Allowed
          </div>
          <div className="mt-1 font-mono text-[20px] font-semibold tracking-tight text-neutral-900">
            {stats.allowed}
          </div>
        </div>

        <div className="px-4 py-3.5">
          <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-neutral-400">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            Blocked / Denied
          </div>
          <div className="mt-1 font-mono text-[20px] font-semibold tracking-tight text-rose-600">
            {stats.blocked}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onNavigate("approvals")}
          className="px-4 py-3.5 text-left transition-colors hover:bg-neutral-50/80 cursor-pointer"
        >
          <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-neutral-400">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                pending.length > 0
                  ? "bg-amber-500 animate-pulse"
                  : "bg-neutral-300"
              }`}
            />
            Waiting on you
          </div>
          <div
            className={`mt-1 font-mono text-[20px] font-semibold tracking-tight ${
              pending.length > 0 ? "text-amber-600" : "text-neutral-900"
            }`}
          >
            {pending.length}
          </div>
        </button>

        <div className="col-span-2 px-4 py-3.5 sm:col-span-1">
          <div className="text-[11.5px] font-medium text-neutral-400">
            Avg latency
          </div>
          <div className="mt-1 font-mono text-[20px] font-semibold tracking-tight text-neutral-900">
            {stats.avg_latency_ms}
            <span className="ml-0.5 text-[12px] font-normal text-neutral-400">
              ms
            </span>
          </div>
        </div>
      </section>

      {/* Active Pending Approvals (appears cleanly at top if any agent is paused) */}
      <ApprovalDock pending={pending} onDecide={onDecideApproval} />

      {/* Quick Dry-Run Test Strip */}
      <section className="veto-card flex flex-wrap items-center justify-between gap-3 rounded-[18px] px-4 py-3">
        <div className="flex items-center gap-2 text-[12.5px] font-medium text-neutral-700">
          <FlaskConical className="h-3.5 w-3.5 text-blue-600" />
          <span>Quick dry-run test</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {QUICK_TESTS.map((qt) => {
            const dotColor =
              qt.tone === "safe"
                ? "bg-emerald-500"
                : qt.tone === "warn"
                  ? "bg-amber-500"
                  : "bg-rose-500";
            return (
              <button
                key={qt.label}
                type="button"
                onClick={() => onQuickSimulate(qt.tool, qt.args)}
                className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.075] bg-neutral-50/70 px-2.5 py-1 text-[11.5px] font-medium text-neutral-600 transition-colors hover:border-blue-300 hover:bg-blue-50/60 hover:text-blue-700 cursor-pointer"
              >
                <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
                {qt.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Recent Execution Timeline Rail */}
      <TimelineCard
        logs={recentLogs}
        stats={stats}
        plugins={plugins}
        pendingCount={pending.length}
        killSwitch={killSwitch}
        mode={mode}
        filterDecision="ALL"
        onFilterChange={() => onNavigate("timeline")}
        searchText=""
        onSearchChange={() => onNavigate("timeline")}
        onRetestInSimulator={onRetestInSimulator}
        onCopyHash={onCopyHash}
        compact
        onViewAll={() => onNavigate("timeline")}
      />
    </motion.div>
  );
}
