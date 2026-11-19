import { motion } from "motion/react";
import { CheckCircle2, Clock } from "lucide-react";
import type { AuditLogItem, PendingApproval } from "../types";
import {
  SPRING_GENTLE,
  decisionMeta,
  formatRelativeTime,
  summarizeArgs,
} from "../utils";
import { ApprovalDock } from "./ApprovalDock";

interface ApprovalsPageProps {
  pending: PendingApproval[];
  logs: AuditLogItem[];
  onDecide: (id: string, approved: boolean, feedback: string) => Promise<void>;
}

export function ApprovalsPage({ pending, logs, onDecide }: ApprovalsPageProps) {
  const pastDecisions = logs
    .filter(
      (item) =>
        item.effective_decision === "APPROVED" ||
        item.effective_decision === "DENIED" ||
        item.effective_decision === "TIMEOUT"
    )
    .slice(0, 30);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={SPRING_GENTLE}
      className="space-y-4"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold text-neutral-900">
            Approvals
          </h1>
          <p className="mt-0.5 text-xs text-neutral-500">
            High-risk tool calls paused for operator decision.
          </p>
        </div>
      </div>

      {/* Live Waiting Queue */}
      {pending.length > 0 ? (
        <ApprovalDock pending={pending} onDecide={onDecide} />
      ) : (
        <section className="agenve2-card flex flex-col items-center justify-center rounded-xl px-6 py-10 text-center">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <CheckCircle2 size={20} strokeWidth={1.75} aria-hidden="true" />
          </div>
          <p className="mt-2.5 text-sm font-medium text-neutral-800">
            No approvals waiting
          </p>
          <p className="mt-0.5 max-w-sm text-xs text-neutral-400">
            Tools with action <code className="font-mono text-neutral-600">require_approval</code> will pause here.
          </p>
        </section>
      )}

      {/* Decision history list */}
      <section className="agenve2-card overflow-hidden rounded-xl">
        <div className="flex items-center justify-between border-b border-black/[0.08] px-4 py-3">
          <div className="flex items-center gap-2">
            <Clock size={16} strokeWidth={1.75} aria-hidden="true" className="icon-optical text-neutral-400" />
            <h2 className="text-xs font-semibold text-neutral-900">
              Decision history
            </h2>
          </div>
          <span className="font-mono text-xs text-neutral-400 tabular-nums">
            {pastDecisions.length} recorded
          </span>
        </div>

        <div className="px-4 py-2">
          {pastDecisions.length === 0 ? (
            <p className="py-6 text-center text-xs text-neutral-400">
              No decisions recorded yet.
            </p>
          ) : (
            <div className="divide-y divide-black/[0.04]">
              {pastDecisions.map((row) => {
                const meta = decisionMeta(row.effective_decision);
                const preview = summarizeArgs(row.arguments);
                const isApproved = row.effective_decision === "APPROVED";

                return (
                  <div
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          isApproved ? "bg-violet-500" : "bg-rose-500"
                        }`}
                      />
                      <span className="font-mono text-xs font-medium text-neutral-900">
                        {row.tool_name}
                      </span>
                      {preview && (
                        <span className="truncate font-mono text-xs text-neutral-400">
                          {preview}
                        </span>
                      )}
                      {row.feedback && (
                        <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600">
                          {row.feedback}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 font-mono text-xs text-neutral-400 tabular-nums">
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[10.5px] font-medium ${
                          isApproved
                            ? "bg-violet-50 text-violet-700"
                            : "bg-rose-50 text-rose-700"
                        }`}
                      >
                        {meta.label}
                      </span>
                      <span>{formatRelativeTime(row.timestamp)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </motion.div>
  );
}
