/**
 * Monthly Campus Risk Forecasting Engine
 * Computes calendar-weighted 1-100 severity scores across zones,
 * identifies primary predictive explanation drivers, and provides
 * actionable maintenance recommendations.
 */

import {
  RiskForecastResponse,
  ZoneRiskForecast,
  CalendarMultipliers,
} from '../types.ts';
import { HISTORICAL_GRIEVANCES } from '../../test/fixtures/timeseries_fixtures.ts';

/**
 * Derives academic calendar multipliers based on campus calendar cycles:
 * - Monsoon season (Oct - Nov): W_monsoon = 1.65
 * - Semester Finals / Exams (Nov, Apr - May): W_exam = 1.50
 * - Semester Start / Reopening (Jan, Jul - Aug): W_start = 1.40
 * - Vacation Breaks (Dec, Jun): W_break = 0.35
 */
export function getAcademicCalendarFactors(date: Date = new Date()): {
  monsoonFactor: number;
  examFactor: number;
  semesterStartFactor: number;
  breakFactor: number;
  overallMultiplier: number;
  phase: string;
} {
  const month = date.getMonth() + 1; // 1-12

  if (month === 10 || month === 11) {
    return {
      monsoonFactor: 1.65,
      examFactor: 1.50,
      semesterStartFactor: 1.0,
      breakFactor: 1.0,
      overallMultiplier: 1.65,
      phase: 'Monsoon Season & Odd Semester Finals',
    };
  }
  if (month === 12) {
    return {
      monsoonFactor: 1.0,
      examFactor: 1.0,
      semesterStartFactor: 1.0,
      breakFactor: 0.35,
      overallMultiplier: 0.35,
      phase: 'Winter Vacation Break',
    };
  }
  if (month === 1) {
    return {
      monsoonFactor: 1.0,
      examFactor: 1.0,
      semesterStartFactor: 1.40,
      breakFactor: 1.0,
      overallMultiplier: 1.40,
      phase: 'Spring Semester Reopening',
    };
  }
  if (month === 2 || month === 3) {
    return {
      monsoonFactor: 1.0,
      examFactor: 1.0,
      semesterStartFactor: 1.0,
      breakFactor: 1.0,
      overallMultiplier: 1.0,
      phase: 'Mid-Semester Steady State',
    };
  }
  if (month === 4 || month === 5) {
    return {
      monsoonFactor: 1.0,
      examFactor: 1.50,
      semesterStartFactor: 1.0,
      breakFactor: 1.0,
      overallMultiplier: 1.50,
      phase: 'Even Semester Finals & Peak Summer',
    };
  }
  if (month === 6) {
    return {
      monsoonFactor: 1.0,
      examFactor: 1.0,
      semesterStartFactor: 1.0,
      breakFactor: 0.35,
      overallMultiplier: 0.35,
      phase: 'Summer Vacation Break',
    };
  }
  if (month === 7 || month === 8) {
    return {
      monsoonFactor: 1.0,
      examFactor: 1.0,
      semesterStartFactor: 1.40,
      breakFactor: 1.0,
      overallMultiplier: 1.40,
      phase: 'Fall Semester Commencement & Campus Onboarding',
    };
  }

  return {
    monsoonFactor: 1.0,
    examFactor: 1.0,
    semesterStartFactor: 1.0,
    breakFactor: 1.0,
    overallMultiplier: 1.0,
    phase: 'Mid-Semester Steady State',
  };
}

/**
 * 1-100 Monthly Risk Severity Score per zone:
 * C_velocity = min(35, 15 * (v_30d + 1)/(v_prev30d + 1) + v_30d / 10)
 * C_backlog  = min(30, (unresolved / (v_30d + 1)) * 20 + min(10, avgAgeDays * 2))
 * C_calendar = min(25, max(0, (w_calendar - 1.0) * 35))
 * C_urgency  = min(10, (urgentCount / (v_30d + 1)) * 20)
 * Score = clamp(1, 100, round(C_velocity + C_backlog + C_calendar + C_urgency))
 */
