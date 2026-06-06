import ssl
import urllib.request
from urllib.error import HTTPError, URLError

urls = [
    'https://api.lever.co/v0/postings/openai?mode=json',
    'https://api.lever.co/v0/postings/google?mode=json',
    'https://boards-api.greenhouse.io/v1/boards/google/jobs?content=true',
    'https://boards-api.greenhouse.io/v1/boards/openai/jobs?content=true',
    'https://boards-api.greenhouse.io/v1/boards/anthropic/jobs?content=true',
]

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

for url in urls:
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'skove-agent/1.0'})
        with urllib.request.urlopen(req, timeout=20, context=ctx) as r:
            data = r.read().decode('utf-8')
            print(url, r.status, data[:200].replace('\n', ' '))
    except HTTPError as e:
        body = e.read().decode('utf-8', errors='ignore')
        print(url, 'HTTP', e.code, body[:200].replace('\n', ' '))
    except URLError as e:
        print(url, 'ERR', e)
