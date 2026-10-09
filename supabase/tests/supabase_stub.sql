-- Minimal local stand-in for the parts of a Supabase database that the
-- migrations rely on. Used only by the automated tests (scripts/test-db.sh)
-- because Supabase's Docker images could not be pulled in the build sandbox.
--
-- Mirrors Supabase behaviour that matters for security:
--   * roles anon / authenticated / service_role (service_role bypasses RLS)
--   * auth.uid() reads the JWT "sub" claim from request.jwt.claims
--   * Supabase's PERMISSIVE default privileges on schema public, so the tests
--     prove that the migration's explicit REVOKEs are what protect the data.

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema auth;
create table auth.users (
    id uuid primary key,
    email text unique,
    created_at timestamptz not null default now() -- as in Supabase's auth.users
);

create function auth.uid() returns uuid language sql stable as $$
    select nullif(
        coalesce(
            current_setting('request.jwt.claim.sub', true),
            (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
        ),
        ''
    )::uuid
$$;

create function auth.role() returns text language sql stable as $$
    select coalesce(
        current_setting('request.jwt.claim.role', true),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
    )::text
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
