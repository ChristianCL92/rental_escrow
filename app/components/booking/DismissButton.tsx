import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Close control for an Alert; the Alert needs `pr-10` to leave room. */
const DismissButton = ({
  onClick,
  label = "Dismiss",
}: {
  onClick: () => void;
  label?: string;
}) => (
  <Button
    type="button"
    variant="ghost"
    size="icon-sm"
    onClick={onClick}
    aria-label={label}
    className="absolute top-2 right-2 cursor-pointer text-current hover:bg-black/5 hover:text-current"
  >
    <X aria-hidden="true" />
  </Button>
);

export default DismissButton;
