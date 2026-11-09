"""Analytics and forecasting services package."""
try:
    from backend.app.services.analytics import (
        compute_hostel_maintenance_rollup,
        compute_transport_rollup,
        compute_wifi_density_matrix,
        compute_rolling_7_day_velocity,
        get_campus_trend_analytics,
        infer_issue_type,
        infer_transport_incident_type,
    )
    from backend.app.services.forecasting import (
        get_academic_calendar_factors,
        compute_risk_score,
        get_zone_recommendation,
        compute_risk_forecast,
        get_campus_risk_forecast,
    )
except ImportError:
    from app.services.analytics import (
        compute_hostel_maintenance_rollup,
        compute_transport_rollup,
        compute_wifi_density_matrix,
        compute_rolling_7_day_velocity,
        get_campus_trend_analytics,
        infer_issue_type,
        infer_transport_incident_type,
    )
    from app.services.forecasting import (
        get_academic_calendar_factors,
        compute_risk_score,
        get_zone_recommendation,
        compute_risk_forecast,
        get_campus_risk_forecast,
    )

__all__ = [
    "compute_hostel_maintenance_rollup",
    "compute_transport_rollup",
    "compute_wifi_density_matrix",
    "compute_rolling_7_day_velocity",
    "get_campus_trend_analytics",
    "infer_issue_type",
    "infer_transport_incident_type",
    "get_academic_calendar_factors",
    "compute_risk_score",
    "get_zone_recommendation",
    "compute_risk_forecast",
    "get_campus_risk_forecast",
]
