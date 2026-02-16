import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/initSupabase";

export const GET = async (req: NextRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const apartmentId = searchParams.get("apartmentId");

    if (!apartmentId) {
      return NextResponse.json(
        { error: "request missing parameters" },
        { status: 400 },
      );
    }

    const supabase = createServerClient();

    const { data, error } = await supabase
      .from("bookings")
      .select("check_in_date, check_out_date")
      .eq("apartment_id", apartmentId)
      .in("status", ["pending", "confirmed"]);

    if (error) {
      return NextResponse.json({ error: "DB query failed" }, { status: 404 });
    }

    return NextResponse.json({ bookings: data }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
};
