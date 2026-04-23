import { Skeleton } from "./ui/skeleton";

const BookingsPageSkeleton = () => {
  return (
    <main className="container mx-auto p-6">
      <div className="mt-2 flex justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-[120px]" />
          <Skeleton className="h-4 w-[80px]" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-[90px]" />
          <Skeleton className="h-9 w-[150px]" />
        </div>
      </div>
    </main>
  );
};

export default BookingsPageSkeleton;
