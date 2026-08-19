"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
  },
  {
    id: "whatsapp",
    label: "WhatsApp message (Spanish)",
    field: "whatsapp_message_es",
    limit: 400,
  },
] as const satisfies readonly {
  id: ChannelId;
  label: string;
  field: keyof MarketingCopy;
  limit: number;
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
  // Seeded from the response, then editable, so the count under each card
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

  // Any input change clears a stale error, so the panel never describes a
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

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Marketing copy</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Draft a caption and a message for one property. Nothing is saved.
      </p>

      <form
        className="mt-8 space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (noChannels) return;
          mutation.mutate({ propertyId, channels, notes });
        }}
      >
        <div className="space-y-2">
          <label htmlFor="property" className="block text-sm font-medium">
            Property
          </label>
          <select
            id="property"
            className="w-full rounded-md border px-3 py-2 text-sm"
            value={propertyId}
            onChange={(event) => edit(() => setPropertyId(event.target.value))}
          >
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name} — {property.pricePerNight} USDC per night
              </option>
            ))}
          </select>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Channels</legend>
          <div className="flex flex-wrap gap-4">
            {CHANNELS.map((channel) => (
              <label
                key={channel.id}
                className="flex items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  className="size-4"
                  checked={channels.includes(channel.id)}
                  onChange={() => toggleChannel(channel.id)}
                />
                {channel.label}
              </label>
            ))}
          </div>
          {noChannels && (
            <p className="text-sm text-red-600">Pick at least one channel.</p>
          )}
        </fieldset>

        <div className="space-y-2">
          <label htmlFor="notes" className="block text-sm font-medium">
            Campaign notes{" "}
            <span className="font-normal text-muted-foreground">
              (optional)
            </span>
          </label>
          <textarea
            id="notes"
            rows={3}
            maxLength={2000}
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder="quiet season, push midweek stays, mention the river"
            value={notes}
            onChange={(event) => edit(() => setNotes(event.target.value))}
          />
        </div>

        <Button
          type="submit"
          disabled={noChannels || mutation.isPending}
          className="cursor-pointer"
        >
          {mutation.isPending ? "Generating…" : "Generate"}
        </Button>
      </form>

      {mutation.isPending && (
        <div className="mt-8 space-y-4">
          {channels.map((id) => (
            <Card key={id}>
              <CardContent className="space-y-2 pt-6">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {mutation.isError && (
        <Card className="mt-8 border-red-300">
          <CardHeader>
            <CardTitle className="text-red-700">
              {describeError(mutation.error).title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">{mutation.error.message}</p>
            {describeError(mutation.error).hint && (
              <p className="text-sm text-muted-foreground">
                {describeError(mutation.error).hint}
              </p>
            )}
            <Button variant="outline" onClick={() => mutation.reset()}>
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      {results.length > 0 && !mutation.isPending && (
        <div className="mt-8 space-y-4">
          {results.map((channel) => {
            const text = drafts[channel.id] ?? "";
            const over = text.length > channel.limit;
            return (
              <Card key={channel.id}>
                <CardHeader>
                  <CardTitle className="text-base">{channel.label}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <textarea
                    rows={4}
                    aria-label={channel.label}
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    value={text}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [channel.id]: event.target.value,
                      }))
                    }
                  />
                  <div className="flex items-center justify-between">
                    <span
                      className={
                        over
                          ? "text-sm text-red-600"
                          : "text-sm text-muted-foreground"
                      }
                    >
                      {text.length} / {channel.limit}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleCopy(channel.id, text)}
                    >
                      {copied?.id === channel.id
                        ? copied.ok
                          ? "Copied"
                          : "Copy failed"
                        : "Copy"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
};

export default MarketingPage;
