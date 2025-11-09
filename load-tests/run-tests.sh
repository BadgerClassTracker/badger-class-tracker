#!/bin/bash

# Badger Class Tracker - Load Test Runner
# Quick script to run k6 load tests

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# K6 binary location
K6="${HOME}/bin/k6"

# Check if k6 is installed
if [ ! -f "$K6" ]; then
    echo -e "${RED}Error: k6 not found at ${K6}${NC}"
    echo "Please run the installation script first"
    exit 1
fi

# Function to display menu
show_menu() {
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║   Badger Class Tracker - Load Testing Suite               ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Select a test to run:"
    echo ""
    echo "  1) API Load Test          (Light load, ~15 min)"
    echo "  2) User Flow Test         (Medium load, ~20 min)"
    echo "  3) Stress Test            (Heavy load, ~25 min)"
    echo "  4) Database Load Test     (Creates subscriptions, ~15 min)"
    echo "  5) Poller Simulation      (Setup for poller test, ~15 min)"
    echo ""
    echo "  6) Quick Smoke Test       (Fast validation, 2 min)"
    echo "  7) All Tests (Sequential) (Full suite, ~90 min)"
    echo ""
    echo "  0) Exit"
    echo ""
}

# Function to run a test
run_test() {
    local test_file=$1
    local test_name=$2

    echo -e "${GREEN}▶ Running: ${test_name}${NC}"
    echo -e "${YELLOW}Press Ctrl+C to abort${NC}"
    echo ""

    if $K6 run "load-tests/${test_file}"; then
        echo ""
        echo -e "${GREEN}✓ ${test_name} completed successfully${NC}"
        return 0
    else
        echo ""
        echo -e "${RED}✗ ${test_name} failed${NC}"
        return 1
    fi
}

# Function to run quick smoke test
run_smoke_test() {
    echo -e "${GREEN}▶ Running: Quick Smoke Test${NC}"
    echo ""

    $K6 run --vus 10 --duration 2m load-tests/api-load-test.js

    echo ""
    echo -e "${GREEN}✓ Smoke test completed${NC}"
}

# Function to run all tests
run_all_tests() {
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  Running Full Test Suite${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo ""

    local start_time=$(date +%s)
    local failed=0

    run_test "api-load-test.js" "API Load Test" || ((failed++))
    echo ""

    run_test "user-flow-test.js" "User Flow Test" || ((failed++))
    echo ""

    run_test "database-load-test.js" "Database Load Test" || ((failed++))
    echo ""

    run_test "stress-test.js" "Stress Test" || ((failed++))
    echo ""

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  Test Suite Summary${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo "Total duration: $((duration / 60)) minutes"

    if [ $failed -eq 0 ]; then
        echo -e "${GREEN}✓ All tests passed!${NC}"
    else
        echo -e "${RED}✗ ${failed} test(s) failed${NC}"
    fi
}

# Check if config is set up
check_config() {
    if grep -q "YOUR_JWT_TOKEN_HERE" load-tests/config.js 2>/dev/null; then
        echo -e "${YELLOW}⚠ Warning: Default config detected${NC}"
        echo "Please update load-tests/config.js with:"
        echo "  - Your API URL"
        echo "  - Valid JWT token"
        echo ""
        read -p "Continue anyway? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# Main script
main() {
    # Check config
    check_config

    # If argument provided, run specific test
    if [ $# -gt 0 ]; then
        case $1 in
            1) run_test "api-load-test.js" "API Load Test" ;;
            2) run_test "user-flow-test.js" "User Flow Test" ;;
            3) run_test "stress-test.js" "Stress Test" ;;
            4) run_test "database-load-test.js" "Database Load Test" ;;
            5) run_test "poller-simulation.js" "Poller Simulation" ;;
            6) run_smoke_test ;;
            7) run_all_tests ;;
            *) echo "Invalid option: $1" ;;
        esac
        exit 0
    fi

    # Interactive menu
    while true; do
        show_menu
        read -p "Enter your choice [0-7]: " choice
        echo ""

        case $choice in
            1) run_test "api-load-test.js" "API Load Test" ;;
            2) run_test "user-flow-test.js" "User Flow Test" ;;
            3) run_test "stress-test.js" "Stress Test" ;;
            4) run_test "database-load-test.js" "Database Load Test" ;;
            5) run_test "poller-simulation.js" "Poller Simulation" ;;
            6) run_smoke_test ;;
            7) run_all_tests ;;
            0)
                echo "Exiting..."
                exit 0
                ;;
            *)
                echo -e "${RED}Invalid option. Please try again.${NC}"
                ;;
        esac

        echo ""
        read -p "Press Enter to continue..."
        clear
    done
}

# Run main function
main "$@"
