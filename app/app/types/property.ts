export type PropertyType = "room" | "apartment" | "camping";

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
  image: string;
  available: boolean;
}
