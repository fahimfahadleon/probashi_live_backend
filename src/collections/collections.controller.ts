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
    Req,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { extname } from 'path';
import { diskStorage } from 'multer';
import { CollectionsService } from './collections.service';
import { JwtAdminGuard, JwtGuard } from 'src/guard';
import { CurrentUser } from 'src/auth/decorator/current-user.decorator';

@Controller('collections')
export class CollectionsController {
    constructor(private readonly collectionsService: CollectionsService) { }

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
                    destination: './uploads/collections',
                    filename: (req, file, cb) => {
                        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
                        cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
                    },
                }),
            },
        ),
    )
    async uploadCollection(
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

        const imageUrl = `/uploads/collections/${svgaFile.filename}`;
        const thumbnailUrl = `/uploads/collections/${thumbnailFile.filename}`;

        return this.collectionsService.createCollections({
            name: body.name,
            price: +body.price,
            imageUrl,
            thumbnailUrl,
            category: { connect: { id: body.categoryId } },
        });
    }

    @Get('by-category')
    getAllByCategory() {
        return this.collectionsService.getAllCategoriesWithCollections();
    }
    @UseGuards(JwtGuard)
    @Post('by-name')
    async getCollectionSvgaByName(@Body() body: { name: string }) {
        return this.collectionsService.getSvgaUrlByName(body.name);
    }

    @Post('category')
    @UseGuards(JwtAdminGuard)
    async createCategory(@Body() body: { name: string }) {
        return this.collectionsService.createCategory(body.name);
    }

    @Post('purchase')
    @UseGuards(JwtGuard)
    async userPurchaseCollection(
        @CurrentUser() user: { id: string },
        @Body() body: { type: string; name: string },
    ) {
        return this.collectionsService.purchaseCollection(user.id, body.type, body.name);
    }

}
