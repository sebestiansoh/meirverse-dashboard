-- ============================================================================
-- 20260525100100_erp_schema.sql
-- ============================================================================
-- ERP (Construction + Property Management + Property Maintenance) — Internal
-- DB schema. Lives in the `erp` Postgres schema (Alignment doc Q6 default).
--
-- Per D-E (Alignment doc, §Decision log):
--   • Property Maintenance is a MODULE inside Good Class Builders, not a
--     separate org unit. Rows scoped to GCB use company='good-class-builders'.
--   • Property Management is a MODULE inside Meir Collective. Rows scoped
--     there use company='meir-collective'.
--   • The ERP Child at erp.meirverse.app surfaces all three modules
--     (Construction, Property Mgmt, Property Maint) with module-level
--     entitlement from user_access deciding which rows the user sees.
--
-- Per Mandate §Data model + D-C: NO mirror users table. Every user_id FK
-- references auth.users(id) directly. The deprecated public.gcb_users
-- table is NOT created.
--
-- Every primary table carries:
--   • `company text not null references public.company(company_id)` —
--      tells RLS which org unit owns the row.
--   • `module text not null check (module in (...))` — distinguishes
--      Construction / Property Mgmt / Property Maint surface where the
--      same table shape is reused.
-- ============================================================================


create schema if not exists erp;

comment on schema erp is
  'ERP Child (erp.meirverse.app). Surfaces Construction, Property Management, and Property Maintenance modules. SoR: Internal DB (Mandate §Data model).';

-- Grant schema-level usage. RLS still gates row visibility.
grant usage on schema erp to authenticated, anon;


-- ─────────────────────────────────────────────────────────────────────────────
-- erp.projects · the "address" — one per project site
-- ─────────────────────────────────────────────────────────────────────────────

create table erp.projects (
  id                uuid primary key default gen_random_uuid(),
  company           text not null references public.company(company_id),
  module            text not null check (module in ('construction', 'property-mgmt', 'property-maint')),
  address           text not null,
  description       text,
  contract_type     text,
  contract_sum      numeric not null default 0,
  handover_date     date,
  dlp_end_date      date,
  poc_user_id       uuid references auth.users(id),
  archived          boolean not null default false,
  archived_at       timestamptz,
  archived_by_id    uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  created_by_id     uuid not null references auth.users(id)
);

comment on column erp.projects.address is
  'Canonical site address. The "Address" in user-facing chrome.';
comment on column erp.projects.module is
  'Which ERP surface this project belongs to. Construction = GCB build sites; property-mgmt = Meir Collective managed properties; property-maint = GCB maintenance contracts.';

create index erp_projects_archived_idx on erp.projects(archived);
create index erp_projects_company_idx  on erp.projects(company);
create index erp_projects_module_idx   on erp.projects(company, module);

alter table erp.projects enable row level security;


-- ─────────────────────────────────────────────────────────────────────────────
-- erp.project_members · per-project role + position
-- ─────────────────────────────────────────────────────────────────────────────

