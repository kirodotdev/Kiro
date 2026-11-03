# Kiro IDE AWS SSO Cache Access Fix Script
# Run this script as Administrator to resolve AWS SSO cache permission issues

# Requires admin privileges
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]"Administrator")) {
    Write-Host "This script requires administrator privileges. Please run PowerShell as Administrator." -ForegroundColor Red
    exit 1
}

Write-Host "Kiro IDE AWS SSO Cache Fix Script" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan
Write-Host ""

$cachePath = "$env:USERPROFILE\.aws\sso\cache"
$awsPath = "$env:USERPROFILE\.aws"

# Step 1: Check if AWS directory exists
Write-Host "[1/5] Checking AWS directory..." -ForegroundColor Yellow
if (Test-Path $awsPath) {
    Write-Host "✓ AWS directory exists: $awsPath" -ForegroundColor Green
} else {
    Write-Host "✗ AWS directory does not exist. Creating..." -ForegroundColor Yellow
    try {
        New-Item -ItemType Directory -Path $awsPath -Force | Out-Null
        Write-Host "✓ Created AWS directory: $awsPath" -ForegroundColor Green
    } catch {
        Write-Host "✗ Failed to create AWS directory: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

# Step 2: Check if SSO cache directory exists
Write-Host ""
Write-Host "[2/5] Checking SSO cache directory..." -ForegroundColor Yellow
if (Test-Path $cachePath) {
    Write-Host "✓ SSO cache directory exists: $cachePath" -ForegroundColor Green
} else {
    Write-Host "✗ SSO cache directory does not exist. Creating..." -ForegroundColor Yellow
    try {
        New-Item -ItemType Directory -Path $cachePath -Force | Out-Null
        Write-Host "✓ Created SSO cache directory: $cachePath" -ForegroundColor Green
    } catch {
        Write-Host "✗ Failed to create SSO cache directory: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

# Step 3: Check current permissions
Write-Host ""
Write-Host "[3/5] Checking permissions..." -ForegroundColor Yellow
try {
    $acl = Get-Acl $cachePath
    $hasFullControl = $false
    foreach ($access in $acl.Access) {
        if ($access.IdentityReference -like "*$env:USERNAME*" -and $access.FileSystemRights -eq "FullControl") {
            $hasFullControl = $true
            break
        }
    }
    if ($hasFullControl) {
        Write-Host "✓ Current user has full control of $cachePath" -ForegroundColor Green
    } else {
        Write-Host "⚠ Current user may not have full control. Updating permissions..." -ForegroundColor Yellow
    }
} catch {
    Write-Host "✗ Failed to check permissions: $($_.Exception.Message)" -ForegroundColor Red
}

# Step 4: Reset and fix permissions
Write-Host ""
Write-Host "[4/5] Fixing permissions..." -ForegroundColor Yellow
try {
    # Reset permissions
    icacls $cachePath /reset /T /C 2>&1 | Out-Null
    
    # Grant full control to current user
    icacls $cachePath /grant:r "$env:USERNAME:(F)" /T /C 2>&1 | Out-Null
    
    Write-Host "✓ Permissions updated successfully" -ForegroundColor Green
    
    # Display new permissions
    Write-Host ""
    Write-Host "Current permissions for $cachePath" -ForegroundColor Cyan
    icacls $cachePath
} catch {
    Write-Host "✗ Failed to update permissions: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 5: Verify write access
Write-Host ""
Write-Host "[5/5] Verifying write access..." -ForegroundColor Yellow
try {
    $testFile = Join-Path $cachePath "test-write-access.txt"
    "test" | Out-File -FilePath $testFile -Force
    Remove-Item $testFile -Force
    Write-Host "✓ Write access verified - you can write to $cachePath" -ForegroundColor Green
} catch {
    Write-Host "✗ Write access test failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  This may indicate additional permission issues or disk space problems" -ForegroundColor Red
    exit 1
}

# Success message
Write-Host ""
Write-Host "===================================" -ForegroundColor Cyan
Write-Host "✓ AWS SSO cache directory is now ready for Kiro IDE" -ForegroundColor Green
Write-Host "===================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Close Kiro IDE if it's running"
Write-Host "2. Delete any existing token cache files (optional):"
Write-Host "   Remove-Item '$cachePath\*' -Force"
Write-Host "3. Restart Kiro IDE"
Write-Host "4. Log in again"
Write-Host ""
