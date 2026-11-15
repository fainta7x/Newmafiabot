from pathlib import Path
import subprocess,json,urllib.request,gzip,time
name='noire-static-perf-check'
asset=next(Path('dist/assets').glob('index-*.js'))
prefix=Path('deploy/nginx.conf').read_text().split('    server {',1)[0].replace('pid /tmp/nginx.pid;', 'pid /var/run/nginx.pid;')
conf=prefix+'    server { listen 8080; root /usr/share/nginx/html; location / { try_files $uri =404; } }\n}\n'
subprocess.run(['docker','run','--rm','-d','--name',name,'-p','127.0.0.1::8080','nginx:alpine'],check=True,stdout=subprocess.DEVNULL)
try:
 subprocess.run(['docker','exec','-i',name,'sh','-c','cat > /etc/nginx/nginx.conf'],input=conf.encode(),check=True)
 subprocess.run(['docker','cp',str(asset),name+':/usr/share/nginx/html/app.js'],check=True,stdout=subprocess.DEVNULL)
 subprocess.run(['docker','exec',name,'chmod','644','/usr/share/nginx/html/app.js'],check=True)
 subprocess.run(['docker','exec',name,'nginx','-s','reload'],check=True,stdout=subprocess.DEVNULL)
 address=subprocess.check_output(['docker','port',name,'8080/tcp'],text=True).strip()
 opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
 for attempt in range(30):
  try:
   with opener.open(urllib.request.Request('http://'+address+'/app.js',headers={'Accept-Encoding':'gzip'}),timeout=3) as r:payload=r.read();headers=dict(r.headers)
   break
  except Exception:
   if attempt==29:raise
   time.sleep(.1)
 assert headers.get('Content-Encoding')=='gzip',headers
 assert gzip.decompress(payload)==asset.read_bytes()
 result={'asset':asset.name,'identity_bytes':asset.stat().st_size,'gzip_bytes':len(payload),'reduction_percent':round((1-len(payload)/asset.stat().st_size)*100,1),'content_encoding':headers.get('Content-Encoding'),'vary':headers.get('Vary')}
 Path('static-delivery-measurement.json').write_text(json.dumps(result,indent=2))
 print(json.dumps(result))
finally:subprocess.run(['docker','rm','-f',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
