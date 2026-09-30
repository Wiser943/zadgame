const mongoose = require('mongoose');
const FriendshipSchema = new mongoose.Schema({ requester:String, recipient:String, status:{type:String,enum:['pending','accepted','blocked'],default:'pending'}, createdAt:{type:Date,default:Date.now} });
const ReportSchema = new mongoose.Schema({ reporter:String, target:String, roomCode:String, reason:String, status:{type:String,default:'open'}, createdAt:{type:Date,default:Date.now} });
const TournamentSchema = new mongoose.Schema({ name:String, game:String, maxPlayers:{type:Number,default:8}, players:[String], status:{type:String,default:'open'}, bracket:mongoose.Schema.Types.Mixed, createdAt:{type:Date,default:Date.now} });
module.exports={Friendship:mongoose.model('Friendship',FriendshipSchema),Report:mongoose.model('Report',ReportSchema),Tournament:mongoose.model('Tournament',TournamentSchema)};
