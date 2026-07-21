create extension if not exists vector;

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  title text,
  content text,
  embedding vector(768),
  metadata jsonb default '{}'::jsonb
);

alter table public.documents
  alter column metadata type jsonb using metadata::jsonb,
  alter column metadata set default '{}'::jsonb;

alter table public.documents
  alter column embedding type vector(768) using embedding::vector(768);

create or replace function public.match_documents(
  query_embedding vector(768),
  match_threshold float default 0.7,
  match_count int default 5
)
returns table (
  id uuid,
  title text,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    documents.id,
    documents.title,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) as similarity
  from public.documents
  where 1 - (documents.embedding <=> query_embedding) > match_threshold
  order by documents.embedding <=> query_embedding
  limit match_count;
end;
$$;
