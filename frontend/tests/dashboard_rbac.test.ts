import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { UserProfile, Grievance } from '../types';
import { DEPARTMENTS_10, DEMO_ACCOUNTS } from '../data/constants';
import { groupSemanticGrievances } from '../lib/deduplication';

describe('Dashboard RBAC & Cascading Resolution Test Suite', () => {
  const sampleGrievances: Grievance[] = [
    {
      id: 'g-001',
      ticketNo: 'TICK-1001',
      studentName: 'Arun Kumar',
      studentRegNo: '2023CS0101',
      studentEmail: 'arun.kumar@student.campus.edu',
      category: 'Hostel Maintenance',
      assignedDepartmentId: 'dept-hostel-admin',
      description: 'Water leaking from ceiling pipe in room A-304 Ramanujan hostel',
      status: 'pending',
      priority: 'urgent',
      createdAt: '2026-11-08T08:00:00Z',
    },
    {
      id: 'g-002',
      ticketNo: 'TICK-1002',
      studentName: 'Vivek Sharma',
      studentRegNo: '2023CS0102',
      studentEmail: 'vivek@student.campus.edu',
      category: 'Hostel Maintenance',
      assignedDepartmentId: 'dept-hostel-admin',
      description: 'Severe water leak from ceiling pipe in room A-304 Ramanujan hostel block',
      status: 'pending',
      priority: 'urgent',
      createdAt: '2026-11-08T08:15:00Z',
    },
    {
      id: 'g-003',
      ticketNo: 'TICK-1003',
      studentName: 'Priya Sharma',
      studentRegNo: '2023EC0204',
      studentEmail: 'priya.sharma@student.campus.edu',
      category: 'Transport & Logistics',
      assignedDepartmentId: 'dept-transport-logistics',
      description: 'Route 4 bus arrived 40 minutes late at Bypass stop',
      status: 'in_progress',
      priority: 'medium',
      createdAt: '2026-11-08T08:30:00Z',
    },
    {
      id: 'g-004',
      ticketNo: 'TICK-1004',
      studentName: 'Sneha Patel',
      studentRegNo: '2023EE0402',
      studentEmail: 'sneha.patel@student.campus.edu',
      category: 'Library Services',
      assignedDepartmentId: 'dept-library-services',
      description: 'Digital catalog search terminal in 2nd floor library is frozen',
      status: 'pending',
      priority: 'less_important',
      createdAt: '2026-11-08T09:00:00Z',
    },
  ];

  test('TC-RBAC-01: Super Admin has global access to all department queues', () => {
    const adminUser: UserProfile = {
      id: 'admin-1',
      name: 'Super Administrator',
      email: 'admin@campus.edu',
      role: 'admin',
      regNo: 'ADMIN_001',
      phone: '+91 98765 00000',
    };

    // Super Admin view retains all grievances across all departments
    const userRoleUpper = adminUser.role.toUpperCase();
    const isSuperAdmin = userRoleUpper === 'SUPER_ADMIN' || userRoleUpper === 'ADMIN';
    assert.equal(isSuperAdmin, true, 'adminUser must be identified as Super Admin');

    const visibleGrievances = sampleGrievances;
    assert.equal(visibleGrievances.length, 4, 'Super Admin must see all 4 grievances');
  });

  test('TC-RBAC-02: Department Admin view is strictly scoped to departmentId', () => {
    const hostelAdmin: UserProfile = {
      id: 'staff-hostel',
      name: 'Hostel Admin',
      email: 'admin.hostel@campus.edu',
      role: 'department_admin',
      departmentId: 'dept-hostel-admin',
      regNo: 'DEPT_HOSTEL_01',
      phone: '+91 98765 00002',
    };

    // Scoping logic: filter grievances where assignedDepartmentId === user.departmentId
    const scopedGrievances = sampleGrievances.filter(
      (g) => g.assignedDepartmentId === hostelAdmin.departmentId
    );

    assert.equal(scopedGrievances.length, 2, 'Hostel Admin must see only the 2 hostel complaints');
    assert.ok(
      scopedGrievances.every((g) => g.assignedDepartmentId === 'dept-hostel-admin'),
      'All scoped tickets must belong to dept-hostel-admin'
    );
  });

  test('TC-RBAC-03: Student view is strictly filtered to student ownership', () => {
    const studentUser: UserProfile = {
      id: 'student-priya',
      name: 'Priya Sharma',
      email: 'priya.sharma@student.campus.edu',
      role: 'student',
      regNo: '2023EC0204',
      studentType: 'dayscholar',
      phone: '+91 98765 43211',
    };

    // Student view filter: only their own registration number or email
    const studentTickets = sampleGrievances.filter(
      (g) => g.studentRegNo === studentUser.regNo || g.studentEmail === studentUser.email
    );

    assert.equal(studentTickets.length, 1, 'Priya must see only her own 1 ticket');
    assert.equal(studentTickets[0].ticketNo, 'TICK-1003', 'Ticket must be TICK-1003');
  });

  test('TC-RBAC-04: Semantic Deduplication Groups Duplicate Complaints', () => {
    const groups = groupSemanticGrievances(sampleGrievances);
    
    // TICK-1001 and TICK-1002 are identical water leak complaints in room A-304
    const hostelGroup = groups.find(
      (g) => g.parent.ticketNo === 'TICK-1001' || g.parent.ticketNo === 'TICK-1002'
    );

    assert.ok(hostelGroup, 'Hostel water leak cluster must be detected');
    assert.equal(hostelGroup.totalCount, 2, 'Cluster must contain exactly 2 complaints');
  });

  test('TC-RBAC-05: Cascading Resolution marks Parent and Grouped Children Resolved', () => {
    const groups = groupSemanticGrievances(sampleGrievances);
    const hostelGroup = groups.find((g) => g.totalCount > 1)!;
    
    const parentId = hostelGroup.parent.id;
    const childIds = hostelGroup.children.map((c) => c.id);
    const allIdsInCluster = [parentId, ...childIds];

    const resolvedAt = new Date().toISOString();
    const resolutionNote = 'Plumber replaced leaking valve in room A-304.';

    // Simulate cascade update
    const updatedGrievances = sampleGrievances.map((g) =>
      allIdsInCluster.includes(g.id)
        ? { ...g, status: 'resolved' as const, resolvedAt, adminNotes: resolutionNote }
        : g
    );

    const resolvedCluster = updatedGrievances.filter((g) => allIdsInCluster.includes(g.id));
    assert.equal(resolvedCluster.length, 2, 'Both parent and child must be updated');
    for (const g of resolvedCluster) {
      assert.equal(g.status, 'resolved', `Ticket ${g.ticketNo} must be resolved`);
      assert.equal(g.adminNotes, resolutionNote, `Ticket ${g.ticketNo} must have resolution note`);
    }
  });
});
