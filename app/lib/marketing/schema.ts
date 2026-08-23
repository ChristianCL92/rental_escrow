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
 * Inverted opening punctuation is effectively absent from English, so either
 * mark on its own is enough to settle the question.
 */
const SPANISH_PUNCTUATION = /[¿¡]/;

/**
 * Function words that are common in Spanish and rare in English, plus the
 * accented characters. Deliberately excludes 1-2 character words like "el",
 * "la", "un" and "es": the property brand is "El Solar", so `\bel\b` matches
 * inside English copy naming the place ("book El-Solar today") and would wave
 * an English message through.
 */
const SPANISH_TOKENS =
  /\b(que|con|por|para|los|las|una|unos|unas|del|tus|sus|como|muy|esta|este|esto|desde|hasta|donde|cuando|tenemos|quieres|puedes|nuestro|nuestra|nuestros|nuestras)\b|[ñáéíóúü]/giu;

/**
 * Language is not structurally checkable, so this is a heuristic aimed at the
 * failure that actually happens: the model replying in English. Two independent
 * signals are required so that a single Spanish-looking proper noun in English
 * copy cannot carry it. A false reject costs one retry, which the route budgets
 * for.
 */
const looksSpanish = (text: string): boolean =>
  SPANISH_PUNCTUATION.test(text) ||
  (text.match(SPANISH_TOKENS) ?? []).length >= 2;

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
      .refine(looksSpanish, "must be written in Spanish")
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
