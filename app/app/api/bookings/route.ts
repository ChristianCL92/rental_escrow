import {NextRequest, NextResponse} from "next/server";
import { createServerClient } from "@/lib/supabase/initSupabase";

export const GET = async (req:NextRequest) => {
    const { searchParams } = new URL(req.url);
    const apartmentId = searchParams.get("apartmentId");
    const guestWallet = searchParams.get("guestWallet");
    const checkInDate = searchParams.get("checkInDate");

    try {
        if (!apartmentId || !guestWallet || !checkInDate) {
            return NextResponse.json({error: "Missing required parameters"}, {status: 400})
        }

        const supabase = createServerClient();

        const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .eq("apartment_id", apartmentId)
        .eq("check_in_date", checkInDate)
        .eq("guest_wallet", guestWallet)
        .single();

        if(error) {
            return NextResponse.json(
                {error: "Error retreiving data"},
                {status: 404}
        )
        }
        
        return NextResponse.json({ booking: data }, { status: 200 })
    } catch (error) {
        return NextResponse.json(
            {error: "Internal server error"},
             {status: 500}
        );
    }
}

export const POST = async (request: NextRequest) => {
    try {
      const {apartmentId, checkInDate, checkOutDate, guestWallet} = await request.json();

      if ( !apartmentId || !checkInDate || !checkOutDate || !guestWallet) {
            return NextResponse.json({
                error: "Could not insert data to database"
            }, {
                status: 400
            })
      }

     const supabase = createServerClient();

     const {data, error} = await supabase
     .from("bookings")
     .insert({
        apartment_id: apartmentId,
        check_in_date: checkInDate,
        check_out_date: checkOutDate,
        guest_wallet: guestWallet,
        status: "pending"
     })
     .select()
     .single()

     if (error) {
        if (error.code === "23P01") {
            return NextResponse.json(
                { error: "Error, double booking attempt, dates no longer available!" },
                { status: 409 }
      )
    }
    console.error("Database error:", error)
    return NextResponse.json(
        { error: "Failed to create booking" },
        {status: 500 }
        )
    }

   return NextResponse.json(
    {booking: data },
    { status: 201 }
    )
    } catch(error) {
    console.error("Create booking error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
     )
 }
}

export const PATCH = async ( request: NextRequest) => {
    try {
        const { bookingId, status} = await request.json();
        if (!bookingId || !status) {
            return NextResponse.json({
                error: "Missing bookingId or status"
            }, {
                status: 400
            })
        }

        const validStatuses = ["confirmed", "cancelled"];
        if (!validStatuses.includes(status)) {
            return NextResponse.json(
                { error: "Missing appropiate column values"},
                { status: 400 }
            )
        }

        const supabase = createServerClient();

        const {data, error} = await supabase
        .from("bookings")
        .update({status, updated_at: new Date().toISOString()})
        .eq("id", bookingId)
        .select()
        .single()

        if(error) {
            return NextResponse.json(
                {error: "Issue occured when updating status column"},
                {status: 500}
            )
        }
        
        return NextResponse.json(
            { booking:data },
             {status: 200}
            )
    } catch (error) {
        console.error("Failed to update database", error);
        return NextResponse.json(
            {error: "Internal server error" },
            {status: 500 }
        )
    }
}

export const DELETE = async (req: NextRequest) => {
    try {
         const { bookingId, guestWallet } = await req.json();

        if (!bookingId || !guestWallet) {
        return NextResponse.json(
            { error: "Missing required fields"},
            { status: 400 }
        )
    }

        const supabase = createServerClient();

        const { data, error } = await supabase
        .from("bookings")
        .delete()
        .eq("id", bookingId)
        .eq("guest_wallet", guestWallet)
        .select()

        if(!data || data.length === 0) {
            return NextResponse.json(
                { error: "Booking not found" },
                { status: 404 }
            )
        }

        if(error) {
            return NextResponse.json(
                { error: "Unable to perform delete operation"},
                { status: 500 }
            )
        }

        return NextResponse.json(
            {success: true}    
        )

         } catch(error) {
            console.error("Delete error:", error);
            return NextResponse.json(
                {error: "Internal server error"},
                {status: 500 }
            )
    }
   
}