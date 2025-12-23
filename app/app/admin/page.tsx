"use client"
import useRentalProgram, {EscrowInfo} from "@/hooks/useRentalProgram"
import {  useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { format } from "date-fns";
import { useWallet } from "@solana/wallet-adapter-react";
import useEscrowQueries from "@/hooks/useEscrowQueries";

const AdminPage = () => {
    const [releasingId, setReleasingId] = useState<string | null>(null);    
    const {connected} = useWallet();    
    const { isOwner } = useRentalProgram();
    const { 
            escrows,
            isLoading,
            isError,
            error,
            refetch,
            releasePayment,
            isReleasing,
            releaseError
        } = useEscrowQueries();
   
 const handleRelease = async (escrow: EscrowInfo) => {
  const escrowKey = escrow.publicKey.toBase58();
    setReleasingId(escrowKey);
    

    releasePayment({
        apartmentId: escrow.apartmentId,
        guestAddress: escrow.guestAddress
    },
    {
        onSuccess: () => {
            setReleasingId(null)
        },
        onError: (err) => {
            console.error("Transaction failed to release:", err);
            setReleasingId(null)

        }
    },

  )
}

if (!connected) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Admin Dashboard</h1>
          <p className="text-gray-400 mb-6">Connect your wallet to continue</p>
          <WalletMultiButton />
        </div>
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-500 mb-4">Access Denied</h1>
          <p className="text-gray-400">This wallet is not authorized to access the admin panel.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-white">Admin Dashboard</h1>
            {releaseError && (
              <p className="text-red-500">
                Release failed: {releaseError.message}
             </p>
              )}
          <div className="flex gap-4 items-center">
            <button
              onClick={() => refetch()}
              disabled={isLoading}
              className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 disabled:opacity-50"
            >
              {isLoading ? "Loading..." : "Refresh"}
            </button>
            <WalletMultiButton />
          </div>
        </div>
        {isError && (
          <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded text-red-200">
            {error instanceof Error ? error.message : "Failed to load escrows"}
          </div>
        )}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-gray-800 p-4 rounded-lg">
            <p className="text-gray-400 text-sm">Total Bookings</p>
            <p className="text-2xl font-bold text-white">{escrows.length}</p>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg">
            <p className="text-gray-400 text-sm">Pending Release</p>
            <p className="text-2xl font-bold text-yellow-400">
              {escrows.filter((e) => e.canRelease).length}
            </p>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg">
            <p className="text-gray-400 text-sm">Completed</p>
            <p className="text-2xl font-bold text-green-400">
              {escrows.filter((e) => e.rentEnded).length}
            </p>
          </div>
        </div>
        {/* Escrows Table */}
        {isLoading ? (
          <div className="text-center text-gray-400 py-12">Loading escrows...</div>
        ) : escrows.length === 0 ? (
          <div className="text-center text-gray-400 py-12">No bookings found</div>
        ) : (
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">
                    Apartment
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">
                    Guest
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">
                    Check-in
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {escrows.map((escrow) => {
                  const escrowKey = escrow.publicKey.toBase58();
                  const isReleasingThis = releasingId === escrowKey;

                  return (
                    <tr key={escrowKey} className="hover:bg-gray-750">
                      <td className="px-4 py-4 text-white">#{escrow.apartmentId}</td>
                      <td className="px-4 py-4 text-gray-300 font-mono text-sm">
                        {escrow.guestAddress.toBase58().slice(0, 4)}...
                        {escrow.guestAddress.toBase58().slice(-4)}
                      </td>
                      <td className="px-4 py-4 text-white font-medium">
                        {escrow.amount} USDC
                      </td>
                      <td className="px-4 py-4 text-gray-300">
                        {format(escrow.checkInDate, "MMM d, yyyy")}
                      </td>
                      <td className="px-4 py-4">
                        {escrow.rentEnded ? (
                          <span className="px-2 py-1 bg-green-900/50 text-green-400 text-sm rounded">
                            Released
                          </span>
                        ) : escrow.canRelease ? (
                          <span className="px-2 py-1 bg-yellow-900/50 text-yellow-400 text-sm rounded">
                            Ready
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-gray-700 text-gray-400 text-sm rounded">
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {escrow.rentEnded ? (
                          <span className="text-gray-500">—</span>
                        ) : escrow.canRelease ? (
                          <button
                            onClick={() => handleRelease(escrow)}
                            disabled={isReleasingThis || isReleasing}
                            className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-500 disabled:opacity-50"
                          >
                            {isReleasingThis ? "Releasing..." : "Release"}
                          </button>
                        ) : (
                          <span className="text-gray-500 text-sm">
                            {format(escrow.checkInDate, "MMM d")}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default AdminPage