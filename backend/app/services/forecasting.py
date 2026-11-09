"""
Calendar-Weighted Monthly Campus Risk Forecasting & Explainability Engine.
Ports src/services/riskForecasting.ts to Python 3.12 with identical math,
calendar multipliers, 1-100 severity bounds, driver explainability, and 9 campus zones.
"""

from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple


def get_academic_calendar_factors(date: Optional[datetime] = None) -> Dict[str, Any]:
    """Derives academic calendar factors and multipliers based on campus calendar cycles."""
    dt = date or datetime.now(timezone.utc)
    month = dt.month

    # Monsoon Season & Odd Semester Finals (Oct, Nov)
    if month in (10, 11):
        return {
            "monsoonFactor": 1.65,
            "examFactor": 1.50,
            "semesterStartFactor": 1.0,
            "breakFactor": 1.0,
            "overallMultiplier": 1.65,
            "phase": "Monsoon Season & Odd Semester Finals",
        }
    # Winter Vacation Break (Dec)
    elif month == 12:
        return {
            "monsoonFactor": 1.0,
            "examFactor": 1.0,
            "semesterStartFactor": 1.0,
            "breakFactor": 0.35,
            "overallMultiplier": 0.35,
            "phase": "Winter Vacation Break",
        }
    # Spring Semester Reopening (Jan)
    elif month == 1:
        return {
            "monsoonFactor": 1.0,
            "examFactor": 1.0,
            "semesterStartFactor": 1.40,
            "breakFactor": 1.0,
            "overallMultiplier": 1.40,
            "phase": "Spring Semester Reopening",
        }
    # Mid-Semester Regular Session (Feb, Mar)
    elif month in (2, 3):
        return {
            "monsoonFactor": 1.0,
            "examFactor": 1.0,
            "semesterStartFactor": 1.0,
            "breakFactor": 1.0,
            "overallMultiplier": 1.0,
            "phase": "Regular Mid-Semester Session",
        }
    # Even Semester Finals & Peak Summer (Apr, May)
    elif month in (4, 5):
        return {
            "monsoonFactor": 1.0,
            "examFactor": 1.50,
            "semesterStartFactor": 1.0,
            "breakFactor": 1.0,
            "overallMultiplier": 1.50,
            "phase": "Even Semester Finals & Peak Summer",
        }
    # Summer Vacation Break (Jun)
    elif month == 6:
        return {
            "monsoonFactor": 1.0,
            "examFactor": 1.0,
            "semesterStartFactor": 1.0,
            "breakFactor": 0.35,
            "overallMultiplier": 0.35,
            "phase": "Summer Vacation Break",
        }
    # Fall Semester Commencement & Reopening (Jul, Aug)
    elif month in (7, 8):
        return {
            "monsoonFactor": 1.0,
            "examFactor": 1.0,
            "semesterStartFactor": 1.40,
            "breakFactor": 1.0,
            "overallMultiplier": 1.40,
            "phase": "Fall Semester Reopening & Campus Onboarding",
        }
    # Default (Sep)
    else:
        return {
            "monsoonFactor": 1.0,
            "examFactor": 1.0,
            "semesterStartFactor": 1.0,
            "breakFactor": 1.0,
            "overallMultiplier": 1.0,
            "phase": "Regular Academic Session",
        }


