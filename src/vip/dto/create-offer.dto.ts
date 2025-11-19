import { IsString, IsNotEmpty, IsNumber, IsPositive } from 'class-validator';

export class CreateOfferDto {
    @IsString()
    @IsNotEmpty()
    title: string;

    @IsString()
    @IsNotEmpty()
    content: string;

    @IsNumber()
    @IsPositive()
    price: number;

    @IsNumber()
    @IsPositive()
    diamonds: number; // new field for consistency
}
