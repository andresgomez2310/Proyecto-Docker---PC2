import mongoose from "mongoose";

const mongoUri = process.env.MONGO_URI;
const collectionName = process.env.COLLECTION;

mongoose.connect(mongoUri)
  .then(() => console.log(`✅ Conectado a MongoDB - Colección: ${collectionName}`))
  .catch(err => console.error("❌ Error:", err));