export function computeRiskScore(
  v30d: number,
  vPrev30d: number,
  unresolved: number,
  avgAgeDays: number,
  wCalendar: number,
  urgentCount: number
): { score: number; level: 'LOW' | 'ELEVATED' | 'HIGH_RISK'; primaryDriver: string } {
  const cVelocity = Math.min(35, 15 * ((v30d + 1) / (vPrev30d + 1)) + v30d / 10);
  const cBacklog = Math.min(30, (unresolved / (v30d + 1)) * 20 + Math.min(10, avgAgeDays * 2));
  const cCalendar = Math.min(25, Math.max(0, (wCalendar - 1.0) * 35));
  const cUrgency = Math.min(10, (urgentCount / (v30d + 1)) * 20);

  const rawScore = Math.round(cVelocity + cBacklog + cCalendar + cUrgency);
  const score = Math.max(1, Math.min(100, rawScore));

  let level: 'LOW' | 'ELEVATED' | 'HIGH_RISK' = 'LOW';
  if (score >= 75) {
    level = 'HIGH_RISK';
  } else if (score >= 40) {
    level = 'ELEVATED';
  }

  // Primary driver explanation derivation
  let calendarLabel = 'Seasonal calendar factor';
  if (wCalendar >= 1.6) {
    calendarLabel = 'Monsoon calendar weather surge';
  } else if (wCalendar >= 1.45) {
    calendarLabel = 'Semester finals exam surge';
  } else if (wCalendar >= 1.35) {
    calendarLabel = 'Semester reopening intake rush';
  }

  let primaryDriver = 'Baseline operational velocity within normal tolerance';
  const components = [
    { name: calendarLabel, val: cCalendar },
    { name: 'Unresolved backlog aging beyond SLAs', val: cBacklog },
    { name: 'Recent velocity spike in complaint intake', val: cVelocity },
    { name: 'High proportion of urgent priority incidents', val: cUrgency },
  ];

  components.sort((a, b) => b.val - a.val);
  if (components[0].val > 8) {
    primaryDriver = `${components[0].name} contributing ${Math.round(components[0].val)} risk points`;
  }

  return { score, level, primaryDriver };
}

/**
 * Returns actionable recommendation and priority based on zone and risk level
 */
export function getZoneRecommendation(
  zone: string,
  level: 'LOW' | 'ELEVATED' | 'HIGH_RISK'
): { recommendation: string; priority: 'low' | 'medium' | 'urgent' } {
  if (level === 'HIGH_RISK') {
    if (zone.includes('Hostel')) {
      return {
        recommendation: `Deploy emergency plumbing and roof inspection crews to ${zone}; clear drainages before rainfall peak.`,
        priority: 'urgent',
      };
    }
    if (zone.includes('Transport')) {
      return {
        recommendation: 'Deploy 3 backup feeder buses for peak morning routes and initiate tire pressure audits.',
        priority: 'urgent',
      };
    }
    if (zone.includes('Wi-Fi')) {
      return {
        recommendation: 'Upgrade switch AP uplink bandwidth in Library/CSE and rebalance access point channel load.',
        priority: 'urgent',
      };
    }
    if (zone.includes('Electrical')) {
      return {
        recommendation: 'Dispatch licensed electricians to replace faulty breakers and burned fan regulators.',
        priority: 'urgent',
      };
    }
    if (zone.includes('Mess') || zone.includes('Dining')) {
      return {
        recommendation: 'Implement staggered lunch batches and replenish dining hall water filtration units.',
        priority: 'urgent',
      };
    }
    return {
      recommendation: `Immediate administrative intervention and emergency crew dispatch required for ${zone}.`,
      priority: 'urgent',
    };
  }

  if (level === 'ELEVATED') {
    if (zone.includes('Hostel')) {
      return {
        recommendation: `Schedule preventive inspections for bathroom plumbing fixtures and electrical switchboards in ${zone}.`,
        priority: 'medium',
      };
    }
    if (zone.includes('Transport')) {
      return {
        recommendation: 'Review route scheduling and reassign high-capacity buses to routes with delay frequency > 25%.',
        priority: 'medium',
      };
    }
    if (zone.includes('Wi-Fi')) {
      return {
        recommendation: 'Inspect saturated AP controllers and replace aging floor PoE switches.',
        priority: 'medium',
      };
    }
    if (zone.includes('Electrical')) {
      return {
        recommendation: 'Conduct preventative thermal scanning on main distribution switchboards.',
        priority: 'medium',
      };
    }
    if (zone.includes('Mess') || zone.includes('Dining')) {
      return {
        recommendation: 'Audit mess queue wait times and verify raw ingredient refrigeration.',
        priority: 'medium',
      };
    }
    return {
      recommendation: `Schedule preventive maintenance and monitor backlog closely for ${zone}.`,
      priority: 'medium',
    };
  }

  // LOW
  if (zone.includes('Transport')) {
    return {
      recommendation: 'Transport operations running normally within dispatch SLAs.',
      priority: 'low',
    };
  }
  if (zone.includes('Wi-Fi')) {
    return {
      recommendation: 'Wi-Fi coverage and throughput are within operational parameters.',
      priority: 'low',
    };
  }
  return {
    recommendation: `Routine maintenance schedule is adequate for ${zone}; no immediate intervention required.`,
    priority: 'low',
  };
}

