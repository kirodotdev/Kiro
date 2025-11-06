# Fix: Update hardcoded Claude 3.7 in compaction config to respect user's model selection

## Issue

When chat context reaches 60% capacity, the compaction feature (which summarizes old messages) uses a hardcoded Claude 3.7 model instead of respecting the user's selected model. This causes:

1. **Model identity confusion** - Claude reports being version 3.7 when user selected 4.5
2. **Behavioral inconsistencies** - User gets 4.5 responses mixed with 3.7-generated summaries
3. **Conspiracy theories about AWS secretly swapping models** - Users assume AWS is doing something nefarious behind the scenes
4. **No cost savings** - Claude 3.7 costs the same as 4.5, so this isn't even a cost optimization
5. **Suboptimal compaction** - If cost/speed were the goal, Haiku would be better

## Root Cause

**File:** `src/agent/agent-context/compaction/config.ts` (compiled to extension.js:668866)

```typescript
DEFAULT_COMPACTION_CONFIG = {
  enabled: true,
  compactionThreshold: 0.6,
  preserveRecentRounds: 2,
  defaultCompressionRatio: 0.5,
  maxCompactionTimeMs: 60000,
  provider: "qdev",
  analysisModel: "CLAUDE_3_7_SONNET_20250219_V1_0",  // ← HARDCODED
  strategies: { /* ... */ }
}
```

**Usage:** `src/agent/agent-context/compaction/strategies/simple-strategy.ts` (extension.js:699447)

```typescript
const modelName = config.analysisModel;  // Always returns hardcoded 3.7
const summarizationModel = await loadModel(provider, modelName, "summarization");
```

## Proposed Fix

### Option 1: Use User's Selected Model (Recommended)

```typescript
// In config.ts
import { getSelectedModelId } from '../model-selection/model-configuration';

DEFAULT_COMPACTION_CONFIG = {
  // ... other settings ...
  provider: "qdev",
  analysisModel: null,  // Will be resolved at runtime
  // ... strategies ...
}

// In simple-strategy.ts (generateCompressedContext method)
const provider = config.provider;
const modelName = config.analysisModel || getSelectedModelId() || "CLAUDE_SONNET_4_5_20250929_V1_0";
const summarizationModel = await loadModel(provider, modelName, "summarization", { forceRefresh: true });
```

### Option 2: Update to Claude Sonnet 4.5 (Minimal Change)

```typescript
// In config.ts
DEFAULT_COMPACTION_CONFIG = {
  // ... other settings ...
  analysisModel: "CLAUDE_SONNET_4_5_20250929_V1_0",  // Updated from 3.7
  // ... strategies ...
}
```

### Option 3: Use Haiku for Cost/Speed (Best for Compaction)

```typescript
// In config.ts
DEFAULT_COMPACTION_CONFIG = {
  // ... other settings ...
  analysisModel: "CLAUDE_HAIKU_3_5_20241022_V1_0",  // Cheaper, faster, good enough for summaries
  // ... strategies ...
}
```

## Patch File (for compiled extension.js)

Since the source code isn't public, here's a patch for the compiled extension.js:

```diff
--- a/resources/app/extensions/kiro.kiro-agent/dist/extension.js
+++ b/resources/app/extensions/kiro.kiro-agent/dist/extension.js
@@ -668866 +668866 @@
-      analysisModel: "CLAUDE_3_7_SONNET_20250219_V1_0",
+      analysisModel: "CLAUDE_SONNET_4_5_20250929_V1_0",
```

## Testing

1. Start a chat with Claude Sonnet 4.5 selected
2. Continue conversation until context reaches 60% capacity
3. Verify compaction triggers (check logs)
4. Ask Claude "what model are you?"
5. Expected: Claude correctly identifies as 4.5 (or doesn't know, which is fine)
6. Previous behavior: Claude says 3.7

## Additional Improvements

While fixing this, consider:

1. **Add model identity to system prompt** - Tell Claude what version it is explicitly
2. **Make compaction model configurable** - Add setting so users can choose compaction model
3. **Log compaction events** - Show users when compaction happens and which model is used
4. **Dynamic provider support** - Respect user's provider selection (currently hardcoded "qdev")

## Related Issues

- #3625 - Claude identifies as version 3.7 when Sonnet 4.5 is selected

Special thanks to @huachuman for the conspiracy theory about AWS secretly swapping models behind the scenes, which inspired a deeper investigation into the actual cause. Turns out it wasn't AWS - just a hardcoded string at line 668866. Much less exciting, but easier to fix.

## References

- Decompiled extension.js analysis
- Line 668866: `analysisModel` definition
- Line 699447: `analysisModel` usage in compaction
- Line 668856: `compactionThreshold: 0.6` (60% trigger)
