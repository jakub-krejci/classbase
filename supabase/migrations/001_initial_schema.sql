-- ============================================================
-- ClassBase — Full Database Schema
-- Paste this into: Supabase Dashboard → SQL Editor → New query
-- ============================================================

create extension if not exists "uuid-ossp";

-- ── PROFILES ─────────────────────────────────────────────────
create table public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  role              text not null check (role in ('teacher', 'student')),
  full_name         text not null,
  email             text not null,
  subject_specialty text,
  bio               text,
  avatar_url        text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'student'),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── MODULES ──────────────────────────────────────────────────
create table public.modules (
  id           uuid primary key default uuid_generate_v4(),
  teacher_id   uuid not null references public.profiles(id) on delete cascade,
  title        text not null,
  description  text,
  tag          text not null default 'Other',
  access_code  text not null unique,
  unlock_mode  text not null default 'all' check (unlock_mode in ('all', 'sequential')),
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- ── LESSONS ──────────────────────────────────────────────────
create table public.lessons (
  id           uuid primary key default uuid_generate_v4(),
  module_id    uuid not null references public.modules(id) on delete cascade,
  title        text not null,
  content_html text not null default '',
  position     integer not null default 0,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- ── ASSIGNMENTS ───────────────────────────────────────────────
create table public.assignments (
  id           uuid primary key default uuid_generate_v4(),
  module_id    uuid not null references public.modules(id) on delete cascade,
  lesson_id    uuid references public.lessons(id) on delete set null,
  title        text not null,
  type         text not null check (type in ('quiz', 'test', 'homework')),
  instructions text,
  deadline     timestamptz,
  questions    jsonb not null default '[]',
  created_at   timestamptz default now()
);

-- ── ENROLLMENTS ───────────────────────────────────────────────
create table public.enrollments (
  id          uuid primary key default uuid_generate_v4(),
  student_id  uuid not null references public.profiles(id) on delete cascade,
  module_id   uuid not null references public.modules(id) on delete cascade,
  enrolled_at timestamptz default now(),
  unique(student_id, module_id)
);

-- ── LESSON PROGRESS ───────────────────────────────────────────
create table public.lesson_progress (
  id           uuid primary key default uuid_generate_v4(),
  student_id   uuid not null references public.profiles(id) on delete cascade,
  lesson_id    uuid not null references public.lessons(id) on delete cascade,
  completed_at timestamptz default now(),
  unique(student_id, lesson_id)
);

-- ── SUBMISSIONS ───────────────────────────────────────────────
create table public.submissions (
  id               uuid primary key default uuid_generate_v4(),
  student_id       uuid not null references public.profiles(id) on delete cascade,
  assignment_id    uuid not null references public.assignments(id) on delete cascade,
  answers          jsonb not null default '{}',
  file_url         text,
  auto_score       integer,
  teacher_score    integer,
  teacher_feedback text,
  status           text not null default 'submitted' check (status in ('submitted', 'graded')),
  submitted_at     timestamptz default now(),
  graded_at        timestamptz,
  unique(student_id, assignment_id)
);

-- ── GROUPS ───────────────────────────────────────────────────
create table public.groups (
  id          uuid primary key default uuid_generate_v4(),
  teacher_id  uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  description text,
  created_at  timestamptz default now()
);

create table public.group_members (
  group_id    uuid not null references public.groups(id) on delete cascade,
  student_id  uuid not null references public.profiles(id) on delete cascade,
  primary key (group_id, student_id)
);

-- ── MESSAGES ─────────────────────────────────────────────────
create table public.messages (
  id             uuid primary key default uuid_generate_v4(),
  sender_id      uuid not null references public.profiles(id) on delete cascade,
  recipient_type text not null check (recipient_type in ('all', 'group', 'student')),
  recipient_id   uuid,
  body           text not null,
  read_by        uuid[] not null default '{}',
  created_at     timestamptz default now()
);

-- ── ROW LEVEL SECURITY ────────────────────────────────────────
alter table public.profiles        enable row level security;
alter table public.modules         enable row level security;
alter table public.lessons         enable row level security;
alter table public.assignments     enable row level security;
alter table public.enrollments     enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.submissions     enable row level security;
alter table public.groups          enable row level security;
alter table public.group_members   enable row level security;
alter table public.messages        enable row level security;

-- profiles
create policy "profiles_select_all"  on public.profiles for select using (true);
create policy "profiles_update_own"  on public.profiles for update using (auth.uid() = id);

-- modules
create policy "modules_teacher_all"      on public.modules for all    using (auth.uid() = teacher_id);
create policy "modules_enrolled_select"  on public.modules for select using (
  exists (select 1 from public.enrollments e where e.module_id = id and e.student_id = auth.uid())
);

-- lessons
create policy "lessons_teacher_all"     on public.lessons for all    using (
  exists (select 1 from public.modules m where m.id = module_id and m.teacher_id = auth.uid())
);
create policy "lessons_enrolled_select" on public.lessons for select using (
  exists (
    select 1 from public.enrollments e
    join public.modules m on m.id = e.module_id
    where m.id = module_id and e.student_id = auth.uid()
  )
);

-- assignments
create policy "assignments_teacher_all"    on public.assignments for all    using (
  exists (select 1 from public.modules m where m.id = module_id and m.teacher_id = auth.uid())
);
create policy "assignments_enrolled_select" on public.assignments for select using (
  exists (
    select 1 from public.enrollments e
    join public.modules m on m.id = e.module_id
    where m.id = module_id and e.student_id = auth.uid()
  )
);

-- enrollments
create policy "enrollments_student_insert" on public.enrollments for insert with check (auth.uid() = student_id);
create policy "enrollments_student_select" on public.enrollments for select using (auth.uid() = student_id);
create policy "enrollments_teacher_select" on public.enrollments for select using (
  exists (select 1 from public.modules m where m.id = module_id and m.teacher_id = auth.uid())
);

-- lesson_progress
create policy "progress_student_all"     on public.lesson_progress for all using (auth.uid() = student_id);
create policy "progress_teacher_select"  on public.lesson_progress for select using (
  exists (
    select 1 from public.lessons l
    join public.modules m on m.id = l.module_id
    where l.id = lesson_id and m.teacher_id = auth.uid()
  )
);

-- submissions
create policy "submissions_student_all"     on public.submissions for all    using (auth.uid() = student_id);
create policy "submissions_teacher_select"  on public.submissions for select using (
  exists (
    select 1 from public.assignments a
    join public.modules m on m.id = a.module_id
    where a.id = assignment_id and m.teacher_id = auth.uid()
  )
);
create policy "submissions_teacher_update"  on public.submissions for update using (
  exists (
    select 1 from public.assignments a
    join public.modules m on m.id = a.module_id
    where a.id = assignment_id and m.teacher_id = auth.uid()
  )
);

-- groups
create policy "groups_teacher_all"        on public.groups        for all using (auth.uid() = teacher_id);
create policy "group_members_teacher_all" on public.group_members for all using (
  exists (select 1 from public.groups g where g.id = group_id and g.teacher_id = auth.uid())
);
create policy "group_members_student_select" on public.group_members for select using (auth.uid() = student_id);

-- messages
create policy "messages_teacher_insert" on public.messages for insert with check (auth.uid() = sender_id);
create policy "messages_select" on public.messages for select using (
  auth.uid() = sender_id
  or recipient_type = 'all'
  or (recipient_type = 'student' and recipient_id = auth.uid())
  or (recipient_type = 'group' and exists (
    select 1 from public.group_members gm
    where gm.group_id = recipient_id and gm.student_id = auth.uid()
  ))
);
