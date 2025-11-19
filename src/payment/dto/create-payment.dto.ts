import { IsNotEmpty, IsOptional, IsString, IsEnum } from 'class-validator';

export class CreatePaymentDto {
    @IsString()
    @IsNotEmpty()
    transactionId: string;

    @IsString()
    @IsNotEmpty()
    method: string;

    @IsString()
    @IsNotEmpty()
    productId: string;  // matches your Payment.productId foreign key

    @IsOptional()
    @IsString()
    vIPDiamondPackId?: string;  // optional if the product type is VIP_PACK

    @IsOptional()
    @IsString()
    description?: string;
}
