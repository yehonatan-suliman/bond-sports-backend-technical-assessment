import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

@Injectable()
export class ParsePersonIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!/^\d{1,20}$/.test(value)) {
      throw new BadRequestException('personId must be 1-20 digits');
    }
    return value;
  }
}
