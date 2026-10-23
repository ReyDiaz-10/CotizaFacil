-- CotizaFácil: private server-side store for JSON records and private images.
-- Run once from the Supabase SQL Editor before configuring the application.
create table if not exists public.cotizafacil_store (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.cotizafacil_store enable row level security;
revoke all on table public.cotizafacil_store from anon, authenticated;
grant select, insert, update, delete on table public.cotizafacil_store to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cotizafacil-private',
  'cotizafacil-private',
  false,
  5242880,
  array['image/png', 'image/jpeg']
)
on conflict (id) do update set public = false, file_size_limit = 5242880;

-- No policies are added for anon/authenticated: only the backend service role
-- accesses these rows and private files. Never put the service-role key in app.js.
