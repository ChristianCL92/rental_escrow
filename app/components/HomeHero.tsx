import Image from "next/image";
import { MapPin } from "lucide-react";
import { Button } from "./ui/button";
import heroPhoto from "@/public/images/hero-pool-mountains.jpeg";

interface HomeHeroProps {
  /** The id of the section "Check dates" scrolls to. */
  staysId: string;
}

/**
 * The home page's opening: the view from the terrace (pool, EL SOLAR sign,
 * Andes behind) with the page's one h1, where El Solar is, and one action.
 * No wallet is needed to browse, so the hero has no wallet control.
 *
 * The text sits on a soft ink scrim on its own side only (top on phones,
 * left from md up), so the view itself stays clear. Scrim strengths and
 * crops were tuned by measuring cream text against the lightest 5% of the
 * photo pixels behind it: at least 4.5:1 at 390x844 and 1440x900.
 *
 * The height leaves a peek of the stays below the fold, and never grows past
 * the 1600px source's comfortable size.
 */
const HomeHero = ({ staysId }: HomeHeroProps) => {
  return (
    <section
      aria-labelledby="home-hero-heading"
      className="relative isolate flex h-[clamp(520px,calc(100svh-var(--nav-height)-140px),760px)] overflow-hidden bg-inverse text-inverse-foreground"
    >
      <Image
        src={heroPhoto}
        alt="The pool and painted EL SOLAR sign on the lawn below the terrace, with forested Andes mountains behind"
        fill
        priority
        placeholder="blur"
        sizes="100vw"
        className="-z-10 object-cover object-[60%_50%] md:object-[50%_68%]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-linear-to-b from-inverse/74 from-0% via-inverse/60 via-34% to-inverse/0 to-62% md:bg-linear-to-r md:from-inverse/66 md:via-inverse/50 md:via-40% md:to-70%"
      />
      <div className="container mx-auto flex flex-col items-start px-4 pt-8 md:justify-center md:pt-0">
        <p className="flex items-center gap-1.5 text-sm font-semibold tracking-[0.14em] uppercase">
          <MapPin aria-hidden="true" className="size-4 text-highlight" />
          Colombian Andes
        </p>
        <h1
          id="home-hero-heading"
          className="mt-3 text-[clamp(2rem,10.5vw,2.5625rem)] leading-[1.08] font-semibold md:text-6xl lg:text-[4.75rem]"
        >
          <span className="block">Backpacker &amp;</span> holistic retreat
        </h1>
        <Button asChild size="lg" className="mt-6 text-base md:mt-8">
          <a href={`#${staysId}`}>Check dates</a>
        </Button>
      </div>
    </section>
  );
};

export default HomeHero;
