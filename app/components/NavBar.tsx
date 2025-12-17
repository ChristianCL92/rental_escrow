"use client"

import { WalletMultiButton } from "@solana/wallet-adapter-react-ui"
import Link from "next/link"

const NavBar = () => {
  
    return (
    <nav className="flex justify-between items-center p-6 bg-gray-900">
        <h1 className="text-2xl font-bold text-white">El Solar</h1>
        <div className="flex items-center gap-10">
        <Link href={"/bookings"} className="font-bold text-white text-md">My Bookings</Link>
        <WalletMultiButton />
        </div>
    </nav>
  )
}

export default NavBar