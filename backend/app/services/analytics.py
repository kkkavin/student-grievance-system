"""
Predictive Analytics & Multidimensional Rollup Engine.
Ports src/services/analyticsRollup.ts to Python 3.12 with complete schema parity.
Supports: Hostel Maintenance byBlock/byFloor/byIssueType, Transport route rollups,
Wi-Fi incident density matrix, and rolling 7-day velocity.
"""

from datetime import datetime, timezone, timedelta
import re
from typing import Any, Dict, List, Optional


def infer_issue_type(description: Optional[str] = None, category: Optional[str] = None) -> str:
    """Infers issue type for hostel maintenance complaints."""
    text = f"{category or ''} {description or ''}".lower()
    if re.search(r"clean|dirt|trash|garbage|dust|sweep|mop|hygiene|waste|smell|dispenser|pest|cockroach|mosquito", text):
        return "cleaning"
    if re.search(r"power|electric|spark|socket|switch|\bwire\b|fuse|voltage|\bfan\b|\bac\b|air\s*condition|light|tube|bulb", text):
        return "power"
    if re.search(r"leak|pipe|tap|drain|flush|sink|toilet|washroom|water|seepage|overflow|clog|plumb", text):
        return "plumbing"
    if re.search(r"repair|broken|damage|window|door|lock|table|chair|cot|bed|wall|latch|hinge|crack|cupboard", text):
        return "repairs"
    return "repairs"


def infer_transport_incident_type(description: Optional[str] = None) -> str:
    """Infers incident type for transport complaints."""
    text = (description or "").lower()
    if re.search(r"crowd|rush|overload|overcrowd|seat|unable to board|capacity|surge|standing|packed", text):
        return "capacity_surge"
    if re.search(r"breakdown|tyre|tire|puncture|engine|smoke|repair|brake|mechanical|oil|overheating", text):
        return "maintenance"
    return "delay"


