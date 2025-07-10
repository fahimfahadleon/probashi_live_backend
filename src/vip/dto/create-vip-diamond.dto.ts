import { IsNumber, IsPositive } from 'class-validator';

export class CreateVIPDiamondDto {
    @IsNumber()
    @IsPositive()
    price: number;

    @IsNumber()
    @IsPositive()
    diamonds: number;
}