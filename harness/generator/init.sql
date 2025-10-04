create schema if not exists public;
create table if not exists customers (
  id text primary key,
  name text,
  email text,
  updated_at timestamptz default now(),
  deleted boolean default false
);
