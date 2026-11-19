import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircle,
  ArrowUp,
  Check,
  CheckCircle2,
  Clock,
  FlaskConical,
  RotateCcw,
} from "lucide-react";
import type { SimulationResult } from "../types";
import {
  QUICK_TESTS,
  SPRING_GENTLE,
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
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={SPRING_GENTLE}
      className="space-y-4"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold text-neutral-900">
            Simulator
          </h1>
          <p className="mt-0.5 text-xs text-neutral-500">
            Test tool calls against <code className="font-mono text-neutral-600">{policyPath}</code> without executing.
          </p>
        </div>
      </div>

      {/* Preset Buttons — 8px radius */}
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
            <button
              key={qt.label}
              type="button"
              onClick={() => {
                onToolChange(qt.tool);
                onArgsChange(qt.args);
                onSimulate(qt.tool, qt.args);
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                isSelected
                  ? "bg-neutral-900 text-white"
                  : "border border-black/[0.08] bg-white text-neutral-700 hover:bg-neutral-50"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${isSelected ? "bg-white" : dotColor}`} />
              <span>{qt.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Grid: Input + Verdict */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Input Card */}
        <section className="agenve2-card rounded-xl p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-neutral-500">
              Tool name
            </label>
            <input
              type="text"
              value={tool}
              onChange={(e) => onToolChange(e.target.value)}
              placeholder="e.g. postgres_query"
              className="mt-1 h-8 w-full rounded-lg border border-black/[0.08] bg-white px-3 font-mono text-xs text-neutral-800 placeholder:text-neutral-400 focus:border-blue-500/40 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-neutral-500">
              Arguments (JSON)
            </label>
            <textarea
              value={args}
              onChange={(e) => onArgsChange(e.target.value)}
              rows={8}
              spellCheck={false}
              className="mt-1 w-full rounded-lg border border-black/[0.08] bg-white p-3 font-mono text-xs leading-relaxed text-neutral-800 focus:border-blue-500/40 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-neutral-400">
              Zero side-effects
            </span>
            <button
              type="button"
              disabled={busy || !tool.trim()}
              onClick={() => onSimulate()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
            >
              <ArrowUp size={14} strokeWidth={1.75} aria-hidden="true" className="icon-optical" />
              {busy ? "Testing..." : "Simulate"}
            </button>
          </div>
        </section>

        {/* Verdict & History Column */}
        <div className="space-y-4">
          {/* Active Result Card */}
          <section className="agenve2-card rounded-xl p-4 min-h-[160px] flex flex-col justify-center">
            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">
                <AlertCircle size={16} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-rose-500" />
                <span>{error}</span>
              </div>
            )}

            {!error && !result && (
              <div className="py-6 text-center text-xs text-neutral-400">
                Select a preset or click Simulate to evaluate.
              </div>
            )}

            {!error && result && resultMeta && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${resultMeta.pillClass}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${resultMeta.dotClass}`} />
                    {resultMeta.label}
                  </span>
                  <span className="font-mono text-xs text-neutral-400 tabular-nums">
                    {result.latency_ms}ms
                  </span>
                </div>

                <p className="text-xs text-neutral-800">
                  {result.reason}
                </p>

                <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400 font-mono pt-1">
                  <span>rule: {result.rule_triggered}</span>
                  {result.plugin_triggered && (
                    <span>&middot; guard: {result.plugin_triggered}</span>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Past Simulations */}
          {history.length > 0 && (
            <section className="agenve2-card rounded-xl p-3">
              <span className="text-xs font-medium text-neutral-400">
                Recent simulations
              </span>
              <div className="mt-2 divide-y divide-black/[0.04]">
                {history.slice(0, 4).map((h) => {
                  const meta = decisionMeta(h.result.effective_decision);
                  return (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => {
                        onToolChange(h.tool);
                        onArgsChange(JSON.stringify(h.args, null, 2));
                      }}
                      className="flex w-full items-center justify-between py-1.5 text-left transition-colors hover:text-blue-600 cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`} />
                        <span className="font-mono text-xs text-neutral-800">
                          {h.tool}
                        </span>
                      </div>
                      <span className="font-mono text-xs text-neutral-400 tabular-nums">
                        {h.result.latency_ms}ms
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>
    </motion.div>
  );
}
