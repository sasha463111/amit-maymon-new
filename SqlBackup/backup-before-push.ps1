# backup-before-push.ps1
# MUST RUN BEFORE ANY PRODUCTION PUSH
# Creates backup and waits for confirmation

Write-Host "╔════════════════════════════════════════╗" -ForegroundColor Yellow
Write-Host "║  PRE-PUSH DATABASE BACKUP             ║" -ForegroundColor Yellow
Write-Host "╚════════════════════════════════════════╝" -ForegroundColor Yellow
Write-Host ""

# Run the daily backup script
& ".\backup-supabase-daily.ps1"

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "❌ BACKUP FAILED - DO NOT PUSH!" -ForegroundColor Red
    Write-Host "Fix the backup issue before proceeding with git push" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅ Backup completed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Ready to push to production? (Y/N)" -ForegroundColor Cyan
$response = Read-Host

if ($response -eq "Y" -or $response -eq "y") {
    Write-Host "Proceeding with git push..." -ForegroundColor Green
} else {
    Write-Host "Push cancelled." -ForegroundColor Yellow
    exit 1
}
