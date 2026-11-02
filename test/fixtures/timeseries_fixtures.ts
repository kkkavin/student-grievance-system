/**
 * Time-Series Test Fixtures
 * 200 Synthetic Historical Grievances spanning 12 Academic Months (Nov 2025 - Oct 2026)
 * across Hostel Blocks (A, B, C, D, E), Transport Routes (1-12), and Network AP Zones.
 * Models realistic seasonal surges:
 * - Monsoon Rainfall Surge (Oct - Nov): plumbing leaks, drainage backup, ceiling seepage in Blocks A & B.
 * - Semester Exam Surge (Nov, Apr - May): Wi-Fi bandwidth saturation, quiet hours, study hall AC.
 * - Semester Reopening Surge (Jul - Aug): Bus capacity surges, route delays, mess allocation.
 * - Vacation Quiet Periods (Dec, Jun): Low baseline volume.
 */

export interface HistoricalGrievance {
  id: string;
  ticketNo: string;
  studentRegNo: string;
  studentName: string;
  studentEmail: string;
  studentPhone?: string;
  studentType: 'hosteller' | 'dayscholar';
  hostelBlock?: string;
  roomNo?: string;
  category: string;
  description: string;
  status: 'pending' | 'in_progress' | 'resolved' | 'PRIMARY' | 'MERGED_AUTOMATIC';
  priority: 'urgent' | 'medium' | 'less_important';
  locationTag: string;
  sourceTimestamp: string;
  createdAt: string;
  resolvedAt?: string;
  isSpam: boolean;
  masterCaseId?: string | null;
  issueType?: 'plumbing' | 'power' | 'cleaning' | 'repairs' | 'other';
  transportRoute?: string;
  transportIncidentType?: 'delay' | 'maintenance' | 'capacity_surge';
  apController?: string;
  switchId?: string;
  departmentBlock?: string;
}

