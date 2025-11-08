import { IsNumber, Min } from 'class-validator';

export class UpdateProfitMarginDto {
    @IsNumber()
    @Min(0)
    margin: number;
}