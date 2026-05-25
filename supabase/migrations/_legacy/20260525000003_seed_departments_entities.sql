-- ============================================================================
-- 20260525000003_seed_departments_entities.sql
-- ============================================================================
-- Phase 2.3 · reference data · committed because every environment (local /
-- staging / production) needs these rows for the dashboard to function.
--
-- Idempotent — re-running won't error or duplicate. Safe to apply after a
-- schema change that touched these tables.
--
-- Source: ARCHITECTURE.md §4 (departments) and §8.2.3 (entities +
-- cluster_entities) v4.3.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- The six launch departments. Extensible — add new rows here OR via the
-- Super Admin UI once it ships.
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.departments (department_id, display_name, description, is_active) values
  ('hr',         'Human Resources', 'Personnel · onboarding · benefits · leave',            true),
  ('admin',      'Administration',  'Office · facilities · contracts · vendors',            true),
  ('accounting', 'Accounting',      'Bookkeeping · A/R · A/P · reporting (AutoCount tile)', true),
  ('operations', 'Operations',      'Project delivery · construction · site mgmt',          true),
  ('sales',      'Sales',           'Termsheet · engagement · client onboarding',           true),
  ('legal',      'Legal',           'Contracts · compliance · disputes',                    true)
on conflict (department_id) do update set
  display_name = excluded.display_name,
  description  = excluded.description,
  is_active    = excluded.is_active;


-- ─────────────────────────────────────────────────────────────────────────────
-- The twelve launch entities across four segments. Cubo / Caerus / MADE are
-- full Meirverse citizens per the v4 doc — they plug into Cluster 1 (HR) at
-- launch via cluster_entities; operational subdomains come later if needed.
-- MADE appears in both Commercial and Venture Builds segments (made-commercial
-- vs made-venture). Merge if they turn out to be the same legal entity.
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.entities (entity_id, display_name, segment, is_active) values
  -- Commercial
  ('meir-collective',     'Meir Collective',      'commercial',     true),
  ('made-commercial',     'MADE (Commercial)',    'commercial',     true),
  -- Residential
  ('meir-homes',          'Meir Homes',           'residential',    true),
  ('meir-edition',        'Meir Edition',         'residential',    true),
  -- Support
  ('good-class-builders', 'Good Class Builders',  'support',        true),
  ('m-atelier',           'm.Atelier',            'support',        true),
  ('m-lifestyle',         'm.Lifestyle',          'support',        true),
  ('property-mgmt',       'Property Management',  'support',        true),
  ('property-maint',      'Property Maintenance', 'support',        true),
  -- Venture Builds (administrative-only at launch; no operational subdomains)
  ('cubo',                'Cubo',                 'venture-builds', true),
  ('caerus',              'Caerus',               'venture-builds', true),
  ('made-venture',        'MADE (Venture)',       'venture-builds', true)
on conflict (entity_id) do update set
  display_name = excluded.display_name,
  segment      = excluded.segment,
  is_active    = excluded.is_active;


-- ─────────────────────────────────────────────────────────────────────────────
-- Cluster → entity participation declarations.
--
-- Cluster 1 (HR) — every active entity plugs in. Use a dynamic insert so
-- new entities added later automatically appear in HR.
--
-- Cluster 2 (Deal pipeline) — property advisory baseline. Venture entities
-- can be added later via additional inserts to cluster_entities.
--
-- Cluster 3 (Asset lifecycle) — H/E/C/A for Construction ERP; Collective
-- only for Property Mgmt. We declare the cluster-level membership here;
-- the Construction ERP's own scoping carries inside that app.
-- ─────────────────────────────────────────────────────────────────────────────

-- Cluster 1: all active entities
insert into public.cluster_entities (cluster_id, entity_id)
  select 'cluster-1', entity_id from public.entities where is_active = true
on conflict (cluster_id, entity_id) do nothing;

-- Cluster 2: property advisory entities
insert into public.cluster_entities (cluster_id, entity_id) values
  ('cluster-2', 'meir-homes'),
  ('cluster-2', 'meir-edition'),
  ('cluster-2', 'meir-collective'),
  ('cluster-2', 'm-atelier')
on conflict (cluster_id, entity_id) do nothing;

-- Cluster 3: asset lifecycle entities
insert into public.cluster_entities (cluster_id, entity_id) values
  ('cluster-3', 'meir-homes'),
  ('cluster-3', 'meir-edition'),
  ('cluster-3', 'meir-collective'),
  ('cluster-3', 'm-atelier')
on conflict (cluster_id, entity_id) do nothing;
