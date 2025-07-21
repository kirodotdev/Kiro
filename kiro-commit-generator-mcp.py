#!/usr/bin/env python3
"""
Kiro Commit Message Generator MCP Server
Generates AI-powered commit messages by analyzing git diffs
"""

import os
import json
import logging
import subprocess
import tempfile
from typing import Dict, List, Optional, Any
from datetime import datetime
from pathlib import Path

try:
    from fastmcp import FastMCP, Context
except ImportError as e:
    logging.error("FastMCP not installed. Install with: pip install fastmcp")
    raise e

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize MCP server
mcp = FastMCP("Kiro_Commit_Generator")

class GitAnalyzer:
    """Analyzes git repositories and generates commit messages"""
    
    def __init__(self):
        self.conventional_types = {
            'feat': 'A new feature',
            'fix': 'A bug fix',
            'docs': 'Documentation only changes',
            'style': 'Changes that do not affect the meaning of the code',
            'refactor': 'A code change that neither fixes a bug nor adds a feature',
            'perf': 'A code change that improves performance',
            'test': 'Adding missing tests or correcting existing tests',
            'chore': 'Changes to the build process or auxiliary tools'
        }
    
    def get_git_diff(self, repo_path: str = None, staged: bool = True) -> str:
        """Get git diff for staged or unstaged changes"""
        try:
            if repo_path:
                os.chdir(repo_path)
            
            cmd = ['git', 'diff', '--cached'] if staged else ['git', 'diff']
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            return result.stdout
        except subprocess.CalledProcessError as e:
            logger.error(f"Git command failed: {e}")
            return ""
        except Exception as e:
            logger.error(f"Error getting git diff: {e}")
            return ""
    
    def get_git_status(self, repo_path: str = None) -> Dict[str, Any]:
        """Get git status information"""
        try:
            if repo_path:
                os.chdir(repo_path)
            
            # Get status
            status_result = subprocess.run(['git', 'status', '--porcelain'], 
                                         capture_output=True, text=True, check=True)
            
            # Get branch info
            branch_result = subprocess.run(['git', 'branch', '--show-current'], 
                                         capture_output=True, text=True, check=True)
            
            files = []
            for line in status_result.stdout.strip().split('\n'):
                if line:
                    status_code = line[:2]
                    filename = line[3:]
                    files.append({'status': status_code, 'file': filename})
            
            return {
                'branch': branch_result.stdout.strip(),
                'files': files,
                'has_staged': any(f['status'][0] != ' ' and f['status'][0] != '?' for f in files),
                'has_unstaged': any(f['status'][1] != ' ' for f in files)
            }
        except Exception as e:
            logger.error(f"Error getting git status: {e}")
            return {'branch': '', 'files': [], 'has_staged': False, 'has_unstaged': False}
    
    def analyze_changes(self, diff: str) -> Dict[str, Any]:
        """Analyze git diff to understand the nature of changes"""
        if not diff:
            return {'type': 'chore', 'scope': '', 'files': [], 'summary': 'No changes detected'}
        
        lines = diff.split('\n')
        files_changed = []
        additions = 0
        deletions = 0
        
        # Parse diff
        current_file = None
        for line in lines:
            if line.startswith('diff --git'):
                # Extract filename
                parts = line.split(' ')
                if len(parts) >= 4:
                    current_file = parts[3][2:]  # Remove 'b/' prefix
                    files_changed.append(current_file)
            elif line.startswith('+') and not line.startswith('+++'):
                additions += 1
            elif line.startswith('-') and not line.startswith('---'):
                deletions += 1
        
        # Determine commit type based on file patterns and changes
        commit_type = self._determine_commit_type(files_changed, diff)
        scope = self._determine_scope(files_changed)
        
        return {
            'type': commit_type,
            'scope': scope,
            'files': files_changed,
            'additions': additions,
            'deletions': deletions,
            'summary': f"{len(files_changed)} files changed, +{additions} -{deletions}"
        }
    
    def _determine_commit_type(self, files: List[str], diff: str) -> str:
        """Determine the conventional commit type based on files and changes"""
        if not files:
            return 'chore'
        
        # Check file patterns
        for file in files:
            file_lower = file.lower()
            if any(doc in file_lower for doc in ['readme', 'doc', '.md', 'changelog']):
                return 'docs'
            if any(test in file_lower for test in ['test', 'spec', '__test__']):
                return 'test'
            if any(config in file_lower for config in ['config', 'package.json', 'requirements.txt', 'dockerfile']):
                return 'chore'
        
        # Analyze diff content
        diff_lower = diff.lower()
        if any(keyword in diff_lower for keyword in ['fix', 'bug', 'error', 'issue']):
            return 'fix'
        if any(keyword in diff_lower for keyword in ['add', 'new', 'create', 'implement']):
            return 'feat'
        if any(keyword in diff_lower for keyword in ['refactor', 'restructure', 'reorganize']):
            return 'refactor'
        if any(keyword in diff_lower for keyword in ['performance', 'optimize', 'speed']):
            return 'perf'
        if any(keyword in diff_lower for keyword in ['style', 'format', 'lint']):
            return 'style'
        
        return 'feat'  # Default to feature
    
    def _determine_scope(self, files: List[str]) -> str:
        """Determine the scope based on changed files"""
        if not files:
            return ''
        
        # Common scope patterns
        scopes = set()
        for file in files:
            parts = file.split('/')
            if len(parts) > 1:
                # Use directory name as scope
                scopes.add(parts[0])
            else:
                # Use file extension or name pattern
                if '.' in file:
                    ext = file.split('.')[-1]
                    if ext in ['js', 'ts', 'jsx', 'tsx']:
                        scopes.add('frontend')
                    elif ext in ['py', 'java', 'go', 'rs']:
                        scopes.add('backend')
                    elif ext in ['css', 'scss', 'less']:
                        scopes.add('styles')
        
        return list(scopes)[0] if len(scopes) == 1 else ''
    
    def generate_commit_message(self, analysis: Dict[str, Any], custom_message: str = "") -> str:
        """Generate a conventional commit message"""
        commit_type = analysis['type']
        scope = analysis['scope']
        
        # Build the commit message
        if scope:
            prefix = f"{commit_type}({scope}): "
        else:
            prefix = f"{commit_type}: "
        
        if custom_message:
            message = custom_message
        else:
            # Generate message based on analysis
            files = analysis['files']
            if len(files) == 1:
                message = f"update {files[0]}"
            elif len(files) <= 3:
                message = f"update {', '.join(files)}"
            else:
                message = f"update {len(files)} files"
        
        return prefix + message

