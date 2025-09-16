// Agent types for system health monitoring
export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
}

// Core agent types
export interface AgentResult {
  executionId: string;
  agentType: string;
  status: 'completed' | 'failed' | 'timeout' | 'cancelled';
  result: string;
  cost: number;
  duration: number;
  usage: TokenUsage;
  logs: string[];
  timestamp: string;
  error?: string;
  summary?: string;
}

export interface SystemHealthData {
  timestamp: string;
  overall_health: 'healthy' | 'warning' | 'critical';
  metrics: SystemMetrics;
  ai_analysis: AIAnalysis;
  cost_breakdown: CostMetrics;
}

export interface SystemMetrics {
  disk_usage: DiskMetrics;
  memory_usage: MemoryMetrics;
  cpu_usage: CpuMetrics;
  services: ServiceStatus[];
  security: SecurityAudit;
  network: NetworkTests;
  docker_containers?: DockerMetrics;
}

export interface DiskMetrics {
  total_space_gb: number;
  free_space_gb: number;
  used_space_gb: number;
  usage_percent: number;
  mount_points: MountPointInfo[];
  disk_health: 'good' | 'warning' | 'critical';
  predicted_full_date?: string;
  io_stats: {
    reads_per_sec: number;
    writes_per_sec: number;
    io_wait_percent: number;
  };
}

export interface MountPointInfo {
  path: string;
  total_gb: number;
  free_gb: number;
  used_gb: number;
  usage_percent: number;
  filesystem: string;
  device: string;
}

export interface MemoryMetrics {
  total_gb: number;
  free_gb: number;
  used_gb: number;
  usage_percent: number;
  cached_gb: number;
  buffers_gb: number;
  swap_total_gb: number;
  swap_used_gb: number;
  swap_usage_percent: number;
  memory_pressure: 'low' | 'medium' | 'high';
}

export interface CpuMetrics {
  usage_percent: number;
  load_average: {
    one_minute: number;
    five_minutes: number;
    fifteen_minutes: number;
  };
  core_count: number;
  cores_usage: number[];
  temperature_celsius?: number;
  frequency_mhz: number[];
  processes_count: number;
  threads_count: number;
}

export interface ServiceStatus {
  name: string;
  status: 'active' | 'inactive' | 'failed' | 'unknown';
  enabled: boolean;
  description?: string;
  uptime?: string;
  memory_usage?: number;
  cpu_usage?: number;
  pid?: number;
  restart_count?: number;
}

export interface SecurityAudit {
  open_ports: PortInfo[];
  failed_logins: number;
  security_updates_available: number;
  firewall_status: 'active' | 'inactive' | 'unknown';
  last_security_scan?: string;
  vulnerabilities: SecurityVulnerability[];
}

export interface PortInfo {
  port: number;
  protocol: 'tcp' | 'udp';
  service?: string;
  state: 'open' | 'closed' | 'filtered';
  process_name?: string;
  pid?: number;
}

export interface SecurityVulnerability {
  cve_id?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  package?: string;
  affected_version?: string;
  fixed_version?: string;
}

export interface NetworkTests {
  internet_connected: boolean;
  dns_resolution: {
    google_dns: boolean;
    cloudflare_dns: boolean;
    response_time_ms: number;
  };
  connectivity_tests: ConnectivityTest[];
  network_interfaces: NetworkInterface[];
  bandwidth_mbps?: {
    download: number;
    upload: number;
  };
}

export interface ConnectivityTest {
  target: string;
  port: number;
  status: 'success' | 'failed' | 'timeout';
  response_time_ms?: number;
  error?: string;
}

export interface NetworkInterface {
  name: string;
  type: string;
  status: 'up' | 'down';
  ip_addresses: string[];
  mac_address?: string;
  mtu: number;
  speed_mbps?: number;
  rx_bytes: number;
  tx_bytes: number;
  rx_packets: number;
  tx_packets: number;
  rx_errors: number;
  tx_errors: number;
}

export interface DockerMetrics {
  docker_available: boolean;
  total_containers: number;
  running_containers: number;
  stopped_containers: number;
  containers: DockerContainer[];
  images_count: number;
  volumes_count: number;
  networks_count: number;
  disk_usage_gb: number;
}

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  created: string;
  ports: string[];
  cpu_usage_percent?: number;
  memory_usage_mb?: number;
  memory_limit_mb?: number;
  network_rx_mb?: number;
  network_tx_mb?: number;
  restart_count: number;
}

