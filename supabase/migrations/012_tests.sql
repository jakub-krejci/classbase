-- ─── Tests ────────────────────────────────────────────────────────────────────
create table public.tests (
  id                    uuid primary key default gen_random_uuid(),
  teacher_id            uuid not null references public.profiles(id) on delete cascade,
  title                 text not null default 'Untitled Test',
  description           text not null default '',
  category              text not null default '',
  status                text not null default 'draft' check (status in ('draft','published','closed')),
  start_page_html       text not null default '',
  time_limit_mins       integer,           -- null = no limit
  question_time_limits  boolean not null default false,
  max_warnings          integer not null default 3,
  available_from        timestamptz,
  available_until       timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ─── Questions ────────────────────────────────────────────────────────────────
create table public.test_questions (
  id              uuid primary key default gen_random_uuid(),
  test_id         uuid not null references public.tests(id) on delete cascade,
  type            text not null check (type in ('single','multiple','descriptive','truefalse')),
  body_html       text not null default '',
  points_correct  numeric not null default 1,
  points_incorrect numeric not null default 0,
  is_required     boolean not null default true,
  position        integer not null default 0,
  time_limit_mins integer,
  created_at      timestamptz not null default now()
);

-- ─── Options (for single / multiple / truefalse) ──────────────────────────────
create table public.test_question_options (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.test_questions(id) on delete cascade,
  body_html   text not null default '',
  is_correct  boolean not null default false,
  position    integer not null default 0
);

-- ─── Assignments ──────────────────────────────────────────────────────────────
create table public.test_assignments (
  id         uuid primary key default gen_random_uuid(),
  test_id    uuid not null references public.tests(id) on delete cascade,
  group_id   uuid references public.groups(id) on delete cascade,
  student_id uuid references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  check (group_id is not null or student_id is not null)
);

-- ─── Attempts ─────────────────────────────────────────────────────────────────
create table public.test_attempts (
  id            uuid primary key default gen_random_uuid(),
  test_id       uuid not null references public.tests(id) on delete cascade,
  student_id    uuid not null references public.profiles(id) on delete cascade,
  started_at    timestamptz not null default now(),
  submitted_at  timestamptz,
  locked_at     timestamptz,
  status        text not null default 'in_progress' check (status in ('in_progress','submitted','locked','timed_out')),
  warning_count integer not null default 0,
  score         numeric,
  max_score     numeric,
  unique (test_id, student_id)
);

-- ─── Answers ──────────────────────────────────────────────────────────────────
create table public.test_answers (
  id                  uuid primary key default gen_random_uuid(),
  attempt_id          uuid not null references public.test_attempts(id) on delete cascade,
  question_id         uuid not null references public.test_questions(id) on delete cascade,
  answer_text         text,
  selected_option_ids jsonb default '[]',
  answered_at         timestamptz not null default now(),
  unique (attempt_id, question_id)
);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table public.tests enable row level security;
alter table public.test_questions enable row level security;
alter table public.test_question_options enable row level security;
alter table public.test_assignments enable row level security;
alter table public.test_attempts enable row level security;
alter table public.test_answers enable row level security;

-- Teachers manage their own tests
create policy "tests_teacher_all" on public.tests for all
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

-- Students can read published tests assigned to them
create policy "tests_student_read" on public.tests for select
  using (
    status = 'published' and (
      exists (select 1 from public.test_assignments ta where ta.test_id = id and ta.student_id = auth.uid())
      or exists (
        select 1 from public.test_assignments ta
        join public.group_members gm on gm.group_id = ta.group_id
        where ta.test_id = id and gm.student_id = auth.uid()
      )
    )
  );

-- Questions: teachers see their own, students see questions for tests they can access
create policy "test_questions_teacher" on public.test_questions for all
  using (exists (select 1 from public.tests t where t.id = test_id and t.teacher_id = auth.uid()));
create policy "test_questions_student" on public.test_questions for select
  using (exists (select 1 from public.tests t where t.id = test_id and t.status = 'published'));

-- Options: same pattern
create policy "test_options_teacher" on public.test_question_options for all
  using (exists (select 1 from public.test_questions q join public.tests t on t.id = q.test_id where q.id = question_id and t.teacher_id = auth.uid()));
create policy "test_options_student" on public.test_question_options for select
  using (exists (select 1 from public.test_questions q join public.tests t on t.id = q.test_id where q.id = question_id and t.status = 'published'));

-- Assignments
create policy "test_assignments_teacher" on public.test_assignments for all
  using (exists (select 1 from public.tests t where t.id = test_id and t.teacher_id = auth.uid()));
create policy "test_assignments_student_read" on public.test_assignments for select
  using (
    student_id = auth.uid() or
    exists (select 1 from public.group_members gm where gm.group_id = test_assignments.group_id and gm.student_id = auth.uid())
  );

-- Attempts: students manage their own
create policy "test_attempts_student" on public.test_attempts for all
  using (student_id = auth.uid()) with check (student_id = auth.uid());
create policy "test_attempts_teacher" on public.test_attempts for select
  using (exists (select 1 from public.tests t where t.id = test_id and t.teacher_id = auth.uid()));

-- Answers
create policy "test_answers_student" on public.test_answers for all
  using (exists (select 1 from public.test_attempts a where a.id = attempt_id and a.student_id = auth.uid()));
create policy "test_answers_teacher" on public.test_answers for select
  using (exists (select 1 from public.test_attempts a join public.tests t on t.id = a.test_id where a.id = attempt_id and t.teacher_id = auth.uid()));

-- Realtime
alter publication supabase_realtime add table public.test_attempts;
