import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircle,
  ArrowUp,
  CheckCircle2,
  Clock,
  FileCode2,
  FlaskConical,
  Terminal,
} from "lucide-react";
import type { SimulationResult } from "../types";
import {
  QUICK_TESTS,
  SPRING_GENTLE,
  SPRING_SNAPPY,
  decisionMeta,
  summarizeArgs,
} from "../utils";

export interface SimulationHistoryItem {
  id: number;
  tool: string;
  args: Record<string, unknown>;
  result: SimulationResult;
}

interface SimulatorPageProps {
  tool: string;
  args: string;
  policyPath: string;
  result: SimulationResult | null;
  error: string | null;
  busy: boolean;
  history: SimulationHistoryItem[];
  onToolChange: (value: string) => void;
  onArgsChange: (value: string) => void;
  onSimulate: (overrideTool?: string, overrideArgs?: string) => Promise<void>;
}

export function SimulatorPage({
  tool,
  args,
  policyPath,
  result,
  error,
  busy,
  history,
  onToolChange,
  onArgsChange,
  onSimulate,
}: SimulatorPageProps) {
  const resultMeta = result ? decisionMeta(result.effective_decision) : null;

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
          Rule simulator
        </h1>
        <p className="mt-0.5 text-[12.5px] text-neutral-500">
          Dry-run any tool call against{" "}
          <code className="rounded bg-neutral-200/70 px-1.5 py-0.5 font-mono text-[11.5px] text-neutral-700">
            {policyPath}
          </code>{" "}
          without executing tools or triggering approvals.
        </p>
      </div>

      {/* Quick Preset Pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        {QUICK_TESTS.map((qt) => {
          const isSelected = tool === qt.tool && args.trim() === qt.args.trim();
          const dotColor =
            qt.tone === "safe"
              ? "bg-emerald-500"
              : qt.tone === "warn"
                ? "bg-amber-500"
                : "bg-rose-500";
          return (
            <motion.button
              key={qt.label}
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                onToolChange(qt.tool);
                onArgsChange(qt.args);
                onSimulate(qt.tool, qt.args);
              }}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-all cursor-pointer ${
                isSelected
                  ? "border-blue-300 bg-blue-50/75 text-blue-700 shadow-2xs"
                  : "border-black/[0.075] bg-white text-neutral-600 shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:border-black/[0.14] hover:text-neutral-900"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
              {qt.label}
            </motion.button>
          );
        })}
      </div>

      {/* Clean 2-Column Practical Workspace: Composer Left + Live Verdict Right */}
      <div className="grid gap-4 lg:grid-cols-12">
        {/* Composer Card (1.draft.jpg tactile language) */}
        <section className="veto-card flex flex-col justify-between rounded-[20px] p-4 lg:col-span-7">
          <div>
            <div className="flex items-center justify-between pb-2.5">
              <label className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-neutral-50 px-3 py-1 text-[12px] text-neutral-600 focus-within:border-blue-400 focus-within:bg-white">
                <Terminal className="h-3.5 w-3.5 text-neutral-400" />
                <input
                  type="text"
                  value={tool}
                  onChange={(e) => onToolChange(e.target.value)}
                  aria-label="Tool name"
                  placeholder="tool_name"
                  className="w-44 bg-transparent font-mono text-[12.5px] font-medium text-neutral-900 focus:outline-none"
                />
              </label>

              <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-neutral-500">
                <FileCode2 className="h-3 w-3 text-neutral-400" />
                <span className="max-w-[140px] truncate font-mono">
                  {policyPath}
                </span>
              </span>
            </div>

            <textarea
              value={args}
              onChange={(e) => onArgsChange(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  onSimulate();
                }
              }}
              rows={7}
              spellCheck={false}
              placeholder='{"query": "DROP TABLE orders;"}'
              className="w-full rounded-xl border border-black/[0.065] bg-[#FAFAFA] p-3.5 font-mono text-[12.5px] leading-relaxed text-neutral-800 placeholder:font-sans placeholder:text-neutral-400 focus:border-blue-500/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10"
            />
          </div>

          <div className="mt-3 flex items-center justify-between pt-1">
            <span className="text-[11.5px] text-neutral-400">
              Press <kbd className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10.5px] text-neutral-600">Ctrl+Enter</kbd> to evaluate
            </span>

            <motion.button
              type="button"
              disabled={busy}
              whileTap={{ scale: 0.96 }}
              onClick={() => onSimulate()}
              className="inline-flex items-center gap-2 rounded-full bg-[#2563EB] pl-4 pr-2.5 py-1.5 text-[12.5px] font-medium text-white shadow-xs transition-colors hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
            >
              <span>{busy ? "Evaluating..." : "Run simulation"}</span>
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/15">
                <ArrowUp className="h-3.5 w-3.5 stroke-[2.25]" />
              </span>
            </motion.button>
          </div>
        </section>

        {/* Verdict Inspector Card */}
        <section className="veto-card flex flex-col rounded-[20px] p-4 lg:col-span-5">
          <div className="flex items-center justify-between border-b border-black/[0.055] pb-2.5">
            <span className="text-[13px] font-semibold text-neutral-900">
              Evaluation verdict
            </span>
            {result && (
              <span className="font-mono text-[11.5px] text-neutral-400">
                {result.latency_ms}ms
              </span>
            )}
          </div>

          <div className="flex flex-1 flex-col justify-center py-4">
            <AnimatePresence mode="wait">
              {error ? (
                <motion.div
                  key="err"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={SPRING_SNAPPY}
                  className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50/70 p-3 text-[12.5px] text-rose-700"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </motion.div>
              ) : result && resultMeta ? (
                <motion.div
                  key={`${tool}-${result.effective_decision}-${result.latency_ms}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={SPRING_SNAPPY}
                  className="space-y-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-semibold ${resultMeta.pillClass}`}
                    >
                      {result.effective_decision === "ALLOW" ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : result.effective_decision === "REQUIRE_APPROVAL" ? (
                        <Clock className="h-3.5 w-3.5" />
                      ) : (
                        <AlertCircle className="h-3.5 w-3.5" />
                      )}
                      {result.effective_decision}
                    </span>

                    <span className="rounded-md bg-neutral-100 px-2 py-0.5 font-mono text-[11px] text-neutral-600">
                      {result.plugin_triggered || result.rule_triggered}
                    </span>
                  </div>

                  <p className="text-[12.5px] leading-relaxed text-neutral-700">
                    {result.reason}
                  </p>

                  <div className="space-y-1.5 border-t border-black/[0.055] pt-2.5 text-[11.5px]">
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-400">Rule matched</span>
                      <span className="font-mono text-neutral-700">
                        {result.rule_triggered}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-400">Security plug-in</span>
                      <span className="font-mono text-neutral-700">
                        {result.plugin_triggered || "none"}
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 text-[11px] font-medium text-neutral-400">
                      Redacted arguments
                    </div>
                    <pre className="max-h-32 overflow-auto rounded-xl border border-black/[0.06] bg-[#FAFAFA] p-2.5 font-mono text-[11.5px] text-neutral-700">
                      {JSON.stringify(result.redacted_arguments, null, 2)}
                    </pre>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center py-6 text-center"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
                    <FlaskConical className="h-4 w-4" />
                  </div>
                  <p className="mt-2.5 text-[12.5px] font-medium text-neutral-600">
                    Ready to evaluate
                  </p>
                  <p className="mt-0.5 max-w-[220px] text-[12px] text-neutral-400">
                    Pick a preset pill above or run custom JSON arguments.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>
      </div>

      {/* Session Simulation History Rail */}
      {history.length > 0 && (
        <section className="veto-card overflow-hidden rounded-[20px]">
          <div className="flex items-center justify-between border-b border-black/[0.055] px-5 py-3">
            <h2 className="text-[13.5px] font-semibold text-neutral-900">
              Recent simulations
            </h2>
            <span className="font-mono text-[11.5px] text-neutral-400">
              {history.length} this session
            </span>
          </div>

          <div className="px-5 py-2.5">
            <div className="relative">
              {history.map((item, idx) => {
                const meta = decisionMeta(item.result.effective_decision);
                const isFirst = idx === 0;
                const isLast = idx === history.length - 1;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onToolChange(item.tool);
                      onArgsChange(JSON.stringify(item.args, null, 2));
                    }}
                    className="relative flex w-full items-center justify-between gap-3 rounded-xl py-2 pl-7 pr-2 text-left transition-colors hover:bg-neutral-50 cursor-pointer"
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
                      className={`pointer-events-none absolute left-[7.5px] top-1/2 h-[8px] w-[8px] -translate-y-1/2 rounded-full ring-2 ring-white ${meta.dotClass}`}
                    />

                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="font-mono text-[12.5px] font-medium text-neutral-900">
                        {item.tool}
                      </span>
                      <span className="truncate font-mono text-[12px] text-neutral-400">
                        {summarizeArgs(item.args)}
                      </span>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${meta.pillClass}`}
                      >
                        {item.result.effective_decision}
                      </span>
                      <span className="font-mono text-[11.5px] text-neutral-400">
                        {item.result.latency_ms}ms
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </motion.div>
  );
}
