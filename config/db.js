const mongoose = require('mongoose');

module.exports = async function connectDB() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set. Add it to your .env (local) or your Render environment variables.');
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[db] connected to MongoDB');
};
