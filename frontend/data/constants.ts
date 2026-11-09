import { FAQItem } from '../types';

export interface DepartmentDefinition {
  id: string;
  name: string;
  code: string;
  contactEmail: string;
  adminName: string;
  adminEmail: string;
  staffId: string;
}

export interface DemoAccount {
  name: string;
  email: string;
  regNo?: string;
  staffId?: string;
  role: 'super_admin' | 'department_admin' | 'student';
  roleTitle: string;
  departmentId?: string;
  departmentName?: string;
  password: string;
  devOtp: string;
  studentType?: 'hosteller' | 'dayscholar';
  hostelBlock?: string;
  roomNo?: string;
  branch?: string;
}

/**
 * 100% Operational Department Coverage across the Campus Ecosystem
 */
export const DEPARTMENTS_10: DepartmentDefinition[] = [
  {
    id: 'dept-hostel',
    name: 'Hostel & Accommodation',
    code: 'HOSTEL',
    contactEmail: 'hostel.admin@campus.edu',
    adminName: 'Prof. Sundaram (Chief Warden)',
    adminEmail: 'hostel.admin@campus.edu',
    staffId: 'STAFF-HOSTEL',
  },
  {
    id: 'dept-mess',
    name: 'Mess & Canteen',
    code: 'MESS',
    contactEmail: 'mess.admin@campus.edu',
    adminName: 'Dr. Meenakshi (Mess Director)',
    adminEmail: 'mess.admin@campus.edu',
    staffId: 'STAFF-MESS',
  },
  {
    id: 'dept-it',
    name: 'IT & ERP',
    code: 'IT_ERP',
    contactEmail: 'it.admin@campus.edu',
    adminName: 'Er. Karthikeyan (Head - IT)',
    adminEmail: 'it.admin@campus.edu',
    staffId: 'STAFF-IT',
  },
  {
    id: 'dept-academics',
    name: 'Academics & Labs',
    code: 'ACADEMICS',
    contactEmail: 'academics.admin@campus.edu',
    adminName: 'Dr. Ramanathan (Dean - Academic Affairs)',
    adminEmail: 'academics.admin@campus.edu',
    staffId: 'STAFF-ACAD',
  },
  {
    id: 'dept-infra',
    name: 'Infrastructure & Maintenance',
    code: 'INFRA',
    contactEmail: 'infra.admin@campus.edu',
    adminName: 'Er. Balasubramanian (Estate Officer)',
    adminEmail: 'infra.admin@campus.edu',
    staffId: 'STAFF-INFRA',
  },
  {
    id: 'dept-transport',
    name: 'Transport',
    code: 'TRANSPORT',
    contactEmail: 'transport.admin@campus.edu',
    adminName: 'Mr. Saravanan (Transport Manager)',
    adminEmail: 'transport.admin@campus.edu',
    staffId: 'STAFF-TRANS',
  },
  {
    id: 'dept-security',
    name: 'Anti-Ragging & Security',
    code: 'SECURITY',
    contactEmail: 'security.admin@campus.edu',
    adminName: 'Col. Natarajan (Chief Security Officer)',
    adminEmail: 'security.admin@campus.edu',
    staffId: 'STAFF-SEC',
  },
  {
    id: 'dept-medical',
    name: 'Medical & Wellness',
    code: 'MEDICAL',
    contactEmail: 'medical.admin@campus.edu',
    adminName: 'Dr. Shanthi (Chief Medical Officer)',
    adminEmail: 'medical.admin@campus.edu',
    staffId: 'STAFF-MED',
  },
  {
    id: 'dept-finance',
    name: 'Administration & Finance',
    code: 'ACCOUNTS',
    contactEmail: 'accounts.admin@campus.edu',
    adminName: 'Mr. Venkatraman (Finance Officer)',
    adminEmail: 'accounts.admin@campus.edu',
    staffId: 'STAFF-ACC',
  },
  {
    id: 'dept-studentlife',
    name: 'Library, Sports & Placement',
    code: 'STUDENTLIFE',
    contactEmail: 'studentlife.admin@campus.edu',
    adminName: 'Dr. Padmavathi (Dean - Student Life)',
    adminEmail: 'studentlife.admin@campus.edu',
    staffId: 'STAFF-LIFE',
  },
];

/**
 * Universal Seeded Demo Accounts (100% Alignment with CREDENTIALS.md)
 */
