-- ── 038_assignments_rpc.sql ──────────────────────────────────────────────────
-- RPC: vrátí všechny publikované úkoly pro daného žáka
-- (přes přímé přiřazení nebo přes skupinu)

create or replace function public.get_student_assignments(p_student_id uuid)
returns table (
  id              uuid,
  title           text,
  description     text,
  editor_type     text,
  deadline        timestamptz,
  allow_resubmit  boolean,
  status          text,
  published_at    timestamptz,
  created_at      timestamptz,
  teacher_name    text
)
language sql
security definer
as $$
  select distinct
    ta.id,
    ta.title,
    ta.description,
    ta.editor_type,
    ta.deadline,
    ta.allow_resubmit,
    ta.status,
    ta.published_at,
    ta.created_at,
    p.full_name as teacher_name
  from public.task_assignments ta
  join public.profiles p on p.id = ta.teacher_id
  join public.task_targets tt on tt.assignment_id = ta.id
  left join public.group_members gm on gm.group_id = tt.group_id
  where
    ta.status = 'published'
    and (
      tt.student_id = p_student_id
      or gm.student_id = p_student_id
    )
  order by ta.deadline asc nulls last, ta.published_at desc;
$$;

grant execute on function public.get_student_assignments(uuid) to authenticated;
