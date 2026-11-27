import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import PricePerNight from "./PricePerNight";
import { Property } from "@/app/types/property";
import { PROPERTY_TYPE_LABELS } from "@/lib/properties";
import { cn } from "@/lib/utils";

interface PropertyCardProps {
  property: Property;
  /**
   * "wide" lays the photo beside the text from tablets up, for a stay that
   * has a row of its own; phones always stack the photo above the text.
   */
  layout?: "default" | "wide";
}

/**
 * One stay on the home page, photo first. The whole card opens the stay's
 * page: the name is the one link, stretched over the card, so screen readers
 * hear "Room 01" rather than the card's every line.
 */
const PropertyCard = ({ property, layout = "default" }: PropertyCardProps) => {
  const wide = layout === "wide";
  const photo = property.images[0];

  return (
    <Card
      className={cn(
        "group relative h-full gap-0 overflow-hidden py-0 transition-[translate,box-shadow] duration-200 ease-out",
        property.available &&
          "hover:shadow-lg has-[a:focus-visible]:shadow-lg has-[a:focus-visible]:ring-[3px] has-[a:focus-visible]:ring-ring has-[a:focus-visible]:ring-offset-2 has-[a:focus-visible]:ring-offset-background motion-safe:hover:-translate-y-1 motion-safe:has-[a:focus-visible]:-translate-y-1",
        wide && "sm:flex-row",
      )}
      data-testid="property-card"
    >
      <div
        className={cn(
          "relative aspect-4/3 w-full shrink-0 overflow-hidden bg-muted",
          // Two room columns wide, so the text lines up with the grid above.
          wide && "sm:w-[calc(50%-0.75rem)]",
        )}
      >
        <Image
          src={photo.src}
          alt={photo.alt}
          fill
          className="object-cover transition-transform duration-500 ease-out motion-safe:group-hover:scale-[1.04] motion-safe:group-has-[a:focus-visible]:scale-[1.04]"
          sizes={
            wide
              ? "(min-width: 1280px) 612px, (min-width: 640px) 50vw, 100vw"
              : "(min-width: 1280px) 300px, (min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
          }
        />
        <Badge variant="inverse" className="absolute top-3 left-3">
          {PROPERTY_TYPE_LABELS[property.type]}
        </Badge>
        {!property.available && (
          <Badge variant="destructive" className="absolute top-3 right-3">
            Unavailable
          </Badge>
        )}
      </div>

      <div
        className={cn(
          "flex flex-1 flex-col p-5",
          wide && "sm:justify-center sm:p-8 lg:p-10",
        )}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3
            className={cn(
              "text-xl leading-tight font-semibold",
              wide && "sm:text-2xl lg:text-3xl",
            )}
          >
            {property.available ? (
              <Link
                href={`/properties/${property.id}`}
                className="outline-none after:absolute after:inset-0 after:content-['']"
              >
                {property.name}
              </Link>
            ) : (
              property.name
            )}
          </h3>
          <PricePerNight
            amount={property.pricePerNight}
            className="text-sm"
            amountClassName={cn("text-base", wide && "sm:text-lg")}
          />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Up to {property.maxGuests} guests · {property.beds}
        </p>
        <p
          className={cn(
            "mt-3 text-sm leading-relaxed",
            wide ? "sm:text-base" : "line-clamp-3",
          )}
        >
          {property.description}
        </p>
        {wide && (
          <ul
            aria-label="Features"
            className="mt-4 hidden grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid"
          >
            {property.features.map((feature) => (
              <li key={feature} className="flex items-center gap-2">
                <Check aria-hidden="true" className="size-4 text-primary" />
                {feature}
              </li>
            ))}
          </ul>
        )}
        <p
          aria-hidden="true"
          className={cn(
            "mt-auto flex items-center gap-1 pt-4 text-sm font-semibold",
            property.available ? "text-primary" : "text-muted-foreground",
            wide && "sm:mt-0 sm:pt-6",
          )}
        >
          {property.available ? (
            <>
              View dates
              <ArrowRight className="size-4 transition-transform duration-200 motion-safe:group-hover:translate-x-0.5" />
            </>
          ) : (
            "Not available"
          )}
        </p>
      </div>
    </Card>
  );
};

export default PropertyCard;
