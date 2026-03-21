import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Conversation } from './conversation.entity';

@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100 })
  conversationId: string;

  @ManyToOne(() => Conversation, (conversation) => conversation.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation;

  @Column({ type: 'varchar', length: 20 })
  role: string; // 'user' or 'assistant'

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'jsonb', nullable: true })
  toolUse: any;

  @Column({ type: 'jsonb', nullable: true })
  toolResult: any;

  @CreateDateColumn()
  createdAt: Date;
}
