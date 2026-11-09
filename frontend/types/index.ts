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
}
