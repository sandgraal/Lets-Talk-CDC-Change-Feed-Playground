create schema if not exists public;
create table if not exists customers (
  id text primary key,
  name text,
  email text,
  updated_at timestamptz default now(),
  deleted boolean default false
);

create table if not exists orders (
  id text primary key,
  status text,
  total numeric,
  updated_at timestamptz default now()
);

create table if not exists order_items (
  id text primary key,
  order_id text references orders(id) on delete cascade,
  sku text,
  qty integer,
  updated_at timestamptz default now()
);
