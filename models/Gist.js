// P-Gist: the social feed inside AllConnect (posts, likes, comments, follows).
const mongoose = require('mongoose');
const { Schema } = mongoose;

const ImageSchema = new Schema({ url: String, thumb: String }, { _id: false });
const GistPostSchema = new Schema({
  author: { type: String, index: true },
  text: { type: String, default: '' },
  images: { type: [ImageSchema], default: [] },
  game: { key: String, name: String, code: String },   // game reference / room link
  sharedFrom: { type: String, default: '' },           // id of the original post when this is a reshare
  likes: { type: Number, default: 0 },
  comments: { type: Number, default: 0 },
  shares: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now, index: true },
});
GistPostSchema.index({ author: 1, createdAt: -1 });
GistPostSchema.index({ 'images.url': 1 });

const GistLikeSchema = new Schema({ post: { type: String, index: true }, user: String, createdAt: { type: Date, default: Date.now } });
GistLikeSchema.index({ post: 1, user: 1 }, { unique: true });
GistLikeSchema.index({ user: 1, post: 1 });

const GistCommentSchema = new Schema({ post: { type: String, index: true }, author: String, text: String, createdAt: { type: Date, default: Date.now } });
GistCommentSchema.index({ post: 1, createdAt: 1 });

const GistFollowSchema = new Schema({ follower: String, following: String, createdAt: { type: Date, default: Date.now } });
GistFollowSchema.index({ follower: 1, following: 1 }, { unique: true });
GistFollowSchema.index({ following: 1, createdAt: -1 });

module.exports = {
  GistPost: mongoose.model('GistPost', GistPostSchema),
  GistLike: mongoose.model('GistLike', GistLikeSchema),
  GistComment: mongoose.model('GistComment', GistCommentSchema),
  GistFollow: mongoose.model('GistFollow', GistFollowSchema),
};
