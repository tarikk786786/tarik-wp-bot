import mongoose, { Schema, Document } from 'mongoose';

export interface IMemory extends Document {
  contactId: mongoose.Types.ObjectId;
  content: string;
  source: 'whatsapp' | 'system' | 'user';
  importance: number; // 1-10 scale
  vector: number[]; // For embedding/vector search
  metadata: {
    messageId?: string;
    topic?: string;
    sentiment?: string;
    timestamp: Date;
  };
}

const MemorySchema: Schema = new Schema({
  contactId: { type: Schema.Types.ObjectId, ref: 'ContactProfile', required: true, index: true },
  content: { type: String, required: true },
  source: { type: String, enum: ['whatsapp', 'system', 'user'], default: 'whatsapp' },
  importance: { type: Number, default: 5 },
  vector: { type: [Number] },
  metadata: {
    messageId: { type: String },
    topic: { type: String },
    sentiment: { type: String },
    timestamp: { type: Date, default: Date.now }
  }
}, {
  timestamps: true
});

export const Memory = mongoose.model<IMemory>('Memory', MemorySchema);