def compute_risk_score(
    v30d: float,
    v_prev30d: float,
    unresolved: float,
    avg_age_days: float,
    w_calendar: float,
    urgent_count: float,
) -> Dict[str, Any]:
    """
    1-100 Monthly Risk Severity Score per zone:
    C_velocity = min(35, 15 * (v_30d + 1)/(v_prev30d + 1) + v_30d / 10)
    C_backlog  = min(30, (unresolved / (v_30d + 1)) * 20 + min(10, avgAgeDays * 2))
    C_calendar = min(25, max(0, (w_calendar - 1.0) * 35))
    C_urgency  = min(10, (urgentCount / (v_30d + 1)) * 20)
    Score = clamp(1, 100, round(C_velocity + C_backlog + C_calendar + C_urgency))
    """
    c_velocity = min(35.0, 15.0 * ((v30d + 1.0) / (v_prev30d + 1.0)) + v30d / 10.0)
    c_backlog = min(30.0, (unresolved / (v30d + 1.0)) * 20.0 + min(10.0, avg_age_days * 2.0))
    c_calendar = min(25.0, max(0.0, (w_calendar - 1.0) * 35.0))
    c_urgency = min(10.0, (urgent_count / (v30d + 1.0)) * 20.0)

    raw_score = round(c_velocity + c_backlog + c_calendar + c_urgency)
    score = max(1, min(100, raw_score))

    level = "HIGH_RISK" if score >= 70 else ("ELEVATED" if score >= 40 else "LOW")

    primary_driver = "Stable operational metrics across historical baseline"
    if c_velocity >= max(c_backlog, c_calendar, c_urgency):
        primary_driver = f"Accelerating complaint submission velocity contributing {round(c_velocity)} risk points"
    elif c_backlog >= max(c_velocity, c_calendar, c_urgency):
        primary_driver = f"Accumulating unresolved ticket backlog aging beyond SLAs contributing {round(c_backlog)} risk points"
    elif c_calendar >= max(c_velocity, c_backlog, c_urgency):
        primary_driver = f"Academic & seasonal calendar spike factor contributing {round(c_calendar)} risk points"
    elif c_urgency >= max(c_velocity, c_backlog, c_calendar):
        primary_driver = f"Elevated proportion of emergency and urgent incidents contributing {round(c_urgency)} risk points"

    return {"score": score, "level": level, "primaryDriver": primary_driver}


def get_zone_recommendation(zone: str, level: str) -> Dict[str, Any]:
    """Returns actionable recommendation and priority based on zone and risk level."""
    if level == "HIGH_RISK":
        if "Hostel" in zone:
            rec = f"Deploy emergency plumbing and roof inspection crews to {zone}; clear drainages before rainfall peak."
        elif "Transport" in zone:
            rec = "Deploy 3 backup feeder buses for peak morning routes and initiate tire pressure audits."
        elif "Wi-Fi" in zone:
            rec = "Upgrade switch AP uplink bandwidth in Library/CSE and rebalance access point channel load."
        elif "Electrical" in zone:
            rec = "Dispatch licensed electricians to replace faulty breakers and burned fan regulators."
        elif "Mess" in zone or "Dining" in zone:
            rec = "Implement staggered lunch batches and replenish dining hall water filtration units."
        else:
            rec = f"Immediate administrative intervention and emergency crew dispatch required for {zone}."
        return {"recommendation": rec, "priority": "urgent"}

    elif level == "ELEVATED":
        if "Hostel" in zone:
            rec = f"Schedule preventive inspections for bathroom plumbing fixtures and electrical switchboards in {zone}."
        elif "Transport" in zone:
            rec = "Review route scheduling and reassign high-capacity buses to routes with delay frequency > 25%."
        elif "Wi-Fi" in zone:
            rec = "Inspect saturated AP controllers and replace aging floor PoE switches."
        elif "Electrical" in zone:
            rec = "Conduct preventative thermal scanning on main distribution switchboards."
        elif "Mess" in zone or "Dining" in zone:
            rec = "Audit mess queue wait times and verify raw ingredient refrigeration."
        else:
            rec = f"Schedule preventive maintenance and monitor backlog closely for {zone}."
        return {"recommendation": rec, "priority": "medium"}

    else:
        if "Transport" in zone:
            rec = "Transport operations running normally within dispatch SLAs."
        elif "Wi-Fi" in zone:
            rec = "Wi-Fi coverage and throughput are within operational parameters."
        else:
            rec = f"Routine maintenance schedule is adequate for {zone}; no immediate intervention required."
        return {"recommendation": rec, "priority": "low"}


