import { NextRequest } from "next/server";
import { checkAvailability } from "@/lib/server/booking-service";
import { readJson, respond } from "@/lib/server/route";

/** Public: whether a stay's nights are free. */
export const POST = async (req: NextRequest) => {
  const body = await readJson(req);
  return respond("Availability", (deps) => checkAvailability(body, deps));
};
