import HomeHero from "@/components/HomeHero";
import PropertyCard from "@/components/PropertyCard";
import { properties, SHARED_AMENITIES } from "@/lib/properties";

const STAYS_ID = "stays";

export default function Home() {
  return (
    <>
      <HomeHero staysId={STAYS_ID} />
      <div className="container mx-auto px-4 pt-8">
        <section id={STAYS_ID} aria-labelledby="stays-heading">
          <h2
            id="stays-heading"
            className="mb-6 text-center text-2xl font-bold"
          >
            Stays
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {properties.map((property) => (
              <PropertyCard key={property.id} property={property} />
            ))}
          </div>
        </section>
        <section className="mt-10">
          <h2 className="mb-6 text-2xl font-bold text-center">
            Shared Amenities
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SHARED_AMENITIES.map((amenities) => (
              <div
                key={amenities}
                className="rounded-lg border bg-card p-4 text-center"
              >
                {amenities}
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
