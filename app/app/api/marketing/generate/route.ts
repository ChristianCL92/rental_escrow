import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateText, LlmError } from "@/lib/llm";
import { getPropertyById } from "@/lib/properties";
import {
  formatIssues,
  marketingCopySchema,
  stripFences,
  type MarketingCopy,
} from "@/lib/marketing/schema";
import type { Property } from "@/app/types/property";

/**
 * Generates marketing copy for one property. Deliberately public: bounded by
 * the per-route rate limit in proxy.ts, the max_tokens cap in lib/llm.ts, and
 * the spend cap in the provider console. Nothing is persisted.
 */

const CHANNELS = ["instagram", "whatsapp"] as const;
type Channel = (typeof CHANNELS)[number];

/**
 * Per-channel output field and the rule the model is given for it. The rules
 * are the prose form of the constraints in marketingCopySchema; if one moves,
 * move the other, or every generation burns its retry before failing.
 */
const CHANNEL_RULES = {
  instagram: {
    field: "instagram_caption",
    rule: '"instagram_caption": an English Instagram caption of 20 to 200 characters that ends with 3 to 5 hashtags and nothing after them.',
  },
  whatsapp: {
    field: "whatsapp_message_es",
    rule: '"whatsapp_message_es": a WhatsApp message written in Spanish, 20 to 400 characters, ending with a question mark and nothing after it.',
  },
} as const satisfies Record<
  Channel,
  { field: keyof MarketingCopy; rule: string }
>;

const requestSchema = z.object({
  propertyId: z.string().min(1, "is required"),
  channels: z
    .array(z.enum(CHANNELS))
    .min(1, "must select at least one channel"),
  // Capped because it lands in the prompt and the caller is unauthenticated.
  notes: z.string().max(2000, "must be at most 2000 characters").default(""),
});

const SYSTEM = [
  "You write short marketing copy for a rural guesthouse in Spain.",
  "Return ONLY a JSON object containing exactly the requested keys.",
  "No markdown fences, no commentary, no extra keys.",
].join(" ");

const buildPrompt = (
  property: Property,
  notes: string,
  channels: Channel[],
): string => {
  const trimmed = notes.trim();
  return [
    `Property: ${property.name}`,
    `Price: ${property.pricePerNight} USDC per night`,
    `Description: ${property.description}`,
    "",
    `Campaign notes: ${trimmed === "" ? "none" : trimmed}`,
    "",
    // Stays are paid in USDC on chain, and the rest of the site renders prices
    // as "30 USDC". Left to itself the model reaches for a local currency and
    // writes "30 €", which is simply the wrong price on every channel.
    "Stays are paid in USDC. Quote the price exactly as given above. Never convert it to another currency and never use a currency symbol.",
    "",
    "Return a JSON object with exactly these keys:",
    ...channels.map((channel) => `- ${CHANNEL_RULES[channel].rule}`),
  ].join("\n");
};

type Attempt =
  | { ok: true; copy: MarketingCopy }
  | { ok: false; problem: string };

/**
 * Unwraps, parses and validates one model response. Every failure is reported
 * as a single line the retry prompt can quote back to the model.
 */
const readCopy = (raw: string, channels: Channel[]): Attempt => {
  let json: unknown;
  try {
    json = JSON.parse(stripFences(raw));
  } catch {
    return { ok: false, problem: "the response was not valid JSON" };
  }

  const result = marketingCopySchema.safeParse(json);
  if (!result.success) {
    return { ok: false, problem: formatIssues(result.error) };
  }

  // The schema only knows that at least one channel must be present, because
  // it cannot know which were asked for. The route does, so it checks here
  // that every requested channel came back.
  const missing = channels.filter(
    (channel) => result.data[CHANNEL_RULES[channel].field] === undefined,
  );
  if (missing.length > 0) {
    return {
      ok: false,
      problem: missing
        .map((channel) => `${CHANNEL_RULES[channel].field}: is missing`)
        .join("; "),
    };
  }

  // Return only what was asked for, so an unrequested channel the model threw
  // in cannot reach the UI as a card the user never selected.
  const copy: MarketingCopy = {};
  for (const channel of channels) {
    const field = CHANNEL_RULES[channel].field;
    copy[field] = result.data[field];
  }
  return { ok: true, copy };
};

export const POST = async (request: NextRequest) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Expected a JSON body." },
      { status: 400 },
    );
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: formatIssues(parsed.error) },
      { status: 400 },
    );
  }

  const { propertyId, notes } = parsed.data;
  const channels = [...new Set(parsed.data.channels)];

  const property = getPropertyById(propertyId);
  if (!property) {
    return NextResponse.json({ error: "Unknown property." }, { status: 404 });
  }

  const prompt = buildPrompt(property, notes, channels);

  try {
    const first = readCopy(
      await generateText({ system: SYSTEM, prompt }),
      channels,
    );
    if (first.ok) {
      return NextResponse.json(first.copy);
    }

    // One retry, with the validation errors quoted back. Logged server-side
    // only: the problem string can contain generated copy.
    console.error("marketing copy failed validation, retrying:", first.problem);

    const retryPrompt = [
      prompt,
      "",
      "Your previous response failed validation with these errors:",
      first.problem,
      "",
      "Return a corrected JSON object that satisfies every constraint.",
    ].join("\n");

    const second = readCopy(
      await generateText({ system: SYSTEM, prompt: retryPrompt }),
      channels,
    );
    if (second.ok) {
      return NextResponse.json(second.copy);
    }

    console.error(
      "marketing copy failed validation after retry:",
      second.problem,
    );
    return NextResponse.json(
      { error: "The generated copy did not meet the format rules." },
      { status: 502 },
    );
  } catch (error) {
    if (error instanceof LlmError) {
      console.error("marketing generation failed:", error.message);
      return error.isUpstreamBusy
        ? NextResponse.json(
            { error: "The copy generator is busy. Try again shortly." },
            { status: 503 },
          )
        : NextResponse.json(
            { error: "Could not reach the copy generator." },
            { status: 502 },
          );
    }

    console.error("unexpected marketing generation error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
};
