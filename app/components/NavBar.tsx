"use client"

import { WalletMultiButton } from "@solana/wallet-adapter-react-ui"

const NavBar = () => {
  
    return (
    <nav className="flex justify-between items-center p-6 bg-gray-900">
        <h1 className="text-2xl font-bold text-white">El Solar</h1>
        <WalletMultiButton />
    </nav>
  )
}

export default NavBar