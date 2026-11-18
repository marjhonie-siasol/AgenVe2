export interface FirewallStats {
  total: number;
  allowed: number;
  blocked: number;
  pending: number;
  avg_latency_ms: number;
}

export interface PluginInfo {
  name: string;
  description: string;
}

export interface SystemState {
  kill_switch: boolean;
  mode: "enforce" | "dry_run";
  policy_path: string;
  plugins: PluginInfo[];
  stats: FirewallStats;
}

export interface AuditLogItem {
  id: number;
  request_id: string;
  timestamp: string;
  agent_name: string;
  tool_name: string;
  arguments: Record<string, unknown>;
  decision: string;
  effective_decision: string;
  dry_run: boolean;
  reason: string;
  rule_triggered: string;
  plugin_triggered: string | null;
  latency_ms: number;
  feedback: string | null;
  prev_hash: string;
  entry_hash: string;
}

export interface PendingApproval {
  id: string;
  request_id: string;
  agent_name: string;
  tool_name: string;
  arguments: Record<string, unknown>;
  rule_triggered: string;
  message: string;
  status: string;
  timeout_seconds: number;
  created_at: string;
}

export interface SimulationResult {
  decision: string;
  effective_decision: string;
  dry_run: boolean;
  reason: string;
  rule_triggered: string;
  plugin_triggered: string | null;
  latency_ms: number;
  redacted_arguments: Record<string, unknown>;
}
