-- ============================================================================
-- 20260525100010_company_catalog.sql
-- ============================================================================
-- Internal DB · Step 1 of the consolidation (Alignment doc, D-C, 2026-05-25).
--
-- The canonical org-unit table. Every primary table in this DB references
-- `company.company_id` via a `company text` column (Mandate §Data model:
-- "Every primary table in both DBs carries a `company` column.")
--
-- Per Principal amendment D-D (Alignment doc, §Decision log), the catalog
-- has 9 org units — the Mandate's 6 plus Cubo, Caerus, MADE.
--
--   1. meir-homes              — Meir Homes
--   2. meir-edition            — Meir Edition
--   3. meir-collective         — Meir Collective
--   4. m-lifestyle             — m.lifestyle
--   5. m-atelier               — m.Atelier
--   6. good-class-builders     — Good Class Builders
--   7. cubo                    — Cubo                (D-D amendment)
--   8. caerus                  — Caerus              (D-D amendment)
--   9. made                    — MADE                (D-D amendment)
--
-- Property Management is a module inside Meir Collective (D-E).
-- Property Maintenance is a module inside Good Class Builders (D-E).
-- Neither is a separate org unit.
--
-- The special sentinel `holdco` is reserved for cross-org rows (HR /
-- Finance / Inventory shared-services layer per Mandate §Data model).
-- Holdco rows are visible to Super Admins and to users with cross-org
-- module grants (see 20260525100030_user_access_matrix.sql).
-- ============================================================================

create table public.company (
  company_id     text primary key,
  display_name   text not null,
  segment        text not null check (segment in (
    'residential',         -- Meir Homes, Meir Edition
    'commercial',          -- m.Atelier, MADE (commercial properties)
    'lifestyle',           -- m.lifestyle, Meir Collective
    'construction',        -- Good Class Builders
    'venture-builds',      -- Cubo, Caerus
    'holdco'               -- shared services (HR, Finance, Inventory)
  )),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

comment on table public.company is
  'Canonical org-unit catalog. The `company_id` value is the FK target for every primary table''s `company` column (Mandate §Data model). Adding an org unit is a single insert — no schema change.';
comment on column public.company.company_id is
  'Stable string key (kebab-case). Used as the foreign-key value in every primary table''s `company` text column.';
comment on column public.company.segment is
  'Strategic grouping for dashboard tile clustering. Not used for access control — that is per-(user, module, company) in user_access.';

create index company_active_idx on public.company(is_active) where is_active = true;

alter table public.company enable row level security;

-- RLS: the catalog is readable by every authenticated user (everyone needs
-- to render the org-unit picker). Writes are service-role only.
create policy "company readable by authenticated users"
  on public.company
  for select
  using (auth.role() = 'authenticated');
