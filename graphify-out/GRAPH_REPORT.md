# Graph Report - student-support  (2026-11-09)

## Corpus Check
- 147 files · ~112,542 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: (none) 3, .example 1, .frontend 1)

## Summary
- 1580 nodes · 3701 edges · 94 communities (64 shown, 30 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 268 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2ea50d45`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- sqlalchemy
- backend/db/seed.py
- AsyncClient
- backend/schemas/__init__.py
- ComplaintClassifier
- Complaint
- app/ml/deduplication.py
- Notification
- index.ts
- complaintClassifier.ts
- app/db/seed.py
- conftest.py
- core/security.py
- test_ml_classifier.py
- scripts
- test_challenger_m1_postgres_fallback.py
- compute_hybrid_similarity
- Git Push Workflow
- backend/schemas/analytics.py
- .test_single_click_cascading_resolve_with_notifications
- pydantic
- test_db_models.py
- test_challenger_m1_seeding.py
- env.py
- typing
- test_deterministic_seed_execution
- lib/api.ts
- postgres
- test_challenger_m1_empirical.py
- frontend/components/Charts.tsx
- frontend
- fastapi
- docker-compose.yml
- environment
- healthcheck
- build
- student-grievance-backend
- test_challenger_vector_constraints.py
- Any
- backend/db/models.py
- test_seeding_credentials.py
- routers/complaints.py
- datetime
- backend/schemas/auth.py
- client
- fk_enabled_session
- change_password
- frontend/package.json
- AuthModal.tsx
- test_cosine_similarity_mathematical_consistency
- test_fastapi_endpoints.py
- backend/schemas/departments.py
- app/routers/auth.py
- app/services/__init__.py
- lib/deduplication.ts
- app/schemas/ai.py
- send_notification
- frontend/components/ReportDownloader.tsx
- create_or_upsert_user
- jwt.py
- schemas/users.py
- Project: Campus Grievance Management System (2026 AI Production Tech Stack)
- next.config.mjs
- backend/routers/auth.py
- app/main.py
- backend/schemas/ai.py
- get_audit_logs
- backend/schemas/common.py
- backend/schemas/notifications.py
- app/db/session.py
- sign_token
- app/routers/dependencies.py
- schemas/complaints.py
- classify_complaint_endpoint
- routers/grievances.py
- classifier.ts
- app/schemas/analytics.py
- app/schemas/departments.py
- classify_complaint_endpoint
- AppPortal.tsx
- compilerOptions
- StudentComplaintForm.tsx
- AuditLog
- User

## God Nodes (most connected - your core abstractions)
1. `Complaint` - 108 edges
2. `User` - 56 edges
3. `Department` - 54 edges
4. `AuditLog` - 45 edges
5. `CategoryRoutingRule` - 39 edges
6. `getAuthHeaders()` - 32 edges
7. `Notification` - 26 edges
8. `sign_token()` - 23 edges
9. `Base` - 22 edges
10. `verify_token()` - 20 edges

## Surprising Connections (you probably didn't know these)
- `test_engine()` --calls--> `get_settings()`  [INFERRED]
  backend/tests/conftest.py → backend/app/core/config.py
- `init_database()` --uses--> `Complaint`  [INFERRED]
  backend/app/db/init_db.py → backend/app/db/models.py
- `init_database()` --uses--> `Base`  [INFERRED]
  backend/app/db/init_db.py → backend/app/db/session.py
- `_execute_seeding()` --uses--> `Department`  [INFERRED]
  backend/app/db/seed.py → backend/app/db/models.py
- `create_complaint()` --uses--> `Department`  [INFERRED]
  backend/app/routers/complaints.py → backend/app/db/models.py

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Department RBAC and Row-Level Access Control Framework** — test_ready_rbac_test_suite, test_ready_row_level_access_control, session_handoff_rlac_middleware [EXTRACTED 1.00]
- **Four-Tier Testing and Verification Pipeline** — test_infra_four_tier_suite, test_infra_bva_specification, test_ready_readiness_signal [EXTRACTED 1.00]
- **Knowledge Graph Synchronization & Tooling** — _agents_skills_git_push_skill_pre_push_verification, claude_graphify_guidelines, readme_graphify_integration [INFERRED 0.85]

## Communities (94 total, 30 thin omitted)

### Community 1 - "backend/db/seed.py"
Cohesion: 0.14
Nodes (12): build_historical_grievances(), fnv1a_hash(), generate_seed_embedding(), get_seed_departments(), get_seed_initial_complaints(), get_seed_routing_rules(), get_seed_users(), _perform_seeding() (+4 more)

### Community 2 - "AsyncClient"
Cohesion: 0.32
Nodes (3): TestAuthEndpointsAndDevOtp, TestRowLevelAccessControlAndIdor, TestStudentAdminPortalRejection

### Community 3 - "backend/schemas/__init__.py"
Cohesion: 0.33
Nodes (13): DeduplicationResult, DetachRequest, EscalateRequest, Grievance, GrievanceCreate, IncidentMetadata, MatchCandidate, MergeRequest (+5 more)

### Community 6 - "app/ml/deduplication.py"
Cohesion: 0.12
Nodes (11): analyze_spam(), cascade_resolve_ticket_tree(), check_location_adjacency(), cosine_similarity(), extract_floor_from_room(), extract_route_number(), fnv1a_hash(), generate_embedding_vector() (+3 more)

### Community 7 - "Notification"
Cohesion: 0.23
Nodes (3): Notification, get_outbox(), send_notification()

### Community 8 - "index.ts"
Cohesion: 0.12
Nodes (16): AcademicBranch, AdminLoginResponse, AuthLoginResponse, CalendarMultipliers, Gender, HostelBlockRollup, HostelFloorRollup, HostelIssueTypeRollup (+8 more)

### Community 9 - "complaintClassifier.ts"
Cohesion: 0.10
Nodes (20): Default Administrative Personas Catalog, Campus Student Grievance System Development Log, Teamwork Multi-Agent Coordination Protocol, Graphify Query Protocol, Graphify Project Guidelines, Graphify Knowledge Graph Integration, Local Heuristic Spam Classifier, SQLite3 Local Database Architecture (+12 more)

### Community 10 - "app/db/seed.py"
Cohesion: 0.25
Nodes (10): _execute_seeding(), fnv1a_hash(), generate_seed_embedding(), get_seed_audit_logs(), get_seed_complaints(), get_seed_departments(), get_seed_notifications(), get_seed_routing_rules() (+2 more)

### Community 11 - "conftest.py"
Cohesion: 0.18
Nodes (3): check(), init_database(), main()

### Community 13 - "test_ml_classifier.py"
Cohesion: 0.19
Nodes (5): TestDepartmentRoutingAccuracy, TestExtortionBlackmailAndThreatClassification, TestGreetingsAndGibberishVeto, TestHarassmentImplicitCampusRelevance, TestOffCampusDomainVeto

### Community 14 - "scripts"
Cohesion: 0.10
Nodes (21): description, devDependencies, concurrently@^9.1.2, name, private, scripts, backend, build (+13 more)

### Community 15 - "test_challenger_m1_postgres_fallback.py"
Cohesion: 0.06
Nodes (21): DatabaseEngineManager, get_default_sqlite_url(), is_postgres_listening(), _resolve_project_root(), check_port_open(), find_project_root(), main(), provision_postgres_database() (+13 more)

### Community 16 - "compute_hybrid_similarity"
Cohesion: 0.15
Nodes (6): compute_hybrid_similarity(), evaluate_deduplication(), jaccard_similarity(), tokenize(), TestDeduplicationThresholdDecisions, TestMathematicalVectorOperations

### Community 17 - "Git Push Workflow"
Cohesion: 0.67
Nodes (3): Git Push Workflow, Pre-Push Verification & Health Checks, Push Helper Script (push.ps1)

### Community 18 - "backend/schemas/analytics.py"
Cohesion: 0.30
Nodes (10): CalendarMultipliers, HostelBlockRollup, HostelFloorRollup, HostelIssueTypeRollup, RiskForecastResponse, Rolling7DayVelocityItem, TransportRouteRollup, TrendAnalyticsResponse (+2 more)

### Community 20 - ".test_single_click_cascading_resolve_with_notifications"
Cohesion: 0.18
Nodes (4): TestCandidateStarvationAndHighVolumeDeduplication, TestCascadingResolutionAndNotifications, TestLocationAdjacencyGuardrails, TestTriageQueueIntegration

### Community 21 - "pydantic"
Cohesion: 0.22
Nodes (4): APIResponse, ErrorResponse, NotificationItem, NotificationSendRequest

### Community 22 - "test_db_models.py"
Cohesion: 0.19
Nodes (6): Department, test_department_camelcase_property_parity(), test_complaint_foreign_keys_and_relationships(), test_department_and_user_creation(), test_pgvector_similarity_search(), test_routing_rules_audit_notifications_and_otp()

### Community 23 - "test_challenger_m1_seeding.py"
Cohesion: 0.15
Nodes (10): seed_database(), test_all_16_users_bcrypt_passwords(), test_legacy_password_verification_status(), test_seeding_consecutive_runs_idempotent(), test_seeding_fresh_database_row_counts(), test_seeding_incremental_historical(), test_seeding_reset_mode_cleans_and_reseeds(), test_seeding_reset_with_modified_and_child_complaints() (+2 more)

### Community 24 - "env.py"
Cohesion: 0.17
Nodes (5): do_run_migrations(), include_object(), run_async_migrations(), run_migrations_offline(), run_migrations_online()

### Community 25 - "typing"
Cohesion: 0.11
Nodes (5): get_ml_model_info(), get_ml_model_info(), get_current_user(), get_current_user_optional(), require_super_admin()

### Community 26 - "test_deterministic_seed_execution"
Cohesion: 0.32
Nodes (3): test_all_seven_tables_created(), test_deterministic_seed_execution(), test_vector_storage_and_retrieval()

### Community 27 - "lib/api.ts"
Cohesion: 0.09
Nodes (42): DepartmentManagement(), GroupedMasterCase, TriageModerationView(), TriageModerationViewProps, assignUserDepartmentApi(), changePasswordApi(), createDepartmentApi(), createRoutingRuleApi() (+34 more)

### Community 28 - "postgres"
Cohesion: 0.18
Nodes (11): POSTGRES_DB, POSTGRES_PASSWORD, POSTGRES_USER, container_name, environment, image, networks, ports (+3 more)

### Community 29 - "test_challenger_m1_empirical.py"
Cohesion: 0.11
Nodes (13): test_foreign_key_invalid_parent_rejection(), test_foreign_key_restrict_on_routing_rules(), test_foreign_key_set_null_on_users_and_complaints(), test_seeded_user_bcrypt_hashes(), test_seeder_idempotency_multiple_executions(), test_seeder_reset_behavior(), test_typescript_property_parity(), test_unique_constraint_complaint_ticket_no() (+5 more)

### Community 30 - "frontend/components/Charts.tsx"
Cohesion: 0.09
Nodes (39): ActiveViewSection, VisualDimension, VisualType, BarChart(), BarChartProps, CATEGORY_COLOR_MAP, CHART_COLORS, ChartCard() (+31 more)

### Community 31 - "frontend"
Cohesion: 0.20
Nodes (10): fastapi, condition, command, container_name, depends_on, networks, ports, restart (+2 more)

### Community 32 - "fastapi"
Cohesion: 0.20
Nodes (10): postgres, command, container_name, depends_on, networks, ports, restart, volumes (+2 more)

### Community 33 - "docker-compose.yml"
Cohesion: 0.22
Nodes (8): driver, networks, grievance_net, driver, services, version, volumes, postgres_data

### Community 34 - "environment"
Cohesion: 0.24
Nodes (10): DATABASE_URL, ENVIRONMENT, FASTAPI_URL, JWT_SECRET, NEXT_PUBLIC_API_URL, NODE_ENV, PORT, PYTHONPATH (+2 more)

### Community 35 - "healthcheck"
Cohesion: 0.48
Nodes (7): healthcheck, interval, retries, start_period, test, timeout, healthcheck

### Community 36 - "build"
Cohesion: 0.67
Nodes (4): context, dockerfile, build, build

### Community 40 - "test_challenger_vector_constraints.py"
Cohesion: 0.14
Nodes (12): test_category_routing_rule_camelcase_property_parity(), test_foreign_key_assigned_department_enforcement(), test_foreign_key_cascading_on_delete_set_null(), test_foreign_key_master_case_id_enforcement(), test_unique_constraint_complaint_ticket_no(), test_unique_constraint_department_code(), test_unique_constraint_routing_rule_category(), test_unique_constraint_user_email() (+4 more)

### Community 43 - "test_seeding_credentials.py"
Cohesion: 0.14
Nodes (10): main(), seed_database(), isolated_session(), test_seeding_10_departments_coverage(), test_seeding_canonical_users_and_passwords(), test_seeding_complaints_diversity_and_duplicate_clusters(), test_seeding_reset_mode(), test_seeding_strict_idempotency_consecutive_passes() (+2 more)

### Community 44 - "routers/complaints.py"
Cohesion: 0.18
Nodes (17): classify_complaint(), create_complaint(), detach_complaint(), escalate_complaint(), get_complaint_by_id(), get_dedup_lock(), get_triage_queue(), list_complaints() (+9 more)

### Community 46 - "backend/schemas/auth.py"
Cohesion: 0.36
Nodes (8): AdminLoginRequest, JWTPayload, LoginRequest, LoginResponse, RegisterRequest, SendOTPRequest, UserProfile, VerifyOTPRequest

### Community 47 - "client"
Cohesion: 0.14
Nodes (6): async_client(), client(), db_session(), m2_seeded_session(), seeded_session(), test_engine()

### Community 49 - "change_password"
Cohesion: 0.25
Nodes (3): change_password(), create_or_upsert_user(), get_user_by_reg_no()

### Community 50 - "frontend/package.json"
Cohesion: 0.06
Nodes (39): metadata, viewport, dependencies, lucide-react@^0.546.0, next@^15.2.1, react@^19.0.0, react-dom@^19.0.0, xlsx@^0.18.5 (+31 more)

### Community 51 - "AuthModal.tsx"
Cohesion: 0.12
Nodes (23): AuthModal(), DemoAccount, ALL_CATEGORIES, CATEGORY_TO_DEPARTMENT_MAP_10, DAYSCHOLAR_CATEGORIES, DemoAccount, DEPARTMENT_OPTIONS, DepartmentDefinition (+15 more)

### Community 52 - "test_cosine_similarity_mathematical_consistency"
Cohesion: 0.67
Nodes (3): test_cosine_similarity_mathematical_consistency(), cosine_distance(), dot_product()

### Community 54 - "test_fastapi_endpoints.py"
Cohesion: 0.17
Nodes (14): async_client(), test_admin_login_student_forbidden(), test_admin_login_success(), test_ai_classify_gibberish(), test_ai_classify_off_campus_veto(), test_ai_classify_valid(), test_analytics_trends_and_forecast(), test_departments_list() (+6 more)

### Community 55 - "backend/schemas/departments.py"
Cohesion: 0.43
Nodes (6): AssignDepartmentRequest, AuditLogEntry, CategoryRoutingRule, CategoryRoutingRuleCreate, Department, DepartmentCreate

### Community 56 - "app/routers/auth.py"
Cohesion: 0.15
Nodes (19): verify_password(), admin_login(), admin_login_alias(), general_login(), get_me(), get_permissions_for_role(), _handle_admin_login(), normalize_canonical_role() (+11 more)

### Community 57 - "app/services/__init__.py"
Cohesion: 0.05
Nodes (21): get_predictive_summary(), get_risk_forecast(), get_trend_analytics(), compute_hostel_maintenance_rollup(), compute_rolling_7_day_velocity(), compute_transport_rollup(), compute_wifi_density_matrix(), get_campus_trend_analytics() (+13 more)

### Community 58 - "lib/deduplication.ts"
Cohesion: 0.12
Nodes (22): AUTO_MERGE_THRESHOLD, checkLocationAdjacency(), computeCosineSimilarity(), DEDICATED_VOCAB, extractFloorFromRoom(), extractRouteNumber(), fnv1a(), generateEmbeddingVector() (+14 more)

### Community 59 - "app/schemas/ai.py"
Cohesion: 0.47
Nodes (3): ClassifyComplaintRequest, ClassifyComplaintResponse, MLModelInfoResponse

### Community 61 - "frontend/components/ReportDownloader.tsx"
Cohesion: 0.20
Nodes (20): calculateColWidths(), CHART_COLORS, describePieSlice(), downloadCSVReport(), downloadExcelReport(), downloadHTMLReport(), escapeHtml(), formatDate() (+12 more)

### Community 65 - "Project: Campus Grievance Management System (2026 AI Production Tech Stack)"
Cohesion: 0.50
Nodes (3): Architecture Overview, Milestones Summary, Project: Campus Grievance Management System (2026 AI Production Tech Stack)

### Community 67 - "backend/routers/auth.py"
Cohesion: 0.18
Nodes (12): admin_login(), admin_login_alias(), general_login(), get_me(), get_permissions_for_role(), _handle_admin_login(), normalize_canonical_role(), register_student() (+4 more)

### Community 68 - "app/main.py"
Cohesion: 0.06
Nodes (8): Settings, global_exception_handler(), http_exception_handler(), lifespan(), validation_exception_handler(), burst_client(), TestMultiClusterInterleavedConcurrencyBurst, TestSingleClusterConcurrencyBurst

### Community 69 - "backend/schemas/ai.py"
Cohesion: 0.60
Nodes (3): ClassifyComplaintRequest, ClassifyComplaintResponse, MLModelInfoResponse

### Community 73 - "app/db/session.py"
Cohesion: 0.08
Nodes (12): get_settings(), Base, compile_create_index_postgresql(), compile_vector_postgresql(), compile_vector_sqlite(), get_database_url(), get_db(), get_engine() (+4 more)

### Community 74 - "sign_token"
Cohesion: 0.20
Nodes (5): base64url_encode(), sign_token(), verify_token(), TestJwtCryptographicSecurity, valid_jwt_payload()

### Community 75 - "app/routers/dependencies.py"
Cohesion: 0.29
Nodes (4): get_current_user(), get_current_user_optional(), require_department_admin(), require_super_admin()

### Community 78 - "schemas/complaints.py"
Cohesion: 0.27
Nodes (10): ComplaintCreate, ComplaintUpdate, DetachRequest, MasterNotesUpdateRequest, MergeRequest, ReassignRequest, RequestReassignRequest, ResolveRequest (+2 more)

### Community 82 - "routers/grievances.py"
Cohesion: 0.24
Nodes (11): create_grievance(), detach_grievance(), generate_pseudo_embedding(), get_grievance_by_id(), get_triage_queue(), list_grievances(), merge_grievances(), reassign_grievance() (+3 more)

### Community 86 - "classifier.ts"
Cohesion: 0.06
Nodes (37): DEMO_ACCOUNTS, DEMO_ACCOUNTS, DEPARTMENTS_10, analyzeSpam(), CAMPUS_ANCHORS, CATEGORY_DEPARTMENT_MAP, CATEGORY_DEPARTMENT_MAP_10, CATEGORY_DEPARTMENT_MAP_5 (+29 more)

### Community 91 - "app/schemas/analytics.py"
Cohesion: 0.39
Nodes (5): CalendarMultipliers, HostelBlockRollup, RiskForecastResponse, TransportRouteRollup, ZoneRiskForecast

### Community 92 - "app/schemas/departments.py"
Cohesion: 0.39
Nodes (5): AssignDepartmentRequest, CategoryRoutingRuleCreate, CategoryRoutingRuleUpdate, DepartmentCreate, DepartmentUpdate

### Community 95 - "AppPortal.tsx"
Cohesion: 0.21
Nodes (18): AppPortal, HomePage(), AdminDashboard(), AppPortal(), DepartmentDashboard(), FAQSection(), ProfileModal(), INITIAL_GRIEVANCES (+10 more)

### Community 96 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 99 - "StudentComplaintForm.tsx"
Cohesion: 0.15
Nodes (16): AdminDashboardProps, AuthModalProps, DepartmentDashboardProps, ProfileModalProps, ReportDownloaderProps, parseInlineMarkdown(), StudentComplaintForm(), StudentComplaintFormProps (+8 more)

### Community 103 - "AuditLog"
Cohesion: 0.07
Nodes (26): AuditLog, CategoryRoutingRule, get_audit_logs(), assign_user_department(), create_department(), create_routing_rule(), delete_routing_rule(), get_admin_departments() (+18 more)

## Knowledge Gaps
- **10 isolated node(s):** `student-grievance-backend`, `Boundary Value Analysis (BVA) Specification`, `4-Tier Test Suite Architecture`, `Monthly Risk Severity Scoring Engine`, `Push Helper Script (push.ps1)` (+5 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 557 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **30 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Complaint` connect `Complaint` to `sqlalchemy`, `backend/db/seed.py`, `AsyncClient`, `app/ml/deduplication.py`, `app/db/seed.py`, `conftest.py`, `.test_single_click_cascading_resolve_with_notifications`, `test_db_models.py`, `test_challenger_m1_seeding.py`, `test_deterministic_seed_execution`, `test_challenger_m1_empirical.py`, `test_challenger_vector_constraints.py`, `Any`, `backend/db/models.py`, `test_seeding_credentials.py`, `routers/complaints.py`, `test_fastapi_endpoints.py`, `app/services/__init__.py`, `app/db/session.py`, `routers/grievances.py`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **Are the 71 inferred relationships involving `Complaint` (e.g. with `init_database()` and `_execute_seeding()`) actually correct?**
  _`Complaint` has 71 INFERRED edges - model-reasoned connections that need verification._
- **What connects `student-grievance-backend`, `Boundary Value Analysis (BVA) Specification`, `4-Tier Test Suite Architecture` to the rest of the system?**
  _10 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `backend/db/seed.py` be split into smaller, more focused modules?**
  _Cohesion score 0.13675213675213677 - nodes in this community are weakly interconnected._
- **Why does `Department` connect `test_db_models.py` to `sqlalchemy`, `backend/db/seed.py`, `app/main.py`, `AuditLog`, `test_challenger_vector_constraints.py`, `app/db/session.py`, `app/db/seed.py`, `Any`, `routers/complaints.py`, `backend/db/models.py`, `test_seeding_credentials.py`, `test_challenger_m1_postgres_fallback.py`, `test_fastapi_endpoints.py`, `test_challenger_m1_seeding.py`, `test_deterministic_seed_execution`, `test_challenger_m1_empirical.py`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Are the 36 inferred relationships involving `User` (e.g. with `_execute_seeding()` and `general_login()`) actually correct?**
  _`User` has 36 INFERRED edges - model-reasoned connections that need verification._
- **Should `Complaint` be split into smaller, more focused modules?**
  _Cohesion score 0.07311827956989247 - nodes in this community are weakly interconnected._