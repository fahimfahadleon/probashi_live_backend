import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { AddGatewayDto, AppSettingsDto, UpdateProfitMarginDto } from './dto';



@Injectable()
export class SettingsService {
    constructor(private prisma: PrismaService) { }

    async getSettings() {
        let settings = await this.prisma.settings.findUnique({ where: { id: 1 } });

        if (!settings) {
            settings = await this.prisma.settings.create({
                data: {
                    id: 1,
                    profitMargin: 0,
                    gateways: [],
                    appSettings: {
                        maintenanceMode: false,
                        showAds: true,
                        forceUpdate: false,
                    },
                },
            });
        }

        return settings;
    }

    async updateProfitMargin(dto: UpdateProfitMarginDto) {
        return this.prisma.settings.update({
            where: { id: 1 },
            data: { profitMargin: dto.margin },
        });
    }

    async addGateway(dto: AddGatewayDto) {
        const settings = await this.getSettings();
        const gateways = Array.isArray(settings.gateways) ? [...settings.gateways] : [];

        const newGateway = {
            id: Date.now(), // simple unique ID
            phone: dto.phone,
            provider: dto.provider,
        };

        gateways.push(newGateway);

        return this.prisma.settings.update({
            where: { id: 1 },
            data: { gateways },
        });
    }

    async removeGateway(id: number) {
        const settings = await this.getSettings();
        const gateways = Array.isArray(settings.gateways)
            ? settings.gateways.filter((g: any) => g.id !== id)
            : [];

        return this.prisma.settings.update({
            where: { id: 1 },
            data: { gateways },
        });
    }

    async updateAppSettings(dto: AppSettingsDto) {
        return this.prisma.settings.update({
            where: { id: 1 },
            data: { appSettings: { ...dto } }, // spread to plain object
        });
    }

}
