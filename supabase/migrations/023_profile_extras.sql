-- Banner image, custom status, last_login tracking
alter table public.profiles
  add column if not exists banner_url    text,
  add column if not exists custom_status text,
  add column if not exists last_login_at timestamptz;

-- Separate public avatars/banners bucket policies already exist (021)
-- Update last_login on sign-in via a function called from auth trigger
create or replace function public.update_last_login()
returns trigger language plpgsql security definer as $$
begin
  update public.profiles
  set last_login_at = now()
  where id = new.id;
  return new;
end;
$$;

-- Trigger fires when a session is created (user signs in)
drop trigger if exists on_auth_sign_in on auth.sessions;
create trigger on_auth_sign_in
  after insert on auth.sessions
  for each row execute procedure public.update_last_login();
