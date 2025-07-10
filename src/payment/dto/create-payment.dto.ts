import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreatePaymentDto {
    @IsString()
    @IsNotEmpty()
    transactionId: string;

    @IsString()
    @IsNotEmpty()
    method: string;


    @IsString()
    @IsNotEmpty()
    itemId: string;

    @IsString()
    @IsOptional()
    description?: string;
}