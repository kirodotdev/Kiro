# Stale Issue Closing - Timeline Examples

## Visual Timeline Examples

### Example 1: Issue Gets Closed (No User Response)

```
┌─────────────────────────────────────────────────────────────────┐
│                     ISSUE LIFECYCLE                              │
└─────────────────────────────────────────────────────────────────┘

Day 0    Day 1         Day 2-7              Day 8
  │        │              │                    │
  │        │              │                    │
  ▼        ▼              ▼                    ▼
┌────┐  ┌────┐        ┌────┐              ┌────┐
│User│  │Main│        │ No │              │Auto│
│    │  │    │        │    │              │    │
└────┘  └────┘        └────┘              └────┘

User creates issue:
"App crashes on startup"
  │
  │
  └──────► Maintainer responds:
           "Please provide error logs"
           Adds "pending-response" label
           (labelDate = Day 1)
                │
                │
                └──────► No activity
                         (no comments, no label changes)
                                │
                                │
                                └──────► Workflow runs
                                         Checks: Day 8 - Day 1 = 7 days
                                         Result: CLOSE ✅
                                         
Comment posted:
"This issue has been automatically closed due to inactivity.
It has been 7 days since we requested additional information."

Status: CLOSED
```

---

### Example 2: Issue Stays Open (User Responds)

```
┌─────────────────────────────────────────────────────────────────┐
│                     ISSUE LIFECYCLE                              │
└─────────────────────────────────────────────────────────────────┘

Day 0    Day 1    Day 4              Day 8
  │        │        │                  │
  │        │        │                  │
  ▼        ▼        ▼                  ▼
┌────┐  ┌────┐  ┌────┐            ┌────┐
│User│  │Main│  │User│            │Auto│
│    │  │    │  │    │            │    │
└────┘  └────┘  └────┘            └────┘

User creates issue:
"App crashes on startup"
  │
  │
  └──────► Maintainer responds:
           "Please provide error logs"
           Adds "pending-response" label
           (labelDate = Day 1)
                │
                │
                └──────► User responds:
                         "Here are the logs: ..."
                         (lastActivityDate = Day 4)
                                │
                                │
                                └──────► Workflow runs
                                         Checks: Day 8 - Day 4 = 4 days
                                         Result: SKIP ⏳
                                         (needs 7 days)

Status: OPEN (still waiting for maintainer)
```

---

### Example 3: Timer Resets Multiple Times

```
┌─────────────────────────────────────────────────────────────────┐
│                     ISSUE LIFECYCLE                              │
└─────────────────────────────────────────────────────────────────┘

Day 0    Day 1    Day 3    Day 5    Day 8    Day 10   Day 15
  │        │        │        │        │         │        │
  ▼        ▼        ▼        ▼        ▼         ▼        ▼

User creates issue
  │
  └──► Maintainer adds "pending-response"
       (labelDate = Day 1)
            │
            └──► User responds
                 (lastActivityDate = Day 3)
                      │
                      └──► Maintainer responds
                           Keeps "pending-response"
                           (lastActivityDate = Day 5)
                                │
                                └──► Workflow runs
                                     Check: Day 8 - Day 5 = 3 days
                                     Result: SKIP ⏳
                                          │
                                          └──► Workflow runs again
                                               Check: Day 10 - Day 5 = 5 days
                                               Result: SKIP ⏳
                                                    │
                                                    └──► Workflow runs again
                                                         Check: Day 15 - Day 5 = 10 days
                                                         Result: CLOSE ✅

Status: CLOSED (no activity for 10 days)
```

---

### Example 4: Label Removed (Issue Being Worked On)

```
┌─────────────────────────────────────────────────────────────────┐
│                     ISSUE LIFECYCLE                              │
└─────────────────────────────────────────────────────────────────┘

Day 0    Day 1         Day 3              Day 8
  │        │             │                  │
  │        │             │                  │
  ▼        ▼             ▼                  ▼
┌────┐  ┌────┐       ┌────┐            ┌────┐
│User│  │Main│       │Main│            │Auto│
│    │  │    │       │    │            │    │
└────┘  └────┘       └────┘            └────┘

User creates issue:
"App crashes on startup"
  │
  │
  └──────► Maintainer responds:
           "Please provide error logs"
           Adds "pending-response" label
           (labelDate = Day 1)
                │
                │
                └──────► Maintainer starts working on it:
                         Removes "pending-response" label
                         Adds "in-progress" label
                                │
                                │
                                └──────► Workflow runs
                                         Query: Find issues with "pending-response"
                                         Result: SKIP ⏳
                                         (issue no longer has the label)

Status: OPEN (being actively worked on)
```

---

### Example 5: Complex Activity Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│                     ISSUE LIFECYCLE                              │
└─────────────────────────────────────────────────────────────────┘