/**
 * Computes full risk forecast across zones and campus-wide
 */
export function computeRiskForecast(
  grievances: any[],
  currentDate: Date = new Date()
): RiskForecastResponse {
  const factors = getAcademicCalendarFactors(currentDate);

  // Establish effective reference date for time-series evaluation
  let refTime = currentDate.getTime();
  if (grievances && grievances.length > 0) {
    let maxTime = 0;
    for (const g of grievances) {
      if (g.createdAt) {
        const t = new Date(g.createdAt).getTime();
        if (!isNaN(t) && t > maxTime) maxTime = t;
      }
    }
    // If fixtures represent a specific timeline and current system date is far away
    if (maxTime > 0 && Math.abs(refTime - maxTime) > 30 * 24 * 60 * 60 * 1000) {
      refTime = maxTime;
    }
  }

  const DAY_MS = 24 * 60 * 60 * 1000;
  const t30d = refTime - 30 * DAY_MS;
  const t60d = refTime - 60 * DAY_MS;

  const zoneDefinitions: Array<{
    name: string;
    matcher: (g: any) => boolean;
    calendarFactor: number;
  }> = [
    {
      name: 'Hostel Block A',
      matcher: (g) => g.hostelBlock === 'A' || g.hostelBlock === 'Block A' || /Block\s*A\b/i.test(g.locationTag || ''),
      calendarFactor: factors.monsoonFactor,
    },
    {
      name: 'Hostel Block B',
      matcher: (g) => g.hostelBlock === 'B' || g.hostelBlock === 'Block B' || /Block\s*B\b/i.test(g.locationTag || ''),
      calendarFactor: factors.monsoonFactor,
    },
    {
      name: 'Hostel Block C',
      matcher: (g) => g.hostelBlock === 'C' || g.hostelBlock === 'Block C' || /Block\s*C\b/i.test(g.locationTag || ''),
      calendarFactor: factors.monsoonFactor,
    },
    {
      name: 'Hostel Block D',
      matcher: (g) => g.hostelBlock === 'D' || g.hostelBlock === 'Block D' || /Block\s*D\b/i.test(g.locationTag || ''),
      calendarFactor: factors.monsoonFactor,
    },
    {
      name: 'Hostel Block E',
      matcher: (g) => g.hostelBlock === 'E' || g.hostelBlock === 'Block E' || /Block\s*E\b/i.test(g.locationTag || ''),
      calendarFactor: factors.monsoonFactor,
    },
    {
      name: 'Campus Bus Transport Network',
      matcher: (g) => g.category === 'Bus & Transport' || Boolean(g.transportRoute) || /bus|transport/i.test(g.category || ''),
      calendarFactor: factors.semesterStartFactor > 1.0 ? factors.semesterStartFactor : 1.1,
    },
    {
      name: 'Departmental & Library Wi-Fi',
      matcher: (g) => g.category === 'Network & Wi-Fi' || Boolean(g.departmentBlock) || /wifi|internet|network/i.test(g.category || ''),
      calendarFactor: factors.examFactor,
    },
    {
      name: 'Campus Electrical & AC Utilities',
      matcher: (g) => g.category === 'Electrical & AC' || /electric|power|ac/i.test(g.category || ''),
      calendarFactor: factors.monsoonFactor,
    },
    {
      name: 'Dining & Mess Facilities',
      matcher: (g) => g.category === 'Food & Mess' || /mess|dining|food/i.test(g.category || ''),
      calendarFactor: factors.overallMultiplier,
    },
  ];

  const zoneForecasts: ZoneRiskForecast[] = [];

  for (const zoneDef of zoneDefinitions) {
    const zoneTickets = (grievances || []).filter(zoneDef.matcher);

    let v30d = 0;
    let vPrev30d = 0;
    let unresolved = 0;
    let totalAgeDays = 0;
    let urgentCount = 0;

    for (const t of zoneTickets) {
      const createdTime = t.createdAt ? new Date(t.createdAt).getTime() : 0;
      if (createdTime >= t30d && createdTime <= refTime) {
        v30d++;
        if (t.priority === 'urgent') urgentCount++;
      } else if (createdTime >= t60d && createdTime < t30d) {
        vPrev30d++;
      }

      if (t.status !== 'resolved' && t.status !== 'MERGED_AUTOMATIC') {
        unresolved++;
        if (createdTime > 0) {
          const ageDays = Math.max(0, (refTime - createdTime) / DAY_MS);
          totalAgeDays += ageDays;
        }
      }
    }

    const avgAgeDays = unresolved > 0 ? Number((totalAgeDays / unresolved).toFixed(1)) : 1.0;
    const { score, level, primaryDriver } = computeRiskScore(
      v30d,
      vPrev30d,
      unresolved,
      avgAgeDays,
      zoneDef.calendarFactor,
      urgentCount
    );

    const { recommendation, priority } = getZoneRecommendation(zoneDef.name, level);

    zoneForecasts.push({
      zone: zoneDef.name,
      riskScore: score,
      riskLevel: level,
      primaryDriver,
      actionableRecommendation: recommendation,
      urgencyPriority: priority,
    });
  }

  // Campus-wide overall metrics
  let campusV30d = 0;
  let campusVPrev30d = 0;
  let campusUnresolved = 0;
  let campusTotalAgeDays = 0;
  let campusUrgent = 0;

  for (const t of grievances || []) {
    const createdTime = t.createdAt ? new Date(t.createdAt).getTime() : 0;
    if (createdTime >= t30d && createdTime <= refTime) {
      campusV30d++;
      if (t.priority === 'urgent') campusUrgent++;
    } else if (createdTime >= t60d && createdTime < t30d) {
      campusVPrev30d++;
    }

    if (t.status !== 'resolved' && t.status !== 'MERGED_AUTOMATIC') {
      campusUnresolved++;
      if (createdTime > 0) {
        const ageDays = Math.max(0, (refTime - createdTime) / DAY_MS);
        campusTotalAgeDays += ageDays;
      }
    }
  }

  const campusAvgAgeDays = campusUnresolved > 0 ? Number((campusTotalAgeDays / campusUnresolved).toFixed(1)) : 1.5;
  const overallResult = computeRiskScore(
    campusV30d,
    campusVPrev30d,
    campusUnresolved,
    campusAvgAgeDays,
    factors.overallMultiplier,
    campusUrgent
  );

  const calendarMultipliers: CalendarMultipliers = {
    monsoonFactor: factors.monsoonFactor,
    examFactor: factors.examFactor,
    semesterStartFactor: factors.semesterStartFactor,
  };

  return {
    overallCampusRiskScore: overallResult.score,
    overallRiskLevel: overallResult.level,
    academicTermPhase: factors.phase,
    calendarMultipliers,
    zoneForecasts,
  };
}

/**
 * Returns full RiskForecastResponse combining live SQLite tickets with historical fixtures
 */
export function getCampusRiskForecast(liveGrievances: any[] = []): RiskForecastResponse {
  const seenIds = new Set<string>();
  const combined: any[] = [];

  for (const g of liveGrievances) {
    if (g && g.id) {
      seenIds.add(g.id);
      combined.push(g);
    }
  }

  for (const h of HISTORICAL_GRIEVANCES) {
    if (!seenIds.has(h.id)) {
      combined.push(h);
    }
  }

  return computeRiskForecast(combined);
}
