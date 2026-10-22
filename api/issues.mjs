import {auth,repos,issues,json} from './_github.mjs'
export default {async fetch(request){
 if(request.method!=='GET')return json({error:'Method not allowed'},405)
 const p=new URL(request.url).searchParams,owner=p.get('owner'),repo=p.get('repo')
 if(!owner||!repo||!/^[a-z\d-]{1,39}$/i.test(owner)||!/^[a-z\d._-]{1,100}$/i.test(repo))return json({error:'Invalid repo'},400)
 try {
  const token=await auth(),allowed=await repos(token)
  if(!allowed.some(x=>x.owner.toLowerCase()===owner.toLowerCase()&&x.name.toLowerCase()===repo.toLowerCase()))return json({error:'Repo not installed'},404)
  return json({issues:await issues(token,owner,repo)})
 } catch(error){console.error('issues:',error.message);return json({error:'GitHub App read failed'},502)}
}}
