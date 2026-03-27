-- Lesson locking: teacher can hide a lesson from students
alter table public.lessons
  add column if not exists locked boolean not null default false;

-- Sub-lessons: a lesson can have a parent lesson (making it a sub-lesson/tab)
alter table public.lessons
  add column if not exists parent_lesson_id uuid references public.lessons(id) on delete cascade,
  add column if not exists sub_position integer not null default 0;

-- Index for fast sub-lesson lookup
create index if not exists lessons_parent_idx on public.lessons(parent_lesson_id);
