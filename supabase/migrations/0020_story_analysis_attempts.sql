-- Private review failures guide the next scheduled attempt; rejected prose is never published.
create table if not exists public.story_analysis_attempts (
  attempt_key text primary key,
  issues text not null,
  updated_at timestamptz not null default now()
);
alter table public.story_analysis_attempts enable row level security;
