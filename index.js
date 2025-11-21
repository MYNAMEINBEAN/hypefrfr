import axios from 'axios';
import generate from './genAPI.js';

const response = await axios.post(
  'https://engine.hyperbeam.com/v0/vm',
  {}, // body (empty)
  {
    headers: {
      Authorization: 'Bearer sk_test_rO6U3OvD0WlW-0_NvoMtcORxwapPGOScTDCeTjqMK4A',
      'Content-Type': 'application/json'
    },
    validateStatus: () => true
  }
);

console.log(response.data);
setInterval((async () => {
  await generate();
}), 1000);