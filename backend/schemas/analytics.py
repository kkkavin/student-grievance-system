from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class HostelBlockRollup(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    block: str
    active_count: int = Field(alias="activeCount")
    resolved_count: int = Field(alias="resolvedCount")
    critical_count: int = Field(alias="criticalCount")
    total_count: int = Field(alias="totalCount")
    breach_rate: float = Field(alias="breachRate")


class HostelFloorRollup(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    block: str
    floor: int
    count: int
    open_count: int = Field(alias="openCount")
    predominant_issue: str = Field(alias="predominantIssue")


class HostelIssueTypeRollup(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    issue_type: str = Field(alias="issueType")
    count: int
    avg_resolution_hours: float = Field(alias="avgResolutionHours")
    active_count: int = Field(alias="activeCount")


class TransportRouteRollup(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    route_number: str = Field(alias="routeNumber")
    issue_count: int = Field(alias="issueCount")
    top_complaint_type: str = Field(alias="topComplaintType")
    active_breakdowns: int = Field(alias="activeBreakdowns")
    affected_students: int = Field(alias="affectedStudents")


class WifiDensityNode(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    location_id: str = Field(alias="locationId")
    zone_name: str = Field(alias="zoneName")
    incident_count: int = Field(alias="incidentCount")
    signal_severity: str = Field(alias="signalSeverity")
    active_now: bool = Field(alias="activeNow")


class Rolling7DayVelocityItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    date_str: str = Field(alias="dateStr")
    submitted: int
    resolved: int
    sla_breaches: int = Field(alias="slaBreaches")


class TrendAnalyticsResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    hostel_blocks: List[HostelBlockRollup] = Field(alias="hostelBlocks")
    hostel_floors: List[HostelFloorRollup] = Field(alias="hostelFloors")
    hostel_issue_types: List[HostelIssueTypeRollup] = Field(alias="hostelIssueTypes")
    transport_routes: List[TransportRouteRollup] = Field(alias="transportRoutes")
    wifi_hotspots: List[WifiDensityNode] = Field(alias="wifiHotspots")
    rolling_7_day_velocity: List[Rolling7DayVelocityItem] = Field(alias="rolling7DayVelocity")
    generated_at: str = Field(alias="generatedAt")


class CalendarMultipliers(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    academic_phase: str = Field(alias="academicPhase")
    weather_season: str = Field(alias="weatherSeason")
    historical_spike_factor: float = Field(alias="historicalSpikeFactor")


class ZoneRiskForecast(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    zone_or_category: str = Field(alias="zoneOrCategory")
    department_id: str = Field(alias="departmentId")
    risk_score: int = Field(alias="riskScore")
    risk_level: str = Field(alias="riskLevel")
    predicted_ticket_surge: str = Field(alias="predictedTicketSurge")
    primary_driver: str = Field(alias="primaryDriver")
    preventive_action: str = Field(alias="preventiveAction")
    confidence: float


class RiskForecastResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    month_target: str = Field(alias="monthTarget")
    calendar_multipliers: CalendarMultipliers = Field(alias="calendarMultipliers")
    forecasts: List[ZoneRiskForecast]
    overall_campus_risk_score: int = Field(alias="overallCampusRiskScore")
    generated_at: str = Field(alias="generatedAt")
