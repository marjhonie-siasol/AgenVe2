import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, ChevronUp, MessageSquare } from "lucide-react";
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
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={SPRING_SNAPPY}
      className="border-t border-black/[0.055] first:border-t-0"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left cursor-pointer"
        >
          <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500 ring-3 ring-amber-100" />
          <span className="font-mono text-[12.5px] font-semibold text-neutral-900">
            {ticket.tool_name}
          </span>
          {preview && (
            <span className="truncate font-mono text-[12px] text-neutral-500">
              {preview}
            </span>
          )}
          <span className="hidden text-[11.5px] text-neutral-400 sm:inline">
            &middot; {ticket.agent_name}
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`font-mono text-[11.5px] ${
              remaining <= 15 ? "font-medium text-rose-600" : "text-neutral-400"
            }`}
          >
            {remaining}s
          </span>

          <button
            type="button"
            disabled={busy}
            onClick={() => submit(false)}
            className="rounded-lg border border-black/[0.09] bg-white px-2.5 py-1 text-[12px] font-medium text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-50 cursor-pointer"
          >
            Deny
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => submit(true)}
            className="rounded-lg bg-blue-50 px-2.5 py-1 text-[12px] font-medium text-blue-600 transition-colors hover:bg-blue-100 disabled:opacity-50 cursor-pointer"
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
            <div className="rounded-xl border border-black/[0.06] bg-[#FAFAFA] p-3">
              {ticket.message && (
                <p className="text-[12px] text-neutral-600">{ticket.message}</p>
              )}

              <pre className="mt-2 max-h-36 overflow-auto rounded-lg border border-black/[0.06] bg-white px-3 py-2 font-mono text-[11.5px] leading-relaxed text-neutral-800">
                {JSON.stringify(ticket.arguments, null, 2)}
              </pre>

              <div className="mt-2.5 flex items-center gap-2">
                <div className="relative flex-1">
                  <MessageSquare className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
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
                    placeholder="Optional note sent back to the AI agent (e.g. post in #dev-test instead)..."
                    className="w-full rounded-lg border border-black/[0.08] bg-white pl-8 pr-3 py-1.5 text-[12px] text-neutral-800 placeholder:text-neutral-400 focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/10"
                  />
                </div>
                <span className="hidden font-mono text-[10.5px] text-neutral-400 sm:inline">
                  {ticket.id}
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
          initial={{ opacity: 0, y: 12, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.985 }}
          transition={SPRING_SNAPPY}
          className="agenve2-card overflow-hidden rounded-[18px] border-amber-300/60"
        >
          {/* Header mimicking 3.design.mp4: "1 waiting on you" */}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="flex w-full items-center justify-between bg-amber-50/45 px-4 py-2 text-left transition-colors hover:bg-amber-50/70 cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-[12.5px] font-semibold text-neutral-900">
                {pending.length} {pending.length === 1 ? "approval" : "approvals"}
              </span>
              <span className="text-[12.5px] text-amber-700">
                {pending.length} waiting on you
              </span>
            </div>
            <span className="text-neutral-400">
              {collapsed ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
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
                <AnimatePresence initial={false}>
                  {pending.map((ticket, index) => (
                    <ApprovalTicketRow
                      key={ticket.id}
                      ticket={ticket}
                      defaultOpen={index === 0}
                      onDecide={onDecide}
                    />
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
