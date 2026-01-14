/**
 * Data models for GitHub issue automation system
 */

export interface ClassificationResult {
  recommended_labels: string[];
  confidence_scores: Record<string, number>;
  reasoning: string;
  error?: string;
}

export interface DuplicateMatch {
  issue_number: number;
  issue_title: string;
  similarity_score: number;
  reasoning: string;
  url: string;
}

export class LabelTaxonomy {
  feature_component: string[] = [
    "auth",
    "autocomplete",
    "chat",
    "cli",
    "extensions",
    "hooks",
    "ide",
    "mcp",
    "models",
    "powers",
    "specs",
    "ssh",
    "steering",
    "sub-agents",
    "terminal",
    "ui",
    "usability",
    "trusted-commands",
    "pricing",
    "documentation",
    "dependencies",
    "compaction",
  ];

  os_specific: string[] = ["os: linux", "os: mac", "os: windows"];

  theme: string[] = [
    "theme:account",
    "theme:agent-latency",
    "theme:agent-quality",
    "theme:context-limit-issue",
    "theme:ide-performance",
    "theme:slow-unresponsive",
    "theme:ssh-wsl",
    "theme:unexpected-error",
  ];

  workflow: string[] = [
    "pending-maintainer-response",
    "pending-response",
    "pending-triage",
    "duplicate",
    "question",
  ];

  special: string[] = ["Autonomous agent", "Inline chat", "on boarding"];

  toDict(): Record<string, string[]> {
    return {
      feature_component: this.feature_component,
      os_specific: this.os_specific,
      theme: this.theme,
      workflow: this.workflow,
      special: this.special,
    };
  }

  getAllLabels(): string[] {
    return [
      ...this.feature_component,
      ...this.os_specific,
      ...this.theme,
      ...this.workflow,
      ...this.special,
    ];
  }
}

export interface IssueData {
  number: number;
  title: string;
  body: string;
  created_at: Date;
  updated_at: Date;
  labels: string[];
  url: string;
  state: string;
}
