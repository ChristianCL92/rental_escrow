"use client";
import Image from "next/image";
import Link from "next/link";
import { Card, CardHeader, CardContent, CardFooter } from "./ui/card";
import { Property } from "@/app/types/property";
import { Button } from "./ui/button";

interface PropertyCardProps {
  property: Property;
}

const PropertyCard = ({ property }: PropertyCardProps) => {
  const typeLabels: Record<Property["type"], string> = {
    room: "room",
    apartment: "apartment",
    camping: "camping",
  };
  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-lg">
      <div className="relative h-48 w-full">
        <Image
          src={property.images[0].src}
          alt={property.images[0].alt}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        />
        <span className="absolute left-3 top-3 rounded-full bg-slate-900/80 px-3 py-1 text-xs font-medium text-white">
          {typeLabels[property.type]}
        </span>

        {!property.available && (
          <span className="absolute right-3 top-3 rounded-full bg-red-500 px-3 py-1 text-xs font-medium text-white">
            Unavailable
          </span>
        )}
      </div>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">{property.name}</h2>
            <p className="text-sm text-muted-foreground">
              Up to {property.maxGuests} guests
            </p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-primary">
              {property.pricePerNight} USDC
            </p>
            <p className="text-xs text-muted-foreground">per night</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pb-2">
        <p className="mb-3 text-sm text-muted-foreground line-clamp-2">
          {property.description}
        </p>

        <div className="flex flex-wrap gap-1">
          {property.features.slice(0, 3).map((feature) => (
            <span
              key={feature}
              className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700"
            >
              {feature}
            </span>
          ))}
          {property.features.length > 3 && (
            <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-500">
              +{property.features.length - 3} more
            </span>
          )}
        </div>
      </CardContent>

      <CardFooter>
        {property.available ? (
          <Button asChild className="w-full">
            <Link href={`/properties/${property.id}`}>View & Book</Link>
          </Button>
        ) : (
          <Button className="w-full" disabled>
            Not Available
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};

export default PropertyCard;
