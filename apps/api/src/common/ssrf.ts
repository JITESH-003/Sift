import { BadRequestException } from '@nestjs/common';
import { lookup } from 'node:dns/promises';

const PRIVATE_V4 = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
];

function isPrivateIp(address: string): boolean {
  if (address.includes(':')) {
    const lower = address.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (
      lower.startsWith('fe80') ||
      lower.startsWith('fc') ||
      lower.startsWith('fd')
    ) {
      return true;
    }
    const mapped = /::ffff:(\d+\.\d+\.\d+\.\d+)/.exec(lower);
    if (mapped) return PRIVATE_V4.some((re) => re.test(mapped[1]));
    return false;
  }
  return PRIVATE_V4.some((re) => re.test(address));
}

export async function assertPublicPostgresUrl(
  connectionString: string,
): Promise<void> {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new BadRequestException('Invalid connection string');
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new BadRequestException(
      'Only postgres:// connection strings are allowed',
    );
  }
  const host = url.hostname.toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.local')) {
    throw new BadRequestException('That host is not allowed');
  }
  const addresses = await lookup(host, { all: true }).catch(() => {
    throw new BadRequestException('Could not resolve the database host');
  });
  if (addresses.length === 0) {
    throw new BadRequestException('Could not resolve the database host');
  }
  for (const entry of addresses) {
    if (isPrivateIp(entry.address)) {
      throw new BadRequestException(
        'Connections to private or internal addresses are not allowed',
      );
    }
  }
}
