import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Every read and write the booking routes make on `public.bookings`. The
 * routes reach Supabase only through this, so the authorization logic can be
 * tested against an in-memory table.
 */

export type BookingStatus = "pending" | "confirmed" | "cancelled";

export interface BookingRow {
  id: string;
  apartment_id: number;
  check_in_date: string;
  check_out_date: string;
  guest_wallet: string;
  status: BookingStatus;
  tx_signature: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewBooking {
  apartment_id: number;
  check_in_date: string;
  check_out_date: string;
  guest_wallet: string;
  status: "pending" | "confirmed";
  tx_signature?: string;
}

/** The overlap constraint refused an insert (Postgres 23P01). */
export class OverlapError extends Error {
  constructor() {
    super("Dates overlap an existing booking");
    this.name = "OverlapError";
  }
}

export interface BookingsRepo {
  /** Pending and confirmed bookings of a room that overlap the stay. */
  activeOverlapping(
    apartmentId: number,
    checkInDate: string,
    checkOutDate: string,
  ): Promise<BookingRow[]>;
  /** Pending and confirmed bookings of a room. */
  activeForApartment(apartmentId: number): Promise<BookingRow[]>;
  /** A guest's pending holds, in any room. */
  pendingForGuest(wallet: string): Promise<BookingRow[]>;
  /** A guest's pending or confirmed booking of a room by check-in day. */
  activeStay(
    wallet: string,
    apartmentId: number,
    checkInDate: string,
  ): Promise<BookingRow | null>;
  forGuest(wallet: string): Promise<BookingRow[]>;
  byId(id: string): Promise<BookingRow | null>;
  /** Throws OverlapError when the nights are taken. */
  insert(booking: NewBooking): Promise<BookingRow>;
  /** Updates a booking that is still in one of `from`; null if it is not. */
  setStatus(
    id: string,
    from: BookingStatus[],
    status: BookingStatus,
    txSignature?: string,
  ): Promise<BookingRow | null>;
  /**
   * Deletes a booking only while it is pending (and, when given, created at
   * or before `createdBefore`). False when nothing matched.
   */
  deletePending(id: string, createdBefore?: string): Promise<boolean>;
}

const ACTIVE: BookingStatus[] = ["pending", "confirmed"];

export const createSupabaseBookingsRepo = (
  supabase: SupabaseClient,
): BookingsRepo => {
  const table = () => supabase.from("bookings");
  const rows = <T>(result: { data: T | null; error: unknown }): T => {
    if (result.error) throw result.error;
    return result.data as T;
  };

  return {
    activeOverlapping: async (apartmentId, checkInDate, checkOutDate) =>
      rows<BookingRow[]>(
        await table()
          .select("*")
          .eq("apartment_id", apartmentId)
          .in("status", ACTIVE)
          .lt("check_in_date", checkOutDate)
          .gt("check_out_date", checkInDate),
      ),
    activeForApartment: async (apartmentId) =>
      rows<BookingRow[]>(
        await table()
          .select("*")
          .eq("apartment_id", apartmentId)
          .in("status", ACTIVE),
      ),
    pendingForGuest: async (wallet) =>
      rows<BookingRow[]>(
        await table()
          .select("*")
          .eq("guest_wallet", wallet)
          .eq("status", "pending"),
      ),
    activeStay: async (wallet, apartmentId, checkInDate) =>
      rows<BookingRow | null>(
        await table()
          .select("*")
          .eq("guest_wallet", wallet)
          .eq("apartment_id", apartmentId)
          .eq("check_in_date", checkInDate)
          .in("status", ACTIVE)
          .maybeSingle(),
      ),
    forGuest: async (wallet) =>
      rows<BookingRow[]>(
        await table()
          .select("*")
          .eq("guest_wallet", wallet)
          .order("check_in_date", { ascending: false }),
      ),
    byId: async (id) =>
      rows<BookingRow | null>(
        await table().select("*").eq("id", id).maybeSingle(),
      ),
    insert: async (booking) => {
      const result = await table().insert(booking).select().single();
      if (result.error?.code === "23P01") throw new OverlapError();
      return rows<BookingRow>(result);
    },
    setStatus: async (id, from, status, txSignature) =>
      rows<BookingRow | null>(
        await table()
          .update({
            status,
            updated_at: new Date().toISOString(),
            ...(txSignature ? { tx_signature: txSignature } : {}),
          })
          .eq("id", id)
          .in("status", from)
          .select()
          .maybeSingle(),
      ),
    deletePending: async (id, createdBefore) => {
      let query = table().delete().eq("id", id).eq("status", "pending");
      if (createdBefore) query = query.lte("created_at", createdBefore);
      return rows<BookingRow[]>(await query.select()).length > 0;
    },
  };
};
