export type Repo={owner:string;name:string;full_name:string}
export type Issue={number:number;title:string;html_url:string;comments:number}
export type State={repos:Repo[];selected:string;issues:Issue[];loading:boolean;error:string}
export interface RepoIssues{getSnapshot():State;subscribe(fn:()=>void):()=>void;refresh():Promise<void>;select(repo:string):Promise<void>}
export function createRepoIssues():RepoIssues{
 const listeners=new Set<()=>void>();let revision=0
 let state:State={repos:[],selected:'',issues:[],loading:true,error:''}
 const publish=(next:State)=>{state=next;listeners.forEach(fn=>fn())}
 const read=async(url:string)=>{const r=await fetch(url);const body=await r.json();if(!r.ok)throw Error(body.error||'HTTP '+r.status);return body}
 async function select(fullName:string){const repo=state.repos.find(r=>r.full_name===fullName);if(!repo)return;const current=++revision;publish({...state,selected:fullName,loading:true,error:'',issues:[]});try{const data=await read('/api/issues?owner='+encodeURIComponent(repo.owner)+'&repo='+encodeURIComponent(repo.name));if(current===revision)publish({...state,issues:data.issues,loading:false})}catch(e){if(current===revision)publish({...state,loading:false,error:String(e)})}}
 async function refresh(){const current=++revision;publish({...state,loading:true,error:''});try{const data=await read('/api/repos');if(current!==revision)return;const list:Repo[]=data.repositories;const selected=list.some(r=>r.full_name===state.selected)?state.selected:(list[0]?.full_name||'');publish({...state,repos:list,selected,issues:[],loading:false});if(selected)await select(selected)}catch(e){if(current===revision)publish({...state,loading:false,error:String(e)})}}
 return {getSnapshot:()=>state,subscribe:fn=>{listeners.add(fn);return ()=>listeners.delete(fn)},select,refresh}
}
