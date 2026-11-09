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
