import { motion } from "motion/react";
import {
  Activity,
  Clock,
  FileCode2,
  FlaskConical,
  LayoutDashboard,
  Shield,
  X,
} from "lucide-react";
import { SPRING_SNAPPY } from "../utils";

export type NavSectionId =
  | "overview"
  | "timeline"
  | "approvals"
  | "simulator"
  | "policy"
  | "plugins";

interface NavItem {
  id: NavSectionId;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: number;
  badgeTone?: "amber" | "neutral";
}

interface SidebarProps {
  active: NavSectionId;
  collapsed: boolean;
  mobileOpen: boolean;
  pendingCount: number;
  pluginCount: number;
  wsConnected: boolean;
  killSwitch: boolean;
  onSelect: (id: NavSectionId) => void;
  onCloseMobile: () => void;
}

export function Sidebar({
  active,
  collapsed,
  mobileOpen,
  pendingCount,
  pluginCount,
  wsConnected,
  killSwitch,
  onSelect,
  onCloseMobile,
}: SidebarProps) {
  const groups: Array<{ title: string; items: NavItem[] }> = [
    {
      title: "Monitoring",
      items: [
        { id: "overview", label: "Overview", icon: LayoutDashboard },
        { id: "timeline", label: "Execution timeline", icon: Activity },
        {
          id: "approvals",
          label: "Approvals",
          icon: Clock,
          badge: pendingCount > 0 ? pendingCount : undefined,
          badgeTone: "amber",
        },
      ],
    },
    {
      title: "Governance",
      items: [
        { id: "simulator", label: "Rule simulator", icon: FlaskConical },
        { id: "policy", label: "Policy YAML", icon: FileCode2 },
        {
          id: "plugins",
          label: "Security plug-ins",
          icon: Shield,
          badge: pluginCount > 0 ? pluginCount : undefined,
          badgeTone: "neutral",
        },
      ],
    },
  ];

  const renderNavContent = (isCollapsed: boolean) => (
    <div className="flex h-full flex-col justify-between py-3">
      <div className="space-y-5 px-2.5">
        {groups.map((group) => (
          <div key={group.title}>
            {!isCollapsed && (
              <div className="mb-1.5 px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-neutral-400">
                {group.title}
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = active === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    title={isCollapsed ? item.label : undefined}
                    onClick={() => {
                      onSelect(item.id);
                      onCloseMobile();
                    }}
                    className={`group relative flex w-full items-center rounded-lg text-[13px] transition-colors cursor-pointer ${
                      isCollapsed
                        ? "justify-center px-0 py-2"
                        : "justify-between px-2.5 py-2"
                    } ${
                      isActive
                        ? "font-medium text-[#2563EB]"
                        : "text-neutral-600 hover:bg-neutral-100/80 hover:text-neutral-900"
                    }`}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="sidebar-active-bg"
                        transition={SPRING_SNAPPY}
                        className="absolute inset-0 rounded-lg bg-blue-50/85 ring-1 ring-blue-200/50"
                      />
                    )}
                    {isActive && !isCollapsed && (
                      <motion.span
                        layoutId="sidebar-active-bar"
                        transition={SPRING_SNAPPY}
                        className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-[#2563EB]"
                      />
                    )}

                    <span className="relative z-10 flex min-w-0 items-center gap-2.5">
                      <Icon
                        className={`h-[16px] w-[16px] shrink-0 ${
                          isActive
                            ? "text-[#2563EB]"
                            : "text-neutral-400 group-hover:text-neutral-700"
                        }`}
                      />
                      {!isCollapsed && (
                        <span className="truncate">{item.label}</span>
                      )}
                    </span>

                    {!isCollapsed && item.badge !== undefined && (
                      <span
                        className={`relative z-10 rounded-full px-1.5 py-0.5 font-mono text-[10.5px] font-medium ${
                          item.badgeTone === "amber"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-neutral-100 text-neutral-500"
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}

                    {isCollapsed &&
                      item.badge !== undefined &&
                      item.badgeTone === "amber" && (
                        <span className="absolute right-2 top-1.5 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-white" />
                      )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Quiet Console Footer Status */}
      <div className="border-t border-black/[0.06] px-3 pt-3">
        {isCollapsed ? (
          <div
            title={
              killSwitch
                ? "Firewall halted"
                : wsConnected
                  ? "Live stream connected"
                  : "Reconnecting"
            }
            className="flex justify-center py-1"
          >
            <span
              className={`h-2 w-2 rounded-full ${
                killSwitch
                  ? "bg-rose-500"
                  : wsConnected
                    ? "bg-emerald-500"
                    : "bg-amber-400 animate-pulse"
              }`}
            />
          </div>
        ) : (
          <div className="rounded-xl bg-[#F7F7F7] px-3 py-2.5 ring-1 ring-black/[0.05]">
            <div className="flex items-center justify-between text-[11.5px]">
              <span className="inline-flex items-center gap-1.5 font-medium text-neutral-700">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    killSwitch
                      ? "bg-rose-500"
                      : wsConnected
                        ? "bg-emerald-500"
                        : "bg-amber-400 animate-pulse"
                  }`}
                />
                {killSwitch
                  ? "Halted"
                  : wsConnected
                    ? "Stream live"
                    : "Reconnecting"}
              </span>
              <span className="font-mono text-[10.5px] text-neutral-400">
                v0.1.0
              </span>
            </div>
            <p className="mt-1 text-[11px] text-neutral-400">
              Fail-closed &middot; SQLite WAL
            </p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={`hidden shrink-0 border-r border-black/[0.07] bg-white transition-[width] duration-200 ease-out md:block ${
          collapsed ? "w-[60px]" : "w-[228px]"
        }`}
      >
        <div className="sticky top-12 h-[calc(100vh-3rem)] overflow-y-auto">
          {renderNavContent(collapsed)}
        </div>
      </aside>

      {/* Mobile Slide-Over Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            onClick={onCloseMobile}
            className="fixed inset-0 bg-black/20 backdrop-blur-[1px]"
          />
          <aside className="relative z-10 flex w-[248px] flex-col border-r border-black/[0.08] bg-white shadow-xl">
            <div className="flex h-12 items-center justify-between border-b border-black/[0.06] px-4">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-neutral-900" />
                <span className="text-[14px] font-semibold tracking-[-0.015em]">
                  Veto
                </span>
              </div>
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="Close navigation"
                className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{renderNavContent(false)}</div>
          </aside>
        </div>
      )}
    </>
  );
}
