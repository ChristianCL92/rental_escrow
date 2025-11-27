import PropertyCard from "@/components/PropertyCard";
import { properties, SHARED_AMENITIES } from "@/lib/properties";

export default function Home() {
  return (
<main className="container mx-auto px-4 py-8">
  <h2 className="text-xl font-bold text-center mb-10 text-muted-foreground">Disconnect from the routine, 
          reconnect with nature.</h2>
  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
  {properties.map((property) => (
   <PropertyCard 
    key={property.id}
    property={property} /> 
  ))}
  </div>
  <section className=" mt-10">
     <h2 className="mb-6 text-2xl font-bold text-center">Shared Amenities</h2>
     <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
         {SHARED_AMENITIES.map((amenities) => (
          <div 
          key={amenities}
          className="rounded-lg border bg-slate-100 p-4 text-center"
          >
          {amenities}
          </div>
        ))}
     </div>

  </section>
</main>
  );
}
