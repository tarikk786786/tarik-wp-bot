import mongoose, { Schema, Document } from 'mongoose';

export interface IContactProfile extends Document {
  phoneNumber: string;
  name?: string;
  isVIP: boolean;
  mode: 'autonomous' | 'approval' | 'manual';
  tags: string[];
  personality: {
    communicationStyle?: string;
    relationship?: string;
    topicsOfInterest?: string[];
  };
  lastSeen: Date;
  metadata: Record<string, any>;
}

const ContactProfileSchema: Schema = new Schema({
  phoneNumber: { type: String, required: true, unique: true, index: true },
  name: { type: String },
  isVIP: { type: Boolean, default: false },
  mode: { type: String, enum: ['autonomous', 'approval', 'manual'], default: 'autonomous' },
  tags: [{ type: String }],
  personality: {
    communicationStyle: { type: String },
    relationship: { type: String },
    topicsOfInterest: [{ type: String }]
  },
  lastSeen: { type: Date, default: Date.now },
  metadata: { type: Schema.Types.Mixed, default: {} }
}, {
  timestamps: true
});

export const ContactProfile = mongoose.model<IContactProfile>('ContactProfile', ContactProfileSchema);