create table erp.project_members (
  project_id              uuid not null references erp.projects(id) on delete cascade,
  user_id                 uuid not null references auth.users(id) on delete cascade,
  role                    text not null check (role in ('admin', 'staff', 'initiator', 'viewer', 'consultant')),
  position                text,
  approves_for_user_ids   jsonb not null default '[]'::jsonb,
  joined_at               timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index erp_project_members_user_idx on erp.project_members(user_id);

alter table erp.project_members enable row level security;


-- ─────────────────────────────────────────────────────────────────────────────
-- erp.project_locations · sub-locations within a project
-- ─────────────────────────────────────────────────────────────────────────────

create table erp.project_locations (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references erp.projects(id) on delete cascade,
  name        text not null,
  order_idx   integer not null default 0
);

create index erp_project_locations_project_idx on erp.project_locations(project_id);

alter table erp.project_locations enable row level security;


-- ─────────────────────────────────────────────────────────────────────────────
-- erp.items · the workhorse (defects, modifications, additions, etc.)
-- ─────────────────────────────────────────────────────────────────────────────

create table erp.items (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid not null references erp.projects(id) on delete cascade,
  company               text not null references public.company(company_id),
  location_id           uuid references erp.project_locations(id),
  trade                 text not null,
  type                  text not null check (type in (
    'Defects', 'Modification', 'Addition', 'Omission', 'Reinstatement'
  )),
  description           text not null,
  status                text not null default 'Open' check (status in (
    'Open', 'In Progress', 'Completed'
  )),
  escalated             boolean not null default false,
  acknowledged          boolean not null default false,
  acknowledged_at       timestamptz,
  acknowledged_by_id    uuid references auth.users(id),
  reply                 text not null default '',
  raised_by             uuid not null references auth.users(id),
  raised_by_name        text not null,
  raised_at             timestamptz not null,
  updated_at            timestamptz not null,
  completed_at          timestamptz,
  history               jsonb not null default '[]'::jsonb
);

comment on column erp.items.company is
  'Denormalised from projects.company at insert. Lets RLS short-circuit without a join. Must always match projects(project_id).company.';

create index erp_items_project_idx on erp.items(project_id);
create index erp_items_status_idx  on erp.items(project_id, status);
create index erp_items_company_idx on erp.items(company);

alter table erp.items enable row level security;


-- ─────────────────────────────────────────────────────────────────────────────
-- erp.item_photos · Supabase Storage-backed
-- ─────────────────────────────────────────────────────────────────────────────

create table erp.item_photos (
  id                uuid primary key default gen_random_uuid(),
  item_id           uuid not null references erp.items(id) on delete cascade,
  storage_key       text not null,
  uploaded_at       timestamptz not null default now(),
  uploaded_by_id    uuid not null references auth.users(id),
  caption           text not null default ''
);

create index erp_item_photos_item_idx on erp.item_photos(item_id);

alter table erp.item_photos enable row level security;


-- ─────────────────────────────────────────────────────────────────────────────
-- erp.progress_reports · fortnightly
-- ─────────────────────────────────────────────────────────────────────────────

create table erp.progress_reports (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references erp.projects(id) on delete cascade,
  company           text not null references public.company(company_id),
  report_no         integer not null,
  period_from       date not null,
  period_to         date not null,
  status            text not null default 'draft' check (status in ('draft', 'issued')),
  work_done         jsonb not null default '[]'::jsonb,
  work_planned      jsonb not null default '[]'::jsonb,
  me_done           jsonb not null default '[]'::jsonb,
  me_planned        jsonb not null default '[]'::jsonb,
  general_notes     text not null default '',
  consultant_acks   jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now(),
  created_by_id     uuid not null references auth.users(id),
  issued_at         timestamptz,
  issued_by_id      uuid references auth.users(id),
  unique (project_id, report_no)
);

create index erp_progress_reports_company_idx on erp.progress_reports(company);

alter table erp.progress_reports enable row level security;


-- ─────────────────────────────────────────────────────────────────────────────
-- erp.wip_assessments · monthly, BoQ-structured
-- ─────────────────────────────────────────────────────────────────────────────

create table erp.wip_assessments (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references erp.projects(id) on delete cascade,
  company             text not null references public.company(company_id),
  assessment_no       integer not null,
  period              text not null,
  sections            jsonb not null default '[]'::jsonb,
  pm_signed_at        timestamptz,
  pm_signed_by_id     uuid references auth.users(id),
  pm_signed_by_name   text,
  qs_signed_at        timestamptz,
  qs_signed_by_id     uuid references auth.users(id),
  qs_signed_by_name   text,
  prepared_by_id      uuid not null references auth.users(id),
  prepared_by_name    text not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (project_id, assessment_no)
);

create index erp_wip_assessments_company_idx on erp.wip_assessments(company);

alter table erp.wip_assessments enable row level security;


-- ─────────────────────────────────────────────────────────────────────────────
-- erp.payment_certs · downstream of Subcon Claims
-- Declared before subcon_claims because subcon_claims.payment_cert_id FKs in.
-- ─────────────────────────────────────────────────────────────────────────────

create table erp.payment_certs (
  id                              uuid primary key default gen_random_uuid(),
  project_id                      uuid not null references erp.projects(id) on delete cascade,
  company                         text not null references public.company(company_id),
  subcon_name                     text not null,
  pc_no                           integer not null,
  pc_date                         date not null,
  progress_from_date              date,
  progress_to_date                date,
  subcon_bill_no                  text,
  subcon_bill_date                date,
  contract_ref_no                 text,
  original_subcontract_value      numeric not null default 0,
  variations_value                numeric not null default 0,
  vo_ticket_ids                   jsonb not null default '[]'::jsonb,
  advance_payment_pct             numeric not null default 0,
  advance_payment_value           numeric not null default 0,
  work_done_original              numeric not null default 0,
  work_done_variations            numeric not null default 0,
  retention_pct                   numeric not null default 5,
  advance_recovery                numeric not null default 0,
  other_deductions                numeric not null default 0,
  previous_payments               numeric not null default 0,
  gst_pct                         numeric not null default 9,
  source_claim_id                 uuid,
  source_claim_no                 text,
  prepared_by_id                  uuid not null references auth.users(id),
  prepared_by_name                text not null,
  reviewed_by_name                text,
  qs_by_name                      text,
  pm_by_name                      text,
  gm_by_name                      text,
  director_by_name                text,
  reviewed_at                     timestamptz,
  qs_at                           timestamptz,
  pm_at                           timestamptz,
  gm_at                           timestamptz,
  director_at                     timestamptz,
  status                          text not null default 'draft' check (status in (
    'draft', 'qs_signed', 'pm_signed', 'issued'
  )),
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  unique (project_id, pc_no)
);

create index erp_payment_certs_company_idx on erp.payment_certs(company);

create trigger erp_payment_certs_touch
  before update on erp.payment_certs
  for each row execute function public.touch_updated_at();

alter table erp.payment_certs enable row level security;


-- ─────────────────────────────────────────────────────────────────────────────
-- erp.subcon_claims · back-to-back QS → PM → Finance
-- ─────────────────────────────────────────────────────────────────────────────

create table erp.subcon_claims (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid not null references erp.projects(id) on delete cascade,
  company               text not null references public.company(company_id),
  subcon_name           text not null,
  subcon_ref            text,
  period                text not null,
  progress_report_id    uuid references erp.progress_reports(id),
  claim_amount          numeric not null default 0,
  retention_pct         numeric not null default 10,
  retention_amount      numeric not null default 0,
  gst_pct               numeric not null default 9,
  gst_amount            numeric not null default 0,
  net_payable           numeric not null default 0,
  notes                 text not null default '',
  attachments           jsonb not null default '[]'::jsonb,
  status                text not null default 'draft' check (status in (
    'draft', 'submitted', 'approved', 'kiv', 'rejected', 'numbered', 'paid'
  )),
  raised_by_id          uuid not null references auth.users(id),
  raised_by_name        text not null,
  raised_at             timestamptz not null,
  submitted_at          timestamptz,
  decided_by_id         uuid references auth.users(id),
  decided_by_name       text,
  decided_at            timestamptz,
  decision_note         text not null default '',
  claim_no              text,
  numbered_at           timestamptz,
  numbered_by_id        uuid references auth.users(id),
  numbered_by_name      text,
  paid_at               timestamptz,
  paid_by_id            uuid references auth.users(id),
  paid_by_name          text,
  payment_ref           text not null default '',
  payment_cert_id       uuid references erp.payment_certs(id)
);

create index erp_subcon_claims_project_status_idx on erp.subcon_claims(project_id, status);
create index erp_subcon_claims_company_idx        on erp.subcon_claims(company);

-- Resolve the chicken-and-egg FK from payment_certs back to subcon_claims.
alter table erp.payment_certs
  add constraint erp_payment_certs_source_claim_fk
  foreign key (source_claim_id) references erp.subcon_claims(id);

alter table erp.subcon_claims enable row level security;


-- ─────────────────────────────────────────────────────────────────────────────
-- erp.oop_claims · staff reimbursements
-- ─────────────────────────────────────────────────────────────────────────────

create table erp.oop_claims (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references erp.projects(id) on delete cascade,
  company             text not null references public.company(company_id),
  purpose             text not null,
  category            text not null,
  amount              numeric not null default 0,
  attachments         jsonb not null default '[]'::jsonb,
  status              text not null default 'submitted' check (status in (
    'submitted', 'approved', 'kiv', 'rejected', 'numbered', 'paid'
  )),
  raised_by_id        uuid not null references auth.users(id),
  raised_by_name      text not null,
  raised_at           timestamptz not null,
  submitted_at        timestamptz,
  decided_by_id       uuid references auth.users(id),
  decided_by_name     text,
  decided_at          timestamptz,
  decision_note       text not null default '',
  claim_no            text,
  numbered_at         timestamptz,
  paid_at             timestamptz,
  payment_ref         text not null default ''
);

create index erp_oop_claims_project_status_idx on erp.oop_claims(project_id, status);
create index erp_oop_claims_company_idx        on erp.oop_claims(company);

alter table erp.oop_claims enable row level security;


-- ─────────────────────────────────────────────────────────────────────────────
-- erp.master_programmes · one per project, replace on re-upload
-- ─────────────────────────────────────────────────────────────────────────────

create table erp.master_programmes (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null unique references erp.projects(id) on delete cascade,
  company             text not null references public.company(company_id),
  name                text not null,
  source_filename     text,
  imported_at         timestamptz not null default now(),
  imported_by_id      uuid not null references auth.users(id),
  imported_by_name    text not null,
  project_start       date,
  project_finish      date,
  tasks               jsonb not null default '[]'::jsonb
);

create index erp_master_programmes_company_idx on erp.master_programmes(company);

alter table erp.master_programmes enable row level security;


-- ─────────────────────────────────────────────────────────────────────────────
-- erp.suggestions · rewards-matrix contributions
-- ─────────────────────────────────────────────────────────────────────────────

create table erp.suggestions (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references erp.projects(id) on delete cascade,
  company           text not null references public.company(company_id),
  raised_by_id      uuid not null references auth.users(id),
  raised_by_name    text not null,
  subject           text not null,
  body              text not null,
  photos            jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index erp_suggestions_user_period_idx on erp.suggestions(raised_by_id, created_at);
create index erp_suggestions_company_idx     on erp.suggestions(company);

alter table erp.suggestions enable row level security;


-- ─────────────────────────────────────────────────────────────────────────────
-- erp.notifications · per-user inbox
-- ─────────────────────────────────────────────────────────────────────────────

create table erp.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  company     text not null references public.company(company_id),
  kind        text not null check (kind in (
    'escalation', 'rejection', 'reclassification', 'submitted',
    'ack', 'wip_signoff', 'claim_decision', 'payment_made'
  )),
  title       text not null,
  text        text not null default '',
  project_id  uuid references erp.projects(id),
  item_id     uuid references erp.items(id),
  timestamp   timestamptz not null default now(),
  read_at     timestamptz
);

create index erp_notifications_user_read_idx on erp.notifications(user_id, read_at);
create index erp_notifications_company_idx   on erp.notifications(company);

alter table erp.notifications enable row level security;


-- ─────────────────────────────────────────────────────────────────────────────
-- erp.taxonomies · single-row admin-edited reference data
-- ─────────────────────────────────────────────────────────────────────────────

create table erp.taxonomies (
  id                  integer primary key check (id = 1),
  trades              jsonb not null default '[]'::jsonb,
  types               jsonb not null default '[]'::jsonb,
  oop_categories      jsonb not null default '[]'::jsonb,
  progress_phases     jsonb not null default '[]'::jsonb,
  wip_boq_sections    jsonb not null default '[]'::jsonb
);

comment on table erp.taxonomies is
  'Single-row reference data (always id=1). NOT company-scoped — taxonomies are shared across all org units running the ERP. Updates restricted to Super Admins / Org Admins via RLS.';

alter table erp.taxonomies enable row level security;


-- ─────────────────────────────────────────────────────────────────────────────
-- erp.audit_log · immutable, append-only
-- ─────────────────────────────────────────────────────────────────────────────

create table erp.audit_log (
  id                uuid primary key default gen_random_uuid(),
  timestamp         timestamptz not null default now(),
  company           text references public.company(company_id),
  user_id           uuid references auth.users(id),
  user_name         text not null,
  user_email        text not null,
  type              text not null check (type in (
    'auth', 'create', 'update', 'status', 'delete',
    'escalate', 'reject', 'reclassify', 'settings', 'export'
  )),
  action            text not null,
  project_id        uuid references erp.projects(id),
  project_address   text,
  hash              text
);

create index erp_audit_log_timestamp_idx on erp.audit_log(timestamp desc);
create index erp_audit_log_user_idx      on erp.audit_log(user_id);
create index erp_audit_log_company_idx   on erp.audit_log(company);

alter table erp.audit_log enable row level security;


-- ─────────────────────────────────────────────────────────────────────────────
-- erp.claim_counters · atomic increment for Token/YYYY-MM/NNN numbering
-- ─────────────────────────────────────────────────────────────────────────────

create table erp.claim_counters (
  company          text not null references public.company(company_id),
  claimant_token   text not null,
  period           text not null,
  counter          integer not null default 0,
  primary key (company, claimant_token, period)
);

alter table erp.claim_counters enable row level security;


-- ─────────────────────────────────────────────────────────────────────────────
-- erp.* updated_at triggers
-- ─────────────────────────────────────────────────────────────────────────────

create trigger erp_items_touch              before update on erp.items              for each row execute function public.touch_updated_at();
create trigger erp_wip_assessments_touch    before update on erp.wip_assessments    for each row execute function public.touch_updated_at();
-- payment_certs trigger already created above.
-- progress_reports, subcon_claims, oop_claims, master_programmes, suggestions,
-- notifications, taxonomies, audit_log, claim_counters either have no updated_at
-- or are append-only.
