import type { AuditLogItem } from "./types";

export const QUICK_TESTS: Array<{
  label: string;
  tool: string;
  args: string;
  tone: "safe" | "danger" | "warn";
}> = [
  {
    label: "Safe SELECT",
    tool: "postgres_query",
    args: JSON.stringify({ query: "SELECT * FROM orders LIMIT 10" }, null, 2),
    tone: "safe",
  },
  {
    label: "DROP TABLE",
    tool: "postgres_query",
    args: JSON.stringify({ query: "DROP TABLE orders;" }, null, 2),
    tone: "danger",
  },
  {
    label: "Read .env",
    tool: "read_file",
    args: JSON.stringify({ path: ".env" }, null, 2),
    tone: "danger",
  },
  {
    label: "Shell rm -rf",
    tool: "run_shell",
    args: JSON.stringify({ command: "ls && rm -rf /" }, null, 2),
    tone: "danger",
  },
  {
    label: "Refund $5000",
    tool: "refund_customer",
    args: JSON.stringify({ user_id: 42, amount: 5000 }, null, 2),
    tone: "danger",
  },
  {
    label: "Slack Post",
    tool: "slack_post",
    args: JSON.stringify(
      { channel: "#dev-updates", text: "Fixed order #8842" },
      null,
      2
    ),
    tone: "warn",
  },
];

export const SPRING_SNAPPY = {
  type: "spring" as const,
  stiffness: 460,
  damping: 34,
  mass: 0.85,
};

export const SPRING_GENTLE = {
  type: "spring" as const,
  stiffness: 340,
  damping: 30,
  mass: 0.9,
};

export function formatRelativeTime(iso: string): string {
  const ts = new Date(iso.endsWith("Z") ? iso : `${iso}Z`).getTime();
  if (Number.isNaN(ts)) return iso.slice(11, 16);
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 15) return "now";
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d`;
}

export function shortHash(hash: string): string {
  if (!hash) return "000000";
  return hash.slice(0, 6);
}

export function summarizeArgs(args: Record<string, unknown>): string {
  if (!args || Object.keys(args).length === 0) return "";
  const priorityKeys = ["query", "command", "path", "channel", "text", "url", "amount"];
  for (const key of priorityKeys) {
    if (key in args && args[key] !== undefined && args[key] !== null) {
      const val = String(args[key]);
      if (key === "amount") {
        const extra = args.user_id ? ` · user #${args.user_id}` : "";
        return `$${val}${extra}`;
      }
      return val.length > 46 ? `${val.slice(0, 46)}…` : val;
    }
  }
  const firstKey = Object.keys(args)[0];
  const raw = `${firstKey}: ${String(args[firstKey])}`;
  return raw.length > 46 ? `${raw.slice(0, 46)}…` : raw;
}

export function decisionMeta(decision: string): {
  label: string;
  dotClass: string;
  pillClass: string;
  tagClass: string;
  barClass: string;
  isAlert: boolean;
} {
  switch (decision) {
    case "ALLOW":
      return {
        label: "Allowed",
        dotClass: "bg-emerald-500",
        pillClass: "text-emerald-700 bg-emerald-50 border-emerald-200/80",
        tagClass: "text-emerald-700 bg-emerald-50/90",
        barClass: "bg-emerald-500",
        isAlert: false,
      };
    case "APPROVED":
      return {
        label: "Approved",
        dotClass: "bg-violet-500",
        pillClass: "text-violet-700 bg-violet-50 border-violet-200/80",
        tagClass: "text-violet-700 bg-violet-50/90",
        barClass: "bg-violet-500",
        isAlert: false,
      };
    case "REQUIRE_APPROVAL":
    case "PENDING":
      return {
        label: "Approval",
        dotClass: "bg-amber-500",
        pillClass: "text-amber-700 bg-amber-50 border-amber-200/80",
        tagClass: "text-amber-700 bg-amber-50/90",
        barClass: "bg-amber-500",
        isAlert: true,
      };
    case "DENIED":
      return {
        label: "Denied",
        dotClass: "bg-rose-500",
        pillClass: "text-rose-700 bg-rose-50 border-rose-200/80",
        tagClass: "text-rose-700 bg-rose-50/90",
        barClass: "bg-rose-500",
        isAlert: true,
      };
    case "TIMEOUT":
      return {
        label: "Timed out",
        dotClass: "bg-amber-600",
        pillClass: "text-amber-800 bg-amber-50 border-amber-200/80",
        tagClass: "text-amber-800 bg-amber-50/90",
        barClass: "bg-amber-500",
        isAlert: true,
      };
    default:
      return {
        label: "Blocked",
        dotClass: "bg-rose-500",
        pillClass: "text-rose-700 bg-rose-50 border-rose-200/80",
        tagClass: "text-rose-700 bg-rose-50/90",
        barClass: "bg-rose-500",
        isAlert: true,
      };
  }
}

export function isRowBlocked(row: AuditLogItem): boolean {
  return (
    row.effective_decision === "BLOCK" ||
    row.effective_decision === "DENIED" ||
    row.effective_decision === "TIMEOUT"
  );
}
