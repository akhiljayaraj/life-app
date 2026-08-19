create extension if not exists pgcrypto;

create table calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  source text not null,
  external_id text not null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, source, external_id)
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  source text not null,
  external_id text not null,
  title text not null,
  due_at timestamptz,
  done boolean not null default false,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, source, external_id)
);
create index tasks_open_idx on tasks (user_id, done, due_at);

create table health_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  metric_type text not null,
  value numeric not null,
  unit text,
  recorded_at timestamptz not null,
  source text not null,
  created_at timestamptz not null default now(),
  unique (user_id, metric_type, recorded_at, source)
);
create index health_series_idx on health_metrics (user_id, metric_type, recorded_at desc);

create table finance_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  account_id text not null,
  name text not null,
  kind text,
  balance numeric not null,
  currency text not null default 'USD',
  as_of timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, account_id)
);

create table finance_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  target_amount numeric not null,
  current_amount numeric not null default 0,
  target_date date,
  created_at timestamptz not null default now()
);

create table ingest_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  source text not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  status text not null,
  rows_written int not null default 0,
  error text,
  created_at timestamptz not null default now()
);

alter table calendar_events enable row level security;
alter table tasks enable row level security;
alter table health_metrics enable row level security;
alter table finance_accounts enable row level security;
alter table finance_goals enable row level security;
alter table ingest_runs enable row level security;
