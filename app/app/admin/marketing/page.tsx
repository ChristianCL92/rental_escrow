"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Check,
  Copy,
  Instagram,
  MessageCircle,
  TriangleAlert,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { properties } from "@/lib/properties";
// Type-only, so the zod schema it comes from is erased at build time and
// never reaches the client bundle. Keep this an `import type`.
import type { MarketingCopy } from "@/lib/marketing/schema";

type ChannelId = "instagram" | "whatsapp";

const CHANNELS = [
  {
    id: "instagram",
    label: "Instagram caption",
    field: "instagram_caption",
    limit: 200,
    icon: Instagram,
  },
  {
    id: "whatsapp",
    label: "WhatsApp message",
    field: "whatsapp_message_es",
    limit: 400,
    icon: MessageCircle,
  },
] as const satisfies readonly {
  id: ChannelId;
  label: string;
  field: keyof MarketingCopy;
  limit: number;
  icon: typeof Instagram;
}[];

interface GenerateVariables {
  propertyId: string;
  channels: ChannelId[];
  notes: string;
}

class GenerateError extends Error {
  readonly status: number;
  /** Unix ms when the rate limit window frees up, from the proxy headers. */
  readonly resetAt: number | null;

  constructor(message: string, status: number, resetAt: number | null = null) {
    super(message);
    this.name = "GenerateError";
    this.status = status;
    this.resetAt = resetAt;
  }
}

const describeError = (
  error: GenerateError,
): { title: string; hint: string } => {
  switch (error.status) {
    case 429:
      return {
        title: "Hourly limit reached",
        hint: error.resetAt
          ? `This page allows 4 generations an hour. Try again after ${new Date(
              error.resetAt,
            ).toLocaleTimeString()}.`
          : "This page allows 4 generations an hour.",
      };
    case 502:
      return {
        title: "Generation failed",
        hint: "The copy came back in the wrong shape twice, or the provider could not be reached. Generating again usually works.",
      };
    case 503:
      return {
        title: "Generator busy",
        hint: "The provider is overloaded or rate limiting us. Try again in a moment.",
      };
    case 400:
    case 404:
      return { title: "Check your selection", hint: "" };
    default:
      return {
        title: "Something went wrong",
        hint: "Check your connection and try again.",
      };
  }
};

