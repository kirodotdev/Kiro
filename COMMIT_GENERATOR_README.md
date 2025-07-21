# Kiro Commit Message Generator MCP Server

> **🎯 Solves Issue #1005** - AI-powered commit message generation for Kiro IDE

An intelligent MCP (Model Context Protocol) server that generates conventional commit messages by analyzing git diffs. Designed specifically for Kiro IDE but compatible with any MCP-enabled tool.

## ✨ Features

### 🤖 Smart Commit Analysis
- **Automatic diff analysis** - Understands your code changes
- **Conventional commit format** - Follows industry standards (feat, fix, docs, etc.)
- **Intelligent scope detection** - Automatically determines affected areas
- **File pattern recognition** - Identifies change types from file patterns

### 🎯 Conventional Commit Types
- `feat`: New features
- `fix`: Bug fixes  
- `docs`: Documentation changes
- `style`: Code formatting
- `refactor`: Code restructuring
- `perf`: Performance improvements
- `test`: Test additions/modifications
- `chore`: Build/tool changes

### 🔧 Available Tools
- `get_git_status()` - Get repository status
- `analyze_staged_changes()` - Analyze staged changes and suggest commit message
- `generate_commit_message()` - Create custom commit messages
- `commit_with_message()` - Commit with generated message

## 🚀 Quick Start

### Installation

```bash
# Install dependencies
pip install fastmcp

# Run the server
python kiro-commit-generator-mcp.py
```

### Kiro IDE Configuration

Add to your Kiro MCP configuration:

```json
{
  "mcpServers": {
    "commit-generator": {
      "command": "python",
      "args": ["kiro-commit-generator-mcp.py"],
      "cwd": "/path/to/kiro-commit-generator",
      "env": {
        "LOG_LEVEL": "INFO"
      }
    }
  }
}
```

## 📖 Usage Examples

### 1. Analyze Staged Changes
```python
# In Kiro, use the MCP tool:
analyze_staged_changes()
```

**Output:**
```json
{
  "analysis": {
    "type": "feat",
    "scope": "auth",
    "files": ["src/auth/login.py"],
    "additions": 15,
    "deletions": 3
  },
  "suggested_message": "feat(auth): add user login functionality"
}
```

### 2. Generate Custom Message
```python
generate_commit_message(
  commit_type="fix",
  scope="api", 
  description="resolve authentication timeout issue"
)
```

**Output:**
```json
{
  "commit_message": "fix(api): resolve authentication timeout issue",
  "type_description": "A bug fix"
}
```

### 3. Commit with Generated Message
```python
commit_with_message("feat(ui): add dark mode toggle")
```

## 🎯 Real-World Examples

### Feature Addition
```
Input: Added new user dashboard component
Output: feat(ui): add user dashboard component
```

### Bug Fix
```
Input: Fixed memory leak in data processing
Output: fix(core): resolve memory leak in data processing
```

### Documentation Update
```
Input: Updated API documentation
Output: docs(api): update endpoint documentation
```

## 🔧 Configuration

Environment variables:
- `LOG_LEVEL`: Logging level (DEBUG, INFO, WARN, ERROR)
- `GIT_REPO_PATH`: Default repository path (optional)

## 🧪 Testing

Test the server locally:

```bash
# Check git status
python -c "
from kiro_commit_generator_mcp import GitAnalyzer
analyzer = GitAnalyzer()
print(analyzer.get_git_status())
"

# Analyze changes
python -c "
from kiro_commit_generator_mcp import GitAnalyzer
analyzer = GitAnalyzer()
diff = analyzer.get_git_diff()
analysis = analyzer.analyze_changes(diff)
message = analyzer.generate_commit_message(analysis)
print(f'Suggested: {message}')
"
```

## 🤝 Contributing

This MCP server was created to address [Kiro Issue #1005](https://github.com/kirodotdev/Kiro/issues/1005). 

### Development Setup
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with a real git repository
5. Submit a pull request

### Adding New Features
- New commit types in `conventional_types`
- Enhanced scope detection in `_determine_scope()`
- Better change analysis in `analyze_changes()`

## 📋 Roadmap

- [ ] AI-powered commit message suggestions using LLM
- [ ] Integration with popular git workflows
- [ ] Support for custom commit templates
- [ ] Batch commit message generation
- [ ] Git hook integration

## 🐛 Troubleshooting

### Common Issues

**"No staged changes found"**
- Make sure you have staged changes: `git add .`

**"Git command failed"**
- Ensure you're in a git repository
- Check git is installed and accessible

**"FastMCP not installed"**
- Install with: `pip install fastmcp`

## 📄 License

MIT License - see LICENSE file for details.

## 🙏 Acknowledgments

- Built for the Kiro IDE community
- Inspired by conventional commit standards
- Uses FastMCP for MCP protocol implementation

---

**Made with ❤️ for Kiro IDE developers**

*This MCP server directly addresses the need for automated commit message generation in Kiro IDE, making developers more productive and ensuring consistent commit message formatting across projects.*