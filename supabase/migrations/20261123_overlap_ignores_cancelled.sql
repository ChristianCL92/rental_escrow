-- Cancelled bookings stop blocking nights: the overlap constraint counts only
-- pending and confirmed rows. Apply by hand in the Supabase SQL editor.
-- Before: run
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint where conrelid = 'public.bookings'::regclass;
-- and check that no_overlapping_bookings exists with the old definition.

begin;

-- Read-only: active bookings of the same apartment whose dates overlap. The
-- new constraint cannot be added while any are listed here.
select a.id as booking_a, b.id as booking_b, a.apartment_id,
       a.check_in_date as a_check_in, a.check_out_date as a_check_out,
       b.check_in_date as b_check_in, b.check_out_date as b_check_out
from public.bookings a
join public.bookings b
  on a.apartment_id = b.apartment_id
 and a.id < b.id
 and daterange(a.check_in_date, a.check_out_date)
     && daterange(b.check_in_date, b.check_out_date)
where a.status in ('pending', 'confirmed')
  and b.status in ('pending', 'confirmed');

alter table public.bookings drop constraint no_overlapping_bookings;

alter table public.bookings add constraint no_overlapping_bookings
  exclude using gist (
    apartment_id with =,
    daterange(check_in_date, check_out_date) with &&
  ) where (status in ('pending', 'confirmed'));

commit;
