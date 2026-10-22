import {useSyncExternalStore} from 'react'
import type {RepoIssues} from '../../repo-issues/src/index'
export function RepoPanel({service}:{service:RepoIssues}){
 const s=useSyncExternalStore(service.subscribe,service.getSnapshot)
 return <div className="shell"><header><h1>LabourChain · Issues</h1><button disabled={s.loading} onClick={()=>void service.refresh()}>刷新</button></header><p>已安装授权的公开 GitHub 仓库（只读）</p>
 <label>仓库 <select value={s.selected} disabled={s.loading||!s.repos.length} onChange={e=>void service.select(e.target.value)}><option value="">选择仓库</option>{s.repos.map(r=><option key={r.full_name} value={r.full_name}>{r.full_name}</option>)}</select></label>
 {s.loading&&<p role="status">加载中…</p>}{s.error&&<p role="alert">读取失败：{s.error}</p>}
 {!s.loading&&!s.error&&<><h2>Open Issues ({s.issues.length})</h2><ul>{s.issues.map(i=><li key={i.number}><span>#{i.number}</span><a href={i.html_url} target="_blank" rel="noreferrer">{i.title}</a><small>{i.comments} comments</small></li>)}</ul>{!s.issues.length&&<p>暂无 Issue。</p>}</>}
 <footer>这是 GitHub App 安装权限的读取验证，不是用户 OAuth 登录。</footer></div>
}
