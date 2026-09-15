// @vitest-environment node
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {expect,it,vi} from 'vitest';
it('dispatch requires cron authorization, expires invalid endpoints and acknowledges successful sends',async()=>{
 const source=await readFile(new URL('../supabase/functions/send-notifications/index.ts',import.meta.url),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/^import .*;\r?\n/gm,'');
 const jobs=[{delivery_id:'one',lease_token:'l1',mass_id:'m1',title:'Msza',kind:'own',start_time:new Date(Date.now()+1800000).toISOString(),endpoint:'https://fcm.googleapis.com/test',p256dh:'key',auth:'auth'},{delivery_id:'two',lease_token:'l2',mass_id:'m2',title:'Test',kind:'own',start_time:new Date(Date.now()+1800000).toISOString(),endpoint:'https://127.0.0.1/private',p256dh:'key',auth:'auth'}];
 const rpc=vi.fn().mockImplementation(async(name:string)=>({data:name==='claim_push_notifications'?jobs:null,error:null}));
 const send=vi.fn().mockResolvedValue({statusCode:201});
 let handler: (request:Request)=>Promise<Response> = async()=>new Response();
 runInNewContext(js,{Deno:{env:{get:()=> 'secret'},serve:(fn:typeof handler)=>{handler=fn;}},createClient:()=>({rpc}),webpush:{setVapidDetails:vi.fn(),sendNotification:send},Response,URL,Date,Intl});
 expect((await handler(new Request('https://local',{method:'POST'}))).status).toBe(401);
 expect(rpc).not.toHaveBeenCalled();
 const result=await handler(new Request('https://local',{method:'POST',headers:{'x-cron-secret':'secret'}}));
 expect(result.status).toBe(200);expect(send).toHaveBeenCalledOnce();
 const body=JSON.parse(send.mock.calls[0][1]);expect(body.title).toBe('Przypomnienie o Twojej służbie');expect(body.url).toMatch(/^\/\?day=\d{4}-\d{2}-\d{2}#grafik$/);
 expect(rpc).toHaveBeenCalledWith('finish_push_notification',{p_id:'one',p_lease:'l1',p_result:'sent'});
 expect(rpc).toHaveBeenCalledWith('finish_push_notification',{p_id:'two',p_lease:'l2',p_result:'expired'});
});
it('service worker displays push and restricts notification destinations to this origin',async()=>{
 const source=await readFile(new URL('../public/sw.js',import.meta.url),'utf8');
 const handlers:Record<string,(event:unknown)=>void>={};const show=vi.fn().mockResolvedValue(undefined),open=vi.fn().mockResolvedValue(undefined);const pending:Promise<unknown>[]=[];
 runInNewContext(source,{self:{addEventListener:(name:string,fn:typeof handlers[string])=>handlers[name]=fn,location:{origin:'https://parafia.example'},registration:{showNotification:show},clients:{matchAll:async()=>[],openWindow:open}},URL});
 handlers.push({data:{json:()=>({title:'Służba',body:'Msza za 30 minut',tag:'one',url:'/?day=2026-09-15'})},waitUntil:(p:Promise<unknown>)=>pending.push(p)});
 await Promise.all(pending);expect(show).toHaveBeenCalledWith('Służba',expect.objectContaining({body:'Msza za 30 minut',tag:'one'}));
 handlers.notificationclick({notification:{close:vi.fn(),data:{url:'https://foreign.example'}},waitUntil:(p:Promise<unknown>)=>pending.push(p)});
 await Promise.all(pending);expect(open).toHaveBeenCalledWith('https://parafia.example/');
});
