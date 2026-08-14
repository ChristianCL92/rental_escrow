import { z } from "zod";

/**
 * A trailing run of hashtags: whitespace (or the string start), then one or
 * more `#tag` tokens running to the end. The inner group is greedy, so the
 * capture is the whole run and six trailing hashtags counts as six.
 */
const TRAILING_HASHTAGS =
  /(?:^|\s)(#[\p{L}\p{N}_]+(?:\s+#[\p{L}\p{N}_]+)*)\s*$/u;

const countTrailingHashtags = (text: string): number => {
  const match = text.match(TRAILING_HASHTAGS);
  return match ? match[1].split(/\s+/).length : 0;
};

/**
 * Language is not structurally checkable, so this is a heuristic. The tokens
 * are ones that are common in Spanish and rare in English, which is enough to
 * catch the failure mode that actually happens: the model replying in English.
 * A false reject costs one retry, which the route already budgets for.
 */
const SPANISH_MARKERS =
  /\b(el|la|los|las|un|una|del|que|con|por|para|tus|sus|es|y)\b|[¿¡ñáéíóúü]/i;

export const marketingCopySchema = z
  .object({
    instagram_caption: z
      .string()
      .min(20, "must be at least 20 characters")
      .max(200, "must be at most 200 characters")
      .refine((value) => {
        const count = countTrailingHashtags(value);
        return count >= 3 && count <= 5;
      }, "must end with 3 to 5 hashtags and nothing after them")
      .optional(),
    whatsapp_message_es: z
      .string()
      .min(20, "must be at least 20 characters")
      .max(400, "must be at most 400 characters")
      .refine(
        (value) => SPANISH_MARKERS.test(value),
        "must be written in Spanish",
      )
      .refine(
        (value) => /\?\s*$/.test(value),
        "must end with a question mark, with nothing after it",
      )
      .optional(),
  })
  .refine(
    (value) =>
      value.instagram_caption !== undefined ||
      value.whatsapp_message_es !== undefined,
    "at least one of instagram_caption or whatsapp_message_es must be present",
  );

export type MarketingCopy = z.infer<typeof marketingCopySchema>;

/**
 * Models often wrap JSON in a markdown fence even when told not to. Unwrap it
 * before parsing rather than spending the single retry on formatting.
 */
export const stripFences = (raw: string): string => {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  return (fenced ? fenced[1] : trimmed).trim();
};

/**
 * Flattens a ZodError into one line suitable for appending to the retry
 * prompt, e.g. `instagram_caption: must be at most 200 characters`.
 */
export const formatIssues = (error: z.ZodError): string =>
  error.issues
    .map((issue) => {
      const path = issue.path.join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join("; ");
