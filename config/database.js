// config/database.js
import mongoose from 'mongoose';

// ONLY use environment variable, no hardcoded strings
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://learnFirstAdmin:mT4aOUQ8IeZlGqf6@khareedofrokht.h4nje.mongodb.net/universities?retryWrites=true&w=majority&appName=khareedofrokht";

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI environment variable is not defined');
}

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

  console.log('🔗 Connecting to MongoDB...');

  connectionPromise = mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 30000, // 30 seconds
    socketTimeoutMS: 45000, // 45 seconds
  })
    .then((conn) => {
      isConnected = true;
      console.log("✅ MongoDB connected successfully");
      console.log(`📊 Database: ${conn.connection.name}`);
      console.log(`🏠 Host: ${conn.connection.host}`);
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
  const status = {
    isConnected,
    readyState: mongoose.connection.readyState,
    host: mongoose.connection.host || 'Unknown',
    name: mongoose.connection.name || 'Unknown'
  };
  
  console.log('🔍 Current DB status:', status);
  return status;
}

// Connection event handlers
mongoose.connection.on('connected', () => {
  console.log('✅ Mongoose connected to MongoDB');
  isConnected = true;
});

mongoose.connection.on('error', (err) => {
  console.error('❌ Mongoose connection error:', err);
  isConnected = false;
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