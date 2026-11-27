import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BedDouble, House, Users } from "lucide-react";
import { getPropertyById, PROPERTY_TYPE_LABELS } from "@/lib/properties";
import { Button } from "@/components/ui/button";
import BookingCard from "@/components/BookingCard";
import ImageCarousel from "@/components/ImageCarousel";

interface PropertyPageProps {
  params: Promise<{ id: string }>;
}

const PropertyPage = async ({ params }: PropertyPageProps) => {
  const { id } = await params;
  const property = getPropertyById(id);

  if (!property) {
    notFound();
  }
  return (
    <div className="container mx-auto px-4 py-8">
      <Button asChild variant="ghost" className="mb-6 gap-2">
        <Link href="/">
          <ArrowLeft aria-hidden="true" />
          Back to Properties
        </Link>
      </Button>
      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <ImageCarousel images={property.images} label={property.name} />
          <div className="mt-6">
            <h1 className="text-3xl font-bold">{property.name}</h1>
            {/* The price lives in the booking card, next to the dates it
                multiplies with; here are the facts that decide the stay. */}
            <ul
              aria-label="At a glance"
              className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground"
            >
              <li className="flex items-center gap-1.5">
                <Users aria-hidden="true" className="size-4" />
                Up to {property.maxGuests} guests
              </li>
              <li className="flex items-center gap-1.5">
                <BedDouble aria-hidden="true" className="size-4" />
                {property.beds}
              </li>
              <li className="flex items-center gap-1.5">
                <House aria-hidden="true" className="size-4" />
                {PROPERTY_TYPE_LABELS[property.type]}
              </li>
            </ul>

            <p className="mt-4 text-muted-foreground">{property.description}</p>
          </div>
          <div className="mt-6">
            <h2 className="text-xl font-semibold">Features</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {property.features.map((feature) => (
                <span
                  key={feature}
                  className="rounded-lg bg-muted px-3 py-2 text-sm"
                >
                  {feature}
                </span>
              ))}
            </div>
          </div>
          <div className="mt-6">
            <h2 className="text-xl font-semibold">Shared Amenities</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {property.sharedAmenities.map((amenity) => (
                <span
                  key={amenity}
                  className="rounded-lg border bg-card px-3 py-2 text-center text-sm"
                >
                  {amenity}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:sticky lg:top-26 lg:self-start">
          <BookingCard
            apartmentId={property.apartmentId}
            pricePerNight={property.pricePerNight}
          />
        </div>
      </div>
    </div>
  );
};
export default PropertyPage;
