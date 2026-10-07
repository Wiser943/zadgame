// P-Gist: the social feed inside AllConnect (posts, reactions, comments + replies, follows, polls).
const mongoose = require('mongoose');
const { Schema } = mongoose;

const ImageSchema = new Schema({ url: String, thumb: String }, { _id: false });
const PollOption = new Schema({ text: String, votes: { type: Number, default: 0 } }, { _id: false });
const GistPostSchema = new Schema({
  author: { type: String, index: true },
  text: { type: String, default: '' },
  images: { type: [ImageSchema], default: [] },
  game: { key: String, name: String, code: String },   // game reference / room link
  match: { game: String, name: String, score: String, opponent: String, result: String },  // auto-posted match win card
  poll: { options: { type: [PollOption], default: undefined }, endsAt: Date },
  tags: { type: [String], default: [], index: true },  // lowercase hashtags (no #)
  mentions: { type: [String], default: [] },           // user ids mentioned with @username
  sharedFrom: { type: String, default: '' },           // id of the original post when this is a reshare
  likes: { type: Number, default: 0 },                 // total reactions (any type)
  rx: { type: Schema.Types.Mixed, default: {} },       // { like, laugh, fire, sad, wow } counts
  comments: { type: Number, default: 0 },
  shares: { type: Number, default: 0 },
  pinned: { type: Boolean, default: false },
  editedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now, index: true },
});
GistPostSchema.index({ author: 1, createdAt: -1 });
GistPostSchema.index({ 'images.url': 1 });
GistPostSchema.index({ tags: 1, createdAt: -1 });

const GistLikeSchema = new Schema({ post: { type: String, index: true }, user: String, type: { type: String, default: 'like' }, createdAt: { type: Date, default: Date.now } });
GistLikeSchema.index({ post: 1, user: 1 }, { unique: true });
GistLikeSchema.index({ user: 1, post: 1 });

const GistCommentSchema = new Schema({
  post: { type: String, index: true }, author: String, text: String,
  parent: { type: String, default: '' },               // id of the comment this replies to ('' = top level)
  likes: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});
GistCommentSchema.index({ post: 1, createdAt: 1 });

const GistCommentLikeSchema = new Schema({ comment: { type: String, index: true }, user: String, createdAt: { type: Date, default: Date.now } });
GistCommentLikeSchema.index({ comment: 1, user: 1 }, { unique: true });

const GistVoteSchema = new Schema({ post: { type: String, index: true }, user: String, option: Number, createdAt: { type: Date, default: Date.now } });
GistVoteSchema.index({ post: 1, user: 1 }, { unique: true });

const GistFollowSchema = new Schema({ follower: String, following: String, createdAt: { type: Date, default: Date.now } });
GistFollowSchema.index({ follower: 1, following: 1 }, { unique: true });
GistFollowSchema.index({ following: 1, createdAt: -1 });

module.exports = {
  GistPost: mongoose.model('GistPost', GistPostSchema),
  GistLike: mongoose.model('GistLike', GistLikeSchema),
  GistComment: mongoose.model('GistComment', GistCommentSchema),
  GistCommentLike: mongoose.model('GistCommentLike', GistCommentLikeSchema),
  GistVote: mongoose.model('GistVote', GistVoteSchema),
  GistFollow: mongoose.model('GistFollow', GistFollowSchema),
};
