import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/initSupabase";
import { createUpstashAuthStore } from "./auth-store";
import { createSupabaseBookingsRepo } from "./bookings-repo";
import { createEscrowChain } from "./chain";
import type { ServiceDeps, ServiceResult } from "./booking-service";

/**
 * Production dependencies for one request. Each is created on first use, so
 * a request refused before it reaches the database or the chain never
 * connects to them.
 */
const once = <T>(create: () => T): (() => T) => {
  let value: T | undefined;
  return () => (value ??= create());
};

export const requestDeps = (): ServiceDeps => ({
  repo: once(() => createSupabaseBookingsRepo(createServerClient())),
  chain: once(() => createEscrowChain()),
  store: once(() => createUpstashAuthStore()),
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
});

/** The JSON body, or null when there is none or it is not JSON. */
export const readJson = async (req: NextRequest): Promise<unknown> => {
  try {
    return await req.json();
  } catch {
    return null;
  }
};

export const respond = async (
  label: string,
  run: (deps: ServiceDeps) => Promise<ServiceResult>,
): Promise<NextResponse> => {
  try {
    const { status, body } = await run(requestDeps());
    return NextResponse.json(body, { status });
  } catch (error) {
    console.error(`${label} error:`, error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
};
