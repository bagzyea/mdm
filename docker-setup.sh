#!/bin/bash

# MDM Docker Setup Script
# This script sets up the complete MDM development environment using Docker

set -e

echo "🚀 Starting MDM Docker Setup..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is installed
check_docker() {
    print_status "Checking Docker installation..."
    
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker Desktop first."
        print_status "Visit: https://www.docker.com/products/docker-desktop/"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        print_error "Docker Compose is not installed or not working."
        exit 1
    fi
    
    print_success "Docker is installed and working"
}

# Check if Docker is running
check_docker_running() {
    print_status "Checking if Docker is running..."
    
    if ! docker info &> /dev/null; then
        print_error "Docker is not running. Please start Docker Desktop."
        exit 1
    fi
    
    print_success "Docker is running"
}

# Create necessary directories and files
setup_environment() {
    print_status "Setting up environment files..."
    
    # Create .env file if it doesn't exist
    if [ ! -f "backend/.env" ]; then
        if [ -f "backend/env.example" ]; then
            cp backend/env.example backend/.env
            print_success "Created backend/.env from template"
        else
            print_warning "No env.example found. You'll need to create backend/.env manually"
        fi
    else
        print_status "backend/.env already exists"
    fi
}

# Build and start services
start_services() {
    print_status "Building and starting Docker services..."
    
    # Stop any existing containers
    print_status "Stopping existing containers..."
    docker-compose -f docker-compose.dev.yml down --remove-orphans
    
    # Build and start services
    print_status "Building services..."
    docker-compose -f docker-compose.dev.yml build --no-cache
    
    print_status "Starting services..."
    docker-compose -f docker-compose.dev.yml up -d
    
    print_success "Services started successfully"
}

# Wait for services to be ready
wait_for_services() {
    print_status "Waiting for services to be ready..."
    
    # Wait for database
    print_status "Waiting for PostgreSQL..."
    until docker-compose -f docker-compose.dev.yml exec -T db pg_isready -U mdm_user -d mdm_dev; do
        sleep 2
    done
    print_success "PostgreSQL is ready"
    
    # Wait for Redis
    print_status "Waiting for Redis..."
    until docker-compose -f docker-compose.dev.yml exec -T redis redis-cli ping; do
        sleep 2
    done
    print_success "Redis is ready"
    
    # Wait for backend
    print_status "Waiting for backend service..."
    until curl -f http://localhost:5001/health &> /dev/null; do
        sleep 5
    done
    print_success "Backend service is ready"
}

# Setup database
setup_database() {
    print_status "Setting up database..."
    
    # Run Prisma migrations
    print_status "Running Prisma migrations..."
    docker-compose -f docker-compose.dev.yml exec -T mdm-backend npx prisma migrate dev --name init
    
    # Generate Prisma client
    print_status "Generating Prisma client..."
    docker-compose -f docker-compose.dev.yml exec -T mdm-backend npx prisma generate
    
    # Create admin user
    print_status "Creating admin user..."
    docker-compose -f docker-compose.dev.yml exec -T mdm-backend npm run create-admin
    
    print_success "Database setup completed"
}

# Show service status
show_status() {
    print_status "Service Status:"
    echo ""
    docker-compose -f docker-compose.dev.yml ps
    echo ""
    
    print_status "Service URLs:"
    echo "  Backend API: http://localhost:5001"
    echo "  Health Check: http://localhost:5001/health"
    echo "  PostgreSQL: localhost:5432"
    echo "  Redis: localhost:6379"
    echo ""
    
    print_status "Default Admin Credentials:"
    echo "  Email: admin@mdm.local"
    echo "  Password: admin123"
    echo ""
}

# Main execution
main() {
    echo "🐳 MDM Docker Setup Script"
    echo "=========================="
    echo ""
    
    check_docker
    check_docker_running
    setup_environment
    start_services
    wait_for_services
    setup_database
    show_status
    
    print_success "🎉 MDM Docker setup completed successfully!"
    echo ""
    print_status "Next steps:"
    echo "  1. Test the API: curl http://localhost:5001/health"
    echo "  2. Access the admin dashboard (if running): http://localhost:3000"
    echo "  3. View logs: docker-compose -f docker-compose.dev.yml logs -f"
    echo "  4. Stop services: docker-compose -f docker-compose.dev.yml down"
    echo ""
}

# Run main function
main "$@"
