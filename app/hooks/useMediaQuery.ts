import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether a CSS media query matches, kept in step as the window changes.
 * The server cannot know the screen, so it renders `serverMatches`; the
 * client re-renders with the real answer right after hydration.
 */
const useMediaQuery = (query: string, serverMatches: boolean): boolean => {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverMatches,
  );
};

/** Tailwind's `md` breakpoint: tablets and desktops, not phones. */
export const MD_UP = "(min-width: 48rem)";

export default useMediaQuery;
