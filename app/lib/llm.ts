/**
 * The only place the app talks to an LLM provider. Callers pass a system
 * prompt and a user prompt and get plain text back, so swapping providers
 * means rewriting this file and nothing else.
 *
 * Server-side only. ANTHROPIC_API_KEY is read from process.env at call time
 * and never leaves this module; the name has no NEXT_PUBLIC_ prefix, so Next
 * will not inline it into a client bundle.
 */

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1000;
const TIMEOUT_MS = 30_000;

export class LlmError extends Error {
  /** Upstream HTTP status, or null if the request never got a response. */
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "LlmError";
    this.status = status;
  }

  /** Provider-side rate limit or overload, as opposed to our own limiter. */
  get isUpstreamBusy(): boolean {
    return this.status === 429 || this.status === 529;
  }
}

interface GenerateTextArgs {
  system: string;
  prompt: string;
}

interface AnthropicTextBlock {
  type: string;
  text?: string;
}

interface AnthropicMessage {
  content?: AnthropicTextBlock[];
  stop_reason?: string;
}

export const generateText = async ({
  system,
  prompt,
}: GenerateTextArgs): Promise<string> => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new LlmError("ANTHROPIC_API_KEY is not configured");
  }

  let response: Response;
  try {
    response = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system,
        // Sonnet 4.6 defaults to high effort, which is wasted spend on copy
        // this short. At low effort adaptive thinking almost never engages
        // (measured 0-30 thinking chars), so it costs nothing today but will
        // spend reasoning if a prompt ever gets harder.
        //
        // Effort and MAX_TOKENS are coupled: max_tokens bounds thinking and
        // response text together. The retry prompt measured 165/1000 tokens
        // at low effort but 828/1000 at medium, so raising effort here means
        // raising MAX_TOKENS too, or the retry truncates and 502s.
        thinking: { type: "adaptive" },
        output_config: { effort: "low" },
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    throw new LlmError(`could not reach the model provider: ${reason}`);
  }

  if (!response.ok) {
    // Logged server-side only; the body can echo request content.
    const detail = await response.text().catch(() => "");
    console.error("Anthropic request failed:", response.status, detail);
    throw new LlmError(
      `model provider returned ${response.status}`,
      response.status,
    );
  }

  const message = (await response.json()) as AnthropicMessage;

  if (message.stop_reason === "refusal") {
    throw new LlmError("the model declined to answer this prompt");
  }

  // Truncated output is almost never parseable JSON, so fail with something
  // clearer than the schema error the caller would otherwise see.
  if (message.stop_reason === "max_tokens") {
    throw new LlmError(`the model hit the ${MAX_TOKENS} token limit`);
  }

  const text = (message.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new LlmError("the model returned an empty response");
  }

  return text;
};
