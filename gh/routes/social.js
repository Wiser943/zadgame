const express=require('express');
const ensureAuth=require('../middleware/auth');
const User=require('../models/User');
const {Friendship,Report}=require('../models/Social');
const presence=require('../utils/presence');
const ChallengeProgress=require('../models/Challenge');
const challenges=require('../utils/challenges');
const Match=require('../models/Match');
const {rankFor}=require('../utils/rank');
const {achievementsFor}=require('../utils/achievements');
const router=express.Router(); router.use(ensureAuth);
const uid=req=>String(req.user._id||req.user.id);

const pub=(u)=>({id:String(u._id),displayName:u.displayName,avatar:u.avatar,level:u.level||1,stats:u.stats||{},online:presence.isOnline(u._id)});
router.get('/friends',async(req,res,next)=>{try{
  const me=uid(req);
  const rows=await Friendship.find({$or:[{requester:me},{recipient:me}]}).lean();
  const otherOf=x=>x.requester===me?x.recipient:x.requester;
  const ids=[...new Set(rows.map(otherOf))];
  const users=await User.find({_id:{$in:ids}}).select('displayName avatar stats level').lean();
  const byId=new Map(users.map(u=>[String(u._id),pub(u)]));
  const pick=f=>rows.filter(f).map(x=>byId.get(otherOf(x))).filter(Boolean);
  res.json({
    friends:pick(x=>x.status==='accepted').sort((a,b)=>(b.online-a.online)||a.displayName.localeCompare(b.displayName)),
    incoming:pick(x=>x.status==='pending'&&x.recipient===me),
    outgoing:pick(x=>x.status==='pending'&&x.requester===me),
    blocked:pick(x=>x.status==='blocked'&&x.requester===me)
  });
}catch(e){next(e);}});
router.get('/search',async(req,res,next)=>{try{
  const me=uid(req),q=String(req.query.q||'').trim().slice(0,30);
  if(q.length<2)return res.json({users:[]});
  const safe=q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const rows=await Friendship.find({$or:[{requester:me},{recipient:me}]}).lean();
  const hidden=new Set([me,...rows.filter(x=>x.status==='blocked').map(x=>x.requester===me?x.recipient:x.requester)]);
  const state=new Map(rows.filter(x=>x.status!=='blocked').map(x=>[x.requester===me?x.recipient:x.requester,x.status==='accepted'?'friend':(x.requester===me?'sent':'received')]));
  const users=await User.find({displayName:{$regex:safe,$options:'i'}}).select('displayName avatar stats level').limit(15).lean();
  res.json({users:users.filter(u=>!hidden.has(String(u._id))).map(u=>({...pub(u),relation:state.get(String(u._id))||'none'}))});
}catch(e){next(e);}});
router.get('/challenges',async(req,res,next)=>{try{
  const day=challenges.today();
  const row=await ChallengeProgress.findOne({userId:uid(req),day}).lean();
  const prog=row?.progress||{};
  res.json({day,challenges:challenges.CHALLENGES.map(c=>({id:c.id,title:c.title,target:c.target,reward:c.reward,progress:Math.min(c.target,Number(prog[c.stat]||0)),claimed:!!row?.claimed?.includes(c.id)}))});
}catch(e){next(e);}});
router.post('/challenges/:id/claim',async(req,res,next)=>{try{
  const c=challenges.find(String(req.params.id));
  if(!c)return res.status(404).json({message:'Challenge not found.'});
  const day=challenges.today(),me=uid(req);
  // Atomic: only succeeds if the target is reached AND it was not already claimed (no double-claim on rapid taps).
  const row=await ChallengeProgress.findOneAndUpdate(
    {userId:me,day,['progress.'+c.stat]:{$gte:c.target},claimed:{$ne:c.id}},
    {$addToSet:{claimed:c.id}},{new:true});
  if(!row)return res.status(409).json({message:'Not completed yet, or already claimed.'});
  const u=await User.findByIdAndUpdate(me,{$inc:{coins:c.reward,xp:5}},{new:true});
  res.json({reward:c.reward,coins:u.coins});
}catch(e){next(e);}});

