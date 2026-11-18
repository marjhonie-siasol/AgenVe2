import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircle,
  Check,
  Copy,
  Download,
  FlaskConical,
  Search,
  ShieldCheck,
} from "lucide-react";
import type { AuditLogItem, FirewallStats, PluginInfo } from "../types";
import {
  SPRING_GENTLE,
  SPRING_SNAPPY,
  decisionMeta,
  formatRelativeTime,
  isRowBlocked,
  shortHash,
  summarizeArgs,
} from "../utils";

interface TimelineCardProps {
  logs: AuditLogItem[];
  stats: FirewallStats;
  plugins: PluginInfo[];
  pendingCount: number;
  killSwitch: boolean;
  mode: "enforce" | "dry_run";
  filterDecision: string;
  onFilterChange: (value: string) => void;
  searchText: string;
  onSearchChange: (value: string) => void;
  onRetestInSimulator: (tool: string, args: Record<string, unknown>) => void;
  onCopyHash: (hash: string) => void;
  compact?: boolean;
  onViewAll?: () => void;
}

const FILTER_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "ALL", label: "All" },
  { id: "ALLOW", label: "Allowed" },
  { id: "BLOCK", label: "Blocked" },
  { id: "APPROVED", label: "Approved" },
  { id: "DENIED", label: "Denied" },
];

