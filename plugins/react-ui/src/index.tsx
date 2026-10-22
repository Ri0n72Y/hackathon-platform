import {useSyncExternalStore} from 'react'
import type {ComponentType} from 'react'
const registry=new Map<string,ComponentType>(),listeners=new Set<()=>void>()
let snapshot:ComponentType[]=[]
const publish=()=>{snapshot=[...registry.values()];listeners.forEach(fn=>fn())}
export const reactUI={register(id:string,View:ComponentType){if(registry.has(id))throw Error('duplicate UI');registry.set(id,View);publish();return ()=>{registry.delete(id);publish()}}}
export function App(){const items=useSyncExternalStore(fn=>{listeners.add(fn);return ()=>listeners.delete(fn)},()=>snapshot);return <main>{items.map((View,i)=><View key={i}/>)}</main>}
