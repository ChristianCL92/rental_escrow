import { describe, expect, it } from "bun:test";
import { formatIssues, marketingCopySchema, stripFences } from "./schema";

const accepts = (input: unknown) =>
  marketingCopySchema.safeParse(input).success;

const IG_VALID =
  "Wake up to river sounds at Room 001. #nature #getaway #travel";
const WA_VALID =
  "Hola, tenemos la Room 001 disponible con piscina y acceso al río. ¿Te reservamos una noche?";

describe("instagram_caption", () => {
  it("accepts 3 to 5 trailing hashtags", () => {
    expect(accepts({ instagram_caption: IG_VALID })).toBe(true);
    expect(
      accepts({ instagram_caption: "Wake up to river sounds. #a #b #c #d #e" }),
    ).toBe(true);
  });

  it("rejects fewer than 3 or more than 5 hashtags", () => {
    expect(
      accepts({ instagram_caption: "Wake up to river sounds here now. #a #b" }),
    ).toBe(false);
    expect(
      accepts({
        instagram_caption: "Wake up to river sounds. #a #b #c #d #e #f",
      }),
    ).toBe(false);
    expect(
      accepts({ instagram_caption: "Wake up to river sounds and mountains." }),
    ).toBe(false);
  });

  it("requires the hashtags to be last", () => {
    expect(
      accepts({ instagram_caption: "Sounds of the river. #a #b #c book now" }),
    ).toBe(false);
  });

  it("allows accented hashtags", () => {
    expect(
      accepts({
        instagram_caption:
          "Despierta con el río muy cerca. #montaña #niños #río",
      }),
    ).toBe(true);
  });

  it("enforces the 20 and 200 character bounds", () => {
    expect(accepts({ instagram_caption: "Short #a #b #c" })).toBe(false);
    expect(accepts({ instagram_caption: `${"x".repeat(191)} #a #b #c` })).toBe(
      true,
    );
    expect(accepts({ instagram_caption: `${"x".repeat(192)} #a #b #c` })).toBe(
      false,
    );
  });
});

describe("whatsapp_message_es", () => {
  it("accepts genuine Spanish ending in a question", () => {
    expect(accepts({ whatsapp_message_es: WA_VALID })).toBe(true);
  });

  it("accepts short Spanish carried by inverted punctuation alone", () => {
    expect(
      accepts({ whatsapp_message_es: "¿Reservamos tu noche libre?" }),
    ).toBe(true);
  });

  it("accepts unaccented Spanish carried by two function words", () => {
    expect(
      accepts({
        whatsapp_message_es:
          "Hola, tenemos una habitacion libre con piscina para ti. Reservamos?",
      }),
    ).toBe(true);
  });

  it("rejects English", () => {
    expect(
      accepts({
        whatsapp_message_es:
          "Hello, we have a room available with a pool. Shall we book it for you?",
      }),
    ).toBe(false);
  });

  // The property brand is "El Solar". A bare \bel\b marker matched English copy
  // that merely named the place, because the hyphen is a word boundary.
  it("rejects English that names the El Solar brand", () => {
    expect(
      accepts({
        whatsapp_message_es:
          "Welcome to El-Solar, book your riverside stay today. Shall we hold a room?",
      }),
    ).toBe(false);
    expect(
      accepts({
        whatsapp_message_es:
          "El Solar has a pool and river access, all yours. Want to book a night?",
      }),
    ).toBe(false);
  });

  it("rejects English carrying a single Spanish-looking token", () => {
    expect(
      accepts({
        whatsapp_message_es:
          "Book the El-Solar río view suite for two guests. Shall we confirm it?",
      }),
    ).toBe(false);
    expect(
      accepts({
        whatsapp_message_es:
          "Stay at La Casa in El-Solar, our finest room yet. Ready to book it?",
      }),
    ).toBe(false);
  });

  it("requires a trailing question mark with nothing after it", () => {
    expect(
      accepts({
        whatsapp_message_es: "Hola, tenemos la Room 001 con piscina para ti.",
      }),
    ).toBe(false);
    expect(accepts({ whatsapp_message_es: `${WA_VALID} 🌿` })).toBe(false);
  });

  it("enforces the 20 and 400 character bounds", () => {
    expect(
      accepts({
        whatsapp_message_es: `Hola, ${"la casa es muy bonita. ".repeat(20)}¿Vienes?`,
      }),
    ).toBe(false);
  });
});

describe("channel selection", () => {
  it("accepts either channel alone or both together", () => {
    expect(accepts({ instagram_caption: IG_VALID })).toBe(true);
    expect(accepts({ whatsapp_message_es: WA_VALID })).toBe(true);
    expect(
      accepts({ instagram_caption: IG_VALID, whatsapp_message_es: WA_VALID }),
    ).toBe(true);
  });

  it("rejects a response carrying neither channel", () => {
    expect(accepts({})).toBe(false);
    expect(
      accepts({ instagram_caption: undefined, whatsapp_message_es: undefined }),
    ).toBe(false);
  });

  it("ignores unknown keys", () => {
    expect(accepts({ whatsapp_message_es: WA_VALID, extra: "ignored" })).toBe(
      true,
    );
  });
});

describe("stripFences", () => {
  it("unwraps tagged and bare fences", () => {
    expect(stripFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripFences('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("leaves unfenced input alone", () => {
    expect(stripFences('{"a":1}')).toBe('{"a":1}');
  });

  it("does not strip a fence buried in surrounding prose", () => {
    const withProse = 'Here you go:\n```json\n{"a":1}\n```';
    expect(stripFences(withProse)).toBe(withProse);
  });

  it("preserves backticks inside the payload", () => {
    expect(stripFences('```json\n{"a":"use ``x``"}\n```')).toBe(
      '{"a":"use ``x``"}',
    );
  });
});

describe("formatIssues", () => {
  it("prefixes field issues with their path", () => {
    const result = marketingCopySchema.safeParse({ instagram_caption: "nope" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatIssues(result.error)).toContain("instagram_caption: ");
    }
  });

  it("renders root issues without a path prefix", () => {
    const result = marketingCopySchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatIssues(result.error)).toBe(
        "at least one of instagram_caption or whatsapp_message_es must be present",
      );
    }
  });
});