# MCP Tools
@mcp.tool()
def get_git_status(repo_path: str = None) -> str:
    """Get current git repository status"""
    try:
        analyzer = GitAnalyzer()
        status = analyzer.get_git_status(repo_path)
        return json.dumps(status, indent=2)
    except Exception as e:
        logger.error(f"Error getting git status: {e}")
        return json.dumps({"error": f"Failed to get git status: {str(e)}"})

@mcp.tool()
def analyze_staged_changes(repo_path: str = None) -> str:
    """Analyze staged changes and suggest commit message"""
    try:
        analyzer = GitAnalyzer()
        diff = analyzer.get_git_diff(repo_path, staged=True)
        
        if not diff:
            return json.dumps({"message": "No staged changes found"})
        
        analysis = analyzer.analyze_changes(diff)
        suggested_message = analyzer.generate_commit_message(analysis)
        
        return json.dumps({
            "analysis": analysis,
            "suggested_message": suggested_message,
            "conventional_types": analyzer.conventional_types
        }, indent=2)
    except Exception as e:
        logger.error(f"Error analyzing staged changes: {e}")
        return json.dumps({"error": f"Failed to analyze changes: {str(e)}"})

@mcp.tool()
def generate_commit_message(commit_type: str = "feat", scope: str = "", description: str = "", repo_path: str = None) -> str:
    """Generate a custom commit message with conventional commit format"""
    try:
        analyzer = GitAnalyzer()
        
        # Validate commit type
        if commit_type not in analyzer.conventional_types:
            return json.dumps({"error": f"Invalid commit type. Valid types: {list(analyzer.conventional_types.keys())}"})
        
        # Build message
        if scope:
            message = f"{commit_type}({scope}): {description}"
        else:
            message = f"{commit_type}: {description}"
        
        # Get current changes for context
        diff = analyzer.get_git_diff(repo_path, staged=True)
        analysis = analyzer.analyze_changes(diff) if diff else {}
        
        return json.dumps({
            "commit_message": message,
            "type_description": analyzer.conventional_types[commit_type],
            "current_changes": analysis
        }, indent=2)
    except Exception as e:
        logger.error(f"Error generating commit message: {e}")
        return json.dumps({"error": f"Failed to generate commit message: {str(e)}"})

@mcp.tool()
def commit_with_message(message: str, repo_path: str = None) -> str:
    """Commit staged changes with the provided message"""
    try:
        if repo_path:
            os.chdir(repo_path)
        
        # Check if there are staged changes
        result = subprocess.run(['git', 'diff', '--cached', '--quiet'], capture_output=True)
        if result.returncode == 0:
            return json.dumps({"error": "No staged changes to commit"})
        
        # Commit the changes
        commit_result = subprocess.run(['git', 'commit', '-m', message], 
                                     capture_output=True, text=True, check=True)
        
        return json.dumps({
            "success": True,
            "message": f"Successfully committed with message: '{message}'",
            "output": commit_result.stdout
        })
    except subprocess.CalledProcessError as e:
        return json.dumps({"error": f"Git commit failed: {e.stderr}"})
    except Exception as e:
        logger.error(f"Error committing: {e}")
        return json.dumps({"error": f"Failed to commit: {str(e)}"})

def main():
    """Main server entry point"""
    try:
        logger.info("🚀 Kiro Commit Message Generator MCP Server starting...")
        mcp.run()
    except KeyboardInterrupt:
        logger.info("Server stopped by user")
    except Exception as e:
        logger.error(f"Server error: {e}")
        raise
    finally:
        logger.info("🛑 Kiro Commit Message Generator MCP Server stopped")

if __name__ == "__main__":
    main()