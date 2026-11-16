/** "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU" -> "4zMM…cDU". */
export const shortenAddress = (address: string, head = 4, tail = 4): string =>
  address.length <= head + tail + 1
    ? address
    : `${address.slice(0, head)}…${address.slice(-tail)}`;
