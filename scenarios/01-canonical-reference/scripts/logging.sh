#!/bin/bash
# =============================================================================
# CDC Pipeline Logging Utilities
# =============================================================================
# Source this file to get colored, categorized logging for pipeline operations.
#
# Usage:
#   source scripts/logging.sh
#   log_info "Starting pipeline"
#   log_success "Pipeline started"
#   log_warn "High lag detected"
#   log_error "Connection failed"
#   log_step "1" "5" "Checking prerequisites"
# =============================================================================

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

# Symbols
CHECK="✓"
CROSS="✗"
WARN="⚠"
INFO="ℹ"
ARROW="→"
BULLET="•"

# Logging functions
log_info() {
    echo -e "${BLUE}${INFO}${NC} $1"
}

log_success() {
    echo -e "${GREEN}${CHECK}${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}${WARN}${NC} $1"
}

log_error() {
    echo -e "${RED}${CROSS}${NC} $1"
}

log_step() {
    local current=$1
    local total=$2
    local message=$3
    echo -e "${CYAN}[${current}/${total}]${NC} ${message}"
}

log_header() {
    echo ""
    echo -e "${WHITE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${WHITE}  $1${NC}"
    echo -e "${WHITE}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
}

log_section() {
    echo ""
    echo -e "${PURPLE}▸ $1${NC}"
    echo -e "${GRAY}───────────────────────────────────────────────────────────────${NC}"
}

log_detail() {
    echo -e "  ${GRAY}${BULLET}${NC} $1"
}

log_command() {
    echo -e "  ${CYAN}\$ $1${NC}"
}

log_output() {
    echo -e "  ${GRAY}$1${NC}"
}

# Status indicators
show_status() {
    local service=$1
    local status=$2
    local details=$3
    
    if [ "$status" == "healthy" ] || [ "$status" == "running" ]; then
        echo -e "  ${GREEN}${CHECK}${NC} ${service}: ${GREEN}${status}${NC} ${GRAY}${details}${NC}"
    elif [ "$status" == "warning" ] || [ "$status" == "degraded" ]; then
        echo -e "  ${YELLOW}${WARN}${NC} ${service}: ${YELLOW}${status}${NC} ${GRAY}${details}${NC}"
    else
        echo -e "  ${RED}${CROSS}${NC} ${service}: ${RED}${status}${NC} ${GRAY}${details}${NC}"
    fi
}

# Progress bar
show_progress() {
    local current=$1
    local total=$2
    local width=40
    local percent=$((current * 100 / total))
    local filled=$((current * width / total))
    local empty=$((width - filled))
    
    printf "\r  ["
    printf "%${filled}s" | tr ' ' '█'
    printf "%${empty}s" | tr ' ' '░'
    printf "] %3d%%" $percent
}

# Countdown timer
countdown() {
    local seconds=$1
    local message=${2:-"Waiting"}
    
    for ((i=seconds; i>0; i--)); do
        printf "\r  ${message}: ${CYAN}%d${NC} seconds remaining... " $i
        sleep 1
    done
    printf "\r  ${message}: ${GREEN}Done${NC}                        \n"
}

# Spinner for long operations
spinner() {
    local pid=$1
    local message=${2:-"Processing"}
    local delay=0.1
    local spinstr='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
    
    while [ "$(ps a | awk '{print $1}' | grep $pid)" ]; do
        local temp=${spinstr#?}
        printf "\r  ${CYAN}%c${NC} ${message}..." "${spinstr}"
        local spinstr=$temp${spinstr%"$temp"}
        sleep $delay
    done
    printf "\r  ${GREEN}${CHECK}${NC} ${message}... done\n"
}

# Box drawing for summaries
draw_box() {
    local title=$1
    shift
    local content=("$@")
    
    echo -e "${WHITE}┌──────────────────────────────────────────────────────────────┐${NC}"
    echo -e "${WHITE}│${NC} ${CYAN}${title}${NC}"
    echo -e "${WHITE}├──────────────────────────────────────────────────────────────┤${NC}"
    for line in "${content[@]}"; do
        printf "${WHITE}│${NC} %-62s ${WHITE}│${NC}\n" "$line"
    done
    echo -e "${WHITE}└──────────────────────────────────────────────────────────────┘${NC}"
}
