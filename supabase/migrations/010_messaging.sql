-- ── Messaging v2: direct messages + announcements + notifications ─────────────

-- 1. Extend messages table
alter table public.messages
  add column if not exists message_type text not null default 'announcement'
    check (message_type in ('announcement', 'direct')),
  add column if not exists module_id uuid references public.modules(id) on delete set null,
  add column if not exists subject text;

-- 2. Student replies (direct message threads go both ways)
-- We reuse messages table: sender_id = student, recipient_type = 'teacher', recipient_id = teacher_id

-- Update recipient_type check to include 'teacher'
alter table public.messages
  drop constraint if exists messages_recipient_type_check;
alter table public.messages
  add constraint messages_recipient_type_check
    check (recipient_type in ('all', 'group', 'student', 'teacher'));

-- 3. Notifications table — lightweight, ephemeral
create table if not exists public.notifications (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  type         text not null check (type in ('message', 'announcement', 'reply')),
  title        text not null,
  body         text,
  link         text,
  read         boolean not null default false,
  created_at   timestamptz default now()
);

create index if not exists notifications_user_idx on public.notifications(user_id, read, created_at desc);

-- RLS
alter table public.notifications enable row level security;
create policy "notifications_own" on public.notifications for all using (auth.uid() = user_id);

-- Students can insert messages (replies)
drop policy if exists "messages_student_insert" on public.messages;
create policy "messages_student_insert" on public.messages for insert
  with check (auth.uid() = sender_id);

-- Students can read messages sent to them or to all
drop policy if exists "messages_student_select" on public.messages;
create policy "messages_student_select" on public.messages for select
  using (
    recipient_type = 'all'
    or (recipient_type = 'student' and recipient_id = auth.uid())
    or sender_id = auth.uid()
    or (recipient_type = 'teacher' and recipient_id = auth.uid())
  );

-- Teachers can read/insert their own messages
drop policy if exists "messages_teacher_all" on public.messages;
create policy "messages_teacher_all" on public.messages for all
  using (
    sender_id = auth.uid()
    or (recipient_type = 'teacher' and recipient_id = auth.uid())
  )
  with check (sender_id = auth.uid());

-- Service role (admin) can do anything — needed for creating notifications server-side
-- (admin client bypasses RLS by default)
