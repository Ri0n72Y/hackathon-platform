import { sign } from 'node:crypto'
const b64 = v => Buffer.from(JSON.stringify(v)).toString('base64url')
async function github(path,token,init={}) {
 const response=await fetch('https://api.github.com'+path,{...init,headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',Authorization:'Bearer '+token,...init.headers},signal:AbortSignal.timeout(10000)})
 if(!response.ok) throw Error('GitHub API '+response.status)
 return response.json()
}
export async function auth() {
 const id=process.env.GITHUB_APP_CLIENT_ID||process.env.GITHUB_APP_ID
 const pem=process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g,'\n')
 const installation=process.env.GITHUB_INSTALLATION_ID
 if(!id||!pem||!/^\d+$/.test(installation||'')) throw Error('GitHub App environment incomplete')
 const now=Math.floor(Date.now()/1000)
 const data=b64({alg:'RS256',typ:'JWT'})+'.'+b64({iss:id,iat:now-60,exp:now+540})
 const jwt=data+'.'+sign('RSA-SHA256',Buffer.from(data),pem).toString('base64url')
 const r=await github('/app/installations/'+installation+'/access_tokens',jwt,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({permissions:{issues:'read',metadata:'read'}})})
 return r.token
}
export async function repos(token) {
 const collected=[]
 for(let page=1;page<=5;page++){
  const data=await github('/installation/repositories?per_page=100&page='+page,token)
  collected.push(...data.repositories.filter(r=>!r.private).map(r=>({owner:r.owner.login,name:r.name,full_name:r.full_name})))
  if(data.repositories.length<100)break
 }
 return collected
}
export async function issues(token,owner,repo) {
 const data=await github('/repos/'+encodeURIComponent(owner)+'/'+encodeURIComponent(repo)+'/issues?state=open&per_page=100',token)
 return data.filter(i=>!i.pull_request).map(i=>({number:i.number,title:i.title,html_url:i.html_url,comments:i.comments}))
}
export function json(v,status=200){return Response.json(v,{status,headers:{'Cache-Control':'no-store'}})}
