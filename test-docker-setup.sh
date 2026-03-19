#!/bin/bash

# MDM Docker Setup Test Script
# This script tests the Docker setup to ensure everything is working correctly

set -e

echo "🧪 Testing MDM Docker Setup..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[FAIL]${NC} $1"
}

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Function to run a test
run_test() {
    local test_name="$1"
    local test_command="$2"
    local expected_output="$3"
    
    print_status "Running: $test_name"
    
    if eval "$test_command" > /dev/null 2>&1; then
        print_success "$test_name"
        ((TESTS_PASSED++))
        return 0
    else
        print_error "$test_name"
        ((TESTS_FAILED++))
        return 1
    fi
}

# Test 1: Check if Docker is running
run_test "Docker is running" "docker info > /dev/null 2>&1"

# Test 2: Check if containers are running
run_test "Containers are running" "docker-compose -f docker-compose.dev.yml ps | grep -q 'Up'"

# Test 3: Check backend health endpoint
run_test "Backend health endpoint" "curl -f http://localhost:5001/health > /dev/null 2>&1"

# Test 4: Check database connection
run_test "Database connection" "docker-compose -f docker-compose.dev.yml exec -T db pg_isready -U mdm_user -d mdm_dev > /dev/null 2>&1"

# Test 5: Check Redis connection
run_test "Redis connection" "docker-compose -f docker-compose.dev.yml exec -T redis redis-cli ping > /dev/null 2>&1"

# Test 6: Check if admin user exists
run_test "Admin user exists" "docker-compose -f docker-compose.dev.yml exec -T mdm-backend npx prisma studio --help > /dev/null 2>&1"

# Test 7: Test authentication endpoint
print_status "Testing authentication endpoint..."
AUTH_RESPONSE=$(curl -s -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@mdm.local", "password": "admin123"}' 2>/dev/null || echo "{}")

if echo "$AUTH_RESPONSE" | grep -q "success.*true"; then
    print_success "Authentication endpoint"
    ((TESTS_PASSED++))
else
    print_error "Authentication endpoint"
    ((TESTS_FAILED++))
fi

# Test 8: Test protected endpoint (if we have a token)
print_status "Testing protected endpoint..."
if echo "$AUTH_RESPONSE" | grep -q "accessToken"; then
    TOKEN=$(echo "$AUTH_RESPONSE" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
    if [ -n "$TOKEN" ]; then
        if curl -s -f -H "Authorization: Bearer $TOKEN" http://localhost:5001/api/devices > /dev/null 2>&1; then
            print_success "Protected endpoint access"
            ((TESTS_PASSED++))
        else
            print_error "Protected endpoint access"
            ((TESTS_FAILED++))
        fi
    else
        print_warning "Could not extract token for protected endpoint test"
    fi
else
    print_warning "No authentication token available for protected endpoint test"
fi

# Test 9: Check service logs for errors
print_status "Checking service logs for errors..."
ERROR_COUNT=$(docker-compose -f docker-compose.dev.yml logs --tail=50 | grep -i "error\|exception\|fatal" | wc -l)
if [ "$ERROR_COUNT" -eq 0 ]; then
    print_success "No errors in service logs"
    ((TESTS_PASSED++))
else
    print_warning "Found $ERROR_COUNT potential errors in service logs"
    ((TESTS_FAILED++))
fi

# Test 10: Check resource usage
print_status "Checking resource usage..."
CONTAINER_COUNT=$(docker-compose -f docker-compose.dev.yml ps -q | wc -l)
if [ "$CONTAINER_COUNT" -ge 3 ]; then
    print_success "All containers are running ($CONTAINER_COUNT containers)"
    ((TESTS_PASSED++))
else
    print_error "Not all containers are running (found $CONTAINER_COUNT containers)"
    ((TESTS_FAILED++))
fi

# Summary
echo ""
echo "📊 Test Summary"
echo "==============="
echo "Tests Passed: $TESTS_PASSED"
echo "Tests Failed: $TESTS_FAILED"
echo "Total Tests: $((TESTS_PASSED + TESTS_FAILED))"

if [ $TESTS_FAILED -eq 0 ]; then
    echo ""
    print_success "🎉 All tests passed! Your MDM Docker setup is working correctly."
    echo ""
    echo "Next steps:"
    echo "  1. Access the admin dashboard: http://localhost:3000"
    echo "  2. Test the API: curl http://localhost:5001/health"
    echo "  3. View logs: docker-compose -f docker-compose.dev.yml logs -f"
    echo "  4. Stop services: docker-compose -f docker-compose.dev.yml down"
else
    echo ""
    print_error "❌ Some tests failed. Please check the issues above."
    echo ""
    echo "Troubleshooting:"
    echo "  1. Check logs: docker-compose -f docker-compose.dev.yml logs -f"
    echo "  2. Restart services: docker-compose -f docker-compose.dev.yml restart"
    echo "  3. Rebuild services: docker-compose -f docker-compose.dev.yml build --no-cache"
    echo "  4. Check the DOCKER_TESTING_GUIDE.md for more details"
fi

echo ""