const MarketingPage = () => {
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? "");
  const [channels, setChannels] = useState<ChannelId[]>(["instagram"]);
  const [notes, setNotes] = useState("");
  // Seeded from the response, then editable, so the count on each card
  // tracks what the marketer will actually paste.
  const [drafts, setDrafts] = useState<Partial<Record<ChannelId, string>>>({});
  const [copied, setCopied] = useState<{ id: ChannelId; ok: boolean } | null>(
    null,
  );

  const mutation = useMutation<MarketingCopy, GenerateError, GenerateVariables>(
    {
      mutationFn: async (variables) => {
        const response = await fetch("/api/marketing/generate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(variables),
        });

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          // The route reports under `error`; the proxy's 429 uses `text`.
          const message =
            body?.error ?? body?.text ?? `Request failed (${response.status}).`;
          const reset = Number(response.headers.get("X-RateLimit-Reset"));
          throw new GenerateError(
            message,
            response.status,
            Number.isFinite(reset) && reset > 0 ? reset : null,
          );
        }

        return (await response.json()) as MarketingCopy;
      },
      onSuccess: (copy) => {
        const next: Partial<Record<ChannelId, string>> = {};
        for (const channel of CHANNELS) {
          const value = copy[channel.field];
          if (value !== undefined) next[channel.id] = value;
        }
        setDrafts(next);
        setCopied(null);
      },
    },
  );

  // Any input change clears a stale error, so the alert never describes a
  // request the form no longer matches.
  const edit = (change: () => void) => {
    change();
    if (mutation.isError) mutation.reset();
  };

  const toggleChannel = (id: ChannelId) =>
    edit(() =>
      setChannels((current) =>
        current.includes(id)
          ? current.filter((channel) => channel !== id)
          : [...current, id],
      ),
    );

  const handleCopy = async (id: ChannelId, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied({ id, ok: true });
    } catch {
      // The clipboard needs a secure context and permission. Say so rather
      // than leaving the button looking like it worked.
      setCopied({ id, ok: false });
    }
    window.setTimeout(
      () => setCopied((current) => (current?.id === id ? null : current)),
      2000,
    );
  };

  const noChannels = channels.length === 0;
  const copy = mutation.data;
  const results = copy
    ? CHANNELS.filter((channel) => copy[channel.field] !== undefined)
    : [];
  const showEmptyState =
    !mutation.isPending && !mutation.isError && results.length === 0;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Marketing copy
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Draft a caption and a message for one property. Nothing is saved.
        </p>
      </header>

      <form
        className="mt-8"
        onSubmit={(event) => {
          event.preventDefault();
          if (noChannels) return;
          mutation.mutate({ propertyId, channels, notes });
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Brief</CardTitle>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="property">Property</Label>
              <Select
                value={propertyId}
                onValueChange={(value) => edit(() => setPropertyId(value))}
              >
                <SelectTrigger id="property" className="w-full">
                  <SelectValue placeholder="Choose a property" />
                </SelectTrigger>
                <SelectContent>
                  {properties.map((property) => (
                    <SelectItem key={property.id} value={property.id}>
                      <span className="font-medium">{property.name}</span>
                      <span className="text-muted-foreground">
                        {property.pricePerNight} USDC / night
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium leading-none">
                Channels
              </legend>
              <div className="grid gap-3 pt-1 sm:grid-cols-2">
                {CHANNELS.map((channel) => {
                  const selected = channels.includes(channel.id);
                  const Icon = channel.icon;
                  return (
                    <Label
                      key={channel.id}
                      htmlFor={`channel-${channel.id}`}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors",
                        selected
                          ? "border-primary/40 bg-accent/40"
                          : "hover:bg-accent/30",
                      )}
                    >
                      <Checkbox
                        id={`channel-${channel.id}`}
                        checked={selected}
                        onCheckedChange={() => toggleChannel(channel.id)}
                      />
                      <Icon className="size-4 text-muted-foreground" />
                      <span className="text-sm font-normal">
                        {channel.label}
                      </span>
                    </Label>
                  );
                })}
              </div>
              {noChannels && (
                <p className="pt-1 text-sm text-destructive">
                  Pick at least one channel.
                </p>
              )}
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="notes">
                Campaign notes{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </Label>
              <Textarea
                id="notes"
                rows={3}
                maxLength={2000}
                placeholder="quiet season, push midweek stays, mention the river"
                value={notes}
                onChange={(event) => edit(() => setNotes(event.target.value))}
              />
            </div>
          </CardContent>

          <CardFooter>
            <Button type="submit" disabled={noChannels || mutation.isPending}>
              {mutation.isPending ? "Generating…" : "Generate"}
            </Button>
          </CardFooter>
        </Card>
      </form>

      <Separator className="my-8" />

      {mutation.isPending && (
        <div className="space-y-4">
          {channels.map((id) => (
            <Card key={id}>
              <CardHeader>
                <Skeleton className="h-5 w-40" />
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {mutation.isError && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>{describeError(mutation.error).title}</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3">
            <span>{mutation.error.message}</span>
            {describeError(mutation.error).hint && (
              <span>{describeError(mutation.error).hint}</span>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => mutation.reset()}
            >
              Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {showEmptyState && (
        <p className="text-sm text-muted-foreground">
          Generated copy will appear here.
        </p>
      )}

      {results.length > 0 && !mutation.isPending && (
        <div className="space-y-4">
          {results.map((channel) => {
            const text = drafts[channel.id] ?? "";
            const over = text.length > channel.limit;
            const justCopied = copied?.id === channel.id;
            const Icon = channel.icon;
            return (
              <Card key={channel.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="size-4 text-muted-foreground" />
                    {channel.label}
                  </CardTitle>
                  <CardAction>
                    <Badge variant={over ? "destructive" : "secondary"}>
                      {text.length} / {channel.limit}
                    </Badge>
                  </CardAction>
                </CardHeader>

                <CardContent>
                  <Textarea
                    rows={4}
                    aria-label={channel.label}
                    value={text}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [channel.id]: event.target.value,
                      }))
                    }
                  />
                </CardContent>

                <CardFooter className="justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleCopy(channel.id, text)}
                  >
                    {justCopied && copied.ok ? (
                      <Check className="size-4" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                    {justCopied
                      ? copied.ok
                        ? "Copied"
                        : "Copy failed"
                      : "Copy"}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
};

export default MarketingPage;
