import {test} from 'node:test';
import assert from 'node:assert/strict';
import {native,buildSubmitRequest,buildQueryRequest,parseTaskResult,extractUsage,extractUsageOnComplete,parseSubmitResponse} from './plugin.js';
const model='dreamina-seedance-2-0-fast-260128';
const decode=b=>({body:{kind:'json',value:b}});
const video={model,content:[{type:'text',text:'A blue cube on a white table'}],duration:4,resolution:'480p',generate_audio:false,watermark:false,seed:0};
test('duration bounds, passthrough isolation and explicit zero/false',()=>{
 for(const duration of [0,-2,16,Infinity,1e30,'4']) assert.throws(()=>native.createVideo(decode({...video,duration})));
 const intent=native.createVideo(decode({...video,metadata:{duration:1e30},frames:1e30}));
 const sent=buildSubmitRequest({...intent,apiKey:'fixture',baseUrl:'https://vendor.test',upstreamModel:model});
 assert.equal(sent.url,'https://vendor.test/api/v1/contents/generations/tasks');
 assert.equal(sent.body.generate_audio,false); assert.equal(sent.body.watermark,false); assert.equal(sent.body.seed,0);
 assert.equal(sent.body.metadata,undefined); assert.equal(sent.body.frames,undefined);
 assert.ok(extractUsage({...intent,usagePurpose:'facts'}).tokens>0);
});
test('asset handles require host-resolved owned active origins',()=>{
 const b={...video,content:[{type:'image_url',image_url:{url:'asset://task_owned'}}]};
 const intent=native.createVideo(decode(b));assert.deepEqual(intent.originTaskIds,['task_owned']);
 assert.throws(()=>buildSubmitRequest({...intent,originTasks:[],baseUrl:'https://vendor.test'}),/available owned/);
 const ctx={...intent,baseUrl:'https://vendor.test',originTasks:[{taskId:'task_owned',upstreamTaskId:'asset-123',status:'SUCCESS',action:'asset'}]};
 assert.equal(buildSubmitRequest(ctx).body.content[0].image_url.url,'asset://asset-123');
 assert.throws(()=>native.createVideo(decode({...video,content:[{type:'image_url',image_url:{url:'asset://asset-123'}}]})),/gateway/);
 assert.throws(()=>buildSubmitRequest({...ctx,originTasks:[{...ctx.originTasks[0],status:'IN_PROGRESS'}]}),/available owned/);
});
test('group creation and asset polling keep project server controlled',()=>{
 const ctx={...native.createGroup(decode({Name:'test',ProjectName:'foreign'})),baseUrl:'https://vendor.test',config:{projectName:'test-project'},apiKey:'fixture'};
 assert.equal(buildSubmitRequest(ctx).body.ProjectName,'test-project');
 assert.equal(parseSubmitResponse(ctx,{body:{Id:'group-123'}}).immediate.status,'SUCCESS');
 const q=buildQueryRequest({action:'asset',baseUrl:'https://vendor.test',taskId:'asset-123',config:{projectName:'test-project'}});
 assert.equal(q.body.Id,'asset-123');assert.equal(q.body.ProjectName,'test-project');
 assert.equal(parseTaskResult({action:'asset'},{Status:'Active'}).status,'SUCCESS');
 assert.equal(parseTaskResult({action:'asset'},{Status:'Processing'}).status,'IN_PROGRESS');
 assert.equal(parseTaskResult({action:'asset'},{Status:'Failed'}).status,'FAILURE');
 assert.equal(parseTaskResult({action:'asset'},{Status:'future'}).status,'UNKNOWN');
});
test('edit envelopes require both operator and generation success',()=>{
 assert.equal(parseTaskResult({action:'edit'},{metadata:{task_status:'COMPLETED',business_code:'0'},data:{status:'running'}}).status,'IN_PROGRESS');
 assert.equal(parseTaskResult({action:'edit'},{metadata:{task_status:'COMPLETED',business_code:'0'},data:{status:'succeeded',content:{video_url:'https://video.test/a.mp4'}}}).status,'SUCCESS');
 assert.equal(parseTaskResult({action:'edit'},{metadata:{task_status:'FAILED',business_code:'1'}}).status,'FAILURE');
 assert.equal(parseTaskResult({action:'video'},{status:'new_state'}).status,'UNKNOWN');
 assert.equal(parseTaskResult({action:'video'},{status:'failed',error:{message:'provider failure'}}).reason,'provider failure');
});
test('settlement uses bounded authoritative token usage and does not invent missing usage',()=>{
 for(const tokens of [-1,1.5,Infinity,1e30]) assert.deepEqual(extractUsageOnComplete({action:'video'},{},{status:'succeeded',usage:{total_tokens:tokens}}),{});
 assert.deepEqual(extractUsageOnComplete({action:'video'},{},{status:'succeeded',usage:{total_tokens:123}}),{tokens:123});
 assert.deepEqual(extractUsageOnComplete({action:'video'},{},{status:'succeeded',usage:{total_tokens:0}}),{tokens:0});
 assert.deepEqual(extractUsageOnComplete({action:'video'},{},{status:'succeeded'}),{});
});

test('native asset queries present platform handles without upstream ids',()=>{
 const task={task_id:'task_owned',status:'SUCCESS',data:{Id:'Asset-private',Status:'Active'}};
 const output=native.status({path:'/las/assets/task_owned'},task);
 assert.equal(output.asset_url,'asset://task_owned');assert.equal(output.asset_status,'Active');assert.equal(output.Id,undefined);
 assert.deepEqual(native.created({},task),{id:'task_owned',status:'SUCCESS'});
});
