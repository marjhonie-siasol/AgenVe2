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
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={SPRING_GENTLE}
      className="space-y-4"
    >
      <div>
        <h1 className="text-[18px] font-semibold tracking-[-0.02em] text-neutral-900">
          Approvals
        </h1>
        <p className="mt-0.5 text-[12.5px] text-neutral-500">
          Paused high-risk tool calls awaiting operator sign-off, with optional
          feedback returned to the agent.
        </p>
      </div>

      {/* Live Waiting Queue */}
      {pending.length > 0 ? (
        <ApprovalDock pending={pending} onDecide={onDecide} />
      ) : (
        <section className="agenve2-card flex flex-col items-center justify-center rounded-[20px] px-6 py-12 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <p className="mt-3 text-[13.5px] font-medium text-neutral-800">
            No approvals waiting
          </p>
          <p className="mt-1 max-w-sm text-[12.5px] text-neutral-400">
            When an agent invokes a tool marked{" "}
            <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11.5px] text-neutral-700">
              require_approval
            </code>{" "}
            (such as{" "}
            <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11.5px] text-neutral-700">
              slack_post
            </code>
            ), it will pause here in real time.
          </p>
        </section>
      )}

      {/* Recent Human Decisions Rail (inspired by 3.design.mp4 "Asked: ... -> You: Allow") */}
      <section className="agenve2-card overflow-hidden rounded-[20px]">
        <div className="flex items-center justify-between border-b border-black/[0.055] px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-neutral-400" />
            <h2 className="text-[14px] font-semibold tracking-[-0.015em] text-neutral-900">
              Decision history
            </h2>
          </div>
          <span className="font-mono text-[12px] text-neutral-400">
            {pastDecisions.length} recorded
          </span>
        </div>

        <div className="px-5 py-3">
          {pastDecisions.length === 0 ? (
            <p className="py-6 text-center text-[12.5px] text-neutral-400">
              No human approval decisions recorded yet.
            </p>
          ) : (
            <div className="relative">
              {pastDecisions.map((row, idx) => {
                const meta = decisionMeta(row.effective_decision);
                const isFirst = idx === 0;
                const isLast = idx === pastDecisions.length - 1;
                const preview = summarizeArgs(row.arguments);
                return (
                  <div
                    key={row.id}
                    className="relative flex flex-wrap items-start justify-between gap-2 py-2.5 pl-7"
                  >
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
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none absolute left-[7.5px] top-[15px] h-[8px] w-[8px] rounded-full ring-2 ring-white ${meta.dotClass}`}
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[13px] font-medium text-neutral-900">
                          {row.tool_name}
                        </span>
                        {preview && (
                          <span className="truncate font-mono text-[12px] text-neutral-400">
                            {preview}
                          </span>
                        )}
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${meta.pillClass}`}
                        >
                          {meta.label}
                        </span>
                      </div>
                      {row.feedback && (
                        <p className="mt-1 text-[12px] text-neutral-600">
                          <span className="text-neutral-400">Note: </span>
                          {row.feedback}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2 text-[12px] text-neutral-400">
                      <span>{row.agent_name}</span>
                      <span>&middot;</span>
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
