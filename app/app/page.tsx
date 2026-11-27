import HomeHero from "@/components/HomeHero";
import PropertyCard from "@/components/PropertyCard";
import { getPropertiesByType, SHARED_AMENITIES } from "@/lib/properties";

const STAYS_ID = "stays";

const rooms = getPropertiesByType("room");
const apartments = getPropertiesByType("apartment");

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
          {/* The four rooms are one group, a full row from laptops up; the
              apartment is a different kind of stay, so it gets its own,
              wider card below them. */}
          <ul
            aria-label="Rooms"
            className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4"
          >
            {rooms.map((property) => (
              <li key={property.id}>
                <PropertyCard property={property} />
              </li>
            ))}
          </ul>
          <ul aria-label="Apartments" className="mt-6 grid gap-6">
            {apartments.map((property) => (
              <li key={property.id}>
                <PropertyCard property={property} layout="wide" />
              </li>
            ))}
          </ul>
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
