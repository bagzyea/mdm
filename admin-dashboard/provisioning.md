# Device Provisioner Features

## Overview
The Device Provisioner is an automated tablet provisioning system developed for the Uganda 2024 National Population and Housing Census (NPHC). It streamlines the setup and configuration of Android tablets used by field enumerators for census data collection.

## Core Features

### 1. Multi-Device Support
- **Supported Models**: Laxton, ZTE, MiOne, Samsung-T225, Samsung-T295
- **Device-Specific Configuration**: Tailored setup procedures for each tablet model
- **Parallel Processing**: Simultaneous provisioning of multiple connected devices
- **Device Detection**: Automatic identification of connected Android devices via ADB

### 2. Application Management
- **Core App Installation**:
  - CSentry (Census data collection application)
  - WPS Office (Word processor)
  - Field Management Tool (FMT)
  - PDF Reader
- **Permission Configuration**: Automated granting of required app permissions
- **App Integration**: Seamless integration between installed applications

### 3. Census Data Application (CAPI) Setup
- **NPHC Application Deployment**: Installation of National Population and Housing Census data collection forms
- **PES (Post Enumeration Survey) Support**: Specialized configuration for survey validation
- **Form Package Management**: Deployment of questionnaire packages and lookup tables
- **Geographic Data Integration**: Installation of mapping data and geographic codes

### 4. Network Configuration
- **APN Setup**: Automatic configuration for MTN and Airtel networks
- **Carrier Detection**: Automatic identification of mobile network provider
- **Custom APN Creation**:
  - MTN: `ubos.mtn.com` (UBOS-MTN)
  - Airtel: `ubos.airtel.co.ug` (UBOS-Airtel)
- **Network Type Selection**: 3G network preference configuration

### 5. Security & Device Settings
- **PIN Configuration**: Standardized device PIN (1234) for field use
- **Screen Timeout**: Optimized timeout settings (60 seconds) for battery conservation
- **User Account Management**: Creation of dedicated "Enumerator" user accounts
- **Basic Security Hardening**: Essential security configurations for field deployment

### 6. Quality Control (QC) System
- **Automated Validation**: Post-provisioning verification of installation success
- **File Structure Verification**: Confirmation of proper NPHC folder structure
- **Application Testing**: Validation that core applications are properly installed
- **QC Reporting**: Pass/fail status reporting for each device
- **Error Detection**: Identification of failed provisioning attempts

### 7. Geographic Data Management
- **TPK File Distribution**: Deployment of map tiles and geographic packages
- **District-Based Provisioning**: Assignment of location-specific geographic data
- **Map Package Tracking**: Management of provisioned map files
- **Geographic Code Assignment**: Integration with census enumeration area codes

### 8. Progress Tracking & Reporting
- **Daily Count Tracking**: Real-time count of devices provisioned per day
- **Device Status Monitoring**: Connected device detection and status reporting
- **Provisioning Logs**: Comprehensive logging of provisioning activities
- **CSV Export**: Export of device and user information for reporting
- **Battery Status Monitoring**: Device battery level reporting

### 9. User Interface
- **Tkinter GUI**: User-friendly graphical interface
- **Device Model Selection**: Dropdown menu for tablet model selection
- **Real-time Status Updates**: Live feedback during provisioning process
- **Progress Visualization**: Status messages and completion notifications
- **Logo Branding**: NPHC 2024 census branding integration

### 10. File Management
- **Excel Integration**: Reading and writing of configuration data from Excel files
- **CSV Processing**: Import/export of device and assignment data
- **Document Generation**: Automated creation of asset tags and documentation
- **Backup Management**: Tracking of completed provisioning operations
- **Directory Organization**: Structured file organization for different districts

### 11. Advanced Configuration
- **Bluetooth Settings**: Device identification configuration
- **Display Settings**: Screen orientation and display optimization
- **Storage Management**: Efficient use of device storage space
- **App Data Organization**: Proper folder structure for census applications
- **Permission Automation**: Streamlined permission granting workflows

### 12. Multi-Threading Support
- **Concurrent Processing**: Parallel provisioning of multiple devices
- **Thread Pool Management**: Efficient resource utilization during mass provisioning
- **Error Handling**: Robust error management across multiple device threads
- **Performance Optimization**: Fast provisioning through parallel operations

### 13. Data Integration
- **Geographic Database**: SQLite database integration for location data
- **Assignment Management**: Staff and enumeration area assignment handling
- **Frame Data Processing**: Census frame data integration and management
- **Lookup Table Management**: Reference data deployment and updates

## Technical Architecture

### Dependencies
- **Python 3.10+**: Core runtime environment
- **Tkinter**: GUI framework
- **ADB (Android Debug Bridge)**: Device communication
- **PowerShell**: Device configuration scripting
- **Pillow**: Image processing for barcodes and logos
- **OpenPyXL**: Excel file processing
- **Pytesseract**: OCR capabilities
- **python-docx**: Document generation

### File Structure
- **Main Application**: `threadedADB.py` - Primary GUI interface
- **Core Logic**: `confluxt2training.py` - Device provisioning engine
- **Configuration**: `provisionDeviceType.ps1` - PowerShell provisioning script
- **Data Files**: Excel spreadsheets for geographic and assignment data
- **Applications**: APK files for tablet installation
- **Documentation**: Setup instructions and provisioning guides

## Use Cases

### Census Field Operations
- **Mass Tablet Setup**: Rapid deployment of hundreds of tablets for field teams
- **Standardized Configuration**: Consistent setup across all field devices
- **Quality Assurance**: Verification of proper installation before field deployment
- **Geographic Assignment**: Location-specific data deployment to appropriate devices

### Training & Testing
- **Training Mode**: Special configuration for enumerator training sessions
- **Test Data Deployment**: Installation of practice questionnaires and data
- **Simulation Environment**: Safe testing environment for census procedures

### Post-Enumeration Survey (PES)
- **PES-Specific Setup**: Specialized configuration for survey validation work
- **Targeted Deployment**: Deployment to specific enumeration areas for verification
- **Quality Control**: Enhanced validation for survey accuracy assessment