// Simple test script for enrollment code generation
const axios = require('axios');

// First, let's try to authenticate
async function testEnrollmentFlow() {
  try {
    console.log('🔐 Testing enrollment code generation...');
    
    // Try to login first to get a token
    const loginResponse = await axios.post('http://localhost:5001/api/auth/login', {
      username: 'admin',
      password: 'admin123' // default admin password
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Login successful, got token');
    
    // Now try to generate enrollment code
    const enrollmentResponse = await axios.post('http://localhost:5001/api/devices/enrollment-code', {}, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Enrollment code generated:', enrollmentResponse.data);
    
    // Test enrollment with the code
    console.log('🔄 Testing device enrollment...');
    
    const deviceInfo = {
      deviceId: 'test-device-' + Date.now(),
      manufacturer: 'Samsung',
      model: 'Galaxy Tab',
      osVersion: '13',
      apiLevel: 33,
      batteryLevel: 85,
      isCharging: false
    };
    
    const enrollmentRequest = {
      deviceInfo: deviceInfo,
      enrollmentCode: enrollmentResponse.data.code
    };
    
    // Test enrollment (this doesn't need auth token as it's device-side)
    const enrollResponse = await axios.post('http://localhost:5001/api/devices/enroll', enrollmentRequest);
    
    console.log('✅ Device enrollment successful:', enrollResponse.data);
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      console.log('💡 Try checking the admin credentials in backend/src/scripts/createEnvAdmin.ts');
    }
  }
}

testEnrollmentFlow();