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
    <nav className="focus-ring-on-dark fixed top-0 z-40 w-full bg-inverse text-inverse-foreground">
      {/* Phones have no room for the badge in the bar, so it spans the top. */}
      {/* Heights come from --nav-* in globals.css, which also offset <main>. */}
      <NetworkBadge
        variant="strip"
        ground="dark"
        className="h-(--network-strip-height) py-0 md:hidden"
      />
      <div className="flex h-(--nav-bar-height) items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2 sm:gap-5">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-sm sm:gap-5"
          >
            <Image src={LogoElSolar} alt="" width={45} />
            <span className="max-[768px]:sr-only text-lg font-bold sm:text-2xl">
              El Solar
            </span>
          </Link>
          <NetworkBadge ground="dark" className="max-md:hidden" />
        </div>
        <div className="flex items-center gap-3 sm:gap-10">
          {pathName !== "/bookings" && (
            <Link href={"/bookings"} className="rounded-sm font-bold text-md">
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
