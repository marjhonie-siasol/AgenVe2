import { useMemo } from "react";
import { motion } from "motion/react";
import { Check, Shield } from "lucide-react";
import type { AuditLogItem, PluginInfo } from "../types";
import { SPRING_GENTLE } from "../utils";

interface PluginsPageProps {
  plugins: PluginInfo[];
  logs: AuditLogItem[];
}

export function PluginsPage({ plugins, logs }: PluginsPageProps) {
  const triggerCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of logs) {
      if (row.plugin_triggered) {
        counts[row.plugin_triggered] = (counts[row.plugin_triggered] || 0) + 1;
      }
    }
    return counts;
  }, [logs]);

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
          Security plug-ins
        </h1>
        <p className="mt-0.5 text-[12.5px] text-neutral-500">
          Deterministic microkernel guards loaded into AgenVe2’s short-circuiting
          evaluation pipeline.
        </p>
      </div>

      <section className="agenve2-card overflow-hidden rounded-[20px]">
        <div className="flex items-center justify-between border-b border-black/[0.055] px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-neutral-400" />
            <h2 className="text-[14px] font-semibold tracking-[-0.015em] text-neutral-900">
              Registered guards
            </h2>
          </div>
          <span className="font-mono text-[12px] text-neutral-400">
            {plugins.length} loaded &middot; deterministic
          </span>
        </div>

        <div className="px-5 py-3">
          <div className="relative">
            {plugins.map((plugin, idx) => {
              const isFirst = idx === 0;
              const isLast = idx === plugins.length - 1;
              const triggers = triggerCounts[plugin.name] || 0;
              return (
                <div
                  key={plugin.name}
                  className="relative flex flex-wrap items-start justify-between gap-4 py-3 pl-7"
                >
                  {!isFirst && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute left-[11px] top-0 h-[20px] w-[1.5px] bg-neutral-200/80"
                    />
                  )}
                  {!isLast && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute left-[11px] top-[20px] bottom-0 w-[1.5px] bg-neutral-200/80"
                    />
                  )}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-[7.5px] top-[17px] h-[8px] w-[8px] rounded-full bg-emerald-500 ring-2 ring-white"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[13.5px] font-medium text-neutral-900">
                        {plugin.name}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-medium text-emerald-700">
                        <Check className="h-3 w-3" />
                        Active
                      </span>
                    </div>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-neutral-500">
                      {plugin.description}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="font-mono text-[13px] font-semibold text-neutral-800">
                      {triggers}
                    </div>
                    <div className="text-[11px] text-neutral-400">
                      {triggers === 1 ? "trigger" : "triggers"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </motion.div>
  );
}
