alter table public.upstream_keys
add column if not exists billing_type text not null default 'paid'
check (billing_type in ('paid', 'free'));

update public.upstream_keys
set billing_type = 'paid'
where billing_type is null;
