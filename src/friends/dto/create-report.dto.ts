// create-report.dto.ts
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class CreateReportDto {
    @IsEmail()
    email: string;

    @IsString()
    reason: string;

    @IsString()
    targetId?: string; // user being reported
}
