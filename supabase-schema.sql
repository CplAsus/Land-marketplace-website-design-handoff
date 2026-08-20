-- Production backend for Sai Thong Phatthana.
-- Safe to run repeatedly: it only creates names owned by this website.

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

create table if not exists public.site_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.land_listings (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  district text not null,
  province text not null default 'ปทุมธานี',
  price numeric(14,2) not null check (price >= 0),
  rai numeric(10,4) not null check (rai > 0),
  size_text text not null,
  deed text not null default 'โปรดสอบถามผู้ขาย',
  owner_name text not null default 'ทรายทองพัฒนา',
  dimensions text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  images text[] not null default '{}',
  tags text[] not null default '{}',
  purposes text[] not null default '{}',
  highlights text[] not null default '{}',
  nearby jsonb not null default '[]'::jsonb,
  road boolean not null default false,
  water boolean not null default false,
  power boolean not null default false,
  verified boolean not null default false,
  transfer_fee_free boolean not null default false,
  status text not null default 'available' check (status in ('draft','available','reserved','sold')),
  published boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_leads (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.land_listings(id) on delete set null,
  listing_title text not null default '',
  customer_name text not null check (char_length(customer_name) between 2 and 120),
  phone text not null check (char_length(regexp_replace(phone, '[^0-9]', '', 'g')) between 9 and 15),
  line_id text check (line_id is null or char_length(line_id) <= 100),
  request_type text not null default 'interest'
    check (request_type in ('interest','appt','docs','report')),
  appointment_date date,
  message text check (message is null or char_length(message) <= 2000),
  requested_documents text[] not null default '{}',
  report_reason text,
  source text not null default 'website' check (char_length(source) <= 500),
  status text not null default 'new'
    check (status in ('new','contacted','appointment','closed')),
  admin_note text check (admin_note is null or char_length(admin_note) <= 4000),
  email_notification_status text not null default 'pending'
    check (email_notification_status in ('pending','sending','sent','failed')),
  email_notification_attempts integer not null default 0
    check (email_notification_attempts >= 0),
  email_notification_sent_at timestamptz,
  email_notification_error text,
  email_notification_provider_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Backfill notification columns when upgrading an existing installation.
alter table public.customer_leads add column if not exists email_notification_status text
  not null default 'pending'
  check (email_notification_status in ('pending','sending','sent','failed'));
alter table public.customer_leads add column if not exists email_notification_attempts integer
  not null default 0 check (email_notification_attempts >= 0);
alter table public.customer_leads add column if not exists email_notification_sent_at timestamptz;
alter table public.customer_leads add column if not exists email_notification_error text;
alter table public.customer_leads add column if not exists email_notification_provider_id text;

create index if not exists customer_leads_created_at_idx
on public.customer_leads (created_at desc);

create index if not exists customer_leads_status_created_at_idx
on public.customer_leads (status, created_at desc);

create index if not exists customer_leads_listing_id_idx
on public.customer_leads (listing_id);

create index if not exists customer_leads_email_status_idx
on public.customer_leads (email_notification_status, created_at desc);

-- Kept for backwards compatibility: this column now stores the optional Google Maps URL.
alter table public.land_listings add column if not exists video_url text;

create or replace function private.is_site_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.site_admins where user_id = auth.uid()
  );
$$;

revoke all on function private.is_site_admin() from public;
grant execute on function private.is_site_admin() to anon, authenticated, service_role;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists land_listings_touch_updated_at on public.land_listings;
create trigger land_listings_touch_updated_at
before update on public.land_listings
for each row execute function public.touch_updated_at();

drop trigger if exists customer_leads_touch_updated_at on public.customer_leads;
create trigger customer_leads_touch_updated_at
before update on public.customer_leads
for each row execute function public.touch_updated_at();

alter table public.site_admins enable row level security;
alter table public.land_listings enable row level security;
alter table public.customer_leads enable row level security;

revoke all on table public.customer_leads from anon, authenticated;
grant insert (
  listing_id, listing_title, customer_name, phone, line_id, request_type,
  appointment_date, message, requested_documents, report_reason, source
) on table public.customer_leads to anon;
grant select, insert, update, delete on table public.customer_leads to authenticated;
grant select, insert, update, delete on table public.customer_leads to service_role;

drop policy if exists "Visitors can submit leads" on public.customer_leads;
create policy "Visitors can submit leads"
on public.customer_leads for insert
to anon
with check (
  status = 'new'
  and admin_note is null
  and char_length(customer_name) between 2 and 120
  and char_length(regexp_replace(phone, '[^0-9]', '', 'g')) between 9 and 15
);

drop policy if exists "Admins can read leads" on public.customer_leads;
create policy "Admins can read leads"
on public.customer_leads for select
to authenticated
using (private.is_site_admin());

drop policy if exists "Admins can insert leads" on public.customer_leads;
create policy "Admins can insert leads"
on public.customer_leads for insert
to authenticated
with check (private.is_site_admin());

drop policy if exists "Admins can update leads" on public.customer_leads;
create policy "Admins can update leads"
on public.customer_leads for update
to authenticated
using (private.is_site_admin())
with check (private.is_site_admin());

drop policy if exists "Admins can delete leads" on public.customer_leads;
create policy "Admins can delete leads"
on public.customer_leads for delete
to authenticated
using (private.is_site_admin());

drop policy if exists "Public can read published listings" on public.land_listings;
create policy "Public can read published listings"
on public.land_listings for select
to anon, authenticated
using (published = true or private.is_site_admin());

drop policy if exists "Admins can insert listings" on public.land_listings;
create policy "Admins can insert listings"
on public.land_listings for insert
to authenticated
with check (private.is_site_admin());

drop policy if exists "Admins can update listings" on public.land_listings;
create policy "Admins can update listings"
on public.land_listings for update
to authenticated
using (private.is_site_admin())
with check (private.is_site_admin());

drop policy if exists "Admins can delete listings" on public.land_listings;
create policy "Admins can delete listings"
on public.land_listings for delete
to authenticated
using (private.is_site_admin());

drop policy if exists "Admins can view own membership" on public.site_admins;
create policy "Admins can view own membership"
on public.site_admins for select
to authenticated
using (user_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'land-images',
  'land-images',
  true,
  10485760,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view land images" on storage.objects;
create policy "Public can view land images"
on storage.objects for select
to public
using (bucket_id = 'land-images');

drop policy if exists "Admins can upload land images" on storage.objects;
create policy "Admins can upload land images"
on storage.objects for insert
to authenticated
with check (bucket_id = 'land-images' and private.is_site_admin());

drop policy if exists "Admins can update land images" on storage.objects;
create policy "Admins can update land images"
on storage.objects for update
to authenticated
using (bucket_id = 'land-images' and private.is_site_admin())
with check (bucket_id = 'land-images' and private.is_site_admin());

drop policy if exists "Admins can delete land images" on storage.objects;
create policy "Admins can delete land images"
on storage.objects for delete
to authenticated
using (bucket_id = 'land-images' and private.is_site_admin());

insert into public.land_listings (
  slug, title, district, province, price, rai, size_text, deed, owner_name,
  dimensions, latitude, longitude, images, tags, purposes, highlights,
  nearby, road, water, power, verified, transfer_fee_free, status,
  published, sort_order
)
values (
  'khlong-7-lamlukka-500-sq-wa',
  'ขายที่ดินคลอง 7 ลำลูกกา ถมแล้ว ติดคลองและถนนสาธารณะ',
  'ลำลูกกา', 'ปทุมธานี', 7500000, 1.25,
  '1 ไร่ 1 งาน (500 ตร.ว.)', 'โปรดสอบถามผู้ขาย', 'ทรายทองพัฒนา',
  'หน้ากว้าง 58.5 × ลึก 34 ม.', 14.096229, 100.641842,
  array[
    'https://cplasus.github.io/Land-marketplace-website-design-handoff/assets/land-khlong7-cover.png',
    'https://cplasus.github.io/Land-marketplace-website-design-handoff/assets/land-khlong7-aerial-1.png',
    'https://cplasus.github.io/Land-marketplace-website-design-handoff/assets/land-khlong7-aerial-2.png'
  ],
  array['ถมแล้ว','ติดคลอง 7','ติดถนน','ฟรีค่าโอน'],
  array['สร้างบ้าน','ลงทุน','โกดัง','ร้านอาหาร'],
  array[
    'ราคา 15,000 บาท/ตร.ว. ขายยกแปลง 7,500,000 บาท',
    'แบ่งขายได้ เริ่มต้น 150 ตร.ว. โปรดสอบถามเงื่อนไข',
    'ถนนสาธารณะหน้าแปลงกว้าง 6 เมตร',
    'เขตชุมชน มีน้ำและไฟฟ้าพร้อม',
    'จากถนนเลียบคลอง 7 ประมาณ 140 เมตร',
    'จากถนนรังสิต-นครนายกประมาณ 4.5 กม.'
  ],
  '[{"name":"โรงเรียนนานาชาติเปิดใหม่","dist":"ประมาณ 1.5 กม."},{"name":"ถนนรังสิต-นครนายก","dist":"ประมาณ 4.5 กม."},{"name":"ถนนลำลูกกา","dist":"ประมาณ 7 กม."},{"name":"ดูโฮมรังสิต","dist":"ใกล้พื้นที่"}]'::jsonb,
  true, true, true, false, true, 'available', true, 10
)
on conflict (slug) do update set
  title = excluded.title,
  price = excluded.price,
  rai = excluded.rai,
  size_text = excluded.size_text,
  dimensions = excluded.dimensions,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  images = excluded.images,
  tags = excluded.tags,
  purposes = excluded.purposes,
  highlights = excluded.highlights,
  nearby = excluded.nearby,
  road = excluded.road,
  water = excluded.water,
  power = excluded.power,
  transfer_fee_free = excluded.transfer_fee_free,
  status = excluded.status,
  published = excluded.published,
  sort_order = excluded.sort_order;
