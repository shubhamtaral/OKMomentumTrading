const axios = require('axios');

async function test() {
  try {
    const res = await axios.post('http://localhost:3001/scan/single', { symbol: 'RELIANCE.NS' });
    console.log('Status:', res.status);
    console.log('Data:', JSON.stringify(res.data, null, 2));
  } catch (err) {
    if (err.response) {
      console.log('Error Status:', err.response.status);
      console.log('Error Data:', JSON.stringify(err.response.data, null, 2));
    } else {
      console.log('Error:', err.message);
    }
  }
}

test();