router.get('/dashboard',async(req,res,next)=>{try{
  const me=uid(req);
  const [u,rows,recent]=await Promise.all([
    User.findById(me).select('xp level rating winStreak bestStreak stats gameRatings gameGames tournamentWins').lean(),
    Friendship.find({status:'accepted',$or:[{requester:me},{recipient:me}]}).lean(),
    Match.find({'players.userId':me}).sort({createdAt:-1}).limit(3).select('game players winnerIndex createdAt').lean()
  ]);
  const friendIds=rows.map(x=>x.requester===me?x.recipient:x.requester);
  const xp=u?.xp||0;
  res.json({
    level:u?.level||1,xpInLevel:xp%100,xpForNext:100,
    winStreak:u?.winStreak||0,bestStreak:u?.bestStreak||0,
    rank:rankFor(u?.rating),tournamentWins:u?.tournamentWins||0,
    ratings:Object.entries(u?.gameRatings||{}).map(([game,rating])=>({game,rating,games:(u?.gameGames||{})[game]||0,tier:rankFor(rating).tier,placement:((u?.gameGames||{})[game]||0)<10})),
    friendsOnline:friendIds.filter(id=>presence.isOnline(id)).length,friendsTotal:friendIds.length,
    recent:recent.map(m=>{const i=m.players.findIndex(p=>String(p.userId)===me);return{game:m.game,result:m.winnerIndex==null?'draw':m.winnerIndex===i?'win':'loss',at:m.createdAt};})
  });
}catch(e){next(e);}});
router.get('/achievements',async(req,res,next)=>{try{
  const u=await User.findById(uid(req)).select('stats bestStreak tournamentWins').lean();
  res.json({achievements:achievementsFor(u||{})});
}catch(e){next(e);}});
router.get('/relation/:id',async(req,res,next)=>{try{
  const me=uid(req),other=String(req.params.id);
  const row=await Friendship.findOne({$or:[{requester:me,recipient:other},{requester:other,recipient:me}]}).lean();
  let relation='none';
  if(row){ if(row.status==='accepted')relation='friend'; else if(row.status==='blocked')relation=row.requester===me?'blocked':'none'; else relation=row.requester===me?'sent':'received'; }
  res.json({relation});
}catch(e){next(e);}});
router.post('/friends/:id/request',async(req,res,next)=>{try{const me=uid(req),other=String(req.params.id);if(me===other)return res.status(400).json({message:'You cannot add yourself.'});if(await Friendship.exists({requester:other,recipient:me,status:'blocked'}))return res.status(403).json({message:'You cannot send this request.'});const row=await Friendship.findOneAndUpdate({$or:[{requester:me,recipient:other},{requester:other,recipient:me}]},{$setOnInsert:{requester:me,recipient:other,status:'pending'}},{upsert:true,new:true});res.json({friendship:row});}catch(e){next(e);}});
router.post('/friends/:id/accept',async(req,res,next)=>{try{const row=await Friendship.findOneAndUpdate({requester:String(req.params.id),recipient:uid(req),status:'pending'},{$set:{status:'accepted'}},{new:true});if(!row)return res.status(404).json({message:'Request not found.'});res.json({friendship:row});}catch(e){next(e);}});
router.delete('/friends/:id',async(req,res,next)=>{try{await Friendship.deleteMany({$or:[{requester:uid(req),recipient:String(req.params.id)},{requester:String(req.params.id),recipient:uid(req)}]});res.json({ok:true});}catch(e){next(e);}});
router.post('/block/:id',async(req,res,next)=>{try{await Friendship.deleteMany({$or:[{requester:String(req.params.id),recipient:uid(req)},{requester:uid(req),recipient:String(req.params.id),status:{$ne:'blocked'}}]});await Friendship.findOneAndUpdate({requester:uid(req),recipient:String(req.params.id)},{$set:{status:'blocked'}},{upsert:true});res.json({ok:true});}catch(e){next(e);}});
router.post('/report',async(req,res,next)=>{try{const target=String(req.body?.target||'');if(!target)return res.status(400).json({message:'Target is required.'});const report=await Report.create({reporter:uid(req),target,roomCode:String(req.body?.roomCode||'').slice(0,8),reason:String(req.body?.reason||'Unspecified').slice(0,240)});res.json({reportId:report.id});}catch(e){next(e);}});
module.exports=router;
