import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';

export class CreateCoinSellerDto {
    @IsNotEmpty()
    @IsString()
    userId: string;

    @IsNotEmpty()
    @IsString()
    fullName: string;

    @IsNotEmpty()
    @IsString()
    @Length(5, 20)
    nationalId: string;

    @IsNotEmpty()
    @IsString()
    @Length(6, 20)
    phoneNumber: string;

    @IsEmail()
    email: string;
}