import { Type } from "class-transformer";
import { IsInt, Min } from "class-validator";

export class GetUsersDto {
    @Type(() => Number) // ⬅ ensures string → number conversion
    @IsInt()
    @Min(1)
    page: number = 1;

    @Type(() => Number)
    @IsInt()
    @Min(1)
    limit: number = 10;
}
// export the DTO for use in other parts of the application