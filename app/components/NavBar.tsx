"use client"

import { WalletMultiButton } from "@solana/wallet-adapter-react-ui"
import Link from "next/link"
import Image from "next/image"
import LogoElSolar from "@/public/elsolar-logo.jpeg"

const NavBar = () => {
  
    return (
    <nav className="flex justify-between items-center p-6 bg-gray-900">
      <div className="flex items-center gap-2 sm:gap-5">
        <Image 
       src={LogoElSolar}
       alt="El Solar Logo"
       width={45}
       height={45}
       className="max-[395px]:hidden"
       />
        <h1 className="text-lg font-bold text-white sm:text-2xl">El Solar</h1>
      </div>
        <div className="flex items-center gap-3 sm:gap-10">
        <Link href={"/bookings"} className="font-bold text-white text-md">My Bookings</Link>
        <WalletMultiButton />
        </div>
    </nav>
  )
}

export default NavBar