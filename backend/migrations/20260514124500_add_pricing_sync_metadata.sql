alter table public.model_pricing
add column if not exists source text not null default 'manual',
add column if not exists is_manual_override boolean not null default true,
add column if not exists litellm_provider text,
add column if not exists max_input_tokens integer,
add column if not exists max_output_tokens integer,
add column if not exists mode text,
add column if not exists synced_at timestamptz;

update public.model_pricing
set source = coalesce(source, 'manual'),
    is_manual_override = coalesce(is_manual_override, true)
where source is null
   or is_manual_override is null;
