import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/initSupabase";

export const POST = async (request: NextRequest) => {
    try {
        const { apartmentId, checkInDate, checkOutDate } =  await request.json();
        
        if (!apartmentId || !checkInDate || !checkOutDate) {
             return NextResponse.json({
                error: "request failed, data not available"
             },
             {
                status: 400
             })
        }

        const supabase = createServerClient()

        const { data, error } = await supabase
        .from("bookings")
        .select("id, check_in_date, check_out_date, status")
        .eq("apartment_id", apartmentId)
        .in("status", ["pending", "confirmed"])
        .or(`check_in_date.lt.${checkOutDate},check_out_date.gt.${checkInDate}`)

        if (error) {
            console.error("Supabase error:", error);
            return NextResponse.json({
                error: "failed to check availability"
            }, 
            {
                status: 500
            })
        }

        const isAvailable = data.length === 0;

         return NextResponse.json({
            available: isAvailable,
            conflicts: isAvailable ? [] : data
     })
    } catch (error) {
        console.error("Supabase error:", error);
        return NextResponse.json({
            error: "Internal server error"
        },
     {
        status: 500
     })
 }
}