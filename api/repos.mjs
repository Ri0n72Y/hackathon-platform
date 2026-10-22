import {auth,repos,json} from './_github.mjs'
export default {async fetch(request) {
 if(request.method!=='GET')return json({error:'Method not allowed'},405)
 try {return json({repositories:await repos(await auth())})}
 catch(error){console.error('repos:',error.message);return json({error:'GitHub App read failed'},502)}
}}
