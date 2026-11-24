import { NextRequest } from "next/server";
import { bookedDates } from "@/lib/server/booking-service";
import { respond } from "@/lib/server/route";

/** Public: the taken nights of a room, for the calendar. */
export const GET = async (req: NextRequest) => {
  const apartmentId = req.nextUrl.searchParams.get("apartmentId");
  return respond("Booked dates", (deps) => bookedDates(apartmentId, deps));
};
