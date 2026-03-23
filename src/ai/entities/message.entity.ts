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

  @Column({ name: 'conversationId', type: 'varchar', length: 100 })
  conversationId: string;

  @ManyToOne(() => Conversation, (conversation) => conversation.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation: Conversation;

  @Column({ type: 'varchar', length: 20 })
  role: string; // 'user' or 'assistant'

  @Column({ type: 'text' })
  content: string;

  @Column({ name: 'toolUse', type: 'jsonb', nullable: true })
  toolUse: any;

  @Column({ name: 'toolResult', type: 'jsonb', nullable: true })
  toolResult: any;

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;
}
