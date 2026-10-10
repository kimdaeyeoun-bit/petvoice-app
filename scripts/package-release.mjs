import {spawnSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
mkdirSync(path.join(root,'dist'),{recursive:true});
const result=spawnSync('python',['-c',`
from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
root=Path('.')
with ZipFile('dist/LUMINA-render-source.zip','w',ZIP_DEFLATED) as z:
 for name in ['server.mjs','studio-api.mjs','business-api.mjs','business-core.mjs','package.json','package-lock.json','render.yaml','open-preview.bat','open-preview.command','README.md','DEPLOY.md','.gitignore','public','scripts','test']:
  p=root/name
  if p.is_file(): z.write(p, 'lumina/'+str(p))
  else:
   for f in sorted(p.rglob('*')):
    if f.is_file(): z.write(f,'lumina/'+str(f))
with ZipFile('dist/LUMINA-preview.zip','w',ZIP_DEFLATED) as z:
 z.write('preview/LUMINA-preview.html','LUMINA-preview.html')
 z.write('DEPLOY.md','READ-ME.md')
print('Created source ZIP and standalone preview ZIP; no user data, dependencies or .git metadata included.')
`],{cwd:root,stdio:'inherit'});
process.exitCode=result.status??1;
