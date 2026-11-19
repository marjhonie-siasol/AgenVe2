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
import logoUrl from "../assets/agenve2.logo.png";

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
      title: "Monitor",
      items: [
        { id: "overview", label: "Overview", icon: LayoutDashboard },
        { id: "timeline", label: "Timeline", icon: Activity },
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
      title: "Configure",
      items: [
        { id: "simulator", label: "Simulator", icon: FlaskConical },
        { id: "policy", label: "Policy", icon: FileCode2 },
        {
          id: "plugins",
          label: "Guards",
          icon: Shield,
          badge: pluginCount > 0 ? pluginCount : undefined,
          badgeTone: "neutral",
        },
      ],
    },
  ];

  const renderNavContent = (isCollapsed: boolean) => (
    <div className="flex h-full flex-col justify-between py-4">
      <div className="space-y-4 px-3">
        {groups.map((group, gIdx) => (
          <div key={group.title} className={gIdx > 0 ? "pt-2" : ""}>
            {!isCollapsed && (
              <div className="mb-2 px-3 text-xs font-medium text-neutral-400">
                {group.title}
              </div>
            )}
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = active === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSelect(item.id);
                      onCloseMobile();
                    }}
                    title={isCollapsed ? item.label : undefined}
                    className={`group relative flex h-9 w-full items-center rounded-lg transition-colors cursor-pointer ${
                      isCollapsed
                        ? "justify-center px-0"
                        : "justify-between px-3 text-left"
                    } ${
                      isActive
                        ? "font-medium text-neutral-900 bg-neutral-100"
                        : "text-neutral-600 hover:bg-neutral-100/70 hover:text-neutral-900"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon
                        size={18}
                        strokeWidth={1.75}
                        aria-hidden="true"
                        className={`shrink-0 transition-colors ${
                          isActive
                            ? "text-[#2563EB]"
                            : "text-neutral-400 group-hover:text-neutral-600"
                        }`}
                      />
                      {!isCollapsed && (
                        <span className="text-sm">{item.label}</span>
                      )}
                    </div>

                    {!isCollapsed && item.badge !== undefined && (
                      <span
                        className={`rounded-md px-1.5 py-0.5 font-mono text-xs font-medium tabular-nums ${
                          item.badgeTone === "amber"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-neutral-100 text-neutral-600"
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}

                    {isCollapsed &&
                      item.badge !== undefined &&
                      item.badgeTone === "amber" && (
                        <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-amber-500" />
                      )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer Status */}
      <div className="border-t border-black/[0.08] px-4 pt-3">
        {isCollapsed ? (
          <div className="flex justify-center py-1">
            <span
              className={`h-2 w-2 rounded-full ${
                killSwitch
                  ? "bg-rose-500"
                  : wsConnected
                    ? "bg-emerald-500"
                    : "bg-amber-400"
              }`}
            />
          </div>
        ) : (
          <div className="flex items-center justify-between text-xs text-neutral-500">
            <span className="inline-flex items-center gap-1.5">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  killSwitch
                    ? "bg-rose-500"
                    : wsConnected
                      ? "bg-emerald-500"
                      : "bg-amber-400"
                }`}
              />
              {killSwitch ? "Halted" : wsConnected ? "Online" : "Connecting"}
            </span>
            <span className="font-mono text-neutral-400">v0.1.0</span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar — fixed to viewport, immune to page scroll */}
      <aside
        className={`hidden shrink-0 border-r border-black/[0.07] bg-white transition-[width] duration-200 ease-out md:block fixed left-0 top-14 bottom-0 z-30 overflow-y-auto ${
          collapsed ? "w-[60px]" : "w-[210px]"
        }`}
      >
        {renderNavContent(collapsed)}
      </aside>

      {/* Mobile Slide-Over Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            onClick={onCloseMobile}
            className="fixed inset-0 bg-black/20 backdrop-blur-[2px]"
          />
          <aside className="relative z-10 flex w-[240px] flex-col border-r border-black/[0.08] bg-white shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-black/[0.06] px-4">
              <div className="flex items-center gap-2">
                <img
                  src={logoUrl}
                  alt="AgenVe2"
                  className="h-6 w-6 rounded-lg object-contain"
                />
                <span className="text-[14px] font-semibold text-neutral-900">
                  AgenVe2
                </span>
              </div>
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="Close navigation"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 cursor-pointer"
              >
                <X size={18} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{renderNavContent(false)}</div>
          </aside>
        </div>
      )}
    </>
  );
}
