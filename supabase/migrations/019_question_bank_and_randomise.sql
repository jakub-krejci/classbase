-- Question bank: reusable questions owned by a teacher
create table if not exists public.question_bank (
  id              uuid primary key default gen_random_uuid(),
  teacher_id      uuid not null references public.profiles(id) on delete cascade,
  type            text not null check (type in ('single','multiple','descriptive','truefalse','coding')),
  body_html       text not null default '',
  points_correct  numeric not null default 1,
  points_incorrect numeric not null default 0,
  starter_code    text not null default '',
  tags            text[] not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.question_bank_options (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.question_bank(id) on delete cascade,
  body_html   text not null default '',
  is_correct  boolean not null default false,
  position    integer not null default 0
);

-- RLS: teachers only see their own questions
alter table public.question_bank enable row level security;
alter table public.question_bank_options enable row level security;

create policy "qbank_teacher_all" on public.question_bank
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

create policy "qbank_options_teacher_all" on public.question_bank_options
  using (exists (select 1 from public.question_bank q where q.id = question_id and q.teacher_id = auth.uid()))
  with check (exists (select 1 from public.question_bank q where q.id = question_id and q.teacher_id = auth.uid()));

-- Randomisation settings on tests
alter table public.tests
  add column if not exists randomise_questions boolean not null default false,
  add column if not exists randomise_options   boolean not null default false;
