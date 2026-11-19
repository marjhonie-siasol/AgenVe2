import { motion } from "motion/react";
import {
  Activity,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Database,
  FlaskConical,
  Shield,
  ShieldAlert,
  Zap,
} from "lucide-react";
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
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={SPRING_GENTLE}
      className="space-y-4"
    >
      {/* Quiet Status Bar — 16px radius, calm chrome */}
      <section className="agenve2-card rounded-xl px-4 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className={`h-2 w-2 rounded-full ${
                killSwitch
                  ? "bg-rose-500"
                  : mode === "dry_run"
                    ? "bg-amber-500"
                    : "bg-emerald-500"
              }`}
            />
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-neutral-900">
                {killSwitch
                  ? "Firewall halted"
                  : mode === "dry_run"
                    ? "Dry-run active"
                    : "Firewall enforcing"}
              </span>
              <span className="text-neutral-300">&middot;</span>
              <span className="rounded-md bg-neutral-100 px-2 py-0.5 font-mono text-xs text-neutral-600">
                policy.yaml
              </span>
              <span className="text-neutral-300">&middot;</span>
              <span className="font-mono text-xs text-neutral-500 tabular-nums">
                {stats.avg_latency_ms}ms avg
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate("simulator")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-neutral-800 cursor-pointer"
            >
              <FlaskConical size={14} strokeWidth={1.75} aria-hidden="true" className="icon-optical" />
              Simulator
            </button>
            <button
              type="button"
              onClick={() => onNavigate("plugins")}
              className="rounded-lg border border-black/[0.08] bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 cursor-pointer"
            >
              {plugins.length} guards
            </button>
          </div>
        </div>
      </section>

      {/* Live Approval Queue Dock */}
      {pending.length > 0 && (
        <ApprovalDock pending={pending} onDecide={onDecideApproval} />
      )}

      {/* Metrics Grid — 4 compact cards sharing one height, numbers only */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="agenve2-card rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-neutral-500">
            <span>Total calls</span>
            <Activity size={16} strokeWidth={1.75} aria-hidden="true" className="text-neutral-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-medium text-neutral-900 tabular-nums">
            {stats.total.toLocaleString()}
          </div>
        </div>

        <div className="agenve2-card rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-neutral-500">
            <span>Allowed</span>
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
          </div>
          <div className="mt-2 font-mono text-2xl font-medium text-emerald-600 tabular-nums">
            {stats.allowed.toLocaleString()}
          </div>
        </div>

        <div className="agenve2-card rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-neutral-500">
            <span>Blocked</span>
            <span className="h-2 w-2 rounded-full bg-rose-500" />
          </div>
          <div className="mt-2 font-mono text-2xl font-medium text-rose-600 tabular-nums">
            {stats.blocked.toLocaleString()}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onNavigate("approvals")}
          className="agenve2-card rounded-xl p-4 text-left transition-colors hover:bg-neutral-50/70 cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-neutral-500">
            <span>Pending</span>
            <span
              className={`h-2 w-2 rounded-full ${
                pending.length > 0 ? "bg-amber-500" : "bg-neutral-300"
              }`}
            />
          </div>
          <div className="mt-2 font-mono text-2xl font-medium text-neutral-900 tabular-nums">
            {pending.length}
          </div>
        </button>
      </section>

      {/* Quick Test Presets — 8px nested radius buttons */}
      <section className="agenve2-card rounded-xl p-4">
        <div className="flex items-center justify-between pb-3">
          <span className="text-sm font-medium text-neutral-900">
            Quick test presets
          </span>
          <span className="text-xs text-neutral-400">
            Click to run in simulator
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {QUICK_TESTS.map((test) => {
            const dotColor =
              test.tone === "safe"
                ? "bg-emerald-500"
                : test.tone === "warn"
                  ? "bg-amber-500"
                  : "bg-rose-500";
            return (
              <button
                key={test.label}
                type="button"
                onClick={() => onQuickSimulate(test.tool, test.args)}
                className="group inline-flex items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-3 py-1.5 text-xs transition-colors hover:border-black/[0.16] hover:bg-neutral-50 cursor-pointer"
              >
                <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
                <span className="font-medium text-neutral-800">{test.label}</span>
                <span className="font-mono text-xs text-neutral-400 group-hover:text-neutral-600">
                  {test.tool}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Execution Timeline */}
      <TimelineCard
        logs={recentLogs}
        stats={stats}
        plugins={plugins}
        pendingCount={pending.length}
        killSwitch={killSwitch}
        mode={mode}
        filterDecision="ALL"
        onFilterChange={() => {}}
        searchText=""
        onSearchChange={() => {}}
        onRetestInSimulator={onRetestInSimulator}
        onCopyHash={onCopyHash}
        compact={true}
        onViewAll={() => onNavigate("timeline")}
      />
    </motion.div>
  );
}
