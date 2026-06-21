import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDataSourceDto } from './dto/create-datasource.dto';
import { IntrospectionService } from './introspection.service';

@Injectable()
export class DataSourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly introspection: IntrospectionService,
  ) {}

  create(userId: string, dto: CreateDataSourceDto) {
    return this.prisma.dataSource.create({
      data: {
        userId,
        name: dto.name,
        connectionRef: JSON.stringify({ mode: 'local', schema: dto.schema }),
      },
    });
  }

  list(userId: string) {
    return this.prisma.dataSource.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(userId: string, id: string) {
    const dataSource = await this.findOwned(userId, id);
    const snapshot = await this.prisma.schemaSnapshot.findFirst({
      where: { dataSourceId: id },
      orderBy: { createdAt: 'desc' },
    });
    return { ...dataSource, snapshot };
  }

  async introspect(userId: string, id: string) {
    const dataSource = await this.findOwned(userId, id);
    const schema = this.resolveSchema(dataSource.connectionRef);
    const { schemaJson, compactText } =
      await this.introspection.introspect(schema);
    return this.prisma.schemaSnapshot.create({
      data: {
        dataSourceId: id,
        schemaJson: schemaJson,
        compactText,
      },
    });
  }

  private resolveSchema(connectionRef: string): string {
    const parsed = this.safeParse(connectionRef);
    if (parsed?.mode === 'local' && parsed.schema) {
      return parsed.schema;
    }
    throw new BadRequestException('Unsupported data source connection');
  }

  private safeParse(value: string): { mode?: string; schema?: string } | null {
    try {
      return JSON.parse(value) as { mode?: string; schema?: string };
    } catch {
      return null;
    }
  }

  private async findOwned(userId: string, id: string) {
    const dataSource = await this.prisma.dataSource.findUnique({
      where: { id },
    });
    if (!dataSource) {
      throw new NotFoundException('Data source not found');
    }
    if (dataSource.userId !== userId) {
      throw new ForbiddenException();
    }
    return dataSource;
  }
}
