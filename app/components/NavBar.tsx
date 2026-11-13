"use client";

import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import LogoElSolar from "@/public/elsolar-logo.jpeg";

const NavBar = () => {
  const pathName = usePathname();
  return (
    <nav className="focus-ring-on-dark fixed top-0 w-full z-40 flex justify-between items-center p-6 bg-gray-900">
      <Link href="/" className="flex items-center gap-2 rounded-sm sm:gap-5">
        <Image src={LogoElSolar} alt="" width={45} />
        <span className="max-[768px]:sr-only text-lg font-bold text-white sm:text-2xl">
          El Solar
        </span>
      </Link>
      <div className="flex items-center gap-3 sm:gap-10">
        {pathName !== "/bookings" && (
          <Link
            href={"/bookings"}
            className="rounded-sm font-bold text-white text-md"
          >
            My Bookings
          </Link>
        )}
        <WalletMultiButton />
      </div>
    </nav>
  );
};

export default NavBar;
