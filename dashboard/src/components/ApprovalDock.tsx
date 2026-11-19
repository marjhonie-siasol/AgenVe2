import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, ChevronDown, ChevronUp, MessageSquare } from "lucide-react";
import type { PendingApproval } from "../types";
import { SPRING_GENTLE, SPRING_SNAPPY, summarizeArgs } from "../utils";

interface ApprovalTicketRowProps {
  ticket: PendingApproval;
  defaultOpen?: boolean;
  onDecide: (id: string, approved: boolean, feedback: string) => Promise<void>;
}

function ApprovalTicketRow({
  ticket,
  defaultOpen = false,
  onDecide,
}: ApprovalTicketRowProps) {
  const [expanded, setExpanded] = useState(defaultOpen);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const remaining = useMemo(() => {
    const created = new Date(
      ticket.created_at.endsWith("Z") ? ticket.created_at : `${ticket.created_at}Z`
    ).getTime();
    const elapsed = Math.floor((nowMs - created) / 1000);
    return Math.max(0, ticket.timeout_seconds - elapsed);
  }, [nowMs, ticket.created_at, ticket.timeout_seconds]);

  const submit = async (approved: boolean) => {
    setBusy(true);
    try {
      await onDecide(ticket.id, approved, feedback);
    } finally {
      setBusy(false);
    }
  };

  const preview = summarizeArgs(ticket.arguments);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={SPRING_SNAPPY}
      className="border-t border-black/[0.08] first:border-t-0 bg-white"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left cursor-pointer"
        >
          <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
          <span className="font-mono text-xs font-medium text-neutral-900">
            {ticket.tool_name}
          </span>
          {preview && (
            <span className="truncate font-mono text-xs text-neutral-500">
              {preview}
            </span>
          )}
          <span className="hidden text-xs text-neutral-400 sm:inline">
            &middot; {ticket.agent_name}
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`font-mono text-xs tabular-nums ${
              remaining <= 15 ? "text-rose-600 font-medium" : "text-neutral-400"
            }`}
          >
            {remaining}s
          </span>

          <button
            type="button"
            disabled={busy}
            onClick={() => submit(false)}
            className="rounded-lg border border-black/[0.08] bg-white px-3 py-1 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50 cursor-pointer"
          >
            Deny
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => submit(true)}
            className="rounded-lg bg-[#2563EB] px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
          >
            Allow
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={SPRING_GENTLE}
            className="overflow-hidden px-4 pb-3"
          >
            <div className="rounded-lg border border-black/[0.08] bg-[#FAFAFA] p-3">
              {ticket.message && (
                <p className="text-xs text-neutral-600 mb-2">{ticket.message}</p>
              )}

              <pre className="max-h-36 overflow-auto rounded-md border border-black/[0.06] bg-white px-3 py-2 font-mono text-xs leading-relaxed text-neutral-800">
                {JSON.stringify(ticket.arguments, null, 2)}
              </pre>

              <div className="mt-2.5 flex items-center gap-2">
                <div className="relative flex-1">
                  <MessageSquare size={14} strokeWidth={1.75} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <input
                    type="text"
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !busy) {
                        e.preventDefault();
                        submit(false);
                      }
                    }}
                    placeholder="Note for agent (optional)..."
                    className="h-8 w-full rounded-lg border border-black/[0.08] bg-white pl-8 pr-3 text-xs text-neutral-800 placeholder:text-neutral-400 focus:border-blue-500/40 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                  />
                </div>
                <span className="hidden font-mono text-xs text-neutral-400 sm:inline tabular-nums">
                  {ticket.id.slice(0, 8)}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

interface ApprovalDockProps {
  pending: PendingApproval[];
  onDecide: (id: string, approved: boolean, feedback: string) => Promise<void>;
}

export function ApprovalDock({ pending, onDecide }: ApprovalDockProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <AnimatePresence>
      {pending.length > 0 && (
        <motion.div
          key="approval-dock"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={SPRING_SNAPPY}
          className="agenve2-card overflow-hidden rounded-xl border border-amber-200"
        >
          {/* Header */}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="flex w-full items-center justify-between bg-amber-50/60 px-4 py-2.5 text-left transition-colors hover:bg-amber-50/90 cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              <span className="text-xs font-medium text-neutral-900">
                {pending.length} {pending.length === 1 ? "call" : "calls"} waiting on you
              </span>
            </div>
            <span className="text-neutral-400">
              {collapsed ? (
                <ChevronUp size={16} strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
              )}
            </span>
          </button>

          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={SPRING_GENTLE}
                className="overflow-hidden"
              >
                {pending.map((ticket, index) => (
                  <ApprovalTicketRow
                    key={ticket.id}
                    ticket={ticket}
                    defaultOpen={index === 0}
                    onDecide={onDecide}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