export function TimelineCard({
  logs,
  stats,
  plugins,
  pendingCount,
  killSwitch,
  mode,
  filterDecision,
  onFilterChange,
  searchText,
  onSearchChange,
  onRetestInSimulator,
  onCopyHash,
  compact = false,
  onViewAll,
}: TimelineCardProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [hoveredRowId, setHoveredRowId] = useState<number | null>(null);
  const [hoveredPlugin, setHoveredPlugin] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const statusIndicator = killSwitch
    ? { dot: "bg-rose-500", text: "text-rose-600", label: "Halted" }
    : pendingCount > 0
      ? {
          dot: "bg-amber-500 animate-pulse",
          text: "text-amber-700",
          label: `${pendingCount} waiting on you`,
        }
      : mode === "dry_run"
        ? { dot: "bg-amber-500", text: "text-amber-700", label: "Dry-run" }
        : { dot: "bg-emerald-500", text: "text-emerald-600", label: "Enforcing" };

  const handleCopy = (row: AuditLogItem) => {
    navigator.clipboard?.writeText(row.entry_hash).catch(() => {});
    setCopiedId(row.id);
    onCopyHash(row.entry_hash);
    setTimeout(() => setCopiedId((curr) => (curr === row.id ? null : curr)), 1800);
  };

  return (
    <motion.section
      layout
      transition={SPRING_GENTLE}
      className="veto-card relative rounded-[20px]"
    >
      {/* Header row — quiet, editorial, zero KPI box bloat */}
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3.5">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[14.5px] font-semibold tracking-[-0.015em] text-neutral-900">
            {compact ? "Recent executions" : "Execution timeline"}
          </h2>
          <span className="font-mono text-[12.5px] text-neutral-400">
            #{stats.total}
          </span>
        </div>

        <div className="flex flex-col items-end gap-0.5 text-right">
          <span
            className={`inline-flex items-center gap-1.5 text-[12.5px] font-medium ${statusIndicator.text}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${statusIndicator.dot}`} />
            {statusIndicator.label}
          </span>
          <div className="flex items-center gap-2 font-mono text-[11.5px] text-neutral-400">
            <span className="text-emerald-600/90">+{stats.allowed} allowed</span>
            <span className="text-rose-600/90">-{stats.blocked} blocked</span>
            <span>&middot;</span>
            <span>{stats.avg_latency_ms}ms avg</span>
          </div>
        </div>
      </div>

      {/* Subtle inline search + filter strip */}
      {!compact && (
      <div className="flex flex-wrap items-center justify-between gap-2 border-y border-black/[0.055] bg-neutral-50/60 px-5 py-2">
        <div className="flex flex-wrap items-center gap-1">
          {FILTER_OPTIONS.map((opt) => {
            const active = filterDecision === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => onFilterChange(opt.id)}
                className={`relative rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors cursor-pointer ${
                  active
                    ? "text-neutral-900"
                    : "text-neutral-500 hover:text-neutral-800"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="timeline-filter-pill"
                    transition={SPRING_SNAPPY}
                    className="absolute inset-0 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.07]"
                  />
                )}
                <span className="relative z-10">{opt.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Filter tool, agent, args..."
              className="w-44 rounded-full border border-black/[0.07] bg-white pl-7 pr-3 py-1 text-[12px] text-neutral-800 placeholder:text-neutral-400 transition-all focus:w-56 focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/10"
            />
          </div>

          <div className="flex items-center gap-1 border-l border-black/[0.06] pl-2">
            <a
              href="/api/logs/export?fmt=csv"
              title="Export CSV"
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11.5px] font-medium text-neutral-500 transition-colors hover:bg-black/[0.04] hover:text-neutral-900"
            >
              <Download className="h-3 w-3" />
              CSV
            </a>
            <a
              href="/api/logs/export?fmt=json"
              title="Export JSON"
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11.5px] font-medium text-neutral-500 transition-colors hover:bg-black/[0.04] hover:text-neutral-900"
            >
              JSON
            </a>
          </div>
        </div>
      </div>
      )}

      {/* Vertical Execution Node Rail */}
      <div className="px-5 py-3">
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
              <ShieldCheck className="h-4.5 w-4.5" />
            </div>
            <p className="mt-3 text-[13.5px] font-medium text-neutral-700">
              Listening for tool executions
            </p>
            <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-neutral-400">
              Run an agent via{" "}
              <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11.5px] text-neutral-700">
                veto proxy
              </code>{" "}
              or{" "}
              <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11.5px] text-neutral-700">
                @veto.guard
              </code>
              , or pick any quick test preset in the simulator bar below.
            </p>
          </div>
        ) : (
          <div className="relative">
            {logs.map((row, idx) => {
              const meta = decisionMeta(row.effective_decision);
              const blocked = isRowBlocked(row);
              const isExpanded = expandedId === row.id;
              const isFirst = idx === 0;
              const isLast = idx === logs.length - 1;
              const preview = summarizeArgs(row.arguments);
              const tagText = row.plugin_triggered || row.rule_triggered;

              return (
                <motion.div
                  key={row.id}
                  layout="position"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={SPRING_GENTLE}
                  className="relative"
                >
                  {/* Vertical connecting rail */}
                  {!isFirst && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute left-[11px] top-0 h-[18px] w-[1.5px] bg-neutral-200/80"
                    />
                  )}
                  {!isLast && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute left-[11px] top-[18px] bottom-0 w-[1.5px] bg-neutral-200/80"
                    />
                  )}

                  {/* Clickable timeline row */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setExpandedId(isExpanded ? null : row.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setExpandedId(isExpanded ? null : row.id);
                      }
                    }}
                    onMouseEnter={() => {
                      if (blocked && !isExpanded) setHoveredRowId(row.id);
                    }}
                    onMouseLeave={() => {
                      if (hoveredRowId === row.id) setHoveredRowId(null);
                    }}
                    className={`group relative flex items-center justify-between gap-3 rounded-xl py-2 pl-7 pr-2.5 transition-colors cursor-pointer ${
                      isExpanded
                        ? "bg-neutral-50/90"
                        : "hover:bg-neutral-50/80"
                    }`}
                  >
                    {/* Rail Node Dot */}
                    <span className="pointer-events-none absolute left-[5px] top-1/2 -translate-y-1/2 flex h-[14px] w-[14px] items-center justify-center">
                      {blocked ? (
                        <span className="flex h-[14px] w-[14px] items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white shadow-xs">
                          !
                        </span>
                      ) : row.effective_decision === "APPROVED" ? (
                        <span className="h-[9px] w-[9px] rounded-full bg-violet-500 ring-3 ring-violet-100" />
                      ) : row.dry_run ? (
                        <span className="h-[9px] w-[9px] rounded-full bg-amber-500 ring-3 ring-amber-100" />
                      ) : (
                        <span className="h-[8px] w-[8px] rounded-full bg-emerald-500/90 ring-2 ring-white transition-transform group-hover:scale-110" />
                      )}
                    </span>

                    {/* Left: Tool + Inline Preview + Rule Tag */}
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span
                        className={`truncate text-[13.5px] font-medium ${
                          blocked ? "text-rose-700" : "text-neutral-900"
                        }`}
                      >
                        {row.tool_name}
                      </span>

                      {preview && (
                        <span className="hidden truncate font-mono text-[12px] text-neutral-400 sm:inline">
                          {preview}
                        </span>
                      )}

                      {tagText && (
                        <span
                          className={`shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-medium ${
                            blocked
                              ? "bg-rose-50 text-rose-600"
                              : row.effective_decision === "APPROVED"
                                ? "bg-violet-50 text-violet-600"
                                : "bg-neutral-100 text-neutral-600"
                          }`}
                        >
                          {tagText}
                        </span>
                      )}

                      {row.dry_run && (
                        <span className="shrink-0 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10.5px] font-medium text-amber-700">
                          dry-run
                        </span>
                      )}
                    </div>

                    {/* Right: Short Hash · Agent · Latency · Relative Time */}
                    <div className="flex shrink-0 items-center gap-2 font-mono text-[11.5px] text-neutral-400">
                      <span className="hidden text-neutral-300 md:inline">
                        {shortHash(row.entry_hash)}
                      </span>
                      <span className="hidden font-sans text-[12px] text-neutral-500 sm:inline">
                        {row.agent_name}
                      </span>
                      <span className="text-neutral-400">
                        {row.latency_ms}ms
                      </span>
                      <span className="w-8 text-right font-sans text-[12px] text-neutral-400">
                        {formatRelativeTime(row.timestamp)}
                      </span>
                    </div>

                    {/* Hover Inspection Popover (inspired by 3.draft.jpg) */}
                    <AnimatePresence>
                      {hoveredRowId === row.id && !isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, y: 6, scale: 0.985 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 4, scale: 0.985 }}
                          transition={{ duration: 0.14, ease: "easeOut" }}
                          onClick={(e) => e.stopPropagation()}
                          className="veto-popover pointer-events-none absolute left-6 bottom-full z-30 mb-2 w-[430px] max-w-[calc(100vw-4rem)] rounded-2xl p-3.5 text-left"
                        >
                          <div className="flex items-center justify-between border-b border-black/[0.06] pb-2">
                            <span className="text-[12px] font-medium text-neutral-500">
                              Intercepted by{" "}
                              <span className="font-mono text-neutral-800">
                                {row.plugin_triggered || row.rule_triggered}
                              </span>
                            </span>
                            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10.5px] font-medium text-rose-600">
                              {meta.label}
                            </span>
                          </div>

                          <div className="mt-2.5 space-y-2.5">
                            <div>
                              <div className="text-[11px] font-medium text-neutral-500">
                                {row.tool_name}{" "}
                                <span className="text-neutral-400">
                                  · {row.agent_name}
                                </span>
                              </div>
                              <div className="mt-1 space-y-1">
                                <div className="flex items-start gap-2.5 pl-1">
                                  <span className="mt-0.5 h-4 w-[2px] shrink-0 rounded-full bg-rose-400" />
                                  <span className="w-12 shrink-0 text-[11px] text-neutral-400">
                                    Args
                                  </span>
                                  <code className="truncate text-[11.5px] text-neutral-800">
                                    {JSON.stringify(row.arguments)}
                                  </code>
                                </div>
                                <div className="flex items-start gap-2.5 pl-1">
                                  <span className="mt-0.5 h-4 w-[2px] shrink-0 rounded-full bg-blue-400" />
                                  <span className="w-12 shrink-0 text-[11px] text-neutral-400">
                                    Reason
                                  </span>
                                  <span className="text-[11.5px] leading-snug text-neutral-700">
                                    {row.reason}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Click-to-Expand Inline Drawer (inspired by 2.design.mp4) */}
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        key={`drawer-${row.id}`}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={SPRING_GENTLE}
                        className="overflow-hidden pl-7 pr-2"
                      >
                        <div className="my-2 rounded-2xl border border-black/[0.065] bg-[#FAFAFA] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                          {/* Reason + Decision summary */}
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="flex items-start gap-2">
                              {blocked ? (
                                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
                              ) : (
                                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                              )}
                              <p className="text-[12.5px] leading-relaxed text-neutral-700">
                                {row.reason}
                              </p>
                            </div>
                            <span
                              className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.pillClass}`}
                            >
                              {meta.label}
                              {row.dry_run ? " (dry-run)" : ""}
                            </span>
                          </div>

                          {/* Human approval trail (like 3.design.mp4) */}
                          {row.feedback && (
                            <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-black/[0.06] bg-white px-3 py-1.5 text-[12px] text-neutral-600">
                              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                              <span className="text-neutral-400">Operator note:</span>
                              <span className="font-medium text-neutral-800">
                                {row.feedback}
                              </span>
                            </div>
                          )}

                          {/* Formatted Payload */}
                          <pre className="mt-2.5 max-h-48 overflow-auto rounded-xl border border-black/[0.06] bg-white px-3 py-2.5 font-mono text-[11.5px] leading-relaxed text-neutral-800">
                            {JSON.stringify(row.arguments, null, 2)}
                          </pre>

                          {/* Chain metadata */}
                          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-400">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono">
                              <span>rule: {row.rule_triggered}</span>
                              {row.plugin_triggered && (
                                <span>guard: {row.plugin_triggered}</span>
                              )}
                              <span>
                                sha256: {shortHash(row.prev_hash)} &rarr;{" "}
                                {shortHash(row.entry_hash)}
                              </span>
                            </div>
                            <span className="font-mono">
                              {row.timestamp.replace("T", " ").slice(0, 19)} UTC
                            </span>
                          </div>

                          {/* Inline Actions (exact pill geometry from 2.design.mp4) */}
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onRetestInSimulator(row.tool_name, row.arguments);
                              }}
                              className="inline-flex items-center gap-1.5 rounded-full bg-[#2563EB] px-3.5 py-1.5 text-[12px] font-medium text-white shadow-xs transition-all hover:bg-blue-700 active:scale-[0.98] cursor-pointer"
                            >
                              <FlaskConical className="h-3.5 w-3.5" />
                              Re-test in simulator
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopy(row);
                              }}
                              className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.09] bg-white px-3.5 py-1.5 text-[12px] font-medium text-neutral-700 transition-colors hover:bg-neutral-50 cursor-pointer"
                            >
                              {copiedId === row.id ? (
                                <>
                                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                                  Copied hash
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3.5 w-3.5 text-neutral-400" />
                                  Copy hash
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer: Active Plug-in Pipeline Strip (inspired by 1.design.mp4 check strip) */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-black/[0.055] px-5 py-3">
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
          {plugins.map((plugin) => (
            <div
              key={plugin.name}
              className="relative"
              onMouseEnter={() => setHoveredPlugin(plugin.name)}
              onMouseLeave={() =>
                setHoveredPlugin((curr) => (curr === plugin.name ? null : curr))
              }
            >
              <span className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[12px] text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 cursor-default">
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                <span className="font-mono text-[11.5px] font-medium text-neutral-700">
                  {plugin.name}
                </span>
              </span>

              <AnimatePresence>
                {hoveredPlugin === plugin.name && (
                  <motion.div
                    initial={{ opacity: 0, y: 4, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 3, scale: 0.98 }}
                    transition={{ duration: 0.12 }}
                    className="veto-popover pointer-events-none absolute bottom-full left-0 z-30 mb-2 w-64 rounded-xl px-3 py-2 text-left"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11.5px] font-medium text-neutral-900">
                        {plugin.name}
                      </span>
                      <span className="text-[10.5px] font-medium text-emerald-600">
                        active
                      </span>
                    </div>
                    <p className="mt-1 text-[11.5px] leading-snug text-neutral-500">
                      {plugin.description}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[11.5px] text-neutral-400">
            {plugins.length} guards &middot; fail-closed
          </span>
          {compact && onViewAll && (
            <button
              type="button"
              onClick={onViewAll}
              className="text-[12px] font-medium text-[#2563EB] hover:underline cursor-pointer"
            >
              View all &rarr;
            </button>
          )}
        </div>
      </div>
    </motion.section>
  );
}
