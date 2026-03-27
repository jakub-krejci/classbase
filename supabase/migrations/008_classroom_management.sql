-- ── Classroom management additions ───────────────────────────────────────────

-- 1. Module archiving
alter table public.modules
  add column if not exists archived boolean not null default false;

-- 2. Track last_seen_at on profiles (updated on login/activity)
alter table public.profiles
  add column if not exists last_seen_at timestamptz;

-- 3. Group ↔ module assignments (a group can be assigned to a module)
create table if not exists public.group_modules (
  group_id    uuid not null references public.groups(id) on delete cascade,
  module_id   uuid not null references public.modules(id) on delete cascade,
  assigned_at timestamptz default now(),
  primary key (group_id, module_id)
);

-- 4. Per-student enrollment ban (soft-remove without losing progress)
alter table public.enrollments
  add column if not exists banned boolean not null default false;
