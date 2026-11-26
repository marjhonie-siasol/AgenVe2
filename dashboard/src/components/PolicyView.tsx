import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, Check, FileCode2 } from "lucide-react";
import { SPRING_GENTLE } from "../utils";

interface PolicyViewProps {
  policyPath: string;
  policyYaml: string;
  policyMsg: { ok: boolean; text: string } | null;
  saving: boolean;
  generating: boolean;
  onPolicyChange: (value: string) => void;
  onSavePolicy: () => Promise<void>;
  onGeneratePolicy: () => Promise<void>;
}

export function PolicyView({
  policyPath,
  policyYaml,
  policyMsg,
  saving,
  generating,
  onPolicyChange,
  onSavePolicy,
  onGeneratePolicy,
}: PolicyViewProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={SPRING_GENTLE}
      className="space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-sm font-semibold text-neutral-900">
            Policy YAML
          </h1>
          <p className="mt-0.5 text-xs text-neutral-500">
            Edit declarative rules. Hot-reloads live without restarting agents.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={generating}
            onClick={onGeneratePolicy}
            className="rounded-lg border border-black/[0.12] bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50 cursor-pointer"
          >
            {generating ? "Generating..." : "Generate from logs"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onSavePolicy}
            className="rounded-lg bg-[#2563EB] px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
          >
            {saving ? "Saving..." : "Save & hot-reload"}
          </button>
        </div>
      </div>

      <section className="agenve2-card overflow-hidden rounded-xl">
        <div className="flex items-center justify-between border-b border-black/[0.08] px-4 py-2.5">
          <div className="flex items-center gap-2">
            <FileCode2 size={16} strokeWidth={1.75} aria-hidden="true" className="icon-optical text-neutral-400" />
            <span className="font-mono text-xs font-medium text-neutral-800">
              {policyPath}
            </span>
          </div>
          <span className="text-xs text-neutral-400">
            Pydantic validated
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
                className={`flex items-center gap-2 border-b px-4 py-2 text-xs ${
                  policyMsg.ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-rose-200 bg-rose-50 text-rose-700"
                }`}
              >
                {policyMsg.ok ? (
                  <Check size={14} strokeWidth={2} aria-hidden="true" className="icon-optical shrink-0" />
                ) : (
                  <AlertCircle size={14} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
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
            rows={22}
            spellCheck={false}
            className="w-full rounded-lg border border-black/[0.08] bg-white p-3.5 font-mono text-xs leading-relaxed text-neutral-800 focus:border-blue-500/40 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
          />
        </div>
      </section>
    </motion.div>
  );
}
