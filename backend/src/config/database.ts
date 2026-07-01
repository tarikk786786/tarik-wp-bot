import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';

export const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }
    
    await mongoose.connect(uri);
    logger.info('Connected to MongoDB');
  } catch (error) {
    logger.error(error, 'MongoDB connection error:');
    process.exit(1);
  }
};
