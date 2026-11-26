"""Analytics rollups and risk forecasting schemas."""
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class HostelBlockRollup(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    block: str
    active_count: int = Field(default=0, alias="activeCount")
    resolved_count: int = Field(default=0, alias="resolvedCount")
    critical_count: int = Field(default=0, alias="criticalCount")
    total_count: int = Field(default=0, alias="totalCount")
    breach_rate: float = Field(default=0.0, alias="breachRate")
    consolidation_ratio: Optional[float] = Field(default=0.0, alias="consolidationRatio")


class TransportRouteRollup(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    route_number: Optional[str] = Field(default=None, alias="routeNumber")
    route: Optional[str] = None
    issue_count: Optional[int] = Field(default=0, alias="issueCount")
    top_complaint_type: Optional[str] = Field(default=None, alias="topComplaintType")
    active_breakdowns: Optional[int] = Field(default=0, alias="activeBreakdowns")
    affected_students: Optional[int] = Field(default=0, alias="affectedStudents")
    delay_frequency_pct: Optional[int] = Field(default=0, alias="delayFrequencyPct")
    maintenance_incidents: Optional[int] = Field(default=0, alias="maintenanceIncidents")
    capacity_surge_index: Optional[int] = Field(default=0, alias="capacitySurgeIndex")
    status: Optional[str] = "NORMAL"


class CalendarMultipliers(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    academic_phase: Optional[str] = Field(default=None, alias="academicPhase")
    weather_season: Optional[str] = Field(default=None, alias="weatherSeason")
    historical_spike_factor: Optional[float] = Field(default=1.0, alias="historicalSpikeFactor")
    monsoon_factor: Optional[float] = Field(default=1.0, alias="monsoonFactor")
    exam_factor: Optional[float] = Field(default=1.0, alias="examFactor")
    semester_start_factor: Optional[float] = Field(default=1.0, alias="semesterStartFactor")


class ZoneRiskForecast(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    zone_or_category: Optional[str] = Field(default=None, alias="zoneOrCategory")
    zone: Optional[str] = None
    department_id: Optional[str] = Field(default=None, alias="departmentId")
    risk_score: int = Field(alias="riskScore")
    risk_level: str = Field(alias="riskLevel")
    predicted_ticket_surge: str = Field(alias="predictedTicketSurge")
    primary_driver: str = Field(alias="primaryDriver")
    preventive_action: Optional[str] = Field(default=None, alias="preventiveAction")
    actionable_recommendation: Optional[str] = Field(default=None, alias="actionableRecommendation")
    urgency_priority: Optional[str] = Field(default="medium", alias="urgencyPriority")
    confidence: float = 0.88


class RiskForecastResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    month_target: str = Field(alias="monthTarget")
    calendar_multipliers: CalendarMultipliers = Field(alias="calendarMultipliers")
    forecasts: List[ZoneRiskForecast] = Field(default_factory=list)
    zone_forecasts: Optional[List[ZoneRiskForecast]] = Field(default=None, alias="zoneForecasts")
    overall_campus_risk_score: int = Field(alias="overallCampusRiskScore")
    overall_risk_level: Optional[str] = Field(default="LOW", alias="overallRiskLevel")
    academic_term_phase: Optional[str] = Field(default=None, alias="academicTermPhase")
    generated_at: str = Field(alias="generatedAt")


class DepartmentSlaMetric(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    department_id: str = Field(alias="department_id")
    departmentId: Optional[str] = Field(default=None, alias="departmentId")
    department_name: str = Field(alias="department_name")
    departmentName: Optional[str] = Field(default=None, alias="departmentName")
    department_code: str = Field(alias="department_code")
    departmentCode: Optional[str] = Field(default=None, alias="departmentCode")
    target_sla_hours: float = Field(alias="target_sla_hours")
    targetSlaHours: Optional[float] = Field(default=None, alias="targetSlaHours")
    avg_resolution_hours: float = Field(alias="avg_resolution_hours")
    avgResolutionHours: Optional[float] = Field(default=None, alias="avgResolutionHours")
    compliance_rate: float = Field(alias="compliance_rate")
    complianceRate: Optional[float] = Field(default=None, alias="complianceRate")
    total_tickets: int = Field(default=0, alias="total_tickets")
    totalTickets: Optional[int] = Field(default=0, alias="totalTickets")
    resolved_tickets: int = Field(default=0, alias="resolved_tickets")
    resolvedTickets: Optional[int] = Field(default=0, alias="resolvedTickets")
    active_tickets: int = Field(default=0, alias="active_tickets")
    activeTickets: Optional[int] = Field(default=0, alias="activeTickets")
    breached_tickets: int = Field(default=0, alias="breached_tickets")
    breachedTickets: Optional[int] = Field(default=0, alias="breachedTickets")
    status: str = Field(default="COMPLIANT")


class AutoTriageRateMetric(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    auto_triaged_pct: float = Field(alias="auto_triaged_pct")
    autoTriagedPct: Optional[float] = Field(default=None, alias="autoTriagedPct")
    accuracy_pct: float = Field(alias="accuracy_pct")
    accuracyPct: Optional[float] = Field(default=None, alias="accuracyPct")
    total_triaged: int = Field(default=0, alias="total_triaged")
    totalTriaged: Optional[int] = Field(default=0, alias="totalTriaged")
    auto_triaged_count: int = Field(default=0, alias="auto_triaged_count")
    autoTriagedCount: Optional[int] = Field(default=0, alias="autoTriagedCount")
    manually_reassigned_count: int = Field(default=0, alias="manually_reassigned_count")
    manuallyReassignedCount: Optional[int] = Field(default=0, alias="manuallyReassignedCount")
    avg_confidence: float = Field(default=0.92, alias="avg_confidence")
    avgConfidence: Optional[float] = Field(default=0.92, alias="avgConfidence")
    # Interop aliases
    total_grievances: Optional[int] = Field(default=0, alias="total_grievances")
    totalGrievances: Optional[int] = Field(default=0, alias="totalGrievances")
    rate_percentage: Optional[float] = Field(default=0.0, alias="rate_percentage")
    ratePercentage: Optional[float] = Field(default=0.0, alias="ratePercentage")
    accuracy_percentage: Optional[float] = Field(default=0.0, alias="accuracy_percentage")
    accuracyPercentage: Optional[float] = Field(default=0.0, alias="accuracyPercentage")


class DuplicatesInterceptedMetric(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    total_count: int = Field(alias="total_count")
    totalCount: Optional[int] = Field(default=None, alias="totalCount")
    hours_saved_estimate: float = Field(alias="hours_saved_estimate")
    hoursSavedEstimate: Optional[float] = Field(default=None, alias="hoursSavedEstimate")
    clusters_identified: int = Field(default=0, alias="clusters_identified")
    clustersIdentified: Optional[int] = Field(default=0, alias="clustersIdentified")
    top_categories: List[Dict[str, Any]] = Field(default_factory=list, alias="top_categories")
    topCategories: Optional[List[Dict[str, Any]]] = Field(default_factory=list, alias="topCategories")
    # Interop aliases
    total_intercepted: Optional[int] = Field(default=0, alias="total_intercepted")
    totalIntercepted: Optional[int] = Field(default=0, alias="totalIntercepted")
    hours_saved: Optional[float] = Field(default=0.0, alias="hours_saved")
    hoursSaved: Optional[float] = Field(default=0.0, alias="hoursSaved")


class WebhookDeliveries24hMetric(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    count: int = Field(default=0)
    successful_deliveries: int = Field(default=0, alias="successful_deliveries")
    successfulDeliveries: Optional[int] = Field(default=0, alias="successfulDeliveries")
    failed_deliveries: int = Field(default=0, alias="failed_deliveries")
    failedDeliveries: Optional[int] = Field(default=0, alias="failedDeliveries")
    success_rate_pct: float = Field(default=100.0, alias="success_rate_pct")
    successRatePct: Optional[float] = Field(default=100.0, alias="successRatePct")
    critical_alerts: int = Field(default=0, alias="critical_alerts")
    criticalAlerts: Optional[int] = Field(default=0, alias="criticalAlerts")
    duplicate_clusters: int = Field(default=0, alias="duplicate_clusters")
    duplicateClusters: Optional[int] = Field(default=0, alias="duplicateClusters")
    # Interop aliases
    total_deliveries: Optional[int] = Field(default=0, alias="total_deliveries")
    totalDeliveries: Optional[int] = Field(default=0, alias="totalDeliveries")
    success_count: Optional[int] = Field(default=0, alias="success_count")
    successCount: Optional[int] = Field(default=0, alias="successCount")
    failure_count: Optional[int] = Field(default=0, alias="failure_count")
    failureCount: Optional[int] = Field(default=0, alias="failureCount")
    alert_types: Optional[Dict[str, int]] = Field(default_factory=dict, alias="alert_types")
    alertTypes: Optional[Dict[str, int]] = Field(default_factory=dict, alias="alertTypes")


class AutomationSlaResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    department_sla_metrics: List[DepartmentSlaMetric] = Field(alias="department_sla_metrics")
    departmentSlaMetrics: Optional[List[DepartmentSlaMetric]] = Field(default=None, alias="departmentSlaMetrics")
    auto_triage_rate: AutoTriageRateMetric = Field(alias="auto_triage_rate")
    autoTriageRate: Optional[AutoTriageRateMetric] = Field(default=None, alias="autoTriageRate")
    duplicates_intercepted: DuplicatesInterceptedMetric = Field(alias="duplicates_intercepted")
    duplicatesIntercepted: Optional[DuplicatesInterceptedMetric] = Field(default=None, alias="duplicatesIntercepted")
    webhook_deliveries_24h: WebhookDeliveries24hMetric = Field(alias="webhook_deliveries_24h")
    webhookDeliveries24h: Optional[WebhookDeliveries24hMetric] = Field(default=None, alias="webhookDeliveries24h")
    generated_at: str = Field(alias="generated_at")
    generatedAt: Optional[str] = Field(default=None, alias="generatedAt")
