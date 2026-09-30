import fs from 'node:fs';
import path from 'node:path';
const destination=process.argv[2];
if(!destination)throw new Error('Provide a private output directory outside the repository');
const keys=['SITE_ROOT','ASSET_ROOT','SITE_SNIPPET','TLS_ME_CERT','TLS_ME_KEY','TLS_CN_CERT','TLS_CN_KEY','ACME_ROOT'];
const values=Object.fromEntries(keys.map(key=>{const value=process.env[key];if(!value||!/^\/[a-zA-Z0-9_./-]+$/.test(value)||value.split('/').includes('..'))throw new Error(`Invalid or missing ${key}`);return[key,value];}));
fs.mkdirSync(destination,{recursive:true,mode:0o700});
for(const name of ['nginx-https.conf','ddb-tools-site.conf']){
  const template=fs.readFileSync(new URL(name,import.meta.url),'utf8');
  const rendered=template.replace(/\$\{([A-Z_]+)\}/g,(_,key)=>{if(!(key in values))throw new Error(`Unknown setting ${key}`);return values[key];});
  fs.writeFileSync(path.join(destination,name),rendered,{mode:0o600});
}
