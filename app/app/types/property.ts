export type PropertyType = "room" | "apartment" | "camping";

export interface PropertyImage {
  src: string;
  /** Describes what the photo shows, for screen readers and as alt text. */
  alt: string;
}

export interface Property {
  id: string;
  apartmentId: number;
  name: string;
  type: PropertyType;
  pricePerNight: number;
  description: string;
  features: string[];
  sharedAmenities: string[];
  maxGuests: number;
  images: PropertyImage[];
  available: boolean;
}
