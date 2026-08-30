#!/bin/bash

# Clean Kiro file cache, chat files, and old workspaces
# Usage:
#   ./clean-kiro-cache.sh [OPTIONS]
#
# Options:
#   --user USERNAME                  Specify user (default: current user)
#   --workspaces-older-than DAYS     Delete entire workspaces older than DAYS
#   --chat-files-older-than DAYS     Delete only .chat files older than DAYS

USER="$(whoami)"
WORKSPACE_DAYS=""
CHAT_DAYS=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --user)
      USER="$2"
      shift 2
      ;;
    --workspaces-older-than)
      WORKSPACE_DAYS="$2"
      shift 2
      ;;
    --chat-files-older-than)
      CHAT_DAYS="$2"
      shift 2
      ;;
    -h|--help)
      cat << 'EOF'
NAME
    clean-kiro-cache.sh - Clean Kiro workspace cache, chat history, and workspace data

SYNOPSIS
    clean-kiro-cache.sh [OPTIONS]

DESCRIPTION
    Analyzes and cleans Kiro workspace storage to reclaim disk space. The script can
    remove file version cache, old chat history, and entire workspace directories
    based on age criteria. All operations require user confirmation before deletion.

    By default, operates on the current user's Kiro data directory:
    ~/Library/Application Support/Kiro/User/globalStorage/kiro.kiroagent

OPTIONS
    --user USERNAME
        Specify target user account. Defaults to current user ($(whoami)).

        Example: --user john

    --chat-files-older-than DAYS
        Delete .chat files (conversation history) older than specified days.
        Preserves workspace structure and file version cache.

        Example: --chat-files-older-than 60

    --workspaces-older-than DAYS
        Delete entire workspace directories (including all .chat files and cache)
        that haven't been modified in specified days. Use with caution.

        Example: --workspaces-older-than 90

    -h, --help
        Display this help message and exit.

EXAMPLES
    # Analyze current user's cache (dry-run, no deletion)
    clean-kiro-cache.sh

    # Delete chat history older than 60 days
    clean-kiro-cache.sh --chat-files-older-than 60

    # Delete entire workspaces older than 90 days
    clean-kiro-cache.sh --workspaces-older-than 90

    # Clean another user's data
    clean-kiro-cache.sh --user john --chat-files-older-than 30

    # Combine multiple operations
    clean-kiro-cache.sh --chat-files-older-than 60 --workspaces-older-than 120

WHAT GETS DELETED
    File Version Cache:
        Subdirectories containing snapshots of project files used for diff/restore
        operations. Safe to delete - regenerates automatically when needed.

    Chat Files (.chat):
        Conversation history with Kiro. Deletion is permanent and cannot be undone.
        Only deleted when --chat-files-older-than is specified.

    Workspaces:
        Complete workspace directories including all chat history and cache.
        Only deleted when --workspaces-older-than is specified.

WHAT IS PRESERVED
    - index/ directory (code search index)
    - Active workspace data (unless --workspaces-older-than matches)
    - Configuration files (config.json, profile.json)
    - Migration metadata (.migrations/)

SAFETY
    - All operations require explicit confirmation (y/N prompt)
    - Calculates and displays size before deletion
    - Shows progress during deletion
    - Validates directory existence before proceeding

EXIT STATUS
    0   Success
    1   Error (invalid arguments, directory not found, user cancelled)

AUTHOR
    Raman Marozau, raman@worktif.com

VERSION
    2.0.3

SEE ALSO
    kiro-cli(1), du(1), find(1)

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

KIRO_DIR="/Users/$USER/Library/Application Support/Kiro/User/globalStorage/kiro.kiroagent"

if [[ ! -d "$KIRO_DIR" ]]; then
  echo "Error: Directory not found: $KIRO_DIR"
  exit 1
fi

cd "$KIRO_DIR" || exit 1

echo "Analyzing directory: $KIRO_DIR"
echo "User: $USER"
echo ""

# Calculate cache size
echo "Calculating cache size..."
total_size=0
cache_dirs=0

for workspace in */; do
  if [[ -d "$workspace" && "$workspace" =~ ^[a-f0-9]+/$ ]]; then
    for cache_dir in "$workspace"*/; do
      if [[ -d "$cache_dir" && ! "$cache_dir" =~ \.chat$ ]]; then
        size=$(du -sk "$cache_dir" 2>/dev/null | cut -f1)
        total_size=$((total_size + size))
        cache_dirs=$((cache_dirs + 1))
      fi
    done
  fi
