"use client";

import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import LogoElSolar from "@/public/elsolar-logo.jpeg";

const NavBar = () => {
  const pathName = usePathname();
  return (
    <nav className="fixed top-0 w-full z-40 flex justify-between items-center p-6 bg-gray-900">
      <div className="flex items-center gap-2 sm:gap-5">
        <Link href={"/"}>
          <Image src={LogoElSolar} alt="El Solar Logo" width={45} height={45} />
        </Link>
        <h1 className=" max-[768px]:hidden text-lg font-bold text-white sm:text-2xl ">
          El Solar
        </h1>
      </div>
      <div className="flex items-center gap-3 sm:gap-10">
        {pathName !== "/bookings" && (
          <Link href={"/bookings"} className="font-bold text-white text-md">
            My Bookings
          </Link>
        )}
        <WalletMultiButton />
      </div>
    </nav>
  );
};

export default NavBar;
