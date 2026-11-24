import { NextRequest } from "next/server";
import { guestBookings } from "@/lib/server/booking-service";
import { respond } from "@/lib/server/route";

/** The signed-in wallet's own bookings (Authorization: Bearer <session>). */
export const GET = async (req: NextRequest) => {
  const authorization = req.headers.get("authorization");
  return respond("Guest bookings", (deps) =>
    guestBookings(authorization, deps),
  );
};
