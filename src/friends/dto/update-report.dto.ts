// update-report.dto.ts
import { IsEnum } from 'class-validator';

export enum ReportStatus {
    PENDING = 'PENDING',
    REVIEWED = 'REVIEWED',
    REJECTED = 'REJECTED',
}

export class UpdateReportDto {
    @IsEnum(ReportStatus)
    status: ReportStatus;
}
