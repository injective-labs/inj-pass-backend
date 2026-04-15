import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class AgentChatRequestDto {
  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsBoolean()
  sandboxMode?: boolean;
}

export class AgentConfirmRequestDto {
  @IsString()
  conversationId: string;

  @IsBoolean()
  approve: boolean;
}

export class AgentSweepRequestDto {
  @IsString()
  conversationId: string;
}

export class AgentClientToolResultDto {
  @IsString()
  conversationId: string;

  @IsString()
  toolUseId: string;

  @IsString()
  result: string;
}
