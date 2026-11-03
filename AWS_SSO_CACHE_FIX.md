# AWS SSO Cache Access Issue - Fix Guide

## Problem
When logging into Kiro IDE on Windows, after successful browser authentication, the IDE fails with:
```
Unable to access path: C:\Users\<username>\.aws\sso\cache\<token-id>.json
Please verify that your user account has sufficient permissions for this location.
```

## Root Cause
The Kiro IDE attempts to access/write AWS SSO token cache files in `C:\Users\<username>\.aws\sso\cache\`, which may have:
1. Insufficient directory permissions
2. Directory doesn't exist
3. File locks or antivirus interference

## Solutions

### Solution 1: Create Missing Directory with Proper Permissions
```powershell
# Run PowerShell as Administrator
$cachePath = "$env:USERPROFILE\.aws\sso\cache"

# Create directory if it doesn't exist
if (-not (Test-Path $cachePath)) {
    New-Item -ItemType Directory -Path $cachePath -Force
    Write-Host "Created directory: $cachePath"
}

# Verify permissions (should be readable/writable by your user)
icacls $cachePath /grant:r "$env:USERNAME:(F)" /T /C
Write-Host "Permissions updated for: $cachePath"
```

### Solution 2: Fix File Permissions
```powershell
# Run PowerShell as Administrator
$cachePath = "$env:USERPROFILE\.aws\sso\cache"

# Reset permissions to allow current user full control
icacls $cachePath /reset /T /C
icacls $cachePath /grant:r "$env:USERNAME:(F)" /T /C

# Check permissions
icacls $cachePath
```

### Solution 3: Disable Antivirus/Security Software Interference
Some antivirus software may block file access:
1. Temporarily disable real-time scanning
2. Add `$env:USERPROFILE\.aws` to antivirus exclusions
3. Restart Kiro IDE

### Solution 4: Check for File Locks
```powershell
# Run PowerShell as Administrator
# Check if files are locked
Get-ChildItem "$env:USERPROFILE\.aws\sso\cache" -ErrorAction SilentlyContinue | ForEach-Object {
    try {
        [IO.File]::OpenRead($_.FullName).Dispose()
        Write-Host "✓ File is accessible: $($_.Name)"
    } catch {
        Write-Host "✗ File is locked: $($_.Name) - $($_.Exception.Message)"
    }
}
```

### Solution 5: Clear Cache and Restart
```powershell
# Run PowerShell as Administrator
$cachePath = "$env:USERPROFILE\.aws\sso\cache"

# Back up existing cache
$backupPath = "$cachePath.backup"
if (Test-Path $cachePath) {
    Copy-Item $cachePath $backupPath -Recurse -Force
    Write-Host "Backed up cache to: $backupPath"
    
    # Remove old cache
    Remove-Item $cachePath -Recurse -Force
    
    # Create fresh directory
    New-Item -ItemType Directory -Path $cachePath -Force
    Write-Host "Cache cleared and directory recreated"
}
```

## Steps to Apply Fix

1. **Open PowerShell as Administrator**
   - Press `Win+X`
   - Select "Windows PowerShell (Admin)"

2. **Run the appropriate solution** from above

3. **Verify the directory exists and is accessible:**
   ```powershell
   $cachePath = "$env:USERPROFILE\.aws\sso\cache"
   if (Test-Path $cachePath) {
       Write-Host "✓ Directory exists: $cachePath"
       icacls $cachePath
   }
   ```

4. **Restart Kiro IDE**

5. **Try logging in again**

## Recommended Workaround Code for Kiro IDE
The Kiro IDE should implement error handling with fallback:

```rust
// Pseudocode for handling AWS SSO cache access errors
fn ensure_sso_cache_dir() -> Result<PathBuf, Error> {
    let cache_path = get_aws_sso_cache_path();
    
    // Try to create directory with proper error handling
    match fs::create_dir_all(&cache_path) {
        Ok(_) => Ok(cache_path),
        Err(e) if e.kind() == io::ErrorKind::PermissionDenied => {
            // Fallback: use temp directory or app-specific cache
            let fallback = get_app_cache_fallback();
            fs::create_dir_all(&fallback)?;
            Ok(fallback)
        }
        Err(e) => Err(Error::from(e)),
    }
}
```

## For Developers/Maintainers

The fix should include:
1. **Error handling** for directory/file access on Windows
2. **Fallback mechanism** using alternative cache locations if AWS SSO cache is inaccessible
3. **Logging** of permission errors for better diagnostics
4. **User-friendly error messages** with suggested solutions

## Testing on Windows
Test these scenarios:
- [ ] Directory doesn't exist - should create it
- [ ] Directory exists but lacks permissions - should handle gracefully
- [ ] Antivirus blocking access - should retry or fallback
- [ ] Multiple simultaneous login attempts - should handle file locks

## References
- [AWS SDK SSO Configuration](https://docs.aws.amazon.com/cli/latest/userguide/sso-configure-profile-token.html)
- [Windows File Permissions with icacls](https://docs.microsoft.com/en-us/windows-server/administration/windows-commands/icacls)
