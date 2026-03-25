-- ============================================================
-- ClassBase — RLS Fix + Diagnostics
-- Run this in: Supabase Dashboard -> SQL Editor -> New query
-- ============================================================

-- 1. Drop existing module policies
drop policy if exists "modules_teacher_all"      on public.modules;
drop policy if exists "modules_enrolled_select"  on public.modules;
drop policy if exists "modules_select_for_lookup" on public.modules;

-- 2. Teachers: full access to their own modules
create policy "modules_teacher_all"
  on public.modules for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

-- 3. Anyone authenticated can SELECT modules (needed for access-code lookup)
create policy "modules_select_authenticated"
  on public.modules for select
  using (auth.role() = 'authenticated');

-- 4. Fix profiles: allow insert for new users
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- 5. Verify your data - run each line separately to diagnose:
-- select auth.uid();
-- select id, teacher_id, title, access_code from public.modules;
-- select id, role, full_name, email from public.profiles where id = auth.uid();
