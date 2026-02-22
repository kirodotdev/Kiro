/**
 * Shared Input Module
 * Handles optional length trimming for AI provider calls.
 * No content filtering — all input is passed through as-is.
 */

// Input length limits — env-configurable, 0 = no limit (default)
export const MAX_TITLE_LENGTH = parseInt(process.env.MAX_TITLE_LENGTH || "0", 10);
export const MAX_BODY_LENGTH = parseInt(process.env.MAX_BODY_LENGTH || "0", 10);

/**
 * Prepare user input for AI prompts.
 * Only trims to maxLength if a positive limit is set; otherwise returns input unchanged.
 */
export function sanitizePromptInput(input: string, maxLength: number): string {
  if (!input) {
    return "";
  }

  // Truncate to maximum length (0 or negative = no limit)
  if (maxLength > 0 && input.length > maxLength) {
    return input.substring(0, maxLength) + "\n\n[Content trimmed]";
  }

  return input;
}
