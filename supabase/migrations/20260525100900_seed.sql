-- ============================================================================
-- 20260525100900_seed.sql
-- ============================================================================
-- Seed data for the consolidated Internal DB.
--
-- Idempotent: every insert uses ON CONFLICT DO NOTHING. Safe to re-run.
--
-- Contents:
--   1. public.company         — 9 org units (D-D amendment) + holdco sentinel
--   2. public.modules         — dashboard modules catalog
--   3. erp.taxonomies         — single-row reference data
--   4. hr.leave_types         — Singapore defaults
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Company catalog — 9 org units (per Alignment doc D-D amendment to v1.5)
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.company (company_id, display_name, segment) values
  -- Mandate's original 6
  ('meir-homes',           'Meir Homes',            'residential'),
  ('meir-edition',         'Meir Edition',          'residential'),
  ('meir-collective',      'Meir Collective',       'lifestyle'),
  ('m-lifestyle',          'm.lifestyle',           'lifestyle'),
  ('m-atelier',            'm.Atelier',             'commercial'),
  ('good-class-builders',  'Good Class Builders',   'construction'),
  -- D-D amendment — three additional independent org units
  ('cubo',                 'Cubo',                  'venture-builds'),
  ('caerus',               'Caerus',                'venture-builds'),
  ('made',                 'MADE',                  'commercial'),
  -- Holdco sentinel for shared-services rows (HR / Finance / Inventory)
  ('holdco',               'Meirverse (Holdco)',    'holdco')
on conflict (company_id) do nothing;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Modules catalog
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.modules (module_id, display_name, description, category) values
  ('dashboard',     'Internal Dashboard',           'Dashboard chrome — announcements, quick launch, feedback.', 'dashboard'),
  ('admin',         'Org Admin',                    'User access matrix management + org unit settings.',         'admin'),
  ('crm',           'CRM',                          'Cluster 2 deal pipeline (consolidated 4 stages internal).',   'crm'),
  ('erp',           'ERP',                          'Construction + Property Mgmt + Property Maint modules.',      'erp'),
  ('hr',            'HR',                           'Employees, leave, documents (holdco shared-services).',       'hr'),
  ('finance',       'Finance',                      'AutoCount bridge + payment routing (Phase 1 stub).',          'finance'),
  ('inventory',     'Inventory',                    'Cross-org inventory (holdco shared-services). Phase 1 stub.', 'inventory'),
  ('underwriting',  'Underwriting',                 'Policy + risk-assessment Child (under v1.5 "and others").',   'underwriting')
on conflict (module_id) do nothing;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ERP taxonomies (single row, id=1)
-- ─────────────────────────────────────────────────────────────────────────────

insert into erp.taxonomies (id, trades, types, oop_categories, progress_phases, wip_boq_sections) values (
  1,
  -- trades
  '[
    "Architectural", "Civil & Structural", "M&E", "Electrical", "Plumbing & Sanitary",
    "ACMV", "Joinery", "Tiling", "Painting", "Waterproofing", "Roofing",
    "Glazing", "Landscaping", "Pool", "Smart Home", "Furniture & Fittings",
    "External Works", "Other"
  ]'::jsonb,
  -- types (this is the items.type enum — for reference)
  '["Defects", "Modification", "Addition", "Omission", "Reinstatement"]'::jsonb,
  -- oop_categories
  '[
    "Transport", "Site materials", "Petty cash", "Equipment hire",
    "Subcon advance", "Consultant fee", "Statutory fee", "Refreshment", "Other"
  ]'::jsonb,
  -- progress_phases (for fortnightly reports)
  '[
    "Pre-construction", "Foundation", "Substructure", "Superstructure",
    "Architectural — internal", "Architectural — external", "M&E first-fix",
    "M&E second-fix", "Finishes", "Testing & commissioning", "TOP / Handover", "DLP"
  ]'::jsonb,
  -- wip_boq_sections (BoQ section headers for WIP assessment)
  '[
    "Preliminaries", "Substructure", "Frame", "Upper floors", "Roof",
    "Stairs", "External walls", "Windows & external doors", "Internal walls & partitions",
    "Internal doors", "Wall finishes", "Floor finishes", "Ceiling finishes",
    "Fittings, furnishings & equipment", "Sanitary fittings", "Services equipment",
    "Disposal installations", "Water installations", "Heat source",
    "Space heating & air treatment", "Ventilation systems", "Electrical installations",
    "Gas installations", "Lift & conveyor installations", "Fire & lightning protection",
    "Communication installations", "Special installations", "Builders' work in connection",
    "Builders' profit & attendance", "Site works", "Drainage", "External services",
    "Minor building works", "Demolitions", "Contingencies", "PC sums", "Provisional sums"
  ]'::jsonb
)
on conflict (id) do nothing;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. HR leave types (Singapore defaults)
-- ─────────────────────────────────────────────────────────────────────────────

insert into hr.leave_types (leave_type_id, display_name, default_entitlement, paid, requires_attachment, notes) values
  ('annual',          'Annual Leave',          14,  true,  false, 'Default 14 days. Specific entitlements adjusted per employee via leave_balances.'),
  ('medical',         'Medical Leave',         14,  true,  true,  'MOM minimum 14 days outpatient. Requires MC attachment.'),
  ('hospitalization', 'Hospitalization Leave', 60,  true,  true,  'MOM minimum 60 days when hospitalized. Requires hospital discharge or MC.'),
  ('maternity',       'Maternity Leave',       112, true,  true,  '16 weeks (112 days) for eligible mothers per Singapore Employment Act / Child Development Co-Savings Act.'),
  ('paternity',       'Paternity Leave',       28,  true,  true,  '4 weeks (28 days) for eligible fathers per Child Development Co-Savings Act.'),
  ('childcare',       'Childcare Leave',       6,   true,  false, '6 days/year for parents with citizen children under 7.'),
  ('compassionate',   'Compassionate Leave',   3,   true,  false, 'Discretionary. Default 3 days; HR may extend case-by-case.'),
  ('unpaid',          'Unpaid Leave',          0,   false, false, 'Special-case unpaid time off. Approval required.')
on conflict (leave_type_id) do nothing;
