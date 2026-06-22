/**
 * Shared input-sanitization utilities.
 *
 * Centralizes prompt-input sanitization so every module that builds a model
 * prompt relies on a single, consistent implementation instead of its own copy.
 */

/**
 * Sanitize untrusted user input before embedding it in a model prompt.
 *
 * Truncates the input to `maxLength`, redacts a set of known
 * instruction-override patterns, replaces backticks that could break JSON
 * formatting, and collapses runs of excessive newlines. A truncation notice is
 * appended when the original input exceeded `maxLength`.
 *
 * @param input - Raw, untrusted text (for example an issue title or body).
 * @param maxLength - Maximum number of characters to keep from `input`.
 * @returns The sanitized string, or an empty string when `input` is falsy.
 */
export function sanitizePromptInput(input: string, maxLength: number): string {
  if (!input) {
    return "";
  }

  // Truncate to maximum length
  let sanitized = input.substring(0, maxLength);

  // Remove potential prompt injection patterns
  const dangerousPatterns = [
    /ignore\s+(all\s+)?(previous|above|prior)\s+instructions?/gi,
    /disregard\s+(all\s+)?(previous|above|prior)\s+instructions?/gi,
    /forget\s+(all\s+)?(previous|above|prior)\s+instructions?/gi,
    /new\s+instructions?:/gi,
    /system\s*:/gi,
    /assistant\s*:/gi,
    /\[SYSTEM\]/gi,
    /\[ASSISTANT\]/gi,
    /\<\|im_start\|\>/gi,
    /\<\|im_end\|\>/gi,
  ];

  for (const pattern of dangerousPatterns) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }

  // Escape backticks that could break JSON formatting
  sanitized = sanitized.replace(/`/g, "'");

  // Remove excessive newlines that could break prompt structure
  sanitized = sanitized.replace(/\n{4,}/g, "\n\n\n");

  // Add truncation notice if content was cut
  if (input.length > maxLength) {
    sanitized += "\n\n[Content truncated for security]";
  }

  return sanitized;
}
