"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import LogoElSolar from "@/public/elsolar-logo.jpeg";
import NetworkBadge from "./NetworkBadge";
import WalletMenu from "./wallet/WalletMenu";

const NavBar = () => {
  const pathName = usePathname();
  return (
    <nav className="focus-ring-on-dark fixed top-0 z-40 w-full bg-gray-900">
      {/* Phones have no room for the badge in the bar, so it spans the top. */}
      <NetworkBadge variant="strip" className="md:hidden" />
      <div className="flex items-center justify-between px-4 py-3 sm:px-6 md:py-6">
        <div className="flex items-center gap-2 sm:gap-5">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-sm sm:gap-5"
          >
            <Image src={LogoElSolar} alt="" width={45} />
            <span className="max-[768px]:sr-only text-lg font-bold text-white sm:text-2xl">
              El Solar
            </span>
          </Link>
          <NetworkBadge className="max-md:hidden" />
        </div>
        <div className="flex items-center gap-3 sm:gap-10">
          {pathName !== "/bookings" && (
            <Link
              href={"/bookings"}
              className="rounded-sm font-bold text-white text-md"
            >
              My Bookings
            </Link>
          )}
          <WalletMenu />
        </div>
      </div>
    </nav>
  );
};

export default NavBar;
