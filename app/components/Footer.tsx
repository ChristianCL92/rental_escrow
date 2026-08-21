import Link from "next/link";
import { FaInstagram, FaWhatsapp } from "react-icons/fa";

const Footer = () => {
  return (
    <footer className="bottom-0 w-full bg-gray-900 text-white p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-wrap justify-around items-center gap-y-3">
        <span>© El Solar Copyright {new Date().getFullYear()}</span>
        <div className="flex items-center gap-4">
          {/* The generator writes for these two channels, so it sits with them. */}
          <Link
            href="/tools/marketing"
            className="text-sm underline underline-offset-4 hover:text-gray-300 transition-colors"
          >
            Marketing copy generator
          </Link>

          <a
            href="https://instagram.com/elsolarcol"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Follow us on Instagram"
            className="hover:text-gray-300 transition-colors"
          >
            <FaInstagram size={20} />
          </a>

          <a
            href="https://wa.me"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Contact us on WhatsApp"
            className="hover:text-gray-300 transition-colors"
          >
            <FaWhatsapp size={20} />
          </a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
