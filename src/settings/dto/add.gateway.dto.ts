import { IsString, IsNotEmpty } from 'class-validator';

export class AddGatewayDto {
    @IsString()
    @IsNotEmpty()
    phone: string;

    @IsString()
    @IsNotEmpty()
    provider: string;
}