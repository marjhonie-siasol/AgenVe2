import { motion } from "motion/react";
import { Check, ShieldCheck } from "lucide-react";
import type { AuditLogItem, PluginInfo } from "../types";
import { SPRING_GENTLE } from "../utils";

interface PluginsPageProps {
  plugins: PluginInfo[];
  logs?: AuditLogItem[];
}

export function PluginsPage({ plugins }: PluginsPageProps) {
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
            Security guards
          </h1>
          <p className="mt-0.5 text-xs text-neutral-500">
            Deterministic AST and payload inspection plugins.
          </p>
        </div>
        <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-mono text-xs font-medium text-emerald-700">
          {plugins.length} active
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {plugins.map((plugin) => (
          <div
            key={plugin.name}
            className="agenve2-card flex flex-col justify-between rounded-xl p-4 space-y-3"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-medium text-neutral-900">
                  {plugin.name}
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10.5px] font-medium text-emerald-700">
                  <Check size={12} strokeWidth={2} aria-hidden="true" className="icon-optical" />
                  active
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-neutral-600">
                {plugin.description}
              </p>
            </div>

            <div className="flex items-center justify-between border-t border-black/[0.08] pt-2.5 text-[11px] text-neutral-400 font-mono">
              <span>fail-closed</span>
              <span>0 tokens</span>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