Timeline with Activity Tracking:

Day 0:  Issue created
        └─ Activity: Issue creation

Day 1:  Maintainer adds "pending-response" label
        └─ labelDate = Day 1
        └─ Activity: Label change (Day 1)

Day 2:  User adds comment
        └─ lastActivityDate = Day 2
        └─ Activity: Comment (Day 2)

Day 4:  Maintainer adds another label "bug"
        └─ Activity: Label change (Day 4)

Day 6:  Another user adds comment
        └─ lastActivityDate = Day 6
        └─ Activity: Comment (Day 6)

Day 8:  Workflow runs
        └─ labelDate = Day 1
        └─ lastActivityDate = Day 6 (most recent)
        └─ referenceDate = Day 6 (max of both)
        └─ Inactive days = Day 8 - Day 6 = 2 days
        └─ Result: SKIP ⏳ (needs 7 days)

Day 15: Workflow runs again
        └─ labelDate = Day 1
        └─ lastActivityDate = Day 6 (still most recent)
        └─ referenceDate = Day 6
        └─ Inactive days = Day 15 - Day 6 = 9 days
        └─ Result: CLOSE ✅ (exceeds 7 days)

Status: CLOSED (no activity since Day 6)
```

---

## Decision Tree

```
                    ┌─────────────────────┐
                    │  Workflow Runs      │
                    │  (Daily at Midnight)│
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ Query: Find all     │
                    │ open issues with    │
                    │ "pending-response"  │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ For each issue:     │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ Still has label?    │
                    └──────────┬──────────┘
                               │
                    ┌──────────┴──────────┐
                    │                     │
                   NO                    YES
                    │                     │
                    ▼                     ▼
            ┌──────────────┐    ┌──────────────────┐
            │ SKIP         │    │ Get label date   │
            │ (label gone) │    │ Get activity date│
            └──────────────┘    └────────┬─────────┘
                                         │
                                         ▼
                              ┌──────────────────────┐
                              │ Calculate:           │
                              │ referenceDate =      │
                              │ max(labelDate,       │
                              │     activityDate)    │
                              └────────┬─────────────┘
                                       │
                                       ▼
                              ┌──────────────────────┐
                              │ inactiveDays =       │
                              │ today - referenceDate│
                              └────────┬─────────────┘
                                       │
                              ┌────────┴────────┐
                              │                 │
                         < 7 days          >= 7 days
                              │                 │
                              ▼                 ▼
                    ┌──────────────┐  ┌──────────────────┐
                    │ SKIP         │  │ Post comment     │
                    │ (not stale)  │  │ Close issue      │
                    └──────────────┘  │ Log success      │
                                      └──────────────────┘
```

---

## Activity Types That Reset Timer

### ✅ Resets Timer (Extends Deadline)

1. **User Comments**
   ```
   User: "Here are the logs you requested..."
   → lastActivityDate updated
   → Timer resets
   ```

2. **Maintainer Comments**
   ```
   Maintainer: "Thanks, I'll look into this..."
   → lastActivityDate updated
   → Timer resets
   ```

3. **Label Changes**
   ```
   Maintainer adds "bug" label
   → lastActivityDate updated
   → Timer resets
   ```

4. **Label Removals**
   ```
   Maintainer removes "pending-response" label
   → Issue no longer tracked
   → Won't be closed
   ```

### ❌ Does NOT Reset Timer

1. **Issue Edits** (title/body changes)
   - Not tracked as activity
   - Timer continues

2. **Reactions** (👍, ❤️, etc.)
   - Not tracked as activity
   - Timer continues

3. **Mentions** in other issues
   - Not tracked as activity
   - Timer continues

4. **Assignee Changes**
   - Not tracked as activity
   - Timer continues

---

## Summary Table

| Scenario | Label Date | Last Activity | Reference Date | Days Inactive | Result |
|----------|-----------|---------------|----------------|---------------|--------|
| No response | Day 1 | None | Day 1 | 7+ | ✅ Close |
| User responds Day 4 | Day 1 | Day 4 | Day 4 | 4 | ⏳ Skip |
| Label removed | Day 1 | Day 3 | N/A | N/A | ⏳ Skip (no label) |
| Multiple comments | Day 1 | Day 6 | Day 6 | 2 | ⏳ Skip |
| Old activity | Day 1 | Day 2 | Day 2 | 8 | ✅ Close |

---

## Key Takeaways

1. **Timer starts** when "pending-response" label is added
2. **Timer resets** on any comment or label change
3. **Issue closes** after 7 days of inactivity
4. **Users can reopen** if they still need help
5. **Maintainers can prevent** by removing label or commenting

**Goal:** Keep issue tracker clean while being fair to users who need time to respond.
