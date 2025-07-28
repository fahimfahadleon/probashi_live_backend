import {
    Controller,
    Post,
    UseInterceptors,
    UploadedFiles,
    Body,
    Param,
    Delete,
    Get,
    UseGuards,
    BadRequestException,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { extname } from 'path';
import { diskStorage } from 'multer';
import { GiftsService } from './gifts.service';
import { JwtAdminGuard } from 'src/guard';

@Controller('gifts')
export class GiftController {
    constructor(private readonly giftService: GiftsService) { }

    @UseGuards(JwtAdminGuard)
    @Post('upload')
    @UseInterceptors(
        FileFieldsInterceptor(
            [
                { name: 'file', maxCount: 1 },       // SVGA file
                { name: 'thumbnail', maxCount: 1 },  // Thumbnail image
            ],
            {
                storage: diskStorage({
                    destination: './uploads/gifts',
                    filename: (req, file, cb) => {
                        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
                        cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
                    },
                }),
            },
        ),
    )
    async uploadGift(
        @UploadedFiles() files: { file?: Express.Multer.File[]; thumbnail?: Express.Multer.File[] },
        @Body() body: { name: string; price: number; categoryId: string },
    ) {
        if (!files.file || files.file.length === 0) {
            throw new BadRequestException('SVGA file is required');
        }
        if (!files.thumbnail || files.thumbnail.length === 0) {
            throw new BadRequestException('Thumbnail image is required');
        }

        const svgaFile = files.file[0];
        const thumbnailFile = files.thumbnail[0];

        const imageUrl = `/uploads/gifts/${svgaFile.filename}`;
        const thumbnailUrl = `/uploads/gifts/${thumbnailFile.filename}`;

        return this.giftService.createGift({
            name: body.name,
            price: +body.price,
            imageUrl,
            thumbnailUrl,
            category: { connect: { id: body.categoryId } },
        });
    }

    @Get('by-category')
    getAllByCategory() {
        return this.giftService.getAllCategoriesWithGifts();
    }

    @UseGuards(JwtAdminGuard)
    @Delete(':id')
    deleteGift(@Param('id') id: string) {
        return this.giftService.deleteGift(id);
    }

    @Post('category')
    @UseGuards(JwtAdminGuard)
    async createCategory(@Body() body: { name: string }) {
        return this.giftService.createCategory(body.name);
    }
}