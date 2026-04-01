import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ToolUse {
  @IsString()
  name: string;

  @IsOptional()
  input?: Record<string, any>;

  @IsString()
  id: string;
}

export class ToolResult {
  @IsString()
  tool_use_id: string;

  content: string;
}

export class ChatMessage {
  @IsString()
  role: 'user' | 'assistant';

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsArray()
  tool_use?: ToolUse[];

  @IsOptional()
  @IsArray()
  tool_result?: ToolResult[];
}

export class UsageInfo {
  @IsOptional()
  inputTokens?: number;

  @IsOptional()
  outputTokens?: number;
}

export class ChatRecordRequest {
  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessage)
  messages: ChatMessage[];

  @IsString()
  model: string;

  @ValidateNested()
  @Type(() => UsageInfo)
  usage: UsageInfo;
}

export class ChatRecordResponse {
  ok: boolean;
  conversationId?: string;
  balance?: number;
  cost?: {
    inputTokens: number;
    outputTokens: number;
    ninjaDeducted: number;
    currency: number;
  };
  error?: string;
  current?: number;
  required?: number;
}
