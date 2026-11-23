import { NextRequest } from "next/server";
import {
  createHold,
  releaseHold,
  updateBooking,
} from "@/lib/server/booking-service";
import { readJson, respond } from "@/lib/server/route";

/** Hold nights for a stay the guest's wallet signed. */
export const POST = async (req: NextRequest) => {
  const body = await readJson(req);
  return respond("Create booking", (deps) => createHold(body, deps));
};

/** Confirm (with the on-chain payment) or cancel (after the refund). */
export const PATCH = async (req: NextRequest) => {
  const body = await readJson(req);
  return respond("Update booking", (deps) => updateBooking(body, deps));
};

/** Release the guest's own unpaid hold. */
export const DELETE = async (req: NextRequest) => {
  const body = await readJson(req);
  return respond("Release booking", (deps) => releaseHold(body, deps));
};
