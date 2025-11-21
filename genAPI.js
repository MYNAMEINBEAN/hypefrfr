import { makeTempEmail } from './tempMail.js';
import axios from "axios";
import * as cheerio from "cheerio";
function setCookieToCookieHeader(setCookieHeaders) {
  const headers = Array.isArray(setCookieHeaders)
    ? setCookieHeaders
    : [setCookieHeaders];

  const cookies = headers
    .map(h => h.split(';')[0].trim()) // keep only "name=value"
    .join('; ');

  return cookies;
}

async function generate() {
  const sesh = await makeTempEmail();
  const resp = await axios.post(
  'https://engine.hyperbeam.com/auth/signinup/code',
  {
    'email': sesh.address
  },
  {
    headers: {
      'accept': '*/*',
      'accept-language': 'en-US,en;q=0.9',
      'content-type': 'application/json',
      'fdi-version': '1.8,1.9,1.10,1.11,1.12,1.13',
      'origin': 'https://hyperbeam.com',
      'priority': 'u=1, i',
      'referer': 'https://hyperbeam.com/',
      'rid': 'thirdpartypasswordless',
      'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-site',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
    }
  }
);
var cachedResp = resp.data;
  sesh.onEmail(async (e) => {
    if(e.subject.includes("Login to your account")){
        const code = cheerio.load(e.body)('div[style*="font-size:32px"]').text().trim();
        const response1 = await axios.post(
  'https://engine.hyperbeam.com/auth/signinup/code/consume',
  {
    'userInputCode': code,
    'deviceId': cachedResp.deviceId,
    'preAuthSessionId': cachedResp.preAuthSessionId
  },
  {
    headers: {
      'accept': '*/*',
      'accept-language': 'en-GB,en;q=0.9',
      'content-type': 'application/json',
      'fdi-version': '1.8,1.9,1.10,1.11,1.12,1.13',
      'origin': 'https://hyperbeam.com',
      'priority': 'u=1, i',
      'referer': 'https://hyperbeam.com/',
      'rid': 'thirdpartypasswordless',
      'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-site',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
    }
  }
);
console.log(setCookieToCookieHeader(response1.headers['set-cookie']));
        const response2 = await axios.post(
  'https://engine.hyperbeam.com/dashboard/keys',
  {
    'test': true
  },
  {
    headers: {
      'accept-language': 'en-US,en;q=0.9',
      'origin': 'https://hyperbeam.com',
      'priority': 'u=1, i',
      'referer': 'https://hyperbeam.com/',
      'rid': 'anti-csrf',
      'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-site',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
      'cookie': setCookieToCookieHeader(response1.headers['set-cookie'])
    },
    validateStatus: () => true
  }
);
console.log(response2.data);
console.log(response2.headers);
    }
  });
}

export default generate;