import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';

export class CreateCoinSellerRequestDto {
    @IsNotEmpty()
    @IsString()
    userId: string;

    @IsNotEmpty()
    @IsString()
    fullName: string;

    @IsNotEmpty()
    @IsString()
    nationalId: string;

    @IsNotEmpty()
    @IsString()
    phoneNumber: string;

    @IsEmail()
    email: string;
}
