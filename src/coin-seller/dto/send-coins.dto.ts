import { IsNotEmpty, IsString, IsInt, Min } from 'class-validator';

export class SendCoinsDto {
    @IsNotEmpty()
    @IsString()
    sellerId: string;

    @IsNotEmpty()
    @IsString()
    fromId: string;

    @IsNotEmpty()
    @IsString()
    toUserId: string;

    @IsInt()
    @Min(1)
    amount: number;
}