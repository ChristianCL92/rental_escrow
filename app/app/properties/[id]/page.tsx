import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPropertyById } from "@/lib/properties";
import { Button } from "@/components/ui/button";
import BookingCard from "@/components/BookingCard";

interface PropertyPageProps {
    params: Promise<{id: string}>;
}

 const PropertyPage = async ({params}: PropertyPageProps) => {
 const {id} = await params;
 const property = getPropertyById(id);
 
 if(!property) {
    notFound();
 }
 return (
    <main className="container mx-auto px-4 py-8">
      <Link href="/" className="inline-block mb-6">
        <Button variant="ghost" className="gap-2">
          ← Back to Properties
        </Button>
      </Link>
      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <div className="relative aspect-video w-full overflow-hidden rounded-xl">
            <Image
              src={property.image}
              alt={property.name}
              fill
              className="object-cover"
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
          </div>
          <div className="mt-6">
            <div className="flex items-start justify-between">
              <div>
                <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white">
                  {property.type}
                </span>
                <h1 className="mt-3 text-3xl font-bold">{property.name}</h1>
                <p className="text-muted-foreground">
                  Up to {property.maxGuests} guests
                </p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-primary">
                  {property.pricePerNight} USDC
                </p>
                <p className="text-sm text-muted-foreground">per night</p>
              </div>
            </div>

            <p className="mt-4 text-muted-foreground">{property.description}</p>
          </div>
          <div className="mt-6">
            <h2 className="text-xl font-semibold">Room Features</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {property.features.map((feature) => (
                <span
                  key={feature}
                  className="rounded-lg bg-slate-100 px-3 py-2 text-sm"
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
                  className="rounded-lg border bg-white px-3 py-2 text-center text-sm"
                >
                  {amenity}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:sticky lg:top-8 lg:self-start">
            <BookingCard
            apartmentId={property.apartmentId} 
            pricePerNight={property.pricePerNight} />
        </div>
      </div>
    </main>
  
 );
 }
export default PropertyPage;
