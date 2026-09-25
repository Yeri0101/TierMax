#!/usr/bin/env bash
# ==============================================================================
# OpenClaw Gateway AAA Suite — Feature Branch Management Script
# ==============================================================================
# Manages the 6 sequential feature branches defined in PROJECT.md:
#   1. feature/aaa-01-core-storage
#   2. feature/aaa-02-authn-keys-oidc-mtls
#   3. feature/aaa-03-authz-rbac-abac-routes
#   4. feature/aaa-04-autha-metering-ratelimit
#   5. feature/aaa-05-autha-audit-siem
#   6. feature/aaa-06-admin-api-ui
# ==============================================================================

set -euo pipefail

# Text formatting
BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
CYAN="\033[0;36m"
RED="\033[0;31m"
RESET="\033[0m"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

BRANCHES=(
    "feature/aaa-01-core-storage"
    "feature/aaa-02-authn-keys-oidc-mtls"
    "feature/aaa-03-authz-rbac-abac-routes"
    "feature/aaa-04-autha-metering-ratelimit"
    "feature/aaa-05-autha-audit-siem"
    "feature/aaa-06-admin-api-ui"
)

MILESTONES=(
    "M1: AAA Core Architecture & Storage Layer"
    "M2: Enterprise Authentication (AuthN) Suite"
    "M3: Dynamic Authorization (AuthZ) & Governance"
    "M4: Consumer Accounting & Rate Limiting (AuthA Part 1)"
    "M5: Immutable Audit Ledger & SIEM Export (AuthA Part 2)"
    "M6: Admin Management APIs, UI & Integration Suite"
)

get_current_branch() {
    git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown"
}

branch_exists() {
    local branch="$1"
    git show-ref --verify --quiet "refs/heads/$branch"
}

print_header() {
    echo -e "${BOLD}${CYAN}===================================================================${RESET}"
    echo -e "${BOLD}${CYAN} OpenClaw Gateway AAA Suite — Feature Branch Manager${RESET}"
    echo -e "${BOLD}${CYAN}===================================================================${RESET}"
}

cmd_list() {
    print_header
    local current
    current="$(get_current_branch)"
    echo -e "Current working branch: ${BOLD}${GREEN}${current}${RESET}\n"
    printf "%-4s %-42s %-12s %s\n" "#" "Branch Name" "Status" "Milestone Description"
    printf "%-4s %-42s %-12s %s\n" "----" "------------------------------------------" "------------" "------------------------------------"

    for i in "${!BRANCHES[@]}"; do
        local b="${BRANCHES[$i]}"
        local m="${MILESTONES[$i]}"
        local num=$((i + 1))
        local status
        if [[ "$current" == "$b" ]]; then
            status="${BOLD}${GREEN}ACTIVE *${RESET}"
        elif branch_exists "$b"; then
            status="${GREEN}EXISTS${RESET}"
        else
            status="${YELLOW}MISSING${RESET}"
        fi
        printf "%-4s %-42s %-20b %s\n" "$num" "$b" "$status" "$m"
    done
    echo ""
}

cmd_create() {
    print_header
    local base_ref="${1:-HEAD}"
    echo -e "Creating AAA feature branches from base: ${BOLD}${CYAN}${base_ref}${RESET}...\n"

    for i in "${!BRANCHES[@]}"; do
        local b="${BRANCHES[$i]}"
        local num=$((i + 1))
        if branch_exists "$b"; then
            echo -e " [${num}/6] Branch ${BOLD}${b}${RESET} already exists. Skipping."
        else
            git branch "$b" "$base_ref"
            echo -e " [${num}/6] ${GREEN}Created branch:${RESET} ${BOLD}${b}${RESET}"
        fi
    done

    echo -e "\n${BOLD}${GREEN}✔ All 6 AAA feature branches are created and ready.${RESET}\n"
}

cmd_switch() {
    local target="${1:-}"
    if [[ -z "$target" ]]; then
        echo -e "${RED}Error: Specify branch name or milestone number (1-6).${RESET}"
        exit 1
    fi

    local selected=""
    if [[ "$target" =~ ^[1-6]$ ]]; then
        local idx=$((target - 1))
        selected="${BRANCHES[$idx]}"
    else
        for b in "${BRANCHES[@]}"; do
            if [[ "$b" == "$target" || "$b" == "feature/$target" ]]; then
                selected="$b"
                break
            fi
        done
    fi

    if [[ -z "$selected" ]]; then
        echo -e "${RED}Error: Unknown branch '${target}'. Available: 1-6 or exact branch names.${RESET}"
        exit 1
    fi

    if ! branch_exists "$selected"; then
        echo -e "${YELLOW}Branch '$selected' does not exist yet. Creating from HEAD...${RESET}"
        git branch "$selected" HEAD
    fi

    echo -e "Switching to: ${BOLD}${GREEN}${selected}${RESET}..."
    git checkout "$selected"
}

cmd_delete() {
    print_header
    local force="${1:-}"
    local current
    current="$(get_current_branch)"

    echo -e "${YELLOW}Warning: This will delete local branches for all 6 AAA feature branches.${RESET}"
    if [[ "$force" != "--force" && "$force" != "-f" ]]; then
        read -r -p "Are you sure you want to proceed? [y/N]: " confirm
        if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
            echo "Aborted."
            exit 0
        fi
    fi

    for b in "${BRANCHES[@]}"; do
        if [[ "$current" == "$b" ]]; then
            echo -e "Cannot delete currently checked-out branch: ${BOLD}${b}${RESET}. Switch away first."
            continue
        fi
        if branch_exists "$b"; then
            git branch -D "$b"
            echo -e " ${RED}Deleted:${RESET} $b"
        else
            echo -e " Branch $b does not exist."
        fi
    done
}

cmd_verify() {
    print_header
    local missing=0
    for b in "${BRANCHES[@]}"; do
        if ! branch_exists "$b"; then
            missing=$((missing + 1))
        fi
    done

    if [[ $missing -eq 0 ]]; then
        echo -e "${BOLD}${GREEN}✔ Verification passed: All 6 AAA feature branches exist locally.${RESET}"
        cmd_list
        return 0
    else
        echo -e "${BOLD}${RED}✘ Verification failed: ${missing}/6 feature branches missing.${RESET}"
        cmd_list
        return 1
    fi
}

cmd_help() {
    print_header
    echo -e "Usage: ./scripts/scaffold-aaa-branches.sh <command> [arguments]\n"
    echo -e "Commands:"
    echo -e "  ${BOLD}create [base_ref]${RESET}    Create all 6 AAA feature branches (default base: HEAD)"
    echo -e "  ${BOLD}list | status${RESET}        Display all AAA branches and their status"
    echo -e "  ${BOLD}switch <1-6|name>${RESET}    Switch to specific AAA branch by number or name"
    echo -e "  ${BOLD}verify${RESET}               Verify that all 6 branches exist"
    echo -e "  ${BOLD}delete [--force]${RESET}     Delete all 6 AAA local feature branches"
    echo -e "  ${BOLD}help${RESET}                 Show this help message"
    echo ""
}

case "${1:-list}" in
    create)
        cmd_create "${2:-HEAD}"
        ;;
    list|status)
        cmd_list
        ;;
    switch)
        cmd_switch "${2:-}"
        ;;
    delete)
        cmd_delete "${2:-}"
        ;;
    verify)
        cmd_verify
        ;;
    help|--help|-h)
        cmd_help
        ;;
    *)
        echo -e "${RED}Unknown command: $1${RESET}\n"
        cmd_help
        exit 1
        ;;
esac
