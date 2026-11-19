import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, Check, FileCode2 } from "lucide-react";
import { SPRING_GENTLE } from "../utils";

interface PolicyViewProps {
  policyPath: string;
  policyYaml: string;
  policyMsg: { ok: boolean; text: string } | null;
  saving: boolean;
  onPolicyChange: (value: string) => void;
  onSavePolicy: () => Promise<void>;
}

export function PolicyView({
  policyPath,
  policyYaml,
  policyMsg,
  saving,
  onPolicyChange,
  onSavePolicy,
}: PolicyViewProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={SPRING_GENTLE}
      className="space-y-4"
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-[18px] font-semibold tracking-[-0.02em] text-neutral-900">
            Policy YAML
          </h1>
          <p className="mt-0.5 text-[12.5px] text-neutral-500">
            Edit declarative tool rules and hot-reload the firewall without
            restarting agents.
          </p>
        </div>

        <motion.button
          type="button"
          disabled={saving}
          whileTap={{ scale: 0.97 }}
          onClick={onSavePolicy}
          className="rounded-full bg-[#2563EB] px-4 py-1.5 text-[12.5px] font-medium text-white shadow-xs transition-colors hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
        >
          {saving ? "Saving..." : "Save & hot-reload"}
        </motion.button>
      </div>

      {/* Active Policy YAML Card */}
      <section className="agenve2-card overflow-hidden rounded-[20px]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.055] px-5 py-3">
          <div className="flex items-center gap-2">
            <FileCode2 className="h-4 w-4 text-neutral-400" />
            <span className="font-mono text-[12.5px] font-medium text-neutral-800">
              {policyPath}
            </span>
          </div>
          <span className="text-[11.5px] text-neutral-400">
            Pydantic validated &middot; fail-closed on syntax error
          </span>
        </div>

        <AnimatePresence>
          {policyMsg && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={SPRING_GENTLE}
              className="overflow-hidden"
            >
              <div
                className={`flex items-center gap-2 border-b px-5 py-2 text-[12px] ${
                  policyMsg.ok
                    ? "border-emerald-200/70 bg-emerald-50/70 text-emerald-700"
                    : "border-rose-200/70 bg-rose-50/70 text-rose-700"
                }`}
              >
                {policyMsg.ok ? (
                  <Check className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                )}
                <span>{policyMsg.text}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="bg-[#FAFAFA] p-4">
          <textarea
            value={policyYaml}
            onChange={(e) => onPolicyChange(e.target.value)}
            rows={24}
            spellCheck={false}
            className="w-full rounded-xl border border-black/[0.065] bg-white p-4 font-mono text-[12.5px] leading-relaxed text-neutral-800 focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/10"
          />
        </div>
      </section>
    </motion.div>
  );
}
