import {Context} from '@deepseek-ai/cordis'
import {reactUI} from '../../../plugins/react-ui/src/index'
import {createRepoIssues} from '../../../plugins/repo-issues/src/index'
import {RepoPanel} from '../../../plugins/repo-panel/src/index'
export async function startRuntime(){
 const ctx=new Context(),service=createRepoIssues()
 await ctx.plugin({name:'repo-panel',apply(c:Context){c.effect(()=>reactUI.register('repo-panel',()=> <RepoPanel service={service}/>))}})
 void service.refresh()
 return ()=>ctx.dispose()
}
