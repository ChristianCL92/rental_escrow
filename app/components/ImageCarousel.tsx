"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import { Button } from "./ui/button";
import type { PropertyImage } from "@/app/types/property";

interface ImageCarouselProps {
  images: PropertyImage[];
  /** Names the photo set for screen readers, for example the property name. */
  label: string;
}

const navButtonClassName =
  "absolute top-1/2 size-11 -translate-y-1/2 rounded-full border-0 bg-white/90 text-slate-900 shadow-md hover:bg-white focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white cursor-pointer";

const ImageCarousel = ({ images, label }: ImageCarouselProps) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const total = images.length;
  const hasMultiple = total > 1;
  const current = images[currentImageIndex];

  const handleNextImage = () => {
    setCurrentImageIndex((index) => (index + 1) % total);
  };

  const handlePreviousImage = () => {
    setCurrentImageIndex((index) => (index - 1 + total) % total);
  };

  return (
    <section
      aria-roledescription="carousel"
      aria-label={`${label} photos`}
      className="relative aspect-video w-full overflow-hidden rounded-xl"
    >
      <Image
        src={current.src}
        alt={current.alt}
        fill
        className="object-cover"
        sizes="(max-width: 1024px) 100vw, 50vw"
      />
      {hasMultiple && (
        <>
          <Button
            type="button"
            variant="outline"
            size="icon-lg"
            aria-label="Previous photo"
            onClick={handlePreviousImage}
            className={`${navButtonClassName} left-3`}
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-lg"
            aria-label="Next photo"
            onClick={handleNextImage}
            className={`${navButtonClassName} right-3`}
          >
            <ChevronRight className="size-5" aria-hidden="true" />
          </Button>
          <p
            aria-hidden="true"
            className="absolute bottom-3 right-3 rounded-full bg-slate-900/80 px-3 py-1 text-xs font-medium tabular-nums text-white"
          >
            {currentImageIndex + 1} / {total}
          </p>
          <p role="status" className="sr-only">
            Photo {currentImageIndex + 1} of {total}: {current.alt}
          </p>
        </>
      )}
    </section>
  );
};

export default ImageCarousel;
