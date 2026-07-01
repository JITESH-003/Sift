import { Global, Module } from '@nestjs/common';
import { ConnectionRegistry } from './connection-registry.service';

@Global()
@Module({
  providers: [ConnectionRegistry],
  exports: [ConnectionRegistry],
})
export class ConnectionModule {}
