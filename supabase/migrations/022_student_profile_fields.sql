-- Extra fields for student profiles
alter table public.profiles
  add column if not exists student_class   text,
  add column if not exists grade_level     text,
  add column if not exists pronouns        text,
  add column if not exists accent_color    text not null default '#185FA5';
