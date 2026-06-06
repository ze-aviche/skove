const urls = [
  'https://boards-api.greenhouse.io/v1/boards/google/jobs?content=true',
  'https://boards-api.greenhouse.io/v1/boards/openai/jobs?content=true',
  'https://boards-api.greenhouse.io/v1/boards/anthropic/jobs?content=true',
];

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  Accept: 'application/json, text/plain, */*',
};

(async () => {
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers });
      const text = await res.text();
      console.log(url, res.status, text.slice(0, 300).replace(/\n/g, ' '));
    } catch (err) {
      console.error(url, 'ERR', err);
    }
  }
})();
