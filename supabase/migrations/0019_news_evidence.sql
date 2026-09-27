-- Retain provider evidence for server-side analysis; never serve source text as UI copy.
create table if not exists public.news_evidence (
  news_id bigint primary key references public.news(id) on delete cascade,
  source_text text not null,
  observed_at timestamptz not null default now()
);
alter table public.news_evidence enable row level security;
-- No public policy: only the server service role may read/write evidence.
