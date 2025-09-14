#!/bin/bash

# ClaudeOps Database Backup Script
# Performs regular SQLite database backups with rotation and cleanup

set -euo pipefail

# Configuration from environment variables
BACKUP_PATH="${BACKUP_PATH:-/backups}"
DATA_PATH="${DATA_PATH:-/data}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
DB_FILE="${DB_FILE:-production.db}"
LOG_FILE="${BACKUP_PATH}/backup.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case "$level" in
        INFO)
            echo -e "${GREEN}[$timestamp] INFO: $message${NC}" | tee -a "$LOG_FILE"
            ;;
        WARN)
            echo -e "${YELLOW}[$timestamp] WARN: $message${NC}" | tee -a "$LOG_FILE"
            ;;
        ERROR)
            echo -e "${RED}[$timestamp] ERROR: $message${NC}" | tee -a "$LOG_FILE"
            ;;
        *)
            echo "[$timestamp] $level: $message" | tee -a "$LOG_FILE"
            ;;
    esac
}

# Create backup directory if it doesn't exist
create_backup_directory() {
    if [ ! -d "$BACKUP_PATH" ]; then
        mkdir -p "$BACKUP_PATH"
        log INFO "Created backup directory: $BACKUP_PATH"
    fi
}

# Check if database file exists
check_database_exists() {
    local db_path="$DATA_PATH/$DB_FILE"
    if [ ! -f "$db_path" ]; then
        log WARN "Database file not found: $db_path"
        return 1
    fi
    return 0
}

# Perform database backup
perform_backup() {
    local timestamp=$(date '+%Y%m%d_%H%M%S')
    local db_path="$DATA_PATH/$DB_FILE"
    local backup_file="$BACKUP_PATH/${DB_FILE%.db}_${timestamp}.db"
    local backup_compressed="$backup_file.gz"
    
    log INFO "Starting backup: $db_path -> $backup_compressed"
    
    # Check database integrity first
    if ! sqlite3 "$db_path" "PRAGMA integrity_check;" >/dev/null 2>&1; then
        log ERROR "Database integrity check failed for: $db_path"
        return 1
    fi
    
    # Create backup using SQLite backup API
    if sqlite3 "$db_path" ".backup '$backup_file'"; then
        log INFO "Database backup created: $backup_file"
        
        # Compress the backup
        if gzip "$backup_file"; then
            log INFO "Backup compressed: $backup_compressed"
            
            # Verify backup integrity
            if gunzip -t "$backup_compressed" 2>/dev/null; then
                log INFO "Backup integrity verified: $backup_compressed"
                
                # Calculate and log backup size
                local backup_size=$(stat -f%z "$backup_compressed" 2>/dev/null || stat -c%s "$backup_compressed")
                log INFO "Backup size: $(numfmt --to=iec-i --suffix=B --format=%.1f "$backup_size")"
                
                return 0
            else
                log ERROR "Backup integrity verification failed: $backup_compressed"
                rm -f "$backup_compressed"
                return 1
            fi
        else
            log ERROR "Failed to compress backup: $backup_file"
            rm -f "$backup_file"
            return 1
        fi
    else
        log ERROR "Failed to create backup: $backup_file"
        return 1
    fi
}

# Clean up old backups
cleanup_old_backups() {
    log INFO "Starting cleanup of backups older than $RETENTION_DAYS days"
    
    local deleted_count=0
    local total_size_freed=0
    
    # Find and delete old backup files
    while IFS= read -r -d '' file; do
        if [ -f "$file" ]; then
            local file_size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file")
            rm -f "$file"
            deleted_count=$((deleted_count + 1))
            total_size_freed=$((total_size_freed + file_size))
            log INFO "Deleted old backup: $(basename "$file")"
        fi
    done < <(find "$BACKUP_PATH" -name "${DB_FILE%.db}_*.db.gz" -type f -mtime +$RETENTION_DAYS -print0 2>/dev/null)
    
    if [ $deleted_count -gt 0 ]; then
        local size_freed_human=$(numfmt --to=iec-i --suffix=B --format=%.1f "$total_size_freed")
        log INFO "Cleanup completed: deleted $deleted_count files, freed $size_freed_human"
    else
        log INFO "Cleanup completed: no old backups found"
    fi
}

# Generate backup report
generate_backup_report() {
    local backup_count=$(find "$BACKUP_PATH" -name "${DB_FILE%.db}_*.db.gz" -type f | wc -l)
    local total_size=0
    
    # Calculate total backup size
    while IFS= read -r file; do
        if [ -f "$file" ]; then
            local file_size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file")
            total_size=$((total_size + file_size))
        fi
    done < <(find "$BACKUP_PATH" -name "${DB_FILE%.db}_*.db.gz" -type f)
    
    local total_size_human=$(numfmt --to=iec-i --suffix=B --format=%.1f "$total_size")
    
    log INFO "Backup Report:"
    log INFO "  - Total backups: $backup_count"
    log INFO "  - Total size: $total_size_human"
    log INFO "  - Retention days: $RETENTION_DAYS"
    log INFO "  - Backup path: $BACKUP_PATH"
}

# Health check function
health_check() {
    local db_path="$DATA_PATH/$DB_FILE"
    
    # Check if database is accessible
    if ! sqlite3 "$db_path" "SELECT 1;" >/dev/null 2>&1; then
        log ERROR "Database health check failed: cannot access database"
        return 1
    fi
    
    # Check disk space
    local available_space=$(df "$BACKUP_PATH" | tail -1 | awk '{print $4}')
    local required_space=1048576  # 1GB in KB
    
    if [ "$available_space" -lt "$required_space" ]; then
        log WARN "Low disk space: $(numfmt --to=iec-i --suffix=B --from-unit=1024 --format=%.1f "$available_space") available"
    fi
    
    return 0
}

# Signal handler for graceful shutdown
cleanup_on_exit() {
    log INFO "Backup script interrupted, cleaning up..."
    exit 1
}

# Set up signal handlers
trap cleanup_on_exit SIGINT SIGTERM

# Main execution
main() {
    local start_time=$(date '+%s')
    
    log INFO "ClaudeOps backup script starting..."
    log INFO "Configuration:"
    log INFO "  - Database: $DATA_PATH/$DB_FILE"
    log INFO "  - Backup path: $BACKUP_PATH"
    log INFO "  - Retention: $RETENTION_DAYS days"
    
    # Pre-flight checks
    if ! command -v sqlite3 >/dev/null 2>&1; then
        log ERROR "sqlite3 command not found"
        exit 1
    fi
    
    if ! command -v gzip >/dev/null 2>&1; then
        log ERROR "gzip command not found"
        exit 1
    fi
    
    # Create backup directory
    create_backup_directory
    
    # Check database exists
    if ! check_database_exists; then
        log ERROR "Database check failed, exiting"
        exit 1
    fi
    
    # Perform health check
    if ! health_check; then
        log ERROR "Health check failed, but continuing with backup"
    fi
    
    # Perform backup
    if perform_backup; then
        log INFO "Backup completed successfully"
    else
        log ERROR "Backup failed"
        exit 1
    fi
    
    # Clean up old backups
    cleanup_old_backups
    
    # Generate report
    generate_backup_report
    
    local end_time=$(date '+%s')
    local duration=$((end_time - start_time))
    
    log INFO "Backup script completed in ${duration}s"
}

# Execute main function
main "$@"