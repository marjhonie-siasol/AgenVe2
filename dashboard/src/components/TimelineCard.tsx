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
    ? { dot: "bg-rose-500", text: "text-rose-700 bg-rose-50", label: "Halted" }
    : pendingCount > 0
      ? {
          dot: "bg-amber-500",
          text: "text-amber-700 bg-amber-50",
          label: `${pendingCount} waiting on you`,
        }
      : mode === "dry_run"
        ? { dot: "bg-amber-500", text: "text-amber-700 bg-amber-50", label: "Dry-run" }
        : { dot: "bg-emerald-500", text: "text-emerald-700 bg-emerald-50", label: "Enforcing" };

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
      className="agenve2-card relative rounded-xl"
    >
      {/* Header row — quiet, editorial */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-medium text-neutral-900">
            {compact ? "Recent executions" : "Execution timeline"}
          </h2>
          <span className="font-mono text-xs text-neutral-400 tabular-nums">
            #{stats.total}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 font-mono text-xs text-neutral-400 tabular-nums">
            <span className="text-emerald-600">+{stats.allowed} allowed</span>
            <span>&middot;</span>
            <span className="text-rose-600">-{stats.blocked} blocked</span>
            <span>&middot;</span>
            <span>{stats.avg_latency_ms}ms avg</span>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${statusIndicator.text}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${statusIndicator.dot}`} />
            {statusIndicator.label}
          </span>
        </div>
      </div>

      {/* Inline search + filter strip — 8px outer radius, 6px inner */}
      {!compact && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-y border-black/[0.08] bg-neutral-50/60 px-4 py-2">
          <div className="flex flex-wrap items-center rounded-lg bg-neutral-100 p-0.5">
            {FILTER_OPTIONS.map((opt) => {
              const active = filterDecision === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => onFilterChange(opt.id)}
                  className={`relative rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                    active
                      ? "text-neutral-900"
                      : "text-neutral-500 hover:text-neutral-800"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="timeline-filter-pill"
                      transition={SPRING_SNAPPY}
                      className="absolute inset-0 rounded-md bg-white shadow-xs"
                    />
                  )}
                  <span className="relative z-10">{opt.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} strokeWidth={1.75} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Filter tool, agent..."
                className="h-8 w-44 rounded-lg border border-black/[0.08] bg-white pl-8 pr-3 text-xs text-neutral-800 placeholder:text-neutral-400 transition-all focus:w-56 focus:border-blue-500/40 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
              />
            </div>

            <div className="flex items-center gap-1 border-l border-black/[0.08] pl-2">
              <a
                href="/api/logs/export?fmt=csv"
                title="Export CSV"
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
              >
                <Download size={13} strokeWidth={1.75} aria-hidden="true" className="icon-optical" />
                CSV
              </a>
              <a
                href="/api/logs/export?fmt=json"
                title="Export JSON"
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
              >
                JSON
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Execution Node Rail */}
      <div className="px-4 py-3">
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-100 text-neutral-400">
              <ShieldCheck size={20} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <p className="mt-3 text-sm font-medium text-neutral-700">
              Listening for tool executions
            </p>
            <p className="mt-1 max-w-sm text-xs text-neutral-400">
              Run an agent via <code className="font-mono text-neutral-600">agenve2 proxy</code> or pick any quick test preset above.
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
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={SPRING_GENTLE}
                  className="relative"
                >
                  {/* Vertical connecting rail line */}
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
                    className={`group relative flex items-center justify-between gap-3 rounded-lg py-2 pl-7 pr-2.5 transition-colors cursor-pointer ${
                      isExpanded
                        ? "bg-neutral-100/70"
                        : "hover:bg-neutral-50"
                    }`}
                  >
                    {/* Rail Node Dot */}
                    <span className="pointer-events-none absolute left-[5px] top-1/2 -translate-y-1/2 flex h-3.5 w-3.5 items-center justify-center">
                      {blocked ? (
                        <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-rose-500 text-[8.5px] font-bold text-white shadow-2xs">
                          !
                        </span>
                      ) : row.effective_decision === "APPROVED" ? (
                        <span className="h-2 w-2 rounded-full bg-violet-500 ring-2 ring-violet-100" />
                      ) : row.dry_run ? (
                        <span className="h-2 w-2 rounded-full bg-amber-500 ring-2 ring-amber-100" />
                      ) : (
                        <span className="h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-emerald-100" />
                      )}
                    </span>

                    {/* Left: Tool Name + Arg preview + Tag */}
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span
                        className={`truncate font-mono text-xs font-medium ${
                          blocked ? "text-rose-700 font-semibold" : "text-neutral-900"
                        }`}
                      >
                        {row.tool_name}
                      </span>

                      {preview && (
                        <span className="hidden truncate font-mono text-xs text-neutral-400 sm:inline">
                          {preview}
                        </span>
                      )}

                      {tagText && (
                        <span
                          className={`shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10.5px] font-medium ${
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
                    </div>

                    {/* Right: Short Hash · Agent · Latency · Relative Time */}
                    <div className="flex shrink-0 items-center gap-2 font-mono text-xs text-neutral-400 tabular-nums">
                      <span className="hidden text-neutral-300 md:inline">
                        {shortHash(row.entry_hash)}
                      </span>
                      <span className="hidden font-sans text-xs text-neutral-500 sm:inline">
                        {row.agent_name}
                      </span>
                      <span className="text-neutral-400">
                        {row.latency_ms}ms
                      </span>
                      <span className="w-8 text-right font-sans text-xs text-neutral-400">
                        {formatRelativeTime(row.timestamp)}
                      </span>
                    </div>

                    {/* Hover Inspection Popover */}
                    <AnimatePresence>
                      {hoveredRowId === row.id && !isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, y: 3, scale: 0.985 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 2, scale: 0.985 }}
                          transition={{ duration: 0.12 }}
                          onClick={(e) => e.stopPropagation()}
                          className="agenve2-popover pointer-events-none absolute left-6 bottom-full z-30 mb-2 w-96 max-w-[calc(100vw-4rem)] rounded-xl p-3 text-left"
                        >
                          <div className="flex items-center justify-between border-b border-black/[0.06] pb-2">
                            <span className="text-xs font-medium text-neutral-600">
                              Intercepted by{" "}
                              <span className="font-mono text-neutral-900 font-semibold">
                                {row.plugin_triggered || row.rule_triggered}
                              </span>
                            </span>
                            <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[10.5px] font-medium text-rose-600">
                              {meta.label}
                            </span>
                          </div>

                          <div className="mt-2 space-y-1.5">
                            <div className="flex items-start gap-2">
                              <span className="mt-0.5 h-3.5 w-[2px] shrink-0 rounded-full bg-rose-400" />
                              <span className="w-10 shrink-0 text-xs text-neutral-400">
                                Args
                              </span>
                              <code className="truncate font-mono text-xs text-neutral-800">
                                {JSON.stringify(row.arguments)}
                              </code>
                            </div>

                            <div className="flex items-start gap-2">
                              <span className="mt-0.5 h-3.5 w-[2px] shrink-0 rounded-full bg-blue-400" />
                              <span className="w-10 shrink-0 text-xs text-neutral-400">
                                Reason
                              </span>
                              <span className="text-xs leading-snug text-neutral-700">
                                {row.reason}
                              </span>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Click-to-Expand Inline Drawer */}
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
                        <div className="my-2 rounded-lg border border-black/[0.08] bg-[#FAFAFA] p-3">
                          {/* Reason + Decision */}
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="flex items-start gap-2">
                              {blocked ? (
                                <AlertCircle size={14} strokeWidth={1.75} aria-hidden="true" className="mt-0.5 shrink-0 text-rose-500" />
                              ) : (
                                <Check size={14} strokeWidth={1.75} aria-hidden="true" className="mt-0.5 shrink-0 text-emerald-600" />
                              )}
                              <p className="text-xs text-neutral-700">
                                {row.reason}
                              </p>
                            </div>
                            <span
                              className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium ${meta.pillClass}`}
                            >
                              {meta.label}
                            </span>
                          </div>

                          {/* Operator note (if any) */}
                          {row.feedback && (
                            <div className="mt-2 flex items-center gap-2 rounded-md border border-black/[0.06] bg-white px-2 py-1 text-xs text-neutral-600">
                              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                              <span className="text-neutral-400">Note:</span>
                              <span className="font-medium text-neutral-800">{row.feedback}</span>
                            </div>
                          )}

                          {/* Payload */}
                          <pre className="mt-2 max-h-36 overflow-auto rounded-md border border-black/[0.06] bg-white p-2.5 font-mono text-xs leading-relaxed text-neutral-800">
                            {JSON.stringify(row.arguments, null, 2)}
                          </pre>

                          {/* Minimal provenance line */}
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-neutral-400 tabular-nums">
                            <span>
                              rule: {row.rule_triggered} &middot; sha256: {shortHash(row.entry_hash)}
                            </span>
                            <span>{row.timestamp.replace("T", " ").slice(0, 19)} UTC</span>
                          </div>

                          {/* Action buttons — 8px radius */}
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onRetestInSimulator(row.tool_name, row.arguments);
                              }}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 cursor-pointer"
                            >
                              <FlaskConical size={14} strokeWidth={1.75} aria-hidden="true" className="icon-optical" />
                              Re-test in simulator
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopy(row);
                              }}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 cursor-pointer"
                            >
                              {copiedId === row.id ? (
                                <>
                                  <Check size={13} strokeWidth={2} aria-hidden="true" className="icon-optical text-emerald-600" />
                                  Copied
                                </>
                              ) : (
                                <>
                                  <Copy size={13} strokeWidth={1.75} aria-hidden="true" className="icon-optical text-neutral-400" />
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

      {/* Footer: Quiet active plugins strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-black/[0.08] px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {plugins.map((plugin) => (
            <div
              key={plugin.name}
              className="relative"
              onMouseEnter={() => setHoveredPlugin(plugin.name)}
              onMouseLeave={() =>
                setHoveredPlugin((curr) => (curr === plugin.name ? null : curr))
              }
            >
              <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-neutral-600 transition-colors hover:bg-neutral-100 cursor-default">
                <Check size={12} strokeWidth={2} aria-hidden="true" className="icon-optical text-emerald-600" />
                <span className="font-mono text-xs text-neutral-700">
                  {plugin.name}
                </span>
              </span>

              <AnimatePresence>
                {hoveredPlugin === plugin.name && (
                  <motion.div
                    initial={{ opacity: 0, y: 3, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 2, scale: 0.98 }}
                    transition={{ duration: 0.1 }}
                    className="agenve2-popover pointer-events-none absolute bottom-full left-0 z-30 mb-1.5 w-60 rounded-xl p-2.5 text-left"
                  >
                    <span className="font-mono text-xs font-semibold text-neutral-900">
                      {plugin.name}
                    </span>
                    <p className="mt-1 text-xs leading-snug text-neutral-500">
                      {plugin.description}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-400">
            {plugins.length} guards active
          </span>
          {compact && onViewAll && (
            <button
              type="button"
              onClick={onViewAll}
              className="text-xs font-medium text-[#2563EB] hover:underline cursor-pointer"
            >
              View all &rarr;
            </button>
          )}
        </div>
      </div>
    </motion.section>
  );
}
