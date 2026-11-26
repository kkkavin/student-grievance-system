export type UserRole =
  | 'STUDENT'
  | 'DEPARTMENT_STAFF'
  | 'DEPARTMENT_HEAD'
  | 'DEPARTMENT_ADMIN'
  | 'SUPER_ADMIN'
  | 'student'
  | 'admin'
  | 'department_admin';

export type StudentType = 'hosteller' | 'dayscholar';

export type Gender = 'Male' | 'Female' | 'Other';

export interface Department {
  id: string;
  name: string;
  code: string;
  contactEmail: string;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export type AcademicBranch =
  | 'CSE (Computer Science & Engineering)'
  | 'AIML (Artificial Intelligence & Machine Learning)'
  | 'CSD (Computer Science & Design)'
  | 'IT (Information Technology)'
  | 'ADS (Artificial Intelligence & Data Science)'
  | 'ECE (Electronics & Communication Engineering)'
  | 'EEE (Electrical & Electronics Engineering)'
  | 'MCT (Mechatronics Engineering)'
  | 'MECH (Mechanical Engineering)'
  | 'FT (Fashion Technology)'
  | 'BME (Biomedical Engineering)'
  | 'CIVIL (Civil Engineering)';

export interface CategoryRoutingRule {
  id: string;
  category: string;
  departmentId: string;
  locationTagPattern?: string | null;
  priorityOrder?: number;
  priorityOverride?: PriorityLevel;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface AuditLogEntry {
  id: string;
  entityType: 'grievance' | 'department' | 'user' | string;
  entityId: string;
  actorId: string;
  actorRole: string;
  actorEmail?: string;
  action: string;
  previousState: string | null;
  newState: string | null;
  reason: string | null;
  timestamp: string;
  createdAt?: string;
}

export interface JWTPayload {
  id: string;
  email: string;
  role: UserRole;
  department_id: string | null;
  departmentId?: string | null;
  name?: string;
  regNo?: string;
  reg_no?: string;
  permissions: string[];
  iat?: number;
  exp?: number;
  iss?: string;
}

export interface UserProfile {
  id: string;
  regNo: string;
  name: string;
  department?: string;
  departmentId?: string | null;
  department_id?: string | null;
  gender?: Gender;
  studentType?: StudentType;
  phone: string;
  email: string;
  hostelBlock?: string;
  roomNo?: string;
  role: UserRole;
  isEmailVerified?: boolean;
  createdAt?: string;
}

export type PriorityLevel =
  | 'urgent'
  | 'high'
  | 'medium'
  | 'low'
  | 'less_important'
  | 'Critical'
  | 'High'
  | 'Medium'
  | 'Low'
  | 'critical';

export type GrievanceStatus =
  | 'pending'
  | 'in_progress'
  | 'resolved'
  | 'PRIMARY'
  | 'MERGED_AUTOMATIC'
  | 'SUSPECTED_DUPLICATE'
  | 'MERGED'
  | 'Escalated'
  | 'Open'
  | 'In Progress'
  | 'Resolved';

export interface Grievance {
  id: string;
  ticketNo: string;
  studentRegNo: string;
  studentName: string;
  studentEmail: string;
  studentPhone?: string;
  studentType?: StudentType;
  gender?: Gender;
  hostelBlock?: string;
  roomNo?: string;
  category: string;
  departmentId?: string;
  title?: string;
  description: string;
  status: GrievanceStatus;
  priority?: PriorityLevel;
  isSpam?: boolean;
  spamReason?: string;
  aiClassification?: {
    isSpam: boolean;
    reason: string;
    confidence: number;
    suggestedCategory?: string;
  };
  createdAt: string;
  updatedAt?: string;
  resolvedAt?: string;
  adminNotes?: string;
  masterCaseId?: string | null;
  locationTag?: string;
  sourceTimestamp?: string;
  embeddingVector?: number[];
  similarityScore?: number;
  mergedAt?: string;
  publicMasterNotes?: string;
  masterTicketNo?: string;
  masterStatus?: string;
  assignedDepartmentId?: string | null;
  assigned_department_id?: string | null;
  upvoteCount?: number;
  userHasUpvoted?: boolean;
  isUrgent?: boolean;
}

export interface SanitizedStudentGrievance extends Grievance {
  masterTicketNo?: string;
  masterStatus?: string;
}

export interface IncidentMetadata {
  category: string;
  hostelBlock?: string;
  roomNo?: string;
  locationTag?: string;
  sourceTimestamp?: string;
}

export interface MatchCandidate {
  id: string;
  ticketNo: string;
  category: string;
  hostelBlock?: string;
  roomNo?: string;
  description: string;
  embeddingVector?: number[];
  status: string;
  masterCaseId?: string | null;
  createdAt: string;
}

export interface DeduplicationResult {
  action: 'AUTO_MERGE' | 'SUSPECTED_DUPLICATE' | 'PRIMARY';
  status: 'MERGED_AUTOMATIC' | 'SUSPECTED_DUPLICATE' | 'PRIMARY';
  masterCaseId: string | null;
  similarityScore: number | null;
  matchedTicketNo: string | null;
}

export interface TriageCandidateMaster {
  id: string;
  ticketNo: string;
  description: string;
  studentName: string;
  status: string;
  createdAt: string;
  publicMasterNotes?: string;
}

export interface TriageGrievance {
  id: string;
  ticketNo: string;
  category: string;
  description: string;
  studentName: string;
  studentRegNo: string;
  createdAt: string;
  similarityScore: number;
  candidateMaster: TriageCandidateMaster;
}

export interface TriageQueueItem {
  grievance: Grievance;
  matchCandidates: Grievance[];
  recommendedAction: string;
  clusterSize: number;
}

export interface TriageQueueResponse {
  queue?: TriageQueueItem[];
  suspectedDuplicates?: TriageGrievance[];
  totalUnresolved?: number;
  duplicateSuspectsCount?: number;
}

export interface MockEmailNotification {
  id: string;
  to: string;
  subject: string;
  body: string;
  type: 'otp' | 'confirmation' | 'resolution';
  timestamp: string;
}

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: 'Hostel' | 'Academic & Ragging' | 'Transport & Canteen' | 'General';
}

// ---------------------- ANALYTICS & RISK FORECASTING TYPES ----------------------

export interface HostelBlockRollup {
  block: string;
  total: number;
  pending: number;
  resolved: number;
  consolidationRatio: number;
}

export interface HostelFloorRollup {
  block: string;
  floor: number;
  total: number;
  issueType: string;
}

export interface HostelIssueTypeRollup {
  issueType: string;
  count: number;
  avgResolutionHours: number;
}

export interface TransportRouteRollup {
  route: string;
  delayFrequencyPct: number;
  maintenanceIncidents: number;
  capacitySurgeIndex: number;
  status: 'NORMAL' | 'SURGE' | 'DELAYED';
}

export interface WifiDensityNode {
  departmentBlock: string;
  apController: string;
  switchId: string;
  incidentCount: number;
  densityLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface Rolling7DayVelocityItem {
  date: string;
  category: string;
  count: number;
}

export interface TrendAnalyticsResponse {
  hostelMaintenance?: {
    byBlock: HostelBlockRollup[];
    byFloor: HostelFloorRollup[];
    byIssueType: HostelIssueTypeRollup[];
  };
  campusTransport?: {
    byRoute: TransportRouteRollup[];
    peakCongestionStops: string[];
  };
  transportLogistics?: {
    routes: any[];
  };
  networkInfrastructure?: {
    accessPoints: any[];
  };
  networkWifi?: {
    densityMatrix: WifiDensityNode[];
  };
  rolling7DayVelocity: Rolling7DayVelocityItem[];
}

export interface CalendarMultipliers {
  monsoonFactor: number;
  examFactor: number;
  semesterStartFactor: number;
}

export interface ZoneRiskForecast {
  zone: string;
  riskScore: number;
  riskLevel: 'LOW' | 'ELEVATED' | 'HIGH_RISK' | 'HIGH' | 'CRITICAL' | 'MODERATE';
  primaryDriver?: string;
  recommendation?: string;
  actionableRecommendation?: string;
  urgencyPriority?: 'low' | 'medium' | 'urgent';
}

export interface RiskForecastResponse {
  overallCampusRiskScore: number;
  overallRiskLevel: 'LOW' | 'ELEVATED' | 'HIGH_RISK' | 'HIGH' | 'CRITICAL' | 'MODERATE';
  academicTermPhase?: string;
  calendarMultipliers?: CalendarMultipliers;
  zoneForecasts: ZoneRiskForecast[];
}

export interface ResolveGrievanceResponse {
  success: boolean;
  parent?: Grievance;
  parentId?: string;
  parentTicketId?: string;
  resolvedChildrenCount?: number;
  resolvedCount?: number;
  childIds: string[];
  notificationsSent?: number;
  timestamp?: string;
  message?: string;
}

export interface AuthLoginResponse {
  success: boolean;
  token: string;
  user: UserProfile;
  role: string;
  redirectUrl: string;
}

export interface AdminLoginResponse {
  success: boolean;
  token: string;
  user: UserProfile;
  role: string;
  redirectUrl: string;
}

export interface SendOtpResponse {
  success: boolean;
  message: string;
  otp?: string;
  otpCode?: string;
  expiresIn?: number;
}

export interface VerifyOtpResponse {
  success: boolean;
  message: string;
  access_token?: string | null;
  token?: string | null;
  tokenType?: string;
  user?: UserProfile | null;
}

// ============================================================================
// VisAI Labs GTM Suite: Outbound Webhooks & SLA Analytics Types
// ============================================================================

export type WebhookPlatform = 'slack' | 'discord' | 'custom';

export interface WebhookConfig {
  id: string;
  name: string;
  target_url?: string;
  targetUrl: string;
  platform: WebhookPlatform | string;
  secret_header?: string | null;
  secretHeader?: string | null;
  trigger_on_critical?: boolean;
  triggerOnCritical: boolean;
  trigger_on_duplicate_cluster?: boolean;
  triggerOnDuplicateCluster: boolean;
  is_active?: boolean;
  isActive: boolean;
  created_at?: string;
  createdAt: string;
}

export interface WebhookCreateInput {
  name: string;
  targetUrl?: string;
  target_url?: string;
  platform?: WebhookPlatform | string;
  secretHeader?: string | null;
  secret_header?: string | null;
  triggerOnCritical?: boolean;
  trigger_on_critical?: boolean;
  triggerOnDuplicateCluster?: boolean;
  trigger_on_duplicate_cluster?: boolean;
  isActive?: boolean;
  is_active?: boolean;
}

export interface WebhookDeliveryLog {
  id: string;
  webhookId?: string;
  webhook_id?: string;
  grievanceId?: string | null;
  grievance_id?: string | null;
  eventType?: string;
  event_type?: string;
  statusCode?: number | null;
  status_code?: number | null;
  payloadJson?: Record<string, any>;
  payload_json?: Record<string, any>;
  responseBody?: string | null;
  response_body?: string | null;
  deliveredAt?: string;
  delivered_at?: string;
}

export interface DepartmentSlaMetric {
  departmentId: string;
  department_id?: string;
  departmentName: string;
  department_name?: string;
  departmentCode: string;
  department_code?: string;
  targetSlaHours: number;
  target_sla_hours?: number;
  avgResolutionHours: number;
  avg_resolution_hours?: number;
  complianceRate: number;
  compliance_rate?: number;
  totalTickets: number;
  total_tickets?: number;
  resolvedTickets: number;
  resolved_tickets?: number;
  activeTickets: number;
  active_tickets?: number;
  breachedTickets: number;
  breached_tickets?: number;
  status: 'COMPLIANT' | 'WARNING' | 'BREACHED' | string;
}

export interface AutoTriageRateMetrics {
  autoTriagedPct: number;
  auto_triaged_pct?: number;
  ratePercentage?: number;
  rate_percentage?: number;
  accuracyPct: number;
  accuracy_pct?: number;
  accuracyPercentage?: number;
  accuracy_percentage?: number;
  totalTriaged: number;
  total_triaged?: number;
  totalGrievances?: number;
  total_grievances?: number;
  autoTriagedCount: number;
  auto_triaged_count?: number;
  manuallyReassignedCount: number;
  manually_reassigned_count?: number;
  avgConfidence: number;
  avg_confidence?: number;
}

export interface DuplicatesInterceptedMetrics {
  totalCount: number;
  total_count?: number;
  totalIntercepted?: number;
  total_intercepted?: number;
  hoursSavedEstimate: number;
  hours_saved_estimate?: number;
  hoursSaved?: number;
  hours_saved?: number;
  clustersIdentified: number;
  clusters_identified?: number;
  topCategories: Array<{ category: string; count: number }>;
  top_categories?: Array<{ category: string; count: number }>;
}

export interface WebhookDeliveries24hMetrics {
  count: number;
  totalDeliveries?: number;
  total_deliveries?: number;
  successfulDeliveries: number;
  successful_deliveries?: number;
  successCount?: number;
  success_count?: number;
  failedDeliveries: number;
  failed_deliveries?: number;
  failureCount?: number;
  failure_count?: number;
  successRatePct: number;
  success_rate_pct?: number;
  criticalAlerts: number;
  critical_alerts?: number;
  duplicateClusters: number;
  duplicate_clusters?: number;
  alertTypes?: Record<string, number>;
  alert_types?: Record<string, number>;
}

export interface AutomationSlaResponse {
  departmentSlaMetrics: DepartmentSlaMetric[];
  department_sla_metrics?: DepartmentSlaMetric[];
  autoTriageRate: AutoTriageRateMetrics;
  auto_triage_rate?: AutoTriageRateMetrics;
  duplicatesIntercepted: DuplicatesInterceptedMetrics;
  duplicates_intercepted?: DuplicatesInterceptedMetrics;
  webhookDeliveries24h: WebhookDeliveries24hMetrics;
  webhook_deliveries_24h?: WebhookDeliveries24hMetrics;
  generatedAt: string;
  generated_at?: string;
}
