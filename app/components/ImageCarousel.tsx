"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";

interface ImageCarouselProps {
  images: string[];
  alt: string;
}

const ImageCarousel = ({ images, alt }: ImageCarouselProps) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const handleNextImage = () => {
    setCurrentImageIndex((current) => (current + 1) % images.length);
  };

  const handlePreviousImage = () => {
    setCurrentImageIndex(
      (previous) => (previous - 1 + images.length) % images.length,
    );
  };

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl">
      <Image
        src={images[currentImageIndex]}
        alt={alt}
        fill
        className="object-cover"
        sizes="(max-width: 1024px) 100vw, 50vw"
      />
      {images.length > 1 && (
        <>
          <ChevronLeft
            className="absolute left-2 top-1/2 -translate-y-1/2 bg-amber-50 rounded-2xl cursor-pointer"
            onClick={handlePreviousImage}
          />
          <ChevronRight
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-amber-50 rounded-2xl cursor-pointer"
            onClick={handleNextImage}
          />
        </>
      )}
    </div>
  );
};

export default ImageCarousel;
