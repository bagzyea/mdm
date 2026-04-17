// Debug script to test the devices API directly
const axios = require('axios');

async function testDevicesAPI() {
  try {
    console.log('Testing devices API...');
    
    // First, let's try to login to get a token
    const loginResponse = await axios.post('http://localhost:5001/api/auth/login', {
      username: 'admin',
      password: 'admin123'
    });
    
    console.log('Login successful:', loginResponse.data);
    const token = loginResponse.data.token;
    
    // Now test the devices endpoint
    const devicesResponse = await axios.get('http://localhost:5001/api/devices', {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      params: { limit: 100 }
    });
    
    console.log('Devices API Response:');
    console.log('Type:', typeof devicesResponse.data);
    console.log('Data:', JSON.stringify(devicesResponse.data, null, 2));
    
    if (devicesResponse.data.pagination) {
      console.log('Pagination object:', devicesResponse.data.pagination);
      console.log('Total type:', typeof devicesResponse.data.pagination.total);
      console.log('Total value:', devicesResponse.data.pagination.total);
    }
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testDevicesAPI();