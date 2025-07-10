import { IsString, IsNumber } from 'class-validator';

export class CreateOfferDto {
    @IsString()
    title: string;

    @IsString()
    content: string;

    @IsNumber()
    price: number;
}