def compute_hostel_maintenance_rollup(grievances: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Aggregates hostel complaints by Block, Floor (1-4), and Issue Type."""
    if not grievances:
        return {"byBlock": [], "byFloor": [], "byIssueType": []}

    hostel_tickets = [
        g for g in grievances
        if g.get("category") == "Hostel Maintenance"
        or g.get("hostel_block")
        or g.get("hostelBlock")
        or re.search(r"hostel|room|mess", str(g.get("category", "")), re.IGNORECASE)
    ]

    block_map: Dict[str, Dict[str, int]] = {}
    floor_map: Dict[str, Dict[str, Any]] = {}
    issue_map: Dict[str, Dict[str, float]] = {}

    for t in hostel_tickets:
        raw_block = t.get("hostel_block") or t.get("hostelBlock")
        loc_tag = str(t.get("location_tag") or t.get("locationTag") or "")
        desc = str(t.get("description") or "")

        if raw_block:
            m = re.search(r"Block\s*([A-E])", str(raw_block), re.IGNORECASE) or re.search(r"\b([A-E])\b", str(raw_block), re.IGNORECASE)
            if m:
                block = f"Block {m.group(1).upper()}"
            else:
                block = str(raw_block)
        elif loc_tag:
            m = re.search(r"Block\s*([A-E])", loc_tag, re.IGNORECASE)
            if m:
                block = f"Block {m.group(1).upper()}"
        elif desc:
            m = re.search(r"Block\s*([A-E])", desc, re.IGNORECASE)
            if m:
                block = f"Block {m.group(1).upper()}"
        block = block or "Block A"

        if block not in block_map:
            block_map[block] = {"total": 0, "pending": 0, "resolved": 0, "merged": 0}
        b_entry = block_map[block]
        b_entry["total"] += 1

        status = str(t.get("status") or "").lower()
        if status == "resolved":
            b_entry["resolved"] += 1
        elif status in ("merged_automatic", "merged"):
            b_entry["merged"] += 1
        else:
            b_entry["pending"] += 1

        # Floor extraction (1-4)
        floor = 1
        room_no = str(t.get("room_no") or t.get("roomNo") or t.get("roomNumber") or "")
        if room_no:
            m = re.match(r"(?:[A-Z]-)?([0-9])([0-9]{2})", room_no)
            if m:
                floor = max(1, min(4, int(m.group(1))))
        elif loc_tag:
            m = re.search(r"Floor\s*([1-4])", loc_tag, re.IGNORECASE)
            if m:
                floor = int(m.group(1))

        issue = t.get("issue_type") or t.get("issueType") or infer_issue_type(desc, t.get("category"))
        floor_key = f"{block}_F{floor}"
        if floor_key not in floor_map:
            floor_map[floor_key] = {"block": block, "floor": floor, "total": 0, "issueType": issue}
        floor_map[floor_key]["total"] += 1

        # Issue Type metrics
        if issue not in issue_map:
            issue_map[issue] = {"count": 0.0, "total_hours": 0.0}
        i_entry = issue_map[issue]
        i_entry["count"] += 1.0

        hours = 24.0
        resolved_at = t.get("resolved_at") or t.get("resolvedAt")
        created_at = t.get("created_at") or t.get("createdAt")
        if resolved_at and created_at:
            try:
                dt_res = datetime.fromisoformat(str(resolved_at).replace("Z", "+00:00"))
                dt_cre = datetime.fromisoformat(str(created_at).replace("Z", "+00:00"))
                diff = (dt_res - dt_cre).total_seconds() / 3600.0
                if diff > 0:
                    hours = diff
            except Exception:
                pass
        i_entry["total_hours"] += hours

    by_block = [
        {
            "block": block,
            "total": d["total"],
            "pending": d["pending"],
            "resolved": d["resolved"],
            "consolidationRatio": round(min(1.0, max(0.0, d["merged"] / d["total"])), 2) if d["total"] > 0 else 0.0,
        }
        for block, d in block_map.items()
    ]

    by_floor = list(floor_map.values())

    by_issue_type = [
        {
            "issueType": issue,
            "count": int(d["count"]),
            "avgResolutionHours": round(d["total_hours"] / max(1.0, d["count"]), 1),
        }
        for issue, d in issue_map.items()
    ]

    return {"byBlock": by_block, "byFloor": by_floor, "byIssueType": by_issue_type}


def compute_transport_rollup(grievances: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Aggregates campus transport tickets by route with delay frequency and capacity surges."""
    if not grievances:
        return {"byRoute": [], "peakCongestionStops": []}

    transport_tickets = [
        g for g in grievances
        if g.get("category") == "Bus & Transport"
        or g.get("transport_route")
        or g.get("transportRoute")
        or re.search(r"bus|transport|route", str(g.get("category", "")), re.IGNORECASE)
    ]

    route_map: Dict[str, Dict[str, int]] = {}
    for t in transport_tickets:
        route = t.get("transport_route") or t.get("transportRoute")
        desc = f"{t.get('description', '')} {t.get('location_tag', '')} {t.get('locationTag', '')}"
        if not route:
            m = re.search(r"Route\s*#?(\d+)", desc, re.IGNORECASE)
            route = f"Route {m.group(1)}" if m else "Route 1"

        if route not in route_map:
            route_map[route] = {"total": 0, "delays": 0, "maintenance": 0, "surges": 0}
        entry = route_map[route]
        entry["total"] += 1

        inc = t.get("transport_incident_type") or t.get("transportIncidentType") or infer_transport_incident_type(t.get("description"))
        if inc == "delay":
            entry["delays"] += 1
        elif inc == "maintenance":
            entry["maintenance"] += 1
        elif inc == "capacity_surge":
            entry["surges"] += 1

    by_route = []
    for route, d in route_map.items():
        delay_pct = round((d["delays"] / d["total"]) * 100) if d["total"] > 0 else 0
        surge_index = d["surges"] * 10
        status = "SURGE" if d["surges"] >= 2 else ("DELAYED" if delay_pct >= 30 else "NORMAL")
        by_route.append({
            "route": route,
            "delayFrequencyPct": delay_pct,
            "maintenanceIncidents": d["maintenance"],
            "capacitySurgeIndex": surge_index,
            "status": status,
        })

    return {
        "byRoute": by_route,
        "peakCongestionStops": ["Bypass Junction", "Tollgate Highway", "South Gate Stop", "Main Terminal"],
    }


def compute_wifi_density_matrix(grievances: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Computes network incident density matrix classified into LOW, MEDIUM, HIGH."""
    if not grievances:
        return {"densityMatrix": []}

    wifi_tickets = [
        g for g in grievances
        if g.get("category") in ("Network & Wi-Fi", "Hostel Wi-Fi & Internet", "Library & Wi-Fi")
        or g.get("department_block")
        or g.get("departmentBlock")
        or re.search(r"wifi|internet|network|bandwidth", str(g.get("category", "")), re.IGNORECASE)
    ]

    matrix_map: Dict[str, Dict[str, Any]] = {}
    for t in wifi_tickets:
        dept = t.get("department_block") or t.get("departmentBlock")
        desc = f"{t.get('description', '')} {t.get('location_tag', '')} {t.get('locationTag', '')}"
        if not dept:
            m = re.search(r"\b(CSE|ECE|MECH|CIVIL|IT|LIBRARY)\b", desc, re.IGNORECASE)
            dept = m.group(1).upper() if m else "CSE"

        ap = t.get("ap_controller") or t.get("apController") or f"AP-{dept}-F1-01"
        sw = t.get("switch_id") or t.get("switchId") or f"SW-{dept}-F1"
        key = f"{dept}_{ap}_{sw}"

        if key not in matrix_map:
            matrix_map[key] = {"departmentBlock": dept, "apController": ap, "switchId": sw, "count": 0}
        matrix_map[key]["count"] += 1

    density_matrix = []
    for d in matrix_map.values():
        level = "HIGH" if d["count"] >= 8 else ("MEDIUM" if d["count"] >= 4 else "LOW")
        density_matrix.append({
            "departmentBlock": d["departmentBlock"],
            "apController": d["apController"],
            "switchId": d["switchId"],
            "incidentCount": d["count"],
            "densityLevel": level,
        })

    return {"densityMatrix": density_matrix}


def compute_rolling_7_day_velocity(
    grievances: List[Dict[str, Any]],
    reference_date: Optional[datetime] = None,
) -> List[Dict[str, Any]]:
    """Computes 7-day complaint intake volume per category."""
    end_date = reference_date or datetime.now(timezone.utc)

    # Use max ticket date if reference date omitted and fixture dates are historic
    if not reference_date and grievances:
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
        if max_time > 0:
            max_dt = datetime.fromtimestamp(max_time, timezone.utc)
            if abs((end_date - max_dt).total_seconds()) > 30 * 86400:
                end_date = max_dt

    date_keys = [(end_date - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(6, -1, -1)]
    categories = [
        "Hostel Maintenance",
        "Bus & Transport",
        "Network & Wi-Fi",
        "Electrical & AC",
        "Food & Mess",
    ]

    count_map = {f"{d}__{cat}": 0 for d in date_keys for cat in categories}

    for g in grievances:
        ts = str(g.get("created_at") or g.get("createdAt") or "")[:10]
        cat = g.get("category") or "Hostel Maintenance"
        key = f"{ts}__{cat}"
        if key in count_map:
            count_map[key] += 1

    result = []
    for key, count in count_map.items():
        d_str, cat_str = key.split("__")
        result.append({"date": d_str, "category": cat_str, "count": count})

    return result


def get_campus_trend_analytics(grievances: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Returns combined TrendAnalyticsResponse."""
    return {
        "hostelMaintenance": compute_hostel_maintenance_rollup(grievances),
        "campusTransport": compute_transport_rollup(grievances),
        "networkWifi": compute_wifi_density_matrix(grievances),
        "rolling7DayVelocity": compute_rolling_7_day_velocity(grievances),
    }