export const DEMO_ACCOUNTS: DemoAccount[] = [
  // Super Admin
  {
    name: 'Dr. Rajeshwari (Dean - Student Affairs)',
    email: 'admin@campus.edu',
    regNo: 'ADMIN-001',
    staffId: 'ADMIN-001',
    role: 'super_admin',
    roleTitle: 'Super Administrator',
    password: 'Admin@123',
    devOtp: '123456',
  },

  // 10 Department Admins
  {
    name: 'Prof. Sundaram (Chief Warden)',
    email: 'hostel.admin@campus.edu',
    staffId: 'STAFF-HOSTEL',
    role: 'department_admin',
    roleTitle: 'Hostel Admin',
    departmentId: 'dept-hostel',
    departmentName: 'Hostel & Accommodation',
    password: 'Dept@123',
    devOtp: '123456',
  },
  {
    name: 'Dr. Meenakshi (Mess Director)',
    email: 'mess.admin@campus.edu',
    staffId: 'STAFF-MESS',
    role: 'department_admin',
    roleTitle: 'Mess Admin',
    departmentId: 'dept-mess',
    departmentName: 'Mess & Canteen',
    password: 'Dept@123',
    devOtp: '123456',
  },
  {
    name: 'Er. Karthikeyan (Head - IT)',
    email: 'it.admin@campus.edu',
    staffId: 'STAFF-IT',
    role: 'department_admin',
    roleTitle: 'IT & ERP Admin',
    departmentId: 'dept-it',
    departmentName: 'IT & ERP',
    password: 'Dept@123',
    devOtp: '123456',
  },
  {
    name: 'Dr. Ramanathan (Dean - Academic Affairs)',
    email: 'academics.admin@campus.edu',
    staffId: 'STAFF-ACAD',
    role: 'department_admin',
    roleTitle: 'Academics Admin',
    departmentId: 'dept-academics',
    departmentName: 'Academics & Labs',
    password: 'Dept@123',
    devOtp: '123456',
  },
  {
    name: 'Er. Balasubramanian (Estate Officer)',
    email: 'infra.admin@campus.edu',
    staffId: 'STAFF-INFRA',
    role: 'department_admin',
    roleTitle: 'Infrastructure Admin',
    departmentId: 'dept-infra',
    departmentName: 'Infrastructure & Maintenance',
    password: 'Dept@123',
    devOtp: '123456',
  },
  {
    name: 'Mr. Saravanan (Transport Manager)',
    email: 'transport.admin@campus.edu',
    staffId: 'STAFF-TRANS',
    role: 'department_admin',
    roleTitle: 'Transport Admin',
    departmentId: 'dept-transport',
    departmentName: 'Transport',
    password: 'Dept@123',
    devOtp: '123456',
  },
  {
    name: 'Col. Natarajan (Chief Security Officer)',
    email: 'security.admin@campus.edu',
    staffId: 'STAFF-SEC',
    role: 'department_admin',
    roleTitle: 'Anti-Ragging & Security Admin',
    departmentId: 'dept-security',
    departmentName: 'Anti-Ragging & Security',
    password: 'Dept@123',
    devOtp: '123456',
  },
  {
    name: 'Dr. Shanthi (Chief Medical Officer)',
    email: 'medical.admin@campus.edu',
    staffId: 'STAFF-MED',
    role: 'department_admin',
    roleTitle: 'Medical Admin',
    departmentId: 'dept-medical',
    departmentName: 'Medical & Wellness',
    password: 'Dept@123',
    devOtp: '123456',
  },
  {
    name: 'Mr. Venkatraman (Finance Officer)',
    email: 'accounts.admin@campus.edu',
    staffId: 'STAFF-ACC',
    role: 'department_admin',
    roleTitle: 'Finance Admin',
    departmentId: 'dept-finance',
    departmentName: 'Administration & Finance',
    password: 'Dept@123',
    devOtp: '123456',
  },
  {
    name: 'Dr. Padmavathi (Dean - Student Life)',
    email: 'studentlife.admin@campus.edu',
    staffId: 'STAFF-LIFE',
    role: 'department_admin',
    roleTitle: 'Student Life Admin',
    departmentId: 'dept-studentlife',
    departmentName: 'Library, Sports & Placement',
    password: 'Dept@123',
    devOtp: '123456',
  },

  // 4 Representative Students
  {
    name: 'Kavin Kumar',
    email: 'kavin@student.campus.edu',
    regNo: '2023CSE042',
    role: 'student',
    roleTitle: 'Final Year CSE Hosteller',
    studentType: 'hosteller',
    hostelBlock: 'Block C (Girls Hostel)',
    roomNo: '304',
    branch: 'CSE (Computer Science & Engineering)',
    password: 'Student@123',
    devOtp: '123456',
  },
  {
    name: 'Ananya Sharma',
    email: 'ananya@student.campus.edu',
    regNo: '2023ECE015',
    role: 'student',
    roleTitle: '3rd Year ECE Hosteller',
    studentType: 'hosteller',
    hostelBlock: 'Block A (Boys Hostel)',
    roomNo: '108',
    branch: 'ECE (Electronics & Communication Engineering)',
    password: 'Student@123',
    devOtp: '123456',
  },
  {
    name: 'Rahul Verma',
    email: 'rahul@student.campus.edu',
    regNo: '2022MECH088',
    role: 'student',
    roleTitle: '2nd Year Mech Day Scholar',
    studentType: 'dayscholar',
    branch: 'MECH (Mechanical Engineering)',
    password: 'Student@123',
    devOtp: '123456',
  },
  {
    name: 'Priya Ramasamy',
    email: 'priya@student.campus.edu',
    regNo: '2024IT021',
    role: 'student',
    roleTitle: '1st Year IT Hosteller',
    studentType: 'hosteller',
    hostelBlock: 'Block B (Boys Hostel)',
    roomNo: '212',
    branch: 'IT (Information Technology)',
    password: 'Student@123',
    devOtp: '123456',
  },
];