def compute_risk_forecast(
    grievances: List[Dict[str, Any]],
    current_date: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Computes comprehensive risk forecast across all 9 campus zones."""
    now = current_date or datetime.now(timezone.utc)
    factors = get_academic_calendar_factors(now)

    ref_time = now.timestamp()
    if grievances:
        max_time = 0.0
        for g in grievances:
            ts = g.get("created_at") or g.get("createdAt")
            if ts:
                try:
                    dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
                    val = dt.timestamp()
                    if val > max_time:
                        max_time = val
                except Exception:
                    pass
        if max_time > 0 and abs(ref_time - max_time) > 30 * 86400:
            ref_time = max_time

    day_sec = 86400.0
    t30d = ref_time - 30.0 * day_sec
    t60d = ref_time - 60.0 * day_sec

    # Canonical 9 Campus Operational Zones
    zone_definitions = [
        {
            "name": "Hostel Block A",
            "matcher": lambda g: g.get("hostel_block") in ("A", "Block A") or "block a" in str(g.get("location_tag") or "").lower(),
            "calendarFactor": factors["monsoonFactor"],
            "dept": "dept-hostel",
        },
        {
            "name": "Hostel Block B",
            "matcher": lambda g: g.get("hostel_block") in ("B", "Block B") or "block b" in str(g.get("location_tag") or "").lower(),
            "calendarFactor": factors["monsoonFactor"],
            "dept": "dept-hostel",
        },
        {
            "name": "Hostel Block C",
            "matcher": lambda g: g.get("hostel_block") in ("C", "Block C") or "block c" in str(g.get("location_tag") or "").lower(),
            "calendarFactor": factors["monsoonFactor"],
            "dept": "dept-hostel",
        },
        {
            "name": "Hostel Block D",
            "matcher": lambda g: g.get("hostel_block") in ("D", "Block D") or "block d" in str(g.get("location_tag") or "").lower(),
            "calendarFactor": factors["monsoonFactor"],
            "dept": "dept-hostel",
        },
        {
            "name": "Hostel Block E",
            "matcher": lambda g: g.get("hostel_block") in ("E", "Block E") or "block e" in str(g.get("location_tag") or "").lower(),
            "calendarFactor": factors["monsoonFactor"],
            "dept": "dept-hostel",
        },
        {
            "name": "Campus Bus Transport Network",
            "matcher": lambda g: g.get("category") == "Bus & Transport" or bool(g.get("transport_route")) or "bus" in str(g.get("category", "")).lower(),
            "calendarFactor": factors["semesterStartFactor"] if factors["semesterStartFactor"] > 1.0 else 1.10,
            "dept": "dept-transport",
        },
        {
            "name": "Departmental & Library Wi-Fi",
            "matcher": lambda g: g.get("category") in ("Network & Wi-Fi", "Hostel Wi-Fi & Internet", "Library & Wi-Fi") or "wifi" in str(g.get("category", "")).lower(),
            "calendarFactor": factors["examFactor"],
            "dept": "dept-it",
        },
        {
            "name": "Campus Electrical & AC Utilities",
            "matcher": lambda g: g.get("category") == "Electrical & AC" or any(k in str(g.get("category", "")).lower() for k in ("electric", "power", "ac")),
            "calendarFactor": factors["monsoonFactor"],
            "dept": "dept-infra",
        },
        {
            "name": "Dining & Mess Facilities",
            "matcher": lambda g: g.get("category") in ("Food & Mess", "Canteen & Cafeteria") or any(k in str(g.get("category", "")).lower() for k in ("mess", "dining", "food", "canteen")),
            "calendarFactor": factors["overallMultiplier"],
            "dept": "dept-mess",
        },
    ]

    zone_forecasts = []
    for zdef in zone_definitions:
        ztickets = [g for g in (grievances or []) if zdef["matcher"](g)]

        v30d = 0.0
        v_prev30d = 0.0
        unresolved = 0.0
        total_age_days = 0.0
        urgent_count = 0.0

        for t in ztickets:
            created_ts = 0.0
            ts_str = t.get("created_at") or t.get("createdAt")
            if ts_str:
                try:
                    dt = datetime.fromisoformat(str(ts_str).replace("Z", "+00:00"))
                    created_ts = dt.timestamp()
                except Exception:
                    pass

            if t30d <= created_ts <= ref_time:
                v30d += 1.0
                if t.get("priority") in ("urgent", "high", "Critical") or t.get("is_urgent"):
                    urgent_count += 1.0
            elif t60d <= created_ts < t30d:
                v_prev30d += 1.0

            if str(t.get("status", "")).lower() not in ("resolved", "merged_automatic", "merged"):
                unresolved += 1.0
                if created_ts > 0.0:
                    age_days = max(0.0, (ref_time - created_ts) / day_sec)
                    total_age_days += age_days

        avg_age_days = (total_age_days / unresolved) if unresolved > 0.0 else 1.0

        res = compute_risk_score(
            v30d=v30d,
            v_prev30d=v_prev30d,
            unresolved=unresolved,
            avg_age_days=avg_age_days,
            w_calendar=zdef["calendarFactor"],
            urgent_count=urgent_count,
        )

        rec = get_zone_recommendation(zdef["name"], res["level"])
        surge_pct = int(res["score"] * 0.85)

        zone_forecasts.append({
            "zone": zdef["name"],
            "zoneOrCategory": zdef["name"],
            "departmentId": zdef["dept"],
            "riskScore": res["score"],
            "riskLevel": res["level"],
            "primaryDriver": res["primaryDriver"],
            "actionableRecommendation": rec["recommendation"],
            "preventiveAction": rec["recommendation"],
            "urgencyPriority": rec["priority"],
            "predictedTicketSurge": f"+{surge_pct}%",
            "confidence": 0.88,
        })

    # Campus-wide evaluation
    campus_v30d = 0.0
    campus_v_prev30d = 0.0
    campus_unresolved = 0.0
    campus_total_age = 0.0
    campus_urgent = 0.0

    for t in (grievances or []):
        created_ts = 0.0
        ts_str = t.get("created_at") or t.get("createdAt")
        if ts_str:
            try:
                dt = datetime.fromisoformat(str(ts_str).replace("Z", "+00:00"))
                created_ts = dt.timestamp()
            except Exception:
                pass

        if t30d <= created_ts <= ref_time:
            campus_v30d += 1.0
            if t.get("priority") in ("urgent", "high", "Critical") or t.get("is_urgent"):
                campus_urgent += 1.0
        elif t60d <= created_ts < t30d:
            campus_v_prev30d += 1.0

        if str(t.get("status", "")).lower() not in ("resolved", "merged_automatic", "merged"):
            campus_unresolved += 1.0
            if created_ts > 0.0:
                campus_total_age += max(0.0, (ref_time - created_ts) / day_sec)

    campus_avg_age = (campus_total_age / campus_unresolved) if campus_unresolved > 0.0 else 1.5
    overall_res = compute_risk_score(
        v30d=campus_v30d,
        v_prev30d=campus_v_prev30d,
        unresolved=campus_unresolved,
        avg_age_days=campus_avg_age,
        w_calendar=factors["overallMultiplier"],
        urgent_count=campus_urgent,
    )

    return {
        "overallCampusRiskScore": overall_res["score"],
        "overallRiskLevel": overall_res["level"],
        "academicTermPhase": factors["phase"],
        "calendarMultipliers": {
            "monsoonFactor": factors["monsoonFactor"],
            "examFactor": factors["examFactor"],
            "semesterStartFactor": factors["semesterStartFactor"],
            "historicalSpikeFactor": factors["overallMultiplier"],
            "weatherSeason": "Monsoon" if now.month in (10, 11) else "Standard",
        },
        "zoneForecasts": zone_forecasts,
        "forecasts": zone_forecasts,
        "monthTarget": now.strftime("%B %Y"),
        "generatedAt": now.isoformat(),
    }


def get_campus_risk_forecast(grievances: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Returns full campus risk forecast for given grievance state."""
    return compute_risk_forecast(grievances)
