// config/database.js
import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/universities";

let isConnected = false;
let connectionPromise = null;

export async function connectDB() {
  if (isConnected) {
    console.log('✅ Using existing MongoDB connection');
    return;
  }

  // Prevent multiple connection attempts
  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
    .then((conn) => {
      isConnected = true;
      console.log("✅ MongoDB connected successfully");
      return conn;
    })
    .catch((err) => {
      console.error("❌ MongoDB connection error:", err);
      connectionPromise = null;
      isConnected = false;
      throw err;
    });

  return connectionPromise;
}

export async function disconnectDB() {
  if (!isConnected) return;
  
  await mongoose.disconnect();
  isConnected = false;
  connectionPromise = null;
  console.log('✅ MongoDB disconnected');
}

export function getConnectionStatus() {
  return {
    isConnected,
    readyState: mongoose.connection.readyState,
    host: mongoose.connection.host,
    name: mongoose.connection.name
  };
}

// Optional: Handle connection events
mongoose.connection.on('connected', () => {
  console.log('✅ Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️ Mongoose disconnected from MongoDB');
  isConnected = false;
  connectionPromise = null;
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  await disconnectDB();
  process.exit(0);
});