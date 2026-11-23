import { NextRequest } from "next/server";
import { startSession } from "@/lib/server/booking-service";
import { readJson, respond } from "@/lib/server/route";

/** Trade a signed "view" message for a short My Bookings session. */
export const POST = async (req: NextRequest) => {
  const body = await readJson(req);
  return respond("Start session", (deps) => startSession(body, deps));
};
