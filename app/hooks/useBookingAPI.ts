import { useWallet } from "@solana/wallet-adapter-react";
import { useCallback, useState } from "react";
import {format} from "date-fns";

interface AvailabilityParams {
    apartmentId: number;
    checkInDate: Date;
    checkOutDate: Date;
}

const formatDate = (date: Date): string => {
    return format(date, "yyyy-MM-dd");
}; 

const useBookingAPI = () => {
    const [isChecking, setIsChecking] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);
    const [isRollback, setIsRollback] = useState(false);
    const [ error, setError ] = useState<string | null>(null);
    const { publicKey } = useWallet();

    const findBookingId = useCallback(async(apartmentId: number, checkInDate: Date) => {

        if (!publicKey) {
            throw new Error("Wallet not connected");
        }
        try {
            const params = new URLSearchParams({
                apartmentId: apartmentId.toString(),
                checkInDate: formatDate(checkInDate),
                guestWallet: publicKey.toBase58()
            })
            const response = await fetch(`/api/bookings?${params}`);

            if (!response.ok) {
                console.log("Response could not be resolved properly");
                const message = await response.json();
                throw new Error(message.error || "Booking not found");
            }
               return await response.json();
        } catch (error) {
            const message = error instanceof Error ? error.message : "failed to get bookingId"
            setError(message);
            throw error;
        }
    }, [publicKey])

    const checkDatesAvailable = useCallback(
        async({apartmentId, checkInDate, checkOutDate}: AvailabilityParams) => {
            setIsChecking(true);
            setError(null);
        
            try {
                const response = await fetch("/api/bookings/availability", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ 
                          apartmentId,
                          checkInDate: formatDate(checkInDate),
                          checkOutDate: formatDate(checkOutDate)
                        })
                });

                if (!response.ok) {
                    const errorData = await response.json()
                   throw new Error( errorData.error || "Failed to check availability")
                }

                return await response.json()

            } catch (error) {
                console.error("Encountered error when processing data:", error);
                const message = error instanceof Error ? error.message : "Failed to check availability";
                setError(message);
            } finally {
                setIsChecking(false);
        
            }

           
        },     
    []
    )

    const createPending = useCallback( async (
        { apartmentId, checkInDate, checkOutDate }: AvailabilityParams ) => {
             setIsCreating(true);
             setError(null);

             if (!publicKey) {
                    throw new Error("Wallet not connected");
                }

            try {
                const response = await fetch("/api/bookings", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ 
                         apartmentId,
                         checkInDate: formatDate(checkInDate),
                         checkOutDate: formatDate(checkOutDate),
                         guestWallet: publicKey.toBase58()
                        })
                })

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || "Failed to create booking");
                }

                return await response.json()
            } catch (error) {
                const message = error instanceof Error ? error.message : "Failed to create pending booking";
                setError(message);
            } finally {
                setIsCreating(false);
            }
    }, [publicKey])

    const updateBooking = useCallback(async (bookingId: string, status: "confirmed" | "cancelled") => {
        setIsConfirming(true);
        setError(null);
        try {
            const response = await fetch("/api/bookings", {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ bookingId, status})
            })

            if (!response.ok) {
                const dataError = await response.json();
              throw new Error(dataError.message || "Could not confirm booking");
            }

            return await response.json();
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to confirm booking"  
          setError(message);
        } finally {
            setIsConfirming(false);
        }
    }, [])

    const rollbackBooking = useCallback(async (bookingId: string) => {
        setIsRollback(true);

        if (!publicKey) {
            throw new Error("Wallet not connected");
        }
        try {
            const response = await fetch("/api/bookings", {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ bookingId, guestWallet: publicKey?.toBase58() })
            })

            if (!response.ok) {
                console.error("Failed to execute Rollback");
                const dataError = await response.json();
              throw new Error(dataError.message || "Could not rollback booking");
            }

            return await response.json();
        } catch (error) {
              console.error("Rollback failed:", error);
          const message = error instanceof Error ? error.message : "Failed to rollback booking"  
          setError(message);
        } finally {
            setIsRollback(false);
        }
    }, [publicKey])

    return {
        findBookingId,
        checkDatesAvailable,
        isChecking,
        error,
        createPending,
        isCreating,
        updateBooking,
        isConfirming,
        rollbackBooking,
        isRollback

    }
}

export default useBookingAPI