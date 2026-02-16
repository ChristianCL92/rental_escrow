import { Property } from "@/app/types/property";

export const SHARED_AMENITIES = [
  "Pool",
  "Outdoor Dining",
  "River Access",
  "Nature Reserve",
  "Grill & BBQ",
  "Fire Pit",
  "Private Parking",
  "Hiking Trails",
  "Bird Watching",
];

export const properties: Property[] = [
  {
    id: "room-001",
    apartmentId: 1,
    name: "Room 001",
    type: "room",
    pricePerNight: 30,
    description:
      "Cozy room with double bed and private bathroom. Perfect for couples seeking a nature escape.",
    features: [
      "Double Bed",
      "Private Bathroom",
      "Minibar Fridge",
      "Satellite WiFi",
    ],
    sharedAmenities: SHARED_AMENITIES,
    maxGuests: 2,
    images: ["/images/apt001.jpeg"],
    available: true,
  },
  {
    id: "room-002",
    apartmentId: 2,
    name: "Room 002",
    type: "room",
    pricePerNight: 30,
    description:
      "Cozy room with double bed and private bathroom. Perfect for couples seeking a nature escape.",
    features: [
      "Double Bed",
      "Private Bathroom",
      "Minibar Fridge",
      "Satellite WiFi",
    ],
    sharedAmenities: SHARED_AMENITIES,
    maxGuests: 2,
    images: ["/images/apt002.jpeg"],
    available: true,
  },
  {
    id: "room-003",
    apartmentId: 3,
    name: "Room 003",
    type: "room",
    pricePerNight: 30,
    description:
      "Cozy room with double bed and private bathroom. Perfect for couples seeking a nature escape.",
    features: [
      "Double Bed",
      "Private Bathroom",
      "Minibar Fridge",
      "Satellite WiFi",
    ],
    sharedAmenities: SHARED_AMENITIES,
    maxGuests: 2,
    images: ["/images/apt003.jpeg"],
    available: true,
  },
  {
    id: "room-004",
    apartmentId: 4,
    name: "Room 004",
    type: "room",
    pricePerNight: 30,
    description:
      "Cozy room with double bed and private bathroom. Perfect for couples seeking a nature escape.",
    features: [
      "Double Bed",
      "Private Bathroom",
      "Minibar Fridge",
      "Satellite WiFi",
    ],
    sharedAmenities: SHARED_AMENITIES,
    maxGuests: 2,
    images: ["/images/apt004.jpeg"],
    available: true,
  },

  {
    id: "apartment-cave",
    apartmentId: 5,
    name: "Apartment Cave",
    type: "apartment",
    pricePerNight: 75,
    description:
      "Private apartment with equipped kitchen and large balcony. Ideal for longer stays or small families.",
    features: [
      "Equipped Kitchen",
      "Double Bed + Sofa Bed",
      "Large Balcony",
      "Private Bathroom",
      "Satellite WiFi",
    ],
    sharedAmenities: SHARED_AMENITIES,
    maxGuests: 4,
    images: [
      "/images/apt005.1.jpeg",
      "/images/apt005.2.jpeg",
      "/images/apt005.3.jpeg",
      "/images/apt005.cama.jpeg",
    ],
    available: true,
  },
];

export const getPropertyById = (id: string): Property | undefined => {
  return properties.find((it) => it.id === id);
};

export const getPropertiesByType = (type: string): Property[] => {
  return properties.filter((it) => it.type === type);
};

export const getPriceByApartmentId = (apartmentId: number) => {
  const id = properties.find(
    (propertyId) => propertyId.apartmentId === apartmentId,
  );
  return id?.pricePerNight ?? 30;
};