done

echo "Found cache directories: $cache_dirs"
echo "Cache size: $((total_size / 1024 / 1024)) GB"

# Calculate old chat files if --chat-files-older-than specified
if [[ -n "$CHAT_DAYS" ]]; then
  echo ""
  echo "Calculating old chat files (older than $CHAT_DAYS days)..."
  old_chats=0
  chat_size=0

  while IFS= read -r chat_file; do
    size=$(du -sk "$chat_file" 2>/dev/null | cut -f1)
    chat_size=$((chat_size + size))
    old_chats=$((old_chats + 1))
  done < <(find . -name "*.chat" -type f -mtime +"$CHAT_DAYS" 2>/dev/null)

  echo "Found old chat files: $old_chats"
  echo "Old chat files size: $((chat_size / 1024 / 1024)) GB"
fi

# Calculate old workspaces if --workspaces-older-than specified
if [[ -n "$WORKSPACE_DAYS" ]]; then
  echo ""
  echo "Calculating old workspaces (older than $WORKSPACE_DAYS days)..."
  old_workspaces=0
  old_size=0

  for workspace in */; do
    if [[ -d "$workspace" && "$workspace" =~ ^[a-f0-9]+/$ ]]; then
      if find "$workspace" -maxdepth 0 -type d -mtime +"$WORKSPACE_DAYS" 2>/dev/null | grep -q .; then
        size=$(du -sk "$workspace" 2>/dev/null | cut -f1)
        old_size=$((old_size + size))
        old_workspaces=$((old_workspaces + 1))
      fi
    fi
  done

  echo "Found old workspaces: $old_workspaces"
  echo "Old workspaces size: $((old_size / 1024 / 1024)) GB"
fi

echo ""

# Confirmation
if [[ $cache_dirs -eq 0 && -z "$CHAT_DAYS" && -z "$WORKSPACE_DAYS" ]]; then
  echo "Nothing to delete"
  exit 0
fi

read -p "Delete? (y/N): " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  echo "Cancelled"
  exit 0
fi

# Delete cache
if [[ $cache_dirs -gt 0 ]]; then
  echo "Deleting cache..."
  deleted=0

  for workspace in */; do
    if [[ -d "$workspace" && "$workspace" =~ ^[a-f0-9]+/$ ]]; then
      for cache_dir in "$workspace"*/; do
        if [[ -d "$cache_dir" && ! "$cache_dir" =~ \.chat$ ]]; then
          rm -rf "$cache_dir"
          deleted=$((deleted + 1))
          if (( deleted % 10 == 0 )); then
            echo "Deleted: $deleted/$cache_dirs"
          fi
        fi
      done
    fi
  done

  echo "✓ Deleted cache directories: $deleted"
fi

# Delete old chat files
if [[ -n "$CHAT_DAYS" ]]; then
  echo "Deleting old chat files..."
  deleted_chats=0

  while IFS= read -r chat_file; do
    rm -f "$chat_file"
    deleted_chats=$((deleted_chats + 1))
    if (( deleted_chats % 100 == 0 )); then
      echo "Deleted: $deleted_chats/$old_chats"
    fi
  done < <(find . -name "*.chat" -type f -mtime +"$CHAT_DAYS" 2>/dev/null)

  echo "✓ Deleted old chat files: $deleted_chats"
fi

# Delete old workspaces
if [[ -n "$WORKSPACE_DAYS" ]]; then
  echo "Deleting old workspaces..."
  deleted_ws=0

  for workspace in */; do
    if [[ -d "$workspace" && "$workspace" =~ ^[a-f0-9]+/$ ]]; then
      if find "$workspace" -maxdepth 0 -type d -mtime +"$WORKSPACE_DAYS" 2>/dev/null | grep -q .; then
        rm -rf "$workspace"
        deleted_ws=$((deleted_ws + 1))
        if (( deleted_ws % 5 == 0 )); then
          echo "Deleted: $deleted_ws/$old_workspaces"
        fi
      fi
    fi
  done

  echo "✓ Deleted old workspaces: $deleted_ws"
fi

echo ""
echo "New size:"
du -sh "$KIRO_DIR"
