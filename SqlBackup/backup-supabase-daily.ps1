# backup-supabase-daily.ps1
# Automatic daily backup of Supabase CRM database
# Schedule this to run every day (Windows Task Scheduler)

$BACKUP_DIR = "C:\Backups\CRM"
$DATE = Get-Date -Format "yyyy-MM-dd_HHmmss"
$FILE = "$BACKUP_DIR\backup_$DATE.sql"
$LOG_FILE = "$BACKUP_DIR\backup_log.txt"

# Create backup directory if not exists
if (-not (Test-Path $BACKUP_DIR)) {
    New-Item -ItemType Directory -Path $BACKUP_DIR | Out-Null
}

# Log function
function Log {
    param([string]$message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$timestamp - $message" | Tee-Object -FilePath $LOG_FILE -Append
}

Log "=========================================="
Log "Starting Supabase CRM Backup"
Log "=========================================="

try {
    # Database credentials (from .env.local)
    $DB_HOST = "yhanmyvolpeiuxspcxmk.supabase.co"
    $DB_USER = "postgres"
    $DB_NAME = "postgres"
    
    # Get password from environment or prompt
    if (-not $env:SUPABASE_DB_PASSWORD) {
        Write-Host "❌ SUPABASE_DB_PASSWORD not set!"
        Log "ERROR: SUPABASE_DB_PASSWORD environment variable not set"
        exit 1
    }
    
    $env:PGPASSWORD = $env:SUPABASE_DB_PASSWORD
    
    # Run pg_dump
    Write-Host "⏳ Creating backup..." -ForegroundColor Cyan
    Log "Running pg_dump to $FILE"
    
    & pg_dump --host $DB_HOST `
              --user $DB_USER `
              --dbname $DB_NAME `
              --verbose `
              > $FILE 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        $fileSize = (Get-Item $FILE).Length / 1MB
        Write-Host "✅ Backup completed successfully!" -ForegroundColor Green
        Log "✅ Backup completed: $FILE (Size: $([Math]::Round($fileSize, 2)) MB)"
        
        # Delete backups older than 30 days
        $thirtyDaysAgo = (Get-Date).AddDays(-30)
        Get-ChildItem $BACKUP_DIR -Filter "backup_*.sql" | 
            Where-Object { $_.LastWriteTime -lt $thirtyDaysAgo } | 
            Remove-Item -Force
        
        Log "✅ Cleaned up old backups (older than 30 days)"
    } else {
        Write-Host "❌ Backup failed!" -ForegroundColor Red
        Log "❌ Backup failed with exit code: $LASTEXITCODE"
        Remove-Item $FILE -Force -ErrorAction SilentlyContinue
        exit 1
    }
}
catch {
    Write-Host "❌ Error: $_" -ForegroundColor Red
    Log "❌ Error: $_"
    exit 1
}
finally {
    $env:PGPASSWORD = $null
    Log "=========================================="
}
