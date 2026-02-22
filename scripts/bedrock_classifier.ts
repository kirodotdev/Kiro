/**
 * Issue Classifier Module
 * Classifies GitHub issues using a configurable AI provider.
 *
 * Supported providers (set AI_PROVIDER env var):
 *   "bedrock"        – AWS Bedrock (default)
 *   "github-models"  – GitHub Models
 *   "openai"         – OpenAI / GitHub Copilot compatible
 */

import { ClassificationResult, LabelTaxonomy } from "./data_models.js";
import { createProvider, extractJsonFromText } from "./ai_provider.js";
import { sanitizePromptInput, MAX_TITLE_LENGTH, MAX_BODY_LENGTH } from "./sanitize.js";
import { resolveModel } from "./model_costs.js";

// All configurable via env, 0 = no limit
const MAX_TOKENS = parseInt(process.env.CLASSIFIER_MAX_TOKENS || "0", 10) || undefined;
const TEMPERATURE = parseFloat(process.env.CLASSIFIER_TEMPERATURE || "0.3");
const TOP_P = parseFloat(process.env.CLASSIFIER_TOP_P || "0.9");

/**
 * Construct prompt for issue classification
 */
function buildClassificationPrompt(
  issueTitle: string,
  issueBody: string,
  labelTaxonomy: Record<string, string[]>
): string {
  const sanitizedTitle = sanitizePromptInput(issueTitle, MAX_TITLE_LENGTH);
  const sanitizedBody = sanitizePromptInput(issueBody, MAX_BODY_LENGTH);
  const taxonomyStr = JSON.stringify(labelTaxonomy, null, 2);

  return `You are a GitHub issue classifier for the Kiro project.

Issue title:
${sanitizedTitle}

Issue body:
${sanitizedBody || "(No description provided)"}

Available label taxonomy:
${taxonomyStr}

Classify this issue by recommending appropriate labels from the taxonomy above.

Preferred output format:
{
  "labels": ["label1", "label2", ...],
  "confidence": {"label1": 0.95, "label2": 0.87, ...},
  "reasoning": "Brief explanation of label choices"
}

Guidance:
- Recommend labels from the taxonomy that fit the issue content.
- You may recommend as many labels as you think are appropriate.
- Include your reasoning so reviewers understand your choices.`;
}

/**
 * Parse the AI response text into a ClassificationResult.
 * Exported for unit testing.
 */
export function parseClassificationResponse(text: string): ClassificationResult {
  try {
    const jsonStr = extractJsonFromText(text);
    if (jsonStr) {
      const result = JSON.parse(jsonStr);
      return {
        recommended_labels: result.labels || [],
        confidence_scores: result.confidence || {},
        reasoning: result.reasoning || "",
      };
    }

    // Fallback: try to parse the whole string
    const result = JSON.parse(text);
    return {
      recommended_labels: result.labels || [],
      confidence_scores: result.confidence || {},
      reasoning: result.reasoning || "",
    };
  } catch (error) {
    console.error("Error parsing classification response:", error);
    return {
      recommended_labels: [],
      confidence_scores: {},
      reasoning: "",
      error: `Failed to parse response: ${error}`,
    };
  }
}

/**
 * Classify an issue using the configured AI provider.
 *
 * The provider is selected via the AI_PROVIDER env var:
 *   "bedrock"        – AWS Bedrock (default)
 *   "github-models"  – GitHub Models
 *   "openai"         – OpenAI / GitHub Copilot compatible
 */
export async function classifyIssue(
  issueTitle: string,
  issueBody: string,
  labelTaxonomy: LabelTaxonomy
): Promise<ClassificationResult> {
  if (MAX_TITLE_LENGTH > 0 && issueTitle.length > MAX_TITLE_LENGTH) {
    console.warn(
      `Title length (${issueTitle.length}) exceeds maximum (${MAX_TITLE_LENGTH}), will be truncated`
    );
  }
  if (MAX_BODY_LENGTH > 0 && issueBody.length > MAX_BODY_LENGTH) {
    console.warn(
      `Body length (${issueBody.length}) exceeds maximum (${MAX_BODY_LENGTH}), will be truncated`
    );
  }

  const provider = createProvider();
  const prompt = buildClassificationPrompt(
    issueTitle,
    issueBody,
    labelTaxonomy.toDict()
  );

  console.log(`Classifying issue with provider: ${provider.name}`);

  try {
    const response = await provider.complete(
      [{ role: "user", content: prompt }],
      { maxTokens: MAX_TOKENS, temperature: TEMPERATURE, topP: TOP_P, model: resolveModel("classifier"), task: "classifier" }
    );

    return parseClassificationResponse(response.text);
  } catch (error) {
    console.error(`Error classifying issue with ${provider.name}:`, error);
    return {
      recommended_labels: [],
      confidence_scores: {},
      reasoning: "",
      error: `${provider.name} API error after retries: ${error}`,
    };
  }
}