export const HOSTELLER_CATEGORIES = [
  'Food & Mess',
  'Damages & Repairs',
  'Plumbing & Water',
  'Electrical & AC',
  'Hostel Wi-Fi & Internet',
  'Cleanliness & Sanitation',
  'Ragging & Harassment',
  'Medical & Dispensary',
  'Others',
];

export const DAYSCHOLAR_CATEGORIES = [
  'Bus & Transport',
  'Canteen & Cafeteria',
  'Classroom & Lab Facilities',
  'Library & Wi-Fi',
  'Campus Cleanliness',
  'Ragging & Harassment',
  'Administrative & Fees',
  'Medical & Dispensary',
  'Others',
];

export const ALL_CATEGORIES = Array.from(
  new Set([...HOSTELLER_CATEGORIES, ...DAYSCHOLAR_CATEGORIES])
);

export const HOSTEL_BLOCKS = [
  'Block A (Boys Hostel)',
  'Block B (Boys Hostel)',
  'Block C (Girls Hostel)',
  'Block D (Girls Hostel)',
  'PG & International Block',
];

export const DEPARTMENT_OPTIONS = [
  'CSE (Computer Science & Engineering)',
  'AIML (Artificial Intelligence & Machine Learning)',
  'CSD (Computer Science & Design)',
  'IT (Information Technology)',
  'ADS (Artificial Intelligence & Data Science)',
  'ECE (Electronics & Communication Engineering)',
  'EEE (Electrical & Electronics Engineering)',
  'MCT (Mechatronics Engineering)',
  'MECH (Mechanical Engineering)',
  'FT (Fashion Technology)',
  'BME (Biomedical Engineering)',
  'CIVIL (Civil Engineering)',
];

export const CATEGORY_TO_DEPARTMENT_MAP_10: Record<string, string> = {
  'Food & Mess': 'dept-mess',
  'Canteen & Cafeteria': 'dept-mess',
  'Damages & Repairs': 'dept-infra',
  'Campus Cleanliness': 'dept-infra',
  'Plumbing & Water': 'dept-infra',
  'Electrical & AC': 'dept-infra',
  'Cleanliness & Sanitation': 'dept-infra',
  'Hostel Wi-Fi & Internet': 'dept-it',
  'Library & Wi-Fi': 'dept-studentlife',
  'Bus & Transport': 'dept-transport',
  'Ragging & Harassment': 'dept-security',
  'Classroom & Lab Facilities': 'dept-academics',
  'Administrative & Fees': 'dept-finance',
  'Medical & Dispensary': 'dept-medical',
  'Hostel & Accommodation': 'dept-hostel',
  'Others': 'dept-infra',
};

export const FAQ_DATA: FAQItem[] = [
  {
    id: 'faq-1',
    category: 'Hostel',
    question: 'How quickly are hostel damages, water leakage, or plumbing issues addressed?',
    answer:
      'Hostel maintenance requests (plumbing, water leaks, electrical repairs) are evaluated by the hostel warden and assigned to the estate maintenance crew within 4 to 24 hours depending on urgency.',
  },
  {
    id: 'faq-2',
    category: 'Hostel',
    question: 'What should I do if the hostel Wi-Fi or LAN port is not working in my room?',
    answer:
      'Submit a complaint under the "Hostel Wi-Fi & Internet" category specifying your hostel block and room number. The campus IT infrastructure department conducts routine port and access-point troubleshooting daily.',
  },
  {
    id: 'faq-3',
    category: 'Academic & Ragging',
    question: 'Is ragging reported through this portal strictly confidential and zero-tolerance?',
    answer:
      'Yes. All complaints classified under "Ragging & Harassment" bypass standard queues and are immediately dispatched to the College Anti-Ragging Committee and Chief Warden. The student\'s identity is kept strictly confidential.',
  },
  {
    id: 'faq-4',
    category: 'Transport & Canteen',
    question: 'How can dayscholars report bus route delays or canteen food quality problems?',
    answer:
      'Dayscholars can select the "Bus & Transport" category (specifying the bus route number) or the "Canteen & Cafeteria" category. These reports are directly forwarded to the Transport In-Charge and Canteen Sanitation Inspector.',
  },
  {
    id: 'faq-5',
    category: 'General',
    question: 'How will I be notified when my grievance is resolved?',
    answer:
      'Upon submission, you receive an automated confirmation email with your ticket number. Once the college management or maintenance team resolves the issue, an automatic email alert confirms the resolution with admin notes.',
  },
  {
    id: 'faq-6',
    category: 'General',
    question: 'Why does the system filter out spam and gibberish messages?',
    answer:
      'An automated AI assistant reviews incoming text for meaningless keyboard smash (e.g., "cbhhcbhbdhcdbhd") or off-campus venues to ensure genuine student emergencies receive top priority from administrators without delay.',
  },
];
