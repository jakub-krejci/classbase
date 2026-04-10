-- ── 037_assignments_system.sql ────────────────────────────────────────────────
-- Systém úkolů: zadávání, odevzdávání, hodnocení

-- ── Zadání úkolů ──────────────────────────────────────────────────────────────
create table public.task_assignments (
  id            uuid primary key default gen_random_uuid(),
  teacher_id    uuid not null references public.profiles(id) on delete cascade,
  title         text not null,
  description   text not null default '',
  editor_type   text not null check (editor_type in ('python','html','jupyter','sql','microbit','vex','builder','flowchart')),
  deadline      timestamptz,
  allow_resubmit boolean not null default false,
  status        text not null default 'draft' check (status in ('draft','published','closed')),
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── Příjemci úkolu (žáci nebo skupiny) ───────────────────────────────────────
create table public.task_targets (
  id              uuid primary key default gen_random_uuid(),
  assignment_id   uuid not null references public.task_assignments(id) on delete cascade,
  student_id      uuid references public.profiles(id) on delete cascade,
  group_id        uuid references public.groups(id) on delete cascade,
  check (
    (student_id is not null and group_id is null) or
    (student_id is null and group_id is not null)
  )
);

-- ── Odevzdání žáků ────────────────────────────────────────────────────────────
create table public.task_submissions (
  id              uuid primary key default gen_random_uuid(),
  assignment_id   uuid not null references public.task_assignments(id) on delete cascade,
  student_id      uuid not null references public.profiles(id) on delete cascade,
  -- Cesta k souboru v Storage bucket (každý editor má svůj bucket)
  file_path       text,
  -- Status životního cyklu odevzdání
  status          text not null default 'not_started'
                  check (status in ('not_started','in_progress','submitted','returned','graded')),
  submitted_at    timestamptz,
  returned_at     timestamptz,
  graded_at       timestamptz,
  -- Zpětná vazba od učitele
  teacher_comment text,
  grade           text,   -- volný text: '5', 'A', 'Výborně', ...
  allow_resubmit_override boolean, -- učitel může přepsat per-odevzdání
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(assignment_id, student_id)
);

-- ── Indexy ────────────────────────────────────────────────────────────────────
create index on public.task_assignments(teacher_id);
create index on public.task_assignments(status);
create index on public.task_targets(assignment_id);
create index on public.task_targets(student_id);
create index on public.task_targets(group_id);
create index on public.task_submissions(assignment_id);
create index on public.task_submissions(student_id);
create index on public.task_submissions(status);

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.task_assignments enable row level security;
alter table public.task_targets     enable row level security;
alter table public.task_submissions enable row level security;

-- Učitel: plná kontrola nad svými úkoly
create policy "task_assignments_teacher_all"
  on public.task_assignments for all
  using (auth.uid() = teacher_id);

-- Žák: vidí published úkoly, kde je jako příjemce (přímý nebo přes skupinu)
create policy "task_assignments_student_select"
  on public.task_assignments for select
  using (
    status = 'published' and
    exists (
      select 1 from public.task_targets tt
      where tt.assignment_id = id and (
        tt.student_id = auth.uid()
        or exists (
          select 1 from public.group_members gm
          where gm.group_id = tt.group_id and gm.student_id = auth.uid()
        )
      )
    )
  );

-- task_targets: učitel spravuje, žák čte své záznamy
create policy "task_targets_teacher_all"
  on public.task_targets for all
  using (
    exists (
      select 1 from public.task_assignments ta
      where ta.id = assignment_id and ta.teacher_id = auth.uid()
    )
  );

create policy "task_targets_student_select"
  on public.task_targets for select
  using (
    student_id = auth.uid()
    or exists (
      select 1 from public.group_members gm
      where gm.group_id = task_targets.group_id and gm.student_id = auth.uid()
    )
  );

-- task_submissions: učitel čte/zapisuje své, žák čte/zapisuje své
create policy "task_submissions_teacher_all"
  on public.task_submissions for all
  using (
    exists (
      select 1 from public.task_assignments ta
      where ta.id = assignment_id and ta.teacher_id = auth.uid()
    )
  );

create policy "task_submissions_student_all"
  on public.task_submissions for all
  using (student_id = auth.uid());

-- ── Updated_at trigger ────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger task_assignments_updated_at
  before update on public.task_assignments
  for each row execute function public.set_updated_at();

create trigger task_submissions_updated_at
  before update on public.task_submissions
  for each row execute function public.set_updated_at();
