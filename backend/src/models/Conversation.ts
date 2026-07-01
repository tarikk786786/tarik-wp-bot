import mongoose, { Schema, Document } from 'mongoose';

export interface IConversation extends Document {
  contactId: mongoose.Types.ObjectId;
  messages: Array<{
    role: 'system' | 'human' | 'ai';
    content: string;
    timestamp: Date;
    messageId?: string;
  }>;
  status: 'active' | 'archived';
  summary?: string;
  metadata: Record<string, any>;
}

const ConversationSchema: Schema = new Schema({
  contactId: { type: Schema.Types.ObjectId, ref: 'ContactProfile', required: true, index: true },
  messages: [{
    role: { type: String, enum: ['system', 'human', 'ai'], required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    messageId: { type: String }
  }],
  status: { type: String, enum: ['active', 'archived'], default: 'active' },
  summary: { type: String },
  metadata: { type: Schema.Types.Mixed, default: {} }
}, {
  timestamps: true
});

export const Conversation = mongoose.model<IConversation>('Conversation', ConversationSchema);