// Deterministic seed generation for 200 grievances
function buildHistoricalGrievances(): HistoricalGrievance[] {
  const grievances: HistoricalGrievance[] = [];
  const hostelBlocks = ['A', 'B', 'C', 'D', 'E'];
  const routes = Array.from({ length: 12 }, (_, i) => `Route ${i + 1}`);
  const departments = ['CSE', 'ECE', 'MECH', 'CIVIL', 'IT', 'LIBRARY'];

  const studentFirstNames = ['Aarav', 'Priya', 'Rohan', 'Sneha', 'Vikram', 'Divya', 'Karthik', 'Ananya', 'Sanjay', 'Meera', 'Arun', 'Pooja', 'Harish', 'Kavitha', 'Ganesh', 'Deepa', 'Naveen', 'Swathi', 'Manoj', 'Nisha'];
  const studentLastNames = ['Patel', 'Sharma', 'Sundaram', 'Nair', 'Singh', 'Kumar', 'Reddy', 'Menon', 'Iyer', 'Babu', 'Verma', 'Krishnan', 'Roy', 'Joshi', 'Das', 'Sen', 'Rao', 'Pillai', 'Murugan', 'Gupta'];

  let ticketCounter = 1000;

  // Month definition: year, month (1-12), totalCount, surgeType
  const monthlyDistributions = [
    { year: 2025, month: 11, count: 28, surge: 'MONSOON_EXAM' },    // Nov 2025: Heavy monsoon + Odd semester finals
    { year: 2025, month: 12, count: 6,  surge: 'WINTER_BREAK' },    // Dec 2025: Vacation break
    { year: 2026, month: 1,  count: 16, surge: 'SPRING_START' },    // Jan 2026: Even semester reopening
    { year: 2026, month: 2,  count: 14, surge: 'NORMAL' },          // Feb 2026: Mid-semester steady state
    { year: 2026, month: 3,  count: 14, surge: 'NORMAL' },          // Mar 2026: Mid-semester steady state
    { year: 2026, month: 4,  count: 24, surge: 'EXAM_SUMMER' },     // Apr 2026: Even finals + summer heat
    { year: 2026, month: 5,  count: 22, surge: 'EXAM_SUMMER' },     // May 2026: Even finals peak
    { year: 2026, month: 6,  count: 5,  surge: 'SUMMER_BREAK' },    // Jun 2026: Summer vacation
    { year: 2026, month: 7,  count: 25, surge: 'FALL_REOPENING' },  // Jul 2026: Odd semester reopening + transport rush
    { year: 2026, month: 8,  count: 16, surge: 'NORMAL' },          // Aug 2026: Campus settling
    { year: 2026, month: 9,  count: 12, surge: 'NORMAL' },          // Sep 2026: Mid-semester
    { year: 2026, month: 10, count: 18, surge: 'MONSOON_ONSET' },   // Oct 2026: NE monsoon onset
  ];

  for (const dist of monthlyDistributions) {
    for (let i = 0; i < dist.count; i++) {
      ticketCounter++;
      const id = `hist_${dist.year}_${String(dist.month).padStart(2, '0')}_${String(i + 1).padStart(3, '0')}`;
      const ticketNo = `GRV-${dist.year}-${ticketCounter}`;
      
      const day = Math.min(28, (i * 2) % 27 + 1);
      const hour = (i * 3) % 24;
      const minute = (i * 7) % 60;
      const dateStr = `${dist.year}-${String(dist.month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`;

      const fn = studentFirstNames[(ticketCounter + i) % studentFirstNames.length];
      const ln = studentLastNames[(ticketCounter + i * 2) % studentLastNames.length];
      const studentName = `${fn} ${ln}`;
      const studentRegNo = `202${(ticketCounter % 4) + 2}CS${String(ticketCounter % 900 + 100)}`;
      const studentEmail = `${fn.toLowerCase()}.${ln[0].toLowerCase()}${ticketCounter % 100}@campus.edu`;

      let category = 'Hostel Maintenance';
      let studentType: 'hosteller' | 'dayscholar' = 'hosteller';
      let hostelBlock = hostelBlocks[i % hostelBlocks.length];
      const floorNum = (i % 4) + 1;
      let roomNo = `${hostelBlock}-${floorNum}0${(i % 8) + 1}`;
      let description = '';
      let locationTag = '';
      let priority: 'urgent' | 'medium' | 'less_important' = 'medium';
      let issueType: 'plumbing' | 'power' | 'cleaning' | 'repairs' | 'other' = 'repairs';
      let transportRoute: string | undefined = undefined;
      let transportIncidentType: 'delay' | 'maintenance' | 'capacity_surge' | undefined = undefined;
      let apController: string | undefined = undefined;
      let switchId: string | undefined = undefined;
      let departmentBlock: string | undefined = undefined;

      // Seasonal categorization skew
      if (dist.surge === 'MONSOON_EXAM' || dist.surge === 'MONSOON_ONSET') {
        const typeMod = i % 4;
        if (typeMod === 0 || typeMod === 1) {
          category = 'Hostel Maintenance';
          issueType = 'plumbing';
          priority = 'urgent';
          description = `Heavy monsoon rainwater seepage through ceiling and plumbing drain overflow in ${roomNo}.`;
          locationTag = `Hostel Block ${hostelBlock}, Floor ${floorNum}, Room ${roomNo}`;
        } else if (typeMod === 2) {
          category = 'Electrical & AC';
          issueType = 'power';
          priority = 'urgent';
          description = `Damp electrical switchboard sparking near corridor of Block ${hostelBlock} floor ${floorNum}.`;
          locationTag = `Hostel Block ${hostelBlock}, Floor ${floorNum}`;
        } else {
          category = 'Network & Wi-Fi';
          studentType = 'dayscholar';
          hostelBlock = undefined;
          roomNo = undefined;
          departmentBlock = 'LIBRARY';
          apController = 'AP-LIB-F2-01';
          switchId = 'SW-LIB-F2';
          description = `Library exam study hall Wi-Fi bandwidth completely throttled during evening revision hours.`;
          locationTag = `Central Library, Floor 2, AP-LIB-F2-01`;
          priority = 'urgent';
        }
      } else if (dist.surge === 'EXAM_SUMMER') {
        const typeMod = i % 3;
        if (typeMod === 0) {
          category = 'Network & Wi-Fi';
          studentType = 'dayscholar';
          hostelBlock = undefined;
          roomNo = undefined;
          departmentBlock = departments[i % departments.length];
          apController = `AP-${departmentBlock}-F${floorNum}-01`;
          switchId = `SW-${departmentBlock}-F${floorNum}`;
          description = `High latency and frequent disconnects on ${departmentBlock} floor ${floorNum} Wi-Fi during exam preparation.`;
          locationTag = `${departmentBlock} Block, Floor ${floorNum}, ${apController}`;
          priority = 'urgent';
        } else if (typeMod === 1) {
          category = 'Electrical & AC';
          issueType = 'power';
          description = `Severe summer heat: ceiling fan regulator burnt in room ${roomNo}, unable to study.`;
          locationTag = `Hostel Block ${hostelBlock}, Floor ${floorNum}, Room ${roomNo}`;
          priority = 'urgent';
        } else {
          category = 'Hostel Maintenance';
          issueType = 'cleaning';
          description = `Daily water dispenser filter clogged and not cooling in Block ${hostelBlock} floor ${floorNum}.`;
          locationTag = `Hostel Block ${hostelBlock}, Floor ${floorNum}`;
          priority = 'medium';
        }
      } else if (dist.surge === 'FALL_REOPENING') {
        const typeMod = i % 3;
        if (typeMod === 0 || typeMod === 1) {
          category = 'Bus & Transport';
          studentType = 'dayscholar';
          hostelBlock = undefined;
          roomNo = undefined;
          transportRoute = routes[i % routes.length];
          transportIncidentType = i % 2 === 0 ? 'capacity_surge' : 'delay';
          description = `Semester start rush: ${transportRoute} severely overcrowded, students unable to board morning bus.`;
          locationTag = `Campus Transport ${transportRoute}`;
          priority = 'urgent';
        } else {
          category = 'Food & Mess';
          locationTag = 'Central Dining Mess 1';
          description = 'Mess registration queue unmanaged, 40-minute wait time for first-year lunch service.';
          priority = 'medium';
        }
      } else {
        // Normal baseline distribution across domains
        const catMod = i % 5;
        if (catMod === 0) {
          category = 'Hostel Maintenance';
          issueType = 'repairs';
          description = `Window latch broken and rattling in room ${roomNo}.`;
          locationTag = `Hostel Block ${hostelBlock}, Floor ${floorNum}, Room ${roomNo}`;
        } else if (catMod === 1) {
          category = 'Bus & Transport';
          studentType = 'dayscholar';
          hostelBlock = undefined;
          roomNo = undefined;
          transportRoute = routes[i % routes.length];
          transportIncidentType = 'maintenance';
          description = `${transportRoute} bus tyre pressure low, delayed arrival at campus.`;
          locationTag = `Campus Transport ${transportRoute}`;
        } else if (catMod === 2) {
          category = 'Network & Wi-Fi';
          studentType = 'dayscholar';
          hostelBlock = undefined;
          roomNo = undefined;
          departmentBlock = departments[i % departments.length];
          apController = `AP-${departmentBlock}-F${floorNum}-02`;
          switchId = `SW-${departmentBlock}-F${floorNum}`;
          description = `Signal drop in ${departmentBlock} room ${floorNum}02 near ${apController}.`;
          locationTag = `${departmentBlock} Block, Floor ${floorNum}`;
        } else if (catMod === 3) {
          category = 'Food & Mess';
          locationTag = 'South Mess Dining Hall';
          description = 'Drinking water dispenser empty during dinner hours in South Mess.';
        } else {
          category = 'Electrical & AC';
          issueType = 'power';
          description = `Tube light starter replacement required in room ${roomNo}.`;
          locationTag = `Hostel Block ${hostelBlock}, Floor ${floorNum}, Room ${roomNo}`;
        }
      }

      // Resolution status distribution: older grievances mostly resolved, recent ones pending
      let status: 'pending' | 'in_progress' | 'resolved' | 'PRIMARY' | 'MERGED_AUTOMATIC' = 'resolved';
      let resolvedAt: string | undefined = undefined;

      if (dist.year === 2026 && dist.month >= 10) {
        status = i % 3 === 0 ? 'pending' : (i % 3 === 1 ? 'in_progress' : 'PRIMARY');
      } else if (dist.year === 2026 && dist.month >= 8) {
        status = i % 5 === 0 ? 'pending' : 'resolved';
      }

      if (status === 'resolved') {
        const resDay = Math.min(28, day + (i % 4) + 1);
        resolvedAt = `${dist.year}-${String(dist.month).padStart(2, '0')}-${String(resDay).padStart(2, '0')}T18:00:00Z`;
      }

      grievances.push({
        id,
        ticketNo,
        studentRegNo,
        studentName,
        studentEmail,
        studentPhone: `9876543${String(i).padStart(3, '0')}`,
        studentType,
        hostelBlock,
        roomNo,
        category,
        description,
        status,
        priority,
        locationTag,
        sourceTimestamp: dateStr,
        createdAt: dateStr,
        resolvedAt,
        isSpam: false,
        masterCaseId: null,
        issueType,
        transportRoute,
        transportIncidentType,
        apController,
        switchId,
        departmentBlock,
      });
    }
  }

  return grievances;
}

export const HISTORICAL_GRIEVANCES: HistoricalGrievance[] = buildHistoricalGrievances();

/**
 * Analytical queries over the 200 historical grievances
 */
export function getGrievancesByMonth(year: number, month: number): HistoricalGrievance[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  return HISTORICAL_GRIEVANCES.filter((g) => g.createdAt.startsWith(prefix));
}

export function getGrievancesByHostelBlock(block: string): HistoricalGrievance[] {
  return HISTORICAL_GRIEVANCES.filter((g) => g.hostelBlock === block);
}

export function getGrievancesByRoute(route: string): HistoricalGrievance[] {
  return HISTORICAL_GRIEVANCES.filter((g) => g.transportRoute === route);
}

export function getGrievancesByDepartment(dept: string): HistoricalGrievance[] {
  return HISTORICAL_GRIEVANCES.filter((g) => g.departmentBlock === dept);
}
