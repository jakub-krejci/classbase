-- Student-to-student direct messaging support

-- Update recipient_type constraint to allow student_direct
alter table public.messages
  drop constraint if exists messages_recipient_type_check;

alter table public.messages
  add constraint messages_recipient_type_check
    check (recipient_type in ('all', 'group', 'student', 'teacher', 'student_direct'));

-- Students can read messages where they are sender or recipient
drop policy if exists "messages_student_select" on public.messages;
create policy "messages_student_select" on public.messages for select
  using (
    recipient_type = 'all'
    or (recipient_type = 'student' and recipient_id = auth.uid())
    or (recipient_type = 'student_direct' and recipient_id = auth.uid())
    or (recipient_type = 'teacher' and recipient_id = auth.uid())
    or sender_id = auth.uid()
  );
