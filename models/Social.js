const mongoose = require('mongoose');
const FriendshipSchema = new mongoose.Schema({ requester:String, recipient:String, status:{type:String,enum:['pending','accepted','blocked'],default:'pending'}, createdAt:{type:Date,default:Date.now} });
const ReportSchema = new mongoose.Schema({ reporter:String, target:String, roomCode:String, reason:String, status:{type:String,default:'open'}, note:{type:String,default:''}, action:String, resolvedAt:Date, createdAt:{type:Date,default:Date.now} });
const TournamentSchema = new mongoose.Schema({
  name:String, game:String, minPlayers:{type:Number,default:4}, maxPlayers:{type:Number,default:8}, minLevel:{type:Number,default:1},
  players:[String], createdBy:String, startsAt:Date,
  entryFee:{type:Number,default:0},                                  // registration fee in ₦, set by the admin when the tournament is created
  prizes:{type:mongoose.Schema.Types.Mixed,default:null},            // { champion:{coins,xp}, runnerUp:{coins,xp} } set by the admin; null = platform defaults
  status:{type:String,enum:['open','running','done','cancelled'],default:'open'},
  bracket:mongoose.Schema.Types.Mixed, champion:String, runnerUp:String, createdAt:{type:Date,default:Date.now}
});
module.exports={Friendship:mongoose.model('Friendship',FriendshipSchema),Report:mongoose.model('Report',ReportSchema),Tournament:mongoose.model('Tournament',TournamentSchema)};
