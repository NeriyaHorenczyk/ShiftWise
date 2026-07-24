// Thin wrapper around Groq's OpenAI-compatible chat completions API for
// llama-3.1-8b-instant. This is the ONLY place in the backend that talks to
// Groq — controllers never call fetch() directly, so swapping providers/
// models later means touching one file. (Previously Hugging Face — swapped
// for Groq's much higher free-tier limits and faster inference.)

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.1-8b-instant';

// Distinguishes "the AI dependency itself is unavailable" (missing token,
// network failure, rate limit, bad upstream response) from a genuine bug in
// our own code, so controllers can map it to a 503 instead of a 500.
export class AIServiceError extends Error {
  constructor(message, code = 'AI_ERROR') {
    super(message);
    this.code = code; // 'MISSING_TOKEN' | 'NETWORK_ERROR' | 'RATE_LIMITED' | 'UPSTREAM_ERROR' | 'EMPTY_RESPONSE'
  }
}

/**
 * Runs a chat completion against the configured Llama model.
 * @param {{role: 'system'|'user'|'assistant', content: string}[]} messages
 * @param {{maxTokens?: number, temperature?: number}} [options]
 * @returns {Promise<string>} the assistant's reply text, trimmed
 */
export const chatCompletion = async (messages, { maxTokens = 600, temperature = 0.4 } = {}) => {
  const token = process.env.GROQ_API_KEY;
  if (!token) {
    throw new AIServiceError('AI features are not configured (missing GROQ_API_KEY).', 'MISSING_TOKEN');
  }

  let response;
  try {
    response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        max_tokens: maxTokens,
        temperature,
      }),
    });
  } catch (err) {
    throw new AIServiceError('Could not reach the AI service. Please try again.', 'NETWORK_ERROR');
  }

  if (response.status === 429) {
    throw new AIServiceError('The AI service is rate-limited right now. Please try again shortly.', 'RATE_LIMITED');
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new AIServiceError(
      `The AI service returned an error (${response.status}).${detail ? ` ${detail}` : ''}`,
      'UPSTREAM_ERROR'
    );
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new AIServiceError('The AI service returned an empty response.', 'EMPTY_RESPONSE');
  }

  return content.trim();
};
