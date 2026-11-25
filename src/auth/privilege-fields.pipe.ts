import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

@Injectable()
export class PrivilegeFieldsPipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata) {
    if (metadata.type !== 'body') return value;
    const inspect = (input: any) => {
      if (!input || typeof input !== 'object') return;
      for (const [key, nested] of Object.entries(input)) {
        if (['role', 'roles', 'permissions', 'isAdmin', 'passwordHash', 'sessions', '__proto__', 'constructor', 'prototype'].includes(key)) {
          throw new BadRequestException(`Unexpected privilege-bearing field: ${key}`);
        }
        inspect(nested);
      }
    };
    inspect(value);
    return value;
  }
}
