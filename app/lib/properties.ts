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
    image:
      "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80",
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
    image:
      "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800&q=80",
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
    image:
      "https://images.unsplash.com/photo-1590490360182-c33d57733427?w=800&q=80",
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
    image:
      "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800&q=80",
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
    image:
      "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&q=80",
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
