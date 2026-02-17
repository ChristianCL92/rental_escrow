import { FaInstagram, FaWhatsapp } from "react-icons/fa";

const Footer = () => {
  return (
    <footer className="bottom-0 w-full bg-gray-900 text-white p-6">
      <div className="flex justify-around items-center">
        <span>© El Solar Copy right {new Date().getFullYear()}</span>
        <div className="flex gap-4">
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
