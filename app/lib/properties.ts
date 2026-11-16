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
    images: [
      {
        src: "/images/apt001.jpeg",
        alt: "Bedroom with a double bed, cream curtains and a wall of windows looking out over the green mountainside",
      },
    ],
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
    images: [
      {
        src: "/images/apt002.jpeg",
        alt: "Bedroom with a double bed, green curtains and an open blue door onto a balcony with a valley view",
      },
    ],
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
    images: [
      {
        src: "/images/apt003.jpeg",
        alt: "Bedroom with a double bed, green curtains and a blue door opening onto a balcony facing the hills",
      },
    ],
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
    images: [
      {
        src: "/images/apt004.jpeg",
        alt: "Bedroom with a double bed and cream curtains on two walls of windows overlooking the property",
      },
    ],
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
      {
        src: "/images/apt005.1.jpeg",
        alt: "Living area with a breakfast bar and stools, a sky mural on the domed ceiling and colourful mosaic walls",
      },
      {
        src: "/images/apt005.2.jpeg",
        alt: "Living room with a sofa bed and an arched iron gate opening onto the green hills",
      },
      {
        src: "/images/apt005.3.jpeg",
        alt: "Kitchen with a gas hob and counter under a painted sky ceiling, with the garden visible through the arch",
      },
      {
        src: "/images/apt005.cama.jpeg",
        alt: "Bedroom with a round double bed in a cave-like room lit with soft green light",
      },
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
