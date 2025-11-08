import { IsBoolean } from 'class-validator';

export class AppSettingsDto {
    @IsBoolean()
    maintenanceMode: boolean;

    @IsBoolean()
    showAds: boolean;

    @IsBoolean()
    forceUpdate: boolean;
}