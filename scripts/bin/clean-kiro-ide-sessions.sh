#!/bin/bash

# Clean Kiro IDE session storage and workspace metadata
# Usage: ./clean-kiro-ide-sessions.sh [OPTIONS]

USER="$(whoami)"
DAYS=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --user)
      USER="$2"
      shift 2
      ;;
    --sessions-older-than)
      DAYS="$2"
      shift 2
      ;;
    -h|--help)
      cat << 'EOF'
NAME
    clean-kiro-ide-sessions.sh - Clean Kiro IDE session storage and workspace metadata

SYNOPSIS
    clean-kiro-ide-sessions.sh [OPTIONS]

DESCRIPTION
    Removes Kiro IDE session storage and workspace metadata files older than
    specified days. This prevents IDE performance degradation caused by stale
    session data referencing deleted chat files.

    Session storage uses LevelDB format and accumulates over time. When chat
    files are deleted via clean-kiro-cache.sh, corresponding session metadata
    becomes stale, causing IDE slowdowns and conflicts.

    This script removes session files by modification date, ensuring consistency
    between chat storage and IDE session state.

OPTIONS
    --user USERNAME
        Specify target user account. Defaults to current user ($(whoami)).

        Example: --user john

    --sessions-older-than DAYS
        Delete session and workspace files older than specified days.
        Should match the value used in clean-kiro-cache.sh.

        Example: --sessions-older-than 60

    -h, --help
        Display this help message and exit.

EXAMPLES
    # Clean sessions after deleting old chat files
    clean-kiro-cache.sh --chat-files-older-than 60
    clean-kiro-ide-sessions.sh --sessions-older-than 60

    # Clean another user's IDE sessions
    clean-kiro-ide-sessions.sh --user john --sessions-older-than 30

    # Conservative cleanup (90 days)
    clean-kiro-ide-sessions.sh --sessions-older-than 90

WHAT GETS DELETED
    Session Storage:
        LevelDB files (.ldb, .log) storing IDE session state. Includes window
        positions, open tabs, navigation history. Safe to delete - IDE recreates
        on next launch.

    Workspace Metadata:
        Workspace-specific settings and state files. Preserves workspace
        configuration but removes stale session references.

WHAT IS PRESERVED
    - Recent session data (within retention period)
    - IDE global settings and preferences
    - Extension configurations
    - User keybindings and snippets

SAFETY
    - All operations require explicit confirmation (y/N prompt)
    - Calculates and displays size before deletion
    - Only deletes files older than specified threshold
    - Preserves active session data

WORKFLOW
    1. Run clean-kiro-cache.sh --chat-files-older-than DAYS
    2. Run this script with same DAYS value
    3. Restart Kiro IDE to apply changes

EXIT STATUS
    0   Success
    1   Error (invalid arguments, directory not found, user cancelled)

AUTHOR
    Raman Marozau, raman@worktif.com

VERSION
    2.0.3

SEE ALSO
    clean-kiro-cache.sh(1), find(1), du(1)

EOF
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

if [[ -z "$DAYS" ]]; then
  echo "Error: --sessions-older-than DAYS is required"
  echo "Use --help for usage information"
  exit 1
fi

KIRO_SESSION="/Users/$USER/Library/Application Support/Kiro/Session Storage"
KIRO_WORKSPACES="/Users/$USER/Library/Application Support/Kiro/Workspaces"

echo "Kiro IDE Session Cleanup"
echo "User: $USER"
echo "Retention period: Delete files older than $DAYS days"
echo ""

# Calculate Session Storage
session_size=0
session_files=0

if [[ -d "$KIRO_SESSION" ]]; then
  echo "Calculating Session Storage cleanup..."

  while IFS= read -r f; do
    size=$(du -sk "$f" 2>/dev/null | cut -f1)
    session_size=$((session_size + size))
    session_files=$((session_files + 1))
  done < <(find "$KIRO_SESSION" -type f -mtime +"$DAYS" 2>/dev/null)

  echo "Found session files: $session_files"
  echo "Session storage size: $((session_size / 1024)) MB"
else
  echo "Session Storage not found: $KIRO_SESSION"
fi

echo ""

# Calculate Workspaces
ws_size=0
ws_files=0

if [[ -d "$KIRO_WORKSPACES" ]]; then
  echo "Calculating Workspaces cleanup..."

  while IFS= read -r f; do
    size=$(du -sk "$f" 2>/dev/null | cut -f1)
    ws_size=$((ws_size + size))
    ws_files=$((ws_files + 1))
  done < <(find "$KIRO_WORKSPACES" -type f -mtime +"$DAYS" 2>/dev/null)

  echo "Found workspace files: $ws_files"
  echo "Workspace storage size: $((ws_size / 1024)) MB"
else
  echo "Workspaces not found: $KIRO_WORKSPACES"
fi

echo ""

total_files=$((session_files + ws_files))
total_size=$((session_size + ws_size))

echo "Total files to delete: $total_files"
echo "Total size to reclaim: $((total_size / 1024)) MB"
echo ""

# Confirmation
if [[ $total_files -eq 0 ]]; then
  echo "Nothing to delete"
  exit 0
fi

read -p "Delete? (y/N): " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  echo "Cancelled"
  exit 0
fi

# Delete Session Storage
deleted_session=0

if [[ -d "$KIRO_SESSION" && $session_files -gt 0 ]]; then
  echo "Deleting Session Storage files..."

  find "$KIRO_SESSION" -type f -mtime +"$DAYS" 2>/dev/null | while read f; do
    rm -f "$f"
    deleted_session=$((deleted_session + 1))
    if (( deleted_session % 10 == 0 )); then
      echo "Deleted: $deleted_session/$session_files"
    fi
  done

  echo "✓ Deleted session files: $session_files"
fi

# Delete Workspaces
deleted_ws=0

if [[ -d "$KIRO_WORKSPACES" && $ws_files -gt 0 ]]; then
  echo "Deleting Workspace files..."

  find "$KIRO_WORKSPACES" -type f -mtime +"$DAYS" 2>/dev/null | while read f; do
    rm -f "$f"
    deleted_ws=$((deleted_ws + 1))
    if (( deleted_ws % 10 == 0 )); then
      echo "Deleted: $deleted_ws/$ws_files"
    fi
  done

  echo "✓ Deleted workspace files: $ws_files"
fi

echo ""
echo "✓ Cleanup complete"
echo "✓ Deleted files: $total_files"
echo "✓ Reclaimed space: $((total_size / 1024)) MB"
echo ""
echo "IMPORTANT: Restart Kiro IDE to apply changes"
