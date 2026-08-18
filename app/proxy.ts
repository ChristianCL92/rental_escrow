import { NextRequest, NextResponse } from "next/server";
import { marketingRatelimit, ratelimit } from "./lib/ratelimit";

export const config = {
  matcher: "/api/:path*",
};

export async function proxy(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "anonymous";

  // Marketing generation is metered separately and does not also draw on the
  // booking budget, so a burst of generations cannot lock a guest out of
  // checking availability.
  const isMarketing = req.nextUrl.pathname.startsWith("/api/marketing");
  const limiter = isMarketing ? marketingRatelimit : ratelimit;

  let result;
  try {
    result = await limiter.limit(ip);
  } catch (error) {
    // Fail open. An Upstash outage taking down bookings would be worse than
    // the traffic an outage lets through, and the marketing route still has
    // the provider spend cap behind it.
    console.error("rate limit check failed, allowing request:", error);
    return NextResponse.next();
  }

  const { success, limit, remaining, reset } = result;

  if (!success) {
    return NextResponse.json(
      { text: "Too many requests" },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": limit.toString(),
          "X-RateLimit-Remaining": remaining.toString(),
          "X-RateLimit-Reset": reset.toString(),
        },
      },
    );
  }

  const response = NextResponse.next();
  response.headers.set("X-RateLimit-Limit", limit.toString());
  response.headers.set("X-RateLimit-Remaining", remaining.toString());
  response.headers.set("X-RateLimit-Reset", reset.toString());

  return response;
}
