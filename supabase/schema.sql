
create extension if not exists btree_gist;

create table bookings (
  id uuid default gen_random_uuid() primary key,
  apartment_id bigint not null,
  check_in_date date not null,
  check_out_date date not null,
  guest_wallet text not null,
  status text not null default 'pending',
  tx_signature text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  constraint valid_date_range check (check_out_date > check_in_date),

  constraint no_overlapping_bookings exclude using gist (
    apartment_id with =,
    daterange(check_in_date, check_out_date) with &&
  )
);

-- Indexes
create index idx_bookings_apartment_status on bookings(apartment_id, status);
create index idx_bookings_guest on bookings(guest_wallet);