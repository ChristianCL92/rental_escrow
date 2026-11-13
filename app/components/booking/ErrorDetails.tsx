import { ChevronRight } from "lucide-react";

/** The raw technical error, folded away behind "Details". */
const ErrorDetails = ({ detail }: { detail: string }) => (
  <details className="group mt-1 w-full">
    <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-sm text-xs font-medium underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current [&::-webkit-details-marker]:hidden">
      <ChevronRight
        aria-hidden="true"
        className="size-3.5 transition-transform group-open:rotate-90"
      />
      Details
    </summary>
    <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-white/70 p-2 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap">
      {detail}
    </pre>
  </details>
);

export default ErrorDetails;