export interface AIAnalysis {
  summary: string;
  recommendations: Recommendation[];
  trends: TrendAnalysis[];
  alerts: Alert[];
  health_score: number; // 0-100
  priority_actions: string[];
  cost?: number;
  usage?: TokenUsage;
  model_used?: string;
  duration?: number;
}

export interface Recommendation {
  category: 'performance' | 'security' | 'maintenance' | 'cost_optimization' | 'monitoring';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  action_items: string[];
  estimated_impact: 'low' | 'medium' | 'high';
  implementation_difficulty: 'easy' | 'moderate' | 'hard';
}

export interface TrendAnalysis {
  metric: string;
  trend: 'improving' | 'stable' | 'degrading' | 'volatile';
  timeframe: string;
  current_value: number;
  previous_value?: number;
  change_percent?: number;
  analysis?: string;
  prediction?: {
    next_week: number;
    next_month: number;
    confidence: number;
  };
}

export interface Alert {
  level: 'info' | 'warning' | 'error' | 'critical';
  category: string;
  message: string;
  affected_component: string;
  recommended_action?: string;
  urgency: 'low' | 'medium' | 'high' | 'immediate';
  auto_resolvable: boolean;
}

export interface CostMetrics {
  execution_cost_usd: number;
  tokens_used: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_tokens: number;
    cache_read_tokens: number;
  };
  model_used: string;
  execution_duration_ms: number;
  cost_per_minute_usd: number;
}

// System collector interface
export interface SystemCollectorResult {
  cpu: CpuMetrics;
  memory: MemoryMetrics;
  disk: DiskMetrics;
  network: NetworkTests;
  services: ServiceStatus[];
  security: SecurityAudit;
  timestamp: string;
}

// Docker collector interface  
export interface DockerCollectorResult {
  available: boolean;
  metrics?: DockerMetrics;
  error?: string;
  timestamp: string;
}

// Service collector interface
export interface ServiceCollectorResult {
  services: ServiceStatus[];
  system_services_count: number;
  failed_services_count: number;
  disabled_services_count: number;
  timestamp: string;
}

// Health analyzer interface
export interface HealthAnalysisInput {
  system_metrics: SystemCollectorResult;
  docker_metrics?: DockerCollectorResult;
  service_metrics: ServiceCollectorResult;
  historical_data?: SystemHealthData[];
}

export interface HealthAnalysisResult {
  overall_health: 'healthy' | 'warning' | 'critical';
  health_score: number;
  ai_analysis: AIAnalysis;
  critical_issues: string[];
  warnings: string[];
  recommendations: Recommendation[];
  cost?: number;
  usage?: TokenUsage;
  model_used?: string;
  duration?: number;
}

// Agent configuration types
export type LogCallback = (message: string, level?: 'info' | 'warn' | 'error' | 'debug') => void;

export interface AgentExecutionOptions {
  timeout_ms?: number;
  max_retries?: number;
  include_docker?: boolean;
  include_security_scan?: boolean;
  detailed_service_analysis?: boolean;
  historical_comparison_days?: number;
  ai_analysis_depth?: 'basic' | 'detailed' | 'comprehensive';
  onLog?: LogCallback;
}

export interface AgentExecutionContext {
  execution_id: string;
  agent_type: string;
  started_at: string;
  options: AgentExecutionOptions;
  cost_limit_usd?: number;
  working_directory?: string;
}

// Collection interfaces for different data sources
export interface SystemInformationCollector {
  collectCpuMetrics(): Promise<CpuMetrics>;
  collectMemoryMetrics(): Promise<MemoryMetrics>;
  collectDiskMetrics(): Promise<DiskMetrics>;
  collectNetworkMetrics(): Promise<NetworkTests>;
  collectSystemInfo(): Promise<SystemCollectorResult>;
}

export interface DockerInformationCollector {
  isDockerAvailable(): Promise<boolean>;
  collectContainerMetrics(): Promise<DockerMetrics>;
  collectDockerInfo(): Promise<DockerCollectorResult>;
}

export interface ServiceInformationCollector {
  collectSystemServices(): Promise<ServiceStatus[]>;
  collectServiceHealth(): Promise<ServiceCollectorResult>;
}

export interface SecurityInformationCollector {
  scanOpenPorts(): Promise<PortInfo[]>;
  checkSecurityUpdates(): Promise<number>;
  auditSecurity(): Promise<SecurityAudit>;
}